---
name: resolve-linear-project
description: Use when resolving all issues in a Linear project end-to-end. Leverages Agent Teams for parallel execution with git worktrees for workspace isolation, coordinating dependency-aware resolution of every issue in the project.
---

# Resolve Linear Project

Orchestrate resolving ALL issues in a Linear project using Agent Teams.
Each issue is resolved by a dedicated `issue-resolver` teammate working
in its own git worktree. Issue dependencies are respected via the shared
task list's blocking mechanism.

Start by creating a TODO list to complete all steps outlined below.

## Prerequisites

- Agent Teams enabled (`CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1` in settings)
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
max_teammates = min(count(wave_0_issues), 3)
```

Cap at 3 concurrent teammates. Linear projects are 5-7 issues max;
more than 3 teammates creates diminishing returns from overhead and
merge conflict risk.

### 4. Set Up Git Worktrees

**REQUIRED:** Use the `using-git-worktrees` skill conventions for
directory selection and safety verification.

Create a worktree ONLY for Wave 0 issues initially:

```
git worktree add .worktrees/<issue-identifier> -b <issue-identifier>-<slug>
```

Example: `.worktrees/eng-123` with branch `eng-123-configure-oauth`

Run project setup in each worktree (auto-detect: npm install, etc.).

### 5. Create Agent Team

Use Teammate tool:

```
operation: "spawnTeam"
team_name: "project-<project-identifier>"
description: "Resolving all issues in Linear project: <project name>"
```

### 6. Create Tasks in Shared Task List

For EACH open issue, use TaskCreate:
- subject: "Resolve \<issue-identifier\>: \<issue-title\>"
- description: Include issue ID, worktree path (for Wave 0 issues),
  and: "Use the resolve-linear-issue skill workflow."
- activeForm: "Resolving \<issue-identifier\>"

Then establish dependencies via TaskUpdate:
- For each task whose Linear issue has `blockedBy`, add `addBlockedBy`
  pointing to the task IDs of those blocker issues.

This maps Linear dependency chains directly onto the shared task list.

### 7. Spawn Issue-Resolver Teammates for Wave 0

For each Wave 0 issue (up to `max_teammates`), spawn a teammate
using the Task tool:

- team_name: the team name from Step 5
- name: "\<issue-identifier\>-resolver" (e.g., "eng-101-resolver")
- subagent_type: "general-purpose"
- prompt: Include the full issue-resolver agent instructions (see
  `issue-resolver` agent definition). Include the team name and
  instruct them to check the shared task list.

The issue identifier in the name gives immediate observability into
which issue each teammate is working on.

### 8. Assign Wave 0 Tasks

Use TaskUpdate to assign each task to its corresponding teammate:
- Task for ENG-101 → owner: "eng-101-resolver"
- Task for ENG-102 → owner: "eng-102-resolver"
- If more Wave 0 tasks than `max_teammates`, leave extras unassigned.
  When a teammate completes its task, spawn a new teammate named
  after the next issue (e.g., "eng-104-resolver") and assign it.

### 9. Monitor and Coordinate

Enter a monitoring loop. Use delegate mode (Shift+Tab) to stay
focused on coordination.

a. **On task completion message from teammate:**
   - Verify task is marked completed in TaskList
   - Coordinate PR merge order: foundational PRs first
   - After merging a PR, notify active teammates to rebase
   - Create worktrees for newly-unblocked Wave N issues
   - For each newly-unblocked issue, spawn a new teammate named
     "\<issue-identifier\>-resolver" (e.g., "eng-103-resolver") and
     assign the corresponding task to it
   - Send shutdown_request to the completed teammate (its issue
     identifier is already in its name, so it's clear which is done)

b. **On problem report from teammate:**
   - Merge conflicts: Provide resolution guidance (blocker's
     changes are canonical)
   - Failing PR checks: Let teammate handle (resolve-linear-issue
     has check-fix loops)
   - Architectural questions spanning issues: Provide guidance

c. **Stale detection:**
   - If no messages from a teammate for extended period,
     send a status check message

#### Monitoring loop flowchart

```dot
digraph monitor {
    rankdir=TB;
    wait [label="Wait for\nteammate message" shape=box];
    type [label="Message type?" shape=diamond];
    done [label="Verify completion\nMerge PR if ready" shape=box];
    problem [label="Respond with\nguidance" shape=box];
    unblocked [label="Unblocked\ntasks exist?" shape=diamond];
    assign [label="Create worktree\nAssign to idle teammate" shape=box];
    all_done [label="All tasks\ncompleted?" shape=diamond];
    shutdown [label="Shutdown idle\nteammate" shape=box];
    cleanup [label="Step 10: Cleanup" shape=box];

    wait -> type;
    type -> done [label="completion"];
    type -> problem [label="problem"];
    done -> unblocked;
    problem -> wait;
    unblocked -> assign [label="yes"];
    unblocked -> all_done [label="no"];
    assign -> wait;
    all_done -> cleanup [label="yes"];
    all_done -> shutdown [label="no"];
    shutdown -> wait;
}
```

### 10. Cleanup

Once ALL tasks are completed:

a. Send shutdown_request to all remaining teammates
b. Wait for all shutdown confirmations
c. Use Teammate tool with `operation: "cleanup"`
d. Remove git worktrees:
   `git worktree remove .worktrees/<identifier>` for each
e. Update the Linear project with a summary of all resolved issues

## Merge Conflict Handling

When a teammate reports a merge conflict:
1. Identify conflicting files
2. Blocker's changes are canonical (they were merged first)
3. Send resolution guidance to affected teammate
4. If complex, have teammate pause for team lead guidance

## Red Flags

**Never:**
- Spawn more than 3 concurrent teammates
- Let teammates work in the same worktree
- Skip dependency analysis (issues may have blockers)
- Merge Wave N+1 PRs before Wave N PRs
- Leave worktrees uncleaned after completion

**Always:**
- Create worktrees lazily (per wave, not all at once)
- Merge PRs in dependency order
- Notify teammates to rebase after a merge
- Verify PR approval before merging
