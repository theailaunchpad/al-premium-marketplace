import { existsSync, rmSync } from "node:fs";
import { loadEnv } from "./lib/env.js";
import { manifestExists, readManifest, deleteManifest } from "./lib/manifest.js";
import { getLinearClient, getCanceledStateId } from "./lib/linear-helpers.js";
import { deleteTestRepo } from "./lib/github-helpers.js";
import { stopPostgres } from "./lib/docker-pg.js";

async function main() {
  loadEnv();

  if (!manifestExists()) {
    console.error("ERROR: test-manifest-single.json not found. Nothing to tear down.");
    process.exit(1);
  }

  const manifest = readManifest();
  const client = getLinearClient();

  // 1. Cancel issues
  console.log("Canceling issues...");
  try {
    const canceledStateId = await getCanceledStateId(manifest.teamId);
    if (canceledStateId) {
      for (const issue of manifest.issues) {
        try {
          await client.updateIssue(issue.id, { stateId: canceledStateId });
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
    console.warn("  Warning: Failed to cancel issues:", (err as Error).message);
  }

  // 2. Archive project
  console.log("\nArchiving project...");
  try {
    await client.archiveProject(manifest.projectId);
    console.log(`  Archived: ${manifest.projectName}`);
  } catch (err) {
    console.warn("  Warning: Failed to archive project:", (err as Error).message);
  }

  // 3. Delete GitHub repo
  if (manifest.githubRepo) {
    console.log("\nDeleting GitHub repo...");
    deleteTestRepo(manifest.githubRepo);
    console.log(`  Deleted: ${manifest.githubRepo}`);
  }

  // 4. Stop PostgreSQL container
  if (manifest.pgContainerId) {
    console.log("\nStopping PostgreSQL container...");
    stopPostgres(manifest.pgContainerId);
    console.log(`  Stopped: ${manifest.pgContainerId}`);
  }

  // 5. Remove local repo
  console.log("\nRemoving local repo...");
  try {
    if (existsSync(manifest.testRepoPath)) {
      rmSync(manifest.testRepoPath, { recursive: true, force: true });
      console.log(`  Removed: ${manifest.testRepoPath}`);
    } else {
      console.log(`  Already removed: ${manifest.testRepoPath}`);
    }
  } catch (err) {
    console.warn("  Warning: Failed to remove repo:", (err as Error).message);
  }

  // 6. Delete manifest
  console.log("\nDeleting manifest...");
  try {
    deleteManifest();
    console.log("  Deleted.");
  } catch (err) {
    console.warn("  Warning: Failed to delete manifest:", (err as Error).message);
  }

  console.log("\nTeardown complete!");
}

main().catch((err) => {
  console.error("Teardown failed:", err);
  process.exit(1);
});
