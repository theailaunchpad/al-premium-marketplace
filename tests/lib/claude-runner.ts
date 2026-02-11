import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

export interface ClaudeOutput {
  type: string;
  subtype: string;
  is_error: boolean;
  result: string;
  total_cost_usd: number;
  num_turns: number;
  session_id: string;
  duration_ms: number;
}

export interface ClaudeRunResult {
  exitCode: number;
  jsonOutput: ClaudeOutput | null;
  rawStdout: string;
  durationMs: number;
}

const __dirname = new URL(".", import.meta.url).pathname;

/**
 * Find the plugin-dir relative to the repo checkout.
 * The plugins live in the marketplace repo root, so we compute the path
 * from the working directory up to the marketplace root.
 */
function getPluginDir(): string {
  // The marketplace root is 2 levels up from tests/lib/
  const marketplaceRoot = resolve(__dirname, "..", "..");
  return resolve(marketplaceRoot, "plugins", "linear-pm");
}

/**
 * Parse output from claude -p --output-format json.
 * The output may be either:
 * - A JSON array: [{init}, {assistant}, ..., {result}]
 * - JSONL: one JSON object per line
 * We want the object with type "result".
 */
function parseClaudeOutput(stdout: string): ClaudeOutput | null {
  const trimmed = stdout.trim();
  if (!trimmed) return null;

  // Try parsing as a JSON array first
  if (trimmed.startsWith("[")) {
    try {
      const arr = JSON.parse(trimmed);
      if (Array.isArray(arr)) {
        for (let i = arr.length - 1; i >= 0; i--) {
          if (arr[i].type === "result") return arr[i];
        }
      }
    } catch {
      // Fall through to JSONL parsing
    }
  }

  // Try JSONL: one JSON object per line
  const lines = trimmed.split("\n");
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i].trim();
    if (!line) continue;
    if (!line.includes('"type"')) continue;
    try {
      const parsed = JSON.parse(line);
      if (parsed.type === "result") return parsed;
      // If it's an array on one line, search within
      if (Array.isArray(parsed)) {
        for (let j = parsed.length - 1; j >= 0; j--) {
          if (parsed[j].type === "result") return parsed[j];
        }
      }
    } catch {
      // skip
    }
  }

  return null;
}

export function runClaudeResolveIssue(
  repoPath: string,
  identifier: string,
  issueId: string,
  opts?: { maxTurns?: number; timeoutMs?: number }
): ClaudeRunResult {
  const maxTurns = opts?.maxTurns ?? 100;
  const timeoutMs = opts?.timeoutMs ?? 20 * 60 * 1000; // 20 minutes
  const pluginDir = getPluginDir();

  const prompt = [
    `Resolve Linear issue ${identifier} (ID: ${issueId}).`,
    `You MUST invoke the resolve-linear-issue skill using the Skill tool`,
    `before starting any implementation work.`,
    `The workflow is NOT complete until: PR checks pass, pr-reviewer`,
    `approves the PR, and the Linear issue is updated.`,
  ].join(" ");

  const args = [
    "-p", prompt,
    "--dangerously-skip-permissions",
    "--max-turns", String(maxTurns),
    "--output-format", "stream-json",
    "--plugin-dir", pluginDir,
  ];

  const start = Date.now();

  // Use spawnSync so we can inherit stderr for real-time visibility
  // while capturing stdout for JSON parsing
  const result = spawnSync("claude", args, {
    cwd: repoPath,
    encoding: "utf-8",
    timeout: timeoutMs,
    stdio: ["pipe", "pipe", "inherit"], // stdin: pipe, stdout: capture, stderr: show in terminal
    env: { ...process.env },
    maxBuffer: 50 * 1024 * 1024, // 50MB
  });

  const durationMs = Date.now() - start;
  const exitCode = result.status ?? 1;
  const stdout = result.stdout ?? "";

  const jsonOutput = parseClaudeOutput(stdout);

  return { exitCode, jsonOutput, rawStdout: stdout, durationMs };
}
