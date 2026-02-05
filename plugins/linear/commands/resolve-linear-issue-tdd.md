---
name: resolve-linear-issue-tdd
description: Resolve a linear issue end-to-end using Test Driven Development. This involves investigating the issue and relevant context, generating a detailed plan, implementing the plan using Test Driven Development (TDD), and deploying the changes.
---

# Resolve Linear Issue

This a workflow to resolve a Linear issue end-to-end using Test Driven Development (TDD). It is designed to be flexible and adaptable to different types of issues. Use your understanding of the issue, project context, tools, etc. to adjust the workflow as needed. You should leverage your team of agents whenever possible - see specifically the steps that call for "General", "Plan", and "test-analyzer" agents.

Start by creating a TODO list to complete all steps outlined below.

## Steps

1. Get issue details

Use the `mcp__linear__get_issue` tool directly to fetch the issue details (e.g. with `{"id": "spr-12"}`).

2. Generate issue branch

Create a new issue branch following the user's typical process, typically from `main` or `dev` if they have a staging branch. Name the branch after the issue ID to automatically link it to linear (e.g. spr-123-my-feature). This automatically moves the issue to "In Progress" in Linear.

3. **Call a new Plan agent** to investigate the issue and generate a plan to resolve the issue using Test Driven Development (TDD).

The following instructions are an example, modify or add as needed.

<example_prompt>
You **MUST** use the test-driven-development skill for this task. Start by invoking the skill to understand the implementation strategy.

Use the `mcp__linear__get_issue` tool directly to fetch the issue details (e.g. with `{"id": "spr-12"}`).

Gather additional context if relevant, e.g.:

- See related git commit and PRs
- Explore relevant code
- Sentry for error/issue logs
- Use PSQL to explore the local dev db, or Supabase to access actual PROD data
- Render for backend logs
- etc.
</example_prompt>

4. Call a new General agent to implement the plan. 

After implementation, the agent must run the tests and ensure they pass. The agent must also ensure that all linters and type checkers pass, apply supabase migrations locally and ensure no errors, and that bun run build completes successfully.

5. Commit and push the changes on the issue branch, then open a PR into main for review.

6. Update the linear issue with any relevant information or findings that are important for posterity. Do not change the issue status/state, it will automatically move to "Done" when the PR is merged.

7. Start a background task to monitor the PR checks until they've all completed running. IF any checks failed, call a new General agent to read the check results, fix the failures, commit and push the changes and add a comment to the PR summarizing the changes made. You can ignore failed Vercel deployments due to permissions errors.

8. You, Claude, must read the complete PR Review. If any issues/recommendations have been raised, call a General agent to address **ALL** issues, even minor ones.

The general agent should: 
- Read the full PR review
- Address **ALL** issues, even minor ones
- Re-run tests as needed
- Commit the updates and push
- Add a comment to the PR summarizing the changes made.

9. Clean up by killing any background tasks
