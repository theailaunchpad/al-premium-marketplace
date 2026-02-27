---
name: resolve-linear-issue
description: Resolve a linear issue end-to-end using Test Driven Development. This involves investigating the issue and relevant context, generating a detailed plan, implementing the plan using Test Driven Development (TDD), and deploying the changes. Always use this skill when you need to resolve an existing Linear issue.
---

# Resolve Linear Issue

This a workflow to resolve a Linear issue end-to-end using Test Driven Development (TDD). It is designed to be flexible and adaptable to different types of issues. Use your understanding of the issue, project context, tools, etc. to adjust the workflow as needed. You should leverage your team of agents whenever possible - see specifically the steps that call for "General", "Plan", and "test-analyzer" agents.

Start by creating a TODO list to complete all steps outlined below.

## Setup Tip

If your repository's default branch isn't `main` (e.g., `production`, `develop`), you can add this line to your project's `CLAUDE.md` so it's detected automatically:

```
Default branch: production
```

The preflight step will detect it automatically if you don't, but setting it yourself avoids the detection step and guarantees it's correct from the start.

## Steps

### 0. Preflight Checks

Before any work begins, run these checks to ensure a safe starting point.

#### 0a. Clean Working Directory

Run `git status --porcelain`. If the output is non-empty, tell the user:

> "You have unsaved changes in your project. I need a clean starting point before we begin. Here are your options:"
>
> 1. **Commit (save permanently)** — I'll save your current changes as a commit so they're part of your project history. Nothing is lost.
> 2. **Stash (set aside for later)** — I'll tuck your changes away temporarily. You can bring them back later, but they won't be in your project history. Think of it like putting papers in a drawer.
> 3. **I'll handle it myself** — I'll stop here so you can take care of it however you'd like.

- If the user chooses **commit**: commit with message `chore: save work-in-progress before resolving <ISSUE-ID>` and push.
- If the user chooses **stash**: run `git stash push -m "WIP before resolving <ISSUE-ID>"` and tell the user: "Your changes are stashed. When you want them back later, run: `git stash pop`"
- If the user chooses to handle it themselves: **STOP** the skill entirely. Do not proceed.

#### 0b. Detect Default Branch

Use a three-tier detection cascade to determine the repository's default branch:

1. `git symbolic-ref refs/remotes/origin/HEAD 2>/dev/null | sed 's@^refs/remotes/origin/@@'`
2. If empty: `git remote show origin 2>/dev/null | grep 'HEAD branch' | sed 's/.*: //'`
3. If still empty: `git branch -r --list 'origin/main' 'origin/master' 'origin/develop' 'origin/production' | head -1 | sed 's@.*origin/@@' | xargs`

If all three methods fail, ask the user for their default branch name.

Store the result as `DEFAULT_BRANCH` and use it for all branch references in the rest of this workflow.

**Persist the result:** Check the project's `CLAUDE.md` for a `Default branch:` line.
- If `CLAUDE.md` already has the line, use that value directly and skip detection.
- If it's missing, append it (e.g., `Default branch: production`) and tell the user: "I've saved your default branch as `<DEFAULT_BRANCH>` in your project's `CLAUDE.md` so I'll remember it for future sessions. You can change it there anytime."

#### 0c. Safety Checkpoint

Internally note the current position (no commit is created — this just reads where you are):

- Current commit: `git rev-parse HEAD` -> `RESTORE_POINT`
- Current branch: `git branch --show-current` -> `ORIGINAL_BRANCH`

These values are used for rollback guidance in the final step. Then offer the user:

> "Before I start, I can set up a safety bookmark — this just notes where your project is right now so we can undo everything if needed. No extra changes are made. Would you like me to set that up?"

- If the user agrees, tell them: "Safety bookmark set. Your project is currently at commit `<short hash>` on branch `<ORIGINAL_BRANCH>`. If anything goes wrong, I'll give you a simple way to get back to exactly this point."
- If the user declines, that's fine — continue without mentioning it. The values are still recorded internally for rollback guidance.

#### 0d. Verify Remote Access

Run `git fetch origin` to confirm the remote is accessible. If it fails, **STOP** and tell the user to check their credentials or network connection.

### 1. Get issue details

Use the `mcp__linear__get_issue` tool directly to fetch the issue details (e.g. with `{"id": "<issue-id>"}`).

### 2. Generate issue branch

Create a new issue branch from `DEFAULT_BRANCH`:

```bash
git checkout <DEFAULT_BRANCH>
git pull origin <DEFAULT_BRANCH> --rebase
git checkout -b <issue-identifier>-<slug>
```

Name the branch after the issue ID to automatically link it to Linear (e.g. `eng-123-my-feature`). This automatically moves the issue to "In Progress" in Linear.

### 3. **Call a new Plan agent** to investigate the issue and generate a plan to resolve the issue using Test Driven Development (TDD).

The following instructions are an example, modify or add as needed.

<example_prompt>
You **MUST** use the test-driven-development skill for this task. Start by invoking the skill to understand the implementation strategy.

Use the `mcp__linear__get_issue` tool directly to fetch the issue details (e.g. with `{"id": "<issue-id>"}`).

Gather additional context if relevant, e.g.:

- Related git commits and PRs
- Explore relevant code
- Error/issue tracking tools (e.g. Sentry)
- Database exploration (local dev DB or production read replicas)
- Application/backend logs
</example_prompt>

### 4. Call a new General agent to implement the plan.

The General agent *MUST*:
    a. Implement the plan using TDD.
    b. Run the tests and ensure they pass.
    c. Ensure that all linters and type checkers pass
    d. Run any necessary database migrations, following the migration safety protocol:
       1. Identify all migration files and summarize what each one does.
       2. Classify each migration as **reversible** (has a rollback/down migration) or **irreversible** (drops columns, deletes data, truncates tables).
       3. **Reversible migrations**: proceed and note the rollback command.
       4. **Irreversible migrations**: **STOP** and ask the user for explicit confirmation. Show exactly what changes will be made and what data may be lost.
       5. Record all migrations run (file names, timestamps) for rollback guidance in the final step.
    e. Ensure the project builds successfully
    f. Commit and push the changes on the issue branch
    g. Open a PR into `DEFAULT_BRANCH` for review.

### 5. Monitor the PR checks until they've all completed running.

    If any checks failed, call a new General agent to:
    a. Read the check results
    b. Fix the failures
    c. Commit and push the changes
    d. Add a comment to the PR summarizing the changes made.

### 6. Review and Fix

    a. Call the `pr-reviewer` agent to review the PR or re-review if new commits have been pushed.

    b. You, Claude, must read the complete PR Review. If any issues/recommendations have been raised, call a General agent to address **ALL** issues, even minor ones.

    The general agent should:
    - Read the full PR review
    - Address **ALL** issues, even minor ones
    - Re-run tests as needed
    - Commit the updates and push
    - Add a comment to the PR summarizing the changes made.

    c. Repeat 6a and 6b until the PR has been approved.

### 7. Clean up by killing any background tasks

### 8. Update the linear issue with any relevant information or findings that are important for posterity. Do not change the issue status/state, it will automatically move to "Done" when the PR is merged.

### 9. Rollback Guidance

Provide the user with a summary of how to undo the changes made during this session. Include all of the following:

1. **Undo the PR**: `gh pr close <PR-NUMBER>` or create a revert with `git revert <merge-commit>`.
2. **Restore code to pre-session state**: `git checkout <ORIGINAL_BRANCH> && git reset --hard <RESTORE_POINT>` (values from Step 0c).
3. **Delete the issue branch**: `git branch -D <issue-branch>` and `git push origin --delete <issue-branch>`.
4. **Migration rollback**: List the rollback commands for any migrations that were run, or state "No migrations were run during this session."
5. Post this rollback guidance as a comment on the Linear issue so it's preserved for reference.
