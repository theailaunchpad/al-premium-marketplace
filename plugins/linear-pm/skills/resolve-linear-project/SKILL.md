---
name: resolve-linear-project
description: Use when resolving all issues in a Linear project end-to-end.
  Launches parallel headless Claude Code processes, each resolving one
  issue in its own git worktree. Dependencies are respected via
  wave-based execution.
---

# Resolve Linear Project

Orchestrate resolving ALL issues in a Linear project.
Each issue is resolved by a headless Claude Code process (`claude -p`)
running in its own git worktree. Issue dependencies are respected
via wave-based execution (Wave 0 completes before Wave 1 starts).

Start by creating a TODO list to complete all steps outlined below.

## Prerequisites

- Git worktrees support (standard git)
- Linear MCP configured

## Steps

### 1. Fetch Project and Issues

Use `mcp__linear__get_project` to fetch the project.
Then use `mcp__linear__list_issues` filtered to the project
to get ALL issues.

Collect for each issue:
- ID, title, identifier (e.g., `ENG-123`)
- Status (skip Done/Canceled issues)
- `blockedBy` array (issue IDs this depends on)
- Priority

### 2. Build Dependency Graph and Wave Plan

Analyze `blockedBy` relationships. See `dependency-graph.md` for the
full algorithm.

Classify issues into execution waves:
- **Wave 0**: Issues with no unresolved blockers (start immediately)
- **Wave 1**: Issues whose blockers are all in Wave 0
- **Wave N**: Issues whose blockers are all in prior waves

If a cycle is detected, STOP and report to the user.

### 3. Determine Parallelism

```
max_concurrent = min(count(current_wave_issues), 3)
```

Cap at 3 concurrent workers. Linear projects are 5-7 issues max;
more than 3 creates diminishing returns from overhead and merge
conflict risk.

### 4. Process Each Wave (repeat for Wave 0, 1, ..., N)

#### 4a. Create Git Worktrees for Current Wave

**REQUIRED:** Use the `using-git-worktrees` skill conventions for
directory selection and safety verification.

For each issue in this wave:

```bash
git worktree add .worktrees/<issue-identifier> -b <issue-identifier>-<slug>
```

Example: `.worktrees/eng-123` with branch `eng-123-configure-oauth`

Run project setup in each worktree (auto-detect: npm install, etc.).

Copy environment files from the main working directory to each worktree.
Environment files (`.env`, `.env.local`, `.env.test`, etc.) are typically
gitignored and will NOT exist in new worktrees:

```bash
cp <main-dir>/.env* <worktree-path>/  2>/dev/null || true
```

If the project has nested env files (e.g. `frontend/.env.local`),
copy those to the corresponding subdirectory in the worktree.

#### 4b. Launch Headless Workers

For each issue in this wave (up to `max_concurrent`), launch a
headless Claude Code process using the **Bash tool with
`run_in_background: true`**:

```bash
cd <worktree-path> && claude -p \
  "Resolve Linear issue <IDENTIFIER> (ID: <ISSUE-ID>). \
   You MUST invoke the resolve-linear-issue skill using the Skill tool \
   before starting any implementation work. \
   The workflow is NOT complete until: PR checks pass, pr-reviewer \
   approves the PR, and the Linear issue is updated." \
  --dangerously-skip-permissions \
  --max-turns 200 \
  --output-format json \
  --plugin-dir plugins/linear-pm
```

Each Bash call returns a `task_id`. Record the mapping of
task_id to issue identifier and branch name.

Launch all workers for the current wave in a **single message**
with parallel Bash tool calls (one per issue).

#### 4c. Wait for Workers to Complete

Use the **TaskOutput tool** with `block: true` for each task_id.
Set a generous timeout (e.g. 600000ms / 10 minutes per check).

The JSON output from each worker includes:
- `is_error` — whether the worker failed
- `result` — the worker's final message
- `cost_usd` — cost tracking
- `num_turns` — turn count
- `session_id` — for debugging

#### 4d. Handle Failures

For each completed worker, check `is_error` in the JSON output.

- If a failed issue has no downstream dependencies in later waves:
  continue to merge successful PRs and proceed to the next wave.
- If a failed issue blocks downstream issues: report to the user
  and ask whether to retry, skip (remove dependent issues), or abort.
- To retry: re-launch just the failed workers using the same
  approach as Step 4b.

For each successful worker: verify PR exists with
`gh pr list --head <branch>`.

#### 4e. Merge PRs in Dependency Order

For each successful issue in this wave, merge its PR:

```bash
gh pr merge <pr-number> --merge
```

Merge foundational PRs first (those that other issues depend on).
Since next-wave worktrees haven't been created yet, they'll be
based on post-merge main automatically.

Wait for each merge to complete before creating next-wave worktrees.

### 5. Cleanup

Once ALL waves are complete:

a. Remove worktrees:
```bash
git worktree remove .worktrees/<identifier>
```
for each worktree created.

b. Update the Linear project with a summary of all resolved issues,
   including cost and success/failure status.

## Red Flags

**Never:**
- Run more than 3 concurrent workers per wave
- Let workers share a worktree
- Skip dependency analysis (issues may have blockers)
- Merge Wave N+1 PRs before Wave N PRs
- Leave worktrees uncleaned after completion
- Inline resolve-linear-issue steps in worker prompts

**Always:**
- Create worktrees lazily (per wave, not all at once)
- Merge PRs in dependency order
- Verify PR approval before merging
- Check `is_error` in worker output before merging
