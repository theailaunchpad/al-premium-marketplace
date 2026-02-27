# Linear PM Plugin

A Claude Code plugin for managing and resolving Linear issues and projects
end-to-end. It gives Claude the skills and agents needed to plan, implement,
test, and deploy work tracked in Linear — from a single bug fix to an entire
project of parallel issues.

## Skills

| Skill | Description |
|-------|-------------|
| `create-linear-issue` | Create a self-contained Linear issue that any AI coding agent can implement without needing additional context. |
| `create-linear-project` | Create a Linear project and associated issues such that any AI coding agent can implement the entire project without needing additional context. |
| `resolve-linear-issue` | Resolve a Linear issue end-to-end using Test Driven Development — investigate, plan, implement, and deploy. |
| `resolve-linear-project` | Resolve ALL issues in a Linear project by launching parallel headless Claude Code processes in isolated git worktrees. **(Beta — see disclaimer below.)** |
| `enhance-linear-bug-issue` | Enhance an existing Linear bug issue by investigating the bug, gathering additional context, and providing a root cause analysis. |
| `test-driven-development` | Enforce a strict red-green-refactor TDD workflow before writing implementation code. |
| `systematic-debugging` | Structured debugging methodology for investigating bugs, test failures, or unexpected behavior. |

## Agents

| Agent | Description |
|-------|-------------|
| `issue-resolver` | Resolves a single Linear issue end-to-end within an assigned git worktree. Designed to operate as a teammate in an Agent Team. |
| `pr-reviewer` | Reviews a pull request and provides feedback. |
| `root-cause-analyzer` | Conducts a thorough root cause analysis using the systematic-debugging skill. |

## Required Linear MCP Methods

Skills reference these methods by name. Claude resolves the correct
tool prefix (e.g., `mcp__plugin_linear-pm_linear__`, `mcp__claude_ai_Linear__`)
at runtime based on the installation method.

| Method | Used by |
|--------|---------|
| `get_issue` | resolve-linear-issue, enhance-linear-bug-issue |
| `save_issue` | create-linear-issue, create-linear-project, enhance-linear-bug-issue |
| `get_project` | resolve-linear-project |
| `save_project` | create-linear-project |
| `list_issues` | resolve-linear-project |

## Bundled Skills: TDD & Systematic Debugging

`test-driven-development` and `systematic-debugging` are general-purpose
skills bundled with this plugin because the Linear PM workflows depend on
them directly. `resolve-linear-issue` enforces TDD for all implementations,
and `root-cause-analyzer` uses systematic-debugging for bug investigation.
They are not Linear-specific but are required for the plugin to function.

## Prerequisites

- Claude Code CLI
- Linear MCP server configured with a valid API key
- GitHub CLI (`gh`) authenticated
- Git worktree support (standard git)

## Beta Disclaimer: Resolve Linear Project

> **The `resolve-linear-project` skill is currently in beta.** It is under
> active testing and is not yet robust. Use it at your own risk.
>
> Known limitations and risks:
>
> - **Partial failures** — The skill may fail mid-execution, leaving behind
>   worktrees, branches, or open PRs that require manual cleanup.
> - **API costs** — Each issue spawns a full headless Claude Code session.
>   Resolving an entire project can incur significant costs.
> - **Manual intervention** — If something goes wrong (merge conflicts,
>   flaky tests, dependency issues), you may need to step in and fix things
>   by hand.
> - **Limited error recovery** — While the skill has basic retry logic, edge
>   cases may not be handled gracefully.
>
> Claude will ask for explicit confirmation before running this skill.

## Changelog

### v1.5.0

- **Fixed** MCP tool references — all skills now use portable method names
  (`save_issue`, `save_project`, `get_issue`, etc.) instead of
  installation-specific prefixed names
- **Fixed** priority label: `3=Medium` → `3=Normal` to match Linear API
- **Fixed** ghost reference to nonexistent "test-analyzer" agent
- **Fixed** redundant issue fetch in resolve-linear-issue Step 3
- **Added** shared preflight checks extracted from resolve-linear-issue
  and resolve-linear-project (~70 lines of duplication removed)
- **Added** architecture notes documenting headless `claude -p` vs
  Agent Teams coordination models
- **Added** Required Linear MCP Methods table and bundled skills note
- **Expanded** enhance-linear-bug-issue with proper structure and
  clearer update instructions
- **Removed** empty `commands/` directory
