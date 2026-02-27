---
name: resolve-linear-issue
description: Resolve a linear issue end-to-end using Test Driven Development. This involves investigating the issue and relevant context, generating a detailed plan, implementing the plan using Test Driven Development (TDD), and deploying the changes. Always use this skill when you need to resolve an existing Linear issue.
---

# Resolve Linear Issue

This is a workflow to resolve a Linear issue end-to-end using Test Driven Development (TDD). It is designed to be flexible and adaptable to different types of issues. Use your understanding of the issue, project context, tools, etc. to adjust the workflow as needed. You should leverage your team of agents whenever possible - see specifically the steps that call for "General" and "Plan" agents, and the pr-reviewer and root-cause-analyzer agents.

Start by creating a TODO list to complete all steps outlined below.

## Setup Tip

If your repository's default branch isn't `main` (e.g., `production`, `develop`), you can add this line to your project's `CLAUDE.md` so it's detected automatically:

```
Default branch: production
```

The preflight step will detect it automatically if you don't, but setting it yourself avoids the detection step and guarantees it's correct from the start.

## Steps

### 0. Preflight Checks

Follow the steps in [`shared/preflight-checks.md`](../shared/preflight-checks.md) with `<CONTEXT>` = `resolving <ISSUE-ID>`.

### 1. Get issue details

Use the `get_issue` tool from the Linear MCP server to fetch the issue details (e.g. with `{"id": "<issue-id>"}`).

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

The issue details have already been fetched in Step 1 — use those directly instead of re-fetching.

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
