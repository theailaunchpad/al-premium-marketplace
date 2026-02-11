import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { execSync } from "node:child_process";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { loadEnv } from "../lib/env.js";
import { readManifest, manifestExists, type TestManifest } from "../lib/manifest.js";
import { runClaudeResolveIssue, type ClaudeRunResult } from "../lib/claude-runner.js";
import { listPRs, getPRComments, branchExistsOnRemote } from "../lib/github-helpers.js";
import { getIssueState, getIssueComments } from "../lib/linear-helpers.js";
import { pollUntil } from "../lib/poll.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const TESTS_DIR = resolve(__dirname, "..");

// ---------------------------------------------------------------------------
// State shared across test cases
// ---------------------------------------------------------------------------

let manifest: TestManifest;
let claudeResult: ClaudeRunResult;
let testStartTime: Date;

// ---------------------------------------------------------------------------
// Setup & Teardown
// ---------------------------------------------------------------------------

beforeAll(async () => {
  loadEnv();
  testStartTime = new Date();

  // 1. Run setup-single-issue
  console.log("Running setup-single-issue...");
  execSync("bun run setup:single", {
    cwd: TESTS_DIR,
    stdio: "inherit",
    timeout: 120_000, // 2 min
  });

  if (!manifestExists()) {
    throw new Error("Setup did not produce a manifest");
  }
  manifest = readManifest();

  // 2. Run claude -p to resolve the issue
  const issue = manifest.issues[0];
  console.log(`\nRunning claude -p for ${issue.identifier}...`);
  claudeResult = runClaudeResolveIssue(
    manifest.testRepoPath,
    issue.identifier,
    issue.id,
    { maxTurns: 100, timeoutMs: 20 * 60 * 1000 }
  );

  console.log(`\nClaude finished in ${Math.round(claudeResult.durationMs / 1000)}s`);
  console.log(`  Exit code: ${claudeResult.exitCode}`);
  if (claudeResult.jsonOutput) {
    console.log(`  is_error: ${claudeResult.jsonOutput.is_error}`);
    console.log(`  cost_usd: $${claudeResult.jsonOutput.total_cost_usd}`);
    console.log(`  num_turns: ${claudeResult.jsonOutput.num_turns}`);
    console.log(`  duration_ms: ${claudeResult.jsonOutput.duration_ms}`);
    console.log(`  result preview: ${claudeResult.jsonOutput.result?.slice(0, 300)}`);
  } else {
    console.log("  WARNING: Could not parse JSON output from claude -p");
    // Log last 1000 chars of stdout for debugging
    const tail = claudeResult.rawStdout.slice(-1000);
    console.log(`  stdout tail: ${tail}`);
  }

  // Save raw output for debugging
  const { writeFileSync } = require("node:fs");
  const debugPath = resolve(TESTS_DIR, "claude-debug-output.jsonl");
  writeFileSync(debugPath, claudeResult.rawStdout);
  console.log(`  Debug output saved to: ${debugPath}`);
}, 30 * 60 * 1000); // 30 min total timeout for setup + claude run

afterAll(async () => {
  console.log("\nRunning teardown-single-issue...");
  try {
    execSync("bun run teardown:single", {
      cwd: TESTS_DIR,
      stdio: "inherit",
      timeout: 120_000,
    });
  } catch (err) {
    console.warn("Teardown failed:", (err as Error).message);
  }
}, 120_000);

// ---------------------------------------------------------------------------
// Test Cases — one per workflow step
// ---------------------------------------------------------------------------

describe("resolve-linear-issue E2E", () => {
  test("1. claude process completed without error", () => {
    expect(claudeResult.exitCode).toBe(0);
    if (claudeResult.jsonOutput) {
      expect(claudeResult.jsonOutput.is_error).toBe(false);
    }
    // If jsonOutput is null but exitCode is 0, the process still succeeded
    // (JSON parsing may have failed due to output format differences)
  });

  test("2. issue branch was created on GitHub", () => {
    const issue = manifest.issues[0];
    // Branch should contain the lowercase issue identifier (e.g. "eng-123")
    const pattern = issue.identifier.toLowerCase();
    const exists = branchExistsOnRemote(manifest.githubRepo!, pattern);
    expect(exists).toBe(true);
  });

  test("3. PR was opened against main", () => {
    const prs = listPRs(manifest.githubRepo!);
    expect(prs.length).toBeGreaterThanOrEqual(1);

    // At least one PR should have a head branch matching the issue identifier
    const issue = manifest.issues[0];
    const pattern = issue.identifier.toLowerCase();
    const matchingPR = prs.find((pr) =>
      pr.headRefName.toLowerCase().includes(pattern)
    );
    expect(matchingPR).toBeDefined();
  });

  test("4. CI checks completed on the PR", async () => {
    const issue = manifest.issues[0];
    const pattern = issue.identifier.toLowerCase();
    const prs = listPRs(manifest.githubRepo!);
    const pr = prs.find((p) => p.headRefName.toLowerCase().includes(pattern));

    if (!pr) {
      // If no PR, skip (test 3 would have failed already)
      expect(pr).toBeDefined();
      return;
    }

    // Checks may take time. Poll for up to 5 min.
    // We just need them to have a final status (not "pending").
    // The skill itself waits for checks, so by the time claude exits
    // they should be done, but give a buffer.
    const checks = await pollUntil(
      () => {
        try {
          const json = execSync(
            `gh pr checks ${pr.number} --repo ${manifest.githubRepo!} --json name,state 2>/dev/null || echo "[]"`,
            { encoding: "utf-8" }
          ).trim();
          return JSON.parse(json) as Array<{ name: string; state: string }>;
        } catch {
          return [];
        }
      },
      (result) =>
        result.length > 0 &&
        result.every((c) => c.state !== "PENDING" && c.state !== "QUEUED"),
      { intervalMs: 15_000, timeoutMs: 300_000, label: "CI checks to complete" }
    );

    expect(checks.length).toBeGreaterThanOrEqual(1);
  });

  test("5. PR received a review comment from pr-reviewer", () => {
    const issue = manifest.issues[0];
    const pattern = issue.identifier.toLowerCase();
    const prs = listPRs(manifest.githubRepo!);
    const pr = prs.find((p) => p.headRefName.toLowerCase().includes(pattern));

    if (!pr) {
      expect(pr).toBeDefined();
      return;
    }

    const comments = getPRComments(manifest.githubRepo!, pr.number);

    // Debug: log all comments found
    if (comments.length === 0) {
      console.log("  WARNING: No PR comments found. Checking for review comments...");
      // Also try fetching review comments (gh pr reviews)
      try {
        const { execSync } = require("node:child_process");
        const reviews = execSync(
          `gh pr view ${pr.number} --repo ${manifest.githubRepo!} --json reviews --jq '.reviews | length'`,
          { encoding: "utf-8" }
        ).trim();
        console.log(`  PR reviews count: ${reviews}`);
      } catch { /* ignore */ }
    } else {
      console.log(`  Found ${comments.length} PR comment(s)`);
    }

    // pr-reviewer leaves comments via `gh pr comment`. Check for any comment
    // that looks like a review (has Summary, Verdict, or Approve/Request Changes).
    const reviewComment = comments.find(
      (c) =>
        c.body.includes("Summary") ||
        c.body.includes("Verdict") ||
        c.body.includes("Approve") ||
        c.body.includes("LGTM") ||
        c.body.includes("approve")
    );
    expect(reviewComment).toBeDefined();
  });

  test("6. Linear issue was interacted with", async () => {
    const issue = manifest.issues[0];

    // The skill interacts with Linear in multiple ways:
    // - Creating the branch moves the issue to "In Progress"
    // - Step 8 may add a comment with findings
    // Check that at least one of these happened.
    const state = await getIssueState(issue.id);
    const comments = await getIssueComments(issue.id);

    const wasMovedToInProgress = state.type === "started" || state.name === "In Progress";
    const hasComments = comments.length > 0;

    if (!wasMovedToInProgress && !hasComments) {
      console.log(`  Issue state: ${state.name} (type: ${state.type})`);
      console.log(`  Issue comments: ${comments.length}`);
    }

    expect(wasMovedToInProgress || hasComments).toBe(true);
  });

  test("7. Linear issue status was NOT manually set to Done", async () => {
    const issue = manifest.issues[0];
    const state = await getIssueState(issue.id);

    // The skill should NOT set the issue to Done — it moves automatically on PR merge.
    // Acceptable states: Backlog, In Progress, or any non-"done" type.
    expect(state.type).not.toBe("completed");
  });
});
