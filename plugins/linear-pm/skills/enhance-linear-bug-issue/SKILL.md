---
name: enhance-linear-bug-issue
description: Enhance an existing Linear bug issue by investigating the bug, gathering additional context, and providing a root cause analysis.
---

# Enhance Linear Bug Issue

## Goal

Take an existing Linear bug issue and enrich it with reproduction details,
root cause analysis, and structured sections so that any AI coding agent
can resolve it without further context.

## Workflow

1. **Get issue details** — Use the `get_issue` tool from the Linear MCP server with the issue ID.

2. **Gather user context** — Ask the user for any additional context that may be relevant such as steps to reproduce, what happened vs the expected outcome, screenshots, error messages, etc.

3. **Gather non-codebase context** — Gather any important non-codebase context such as related git commits and PRs, error/issue tracking tools (e.g. Sentry), application/backend logs, database exploration (local dev DB or production read replicas), etc.

4. **Investigate the Bug** — Call the `root-cause-analyzer` agent to investigate the bug and provide enhanced context and analysis.

5. **Update the issue** — Use the `save_issue` tool from the Linear MCP server (pass the existing `id` to update) to add the enhanced context and analysis. Structure the update using the **bug-specific template sections** from the `create-linear-issue` skill (Reproduction Steps, Root Cause Analysis, Evidence Gathered, Possible Root Causes, Relevant Code Paths). Preserve all existing issue content — append the new sections rather than replacing what's already there.
