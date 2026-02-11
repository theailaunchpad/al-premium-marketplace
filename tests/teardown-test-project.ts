import { LinearClient } from "@linear/sdk";
import { existsSync, readFileSync, rmSync, unlinkSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

// ---------------------------------------------------------------------------
// Load .env.local
// ---------------------------------------------------------------------------

const envPath = resolve(__dirname, ".env.local");
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, "utf-8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq);
    const val = trimmed.slice(eq + 1);
    if (!process.env[key]) process.env[key] = val;
  }
}

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const LINEAR_API_KEY = process.env.LINEAR_API_KEY;
if (!LINEAR_API_KEY) {
  console.error("ERROR: LINEAR_API_KEY environment variable is required");
  process.exit(1);
}

const MANIFEST_PATH = resolve(__dirname, "test-manifest.json");
if (!existsSync(MANIFEST_PATH)) {
  console.error("ERROR: test-manifest.json not found. Nothing to tear down.");
  process.exit(1);
}

const manifest = JSON.parse(readFileSync(MANIFEST_PATH, "utf-8"));
const client = new LinearClient({ apiKey: LINEAR_API_KEY });

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const { projectId, teamId, issues, testRepoPath } = manifest;

  // 1. Cancel all issues
  console.log("Canceling issues...");
  try {
    const workflowStates = await client.workflowStates({
      filter: { team: { id: { eq: teamId } } },
    });
    const canceledState = workflowStates.nodes.find(
      (s) => s.name === "Canceled" || s.type === "cancelled"
    );

    if (canceledState) {
      for (const issue of issues) {
        try {
          await client.updateIssue(issue.id, { stateId: canceledState.id });
          console.log(`  Canceled: ${issue.identifier} (${issue.key})`);
        } catch (err) {
          console.warn(
            `  Warning: Failed to cancel ${issue.identifier}:`,
            (err as Error).message
          );
        }
      }
    } else {
      console.warn("  Warning: Could not find Canceled workflow state");
    }
  } catch (err) {
    console.warn(
      "  Warning: Failed to cancel issues:",
      (err as Error).message
    );
  }

  // 2. Archive project
  console.log("\nArchiving project...");
  try {
    await client.archiveProject(projectId);
    console.log(`  Archived: ${manifest.projectName}`);
  } catch (err) {
    console.warn(
      "  Warning: Failed to archive project:",
      (err as Error).message
    );
  }

  // 3. Remove stub repo
  console.log("\nRemoving stub repo...");
  try {
    if (existsSync(testRepoPath)) {
      rmSync(testRepoPath, { recursive: true, force: true });
      console.log(`  Removed: ${testRepoPath}`);
    } else {
      console.log(`  Already removed: ${testRepoPath}`);
    }
  } catch (err) {
    console.warn(
      "  Warning: Failed to remove repo:",
      (err as Error).message
    );
  }

  // 4. Delete manifest
  console.log("\nDeleting manifest...");
  try {
    unlinkSync(MANIFEST_PATH);
    console.log(`  Deleted: ${MANIFEST_PATH}`);
  } catch (err) {
    console.warn(
      "  Warning: Failed to delete manifest:",
      (err as Error).message
    );
  }

  console.log("\nTeardown complete!");
}

main().catch((err) => {
  console.error("Teardown failed:", err);
  process.exit(1);
});
