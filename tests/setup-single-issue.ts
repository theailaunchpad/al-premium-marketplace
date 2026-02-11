import { execSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { loadEnv, getLinearApiKey, getGithubTestOrg, getTestsDir } from "./lib/env.js";
import { manifestExists, writeManifest, type TestManifest } from "./lib/manifest.js";
import { getLinearClient, resolveTeam, getBacklogStateId } from "./lib/linear-helpers.js";
import { createTestRepo } from "./lib/github-helpers.js";
import { startPostgres } from "./lib/docker-pg.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

// ---------------------------------------------------------------------------
// Issue definitions (same as setup-test-project.ts, indexed by key)
// ---------------------------------------------------------------------------

interface IssueDef {
  key: string;
  title: string;
  wave: number;
  priority: number;
  blockedByKeys: string[];
  description: string;
  needsDb: boolean;
}

const ISSUES: Record<string, IssueDef> = {
  S: {
    key: "S",
    title: "Add GET /health endpoint",
    wave: 0,
    priority: 2,
    blockedByKeys: [],
    needsDb: false,
    description: `## Summary
Add a health check endpoint to the Express server.

## Acceptance Criteria
- [ ] GET /health returns \`{ status: "ok" }\` with HTTP 200`,
  },
  A: {
    key: "A",
    title: "[Foundation] Set up Express + TypeScript project scaffold",
    wave: 0,
    priority: 2,
    blockedByKeys: [],
    needsDb: false,
    description: `## Summary
Set up the Express + TypeScript project scaffold so that all subsequent features have a working server to build upon.

## Current vs Expected Behavior
**Current:** The project has a minimal \`src/index.ts\` with a single GET / endpoint. No health check, no dev tooling configured.
**Expected:** A fully configured Express + TypeScript server with health check endpoint and hot-reload dev workflow.

## Acceptance Criteria
- [ ] Express server listens on configurable PORT (env var), GET /health returns \`{ status: "ok" }\`
- [ ] TypeScript strict mode enabled, ESLint configuration passes with no errors
- [ ] \`npm run dev\` starts the server with hot-reload (tsx watch)

## Scope
**In scope:** Express server setup, TypeScript config, health endpoint, dev script
**Out of scope:** Database setup, any business logic endpoints, testing framework`,
  },
  B: {
    key: "B",
    title: "[Foundation] Configure PostgreSQL with Prisma ORM",
    wave: 0,
    priority: 2,
    blockedByKeys: [],
    needsDb: true,
    description: `## Summary
Configure Prisma ORM with PostgreSQL so the application has a database layer for persisting tasks and users.

## Current vs Expected Behavior
**Current:** Prisma schema exists with generator and datasource config only — no models defined.
**Expected:** Prisma schema defines Task and User models, migrations run successfully, and Prisma Client is exported for use.

## Acceptance Criteria
- [ ] Prisma schema defines Task model (id, title, description, status, createdAt, updatedAt) and User model (id, email, name, createdAt)
- [ ] \`npx prisma migrate dev\` creates tables without errors
- [ ] Prisma Client is exported from \`src/lib/prisma.ts\` as a singleton

## Scope
**In scope:** Prisma schema models, migration, client export
**Out of scope:** API endpoints, seed data, connection pooling`,
  },
};

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  loadEnv();

  // Parse --issue flag (default: A)
  let issueKeyArg = "S";
  const eqFlag = process.argv.find((a) => a.startsWith("--issue="));
  if (eqFlag) {
    issueKeyArg = eqFlag.split("=")[1];
  } else {
    const idx = process.argv.indexOf("--issue");
    if (idx !== -1 && idx + 1 < process.argv.length) {
      issueKeyArg = process.argv[idx + 1];
    }
  }
  const issueKey = issueKeyArg.toUpperCase();

  const issueDef = ISSUES[issueKey];
  if (!issueDef) {
    console.error(`ERROR: Unknown issue key "${issueKey}". Available: ${Object.keys(ISSUES).join(", ")}`);
    process.exit(1);
  }

  if (manifestExists()) {
    console.error("ERROR: test-manifest-single.json already exists. Run teardown:single first.");
    process.exit(1);
  }

  const org = getGithubTestOrg();
  const client = getLinearClient();

  // 1. Resolve team
  console.log("Resolving team...");
  const { teamId, teamKey } = await resolveTeam();
  console.log(`  Team: ${teamKey} (${teamId})`);

  // 2. Create project
  const timestamp = new Date().toISOString();
  const projectName = `[Test] resolve-linear-issue - ${timestamp}`;
  console.log(`\nCreating project: ${projectName}`);

  const projectPayload = await client.createProject({
    name: projectName,
    content: `E2E test for resolve-linear-issue skill. Issue ${issueKey}: ${issueDef.title}`,
    teamIds: [teamId],
  });
  const project = await projectPayload.project;
  if (!project) {
    console.error("ERROR: Failed to create project");
    process.exit(1);
  }
  console.log(`  Project ID: ${project.id}`);

  // 3. Create issue
  console.log("\nCreating issue...");
  const stateId = await getBacklogStateId(teamId);

  const issuePayload = await client.createIssue({
    title: issueDef.title,
    description: issueDef.description,
    teamId,
    projectId: project.id,
    priority: issueDef.priority,
    ...(stateId ? { stateId } : {}),
  });
  const issue = await issuePayload.issue;
  if (!issue) {
    console.error("ERROR: Failed to create issue");
    process.exit(1);
  }
  console.log(`  ${issueKey}: ${issue.identifier} — ${issueDef.title}`);

  // Write manifest early so teardown can clean up partial state
  const repoTimestamp = timestamp.replace(/[:.]/g, "-");
  const testReposDir = resolve(getTestsDir(), ".test-repos");
  const repoDir = resolve(testReposDir, `task-manager-api-${repoTimestamp}`);

  const manifest: TestManifest = {
    createdAt: timestamp,
    projectId: project.id,
    projectName,
    teamId,
    teamKey,
    issues: [
      {
        key: issueKey,
        id: issue.id,
        identifier: issue.identifier,
        title: issueDef.title,
        wave: issueDef.wave,
        blockedByKeys: issueDef.blockedByKeys,
      },
    ],
    dependencyMap: {},
    waves: { [String(issueDef.wave)]: [issueKey] },
    testRepoPath: repoDir,
  };
  writeManifest(manifest);
  console.log("  Manifest written (partial — will update as resources are created).");

  // 4. Optionally start Docker PostgreSQL
  if (issueDef.needsDb) {
    console.log("\nStarting PostgreSQL container...");
    const runId = timestamp.replace(/[:.]/g, "-");
    const pg = startPostgres(runId);
    manifest.pgContainerId = pg.containerId;
    manifest.databaseUrl = pg.databaseUrl;
    writeManifest(manifest);
    console.log(`  Container: ${pg.containerId}`);
    console.log(`  Port: ${pg.port}`);
    console.log(`  URL: ${pg.databaseUrl}`);
  }

  // 5. Copy fixture and set up local repo
  console.log("\nInitializing test repo...");
  const fixtureDir = resolve(__dirname, "fixtures", "task-manager-api");
  const claudeMdFixture = resolve(__dirname, "fixtures", "claude-md", "CLAUDE.md");
  const ciYmlFixture = resolve(__dirname, "fixtures", "github-actions", "ci.yml");

  mkdirSync(testReposDir, { recursive: true });
  cpSync(fixtureDir, repoDir, { recursive: true });

  // Add CLAUDE.md
  cpSync(claudeMdFixture, resolve(repoDir, "CLAUDE.md"));

  // Add .github/workflows/ci.yml
  const workflowDir = resolve(repoDir, ".github", "workflows");
  mkdirSync(workflowDir, { recursive: true });
  cpSync(ciYmlFixture, resolve(workflowDir, "ci.yml"));

  // Write DATABASE_URL to .env if needed
  if (manifest.databaseUrl) {
    writeFileSync(resolve(repoDir, ".env"), `DATABASE_URL=${manifest.databaseUrl}\n`);
  }

  // Install dependencies
  console.log("  Installing dependencies...");
  execSync("bun install", { cwd: repoDir, stdio: "pipe" });

  // Init git and commit
  execSync(
    'git init && git add -A && git commit -m "Initial scaffold"',
    { cwd: repoDir, stdio: "pipe" }
  );

  // Rename default branch to main (in case git defaults to master)
  try {
    execSync("git branch -M main", { cwd: repoDir, stdio: "pipe" });
  } catch {
    // Already on main
  }

  console.log(`  Repo: ${repoDir}`);

  // 6. Create GitHub repo and push
  console.log("\nCreating GitHub repo...");
  const repoName = `test-task-manager-api-${repoTimestamp}`;
  const githubRepo = createTestRepo(org, repoName, repoDir);
  manifest.githubRepo = githubRepo;
  writeManifest(manifest);
  console.log(`  GitHub: ${githubRepo}`);

  // 7. Write .mcp.json AFTER git commit so it's untracked (contains API key)
  // This ensures the headless claude -p process uses the correct Linear workspace.
  const linearApiKey = getLinearApiKey();
  const mcpConfig = {
    mcpServers: {
      linear: {
        type: "http",
        url: "https://mcp.linear.app/mcp",
        headers: {
          Authorization: `Bearer ${linearApiKey}`,
        },
      },
    },
  };
  writeFileSync(resolve(repoDir, ".mcp.json"), JSON.stringify(mcpConfig, null, 2) + "\n");

  console.log("\nSetup complete!");
  console.log(`  Project: ${projectName}`);
  console.log(`  Issue: ${issue.identifier} (${issueKey})`);
  console.log(`  Repo: ${repoDir}`);
  console.log(`  GitHub: https://github.com/${githubRepo}`);
}

main().catch((err) => {
  console.error("Setup failed:", err);
  process.exit(1);
});
