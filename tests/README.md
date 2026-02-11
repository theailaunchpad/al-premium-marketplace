# Linear-PM Test Scaffold

Setup and teardown scripts that create a real Linear project with 7 issues in a diamond dependency graph, plus a stub git repo, for end-to-end testing of the `resolve-linear-project` skill.

## Prerequisites

- Node.js 20+
- A Linear API key with write access
- `npm install` in this directory

## Environment Variables

| Variable | Required | Description |
|---|---|---|
| `LINEAR_API_KEY` | Yes | Linear personal API key |
| `LINEAR_TEAM_KEY` | No | Team key (e.g. `ENG`). Falls back to first team in workspace. |

## Usage

```bash
cd plugins/linear-pm/tests
npm install

# Create project, issues, stub repo, and manifest
LINEAR_API_KEY=<key> npm run setup

# Archive project, cancel issues, remove repo and manifest
LINEAR_API_KEY=<key> npm run teardown
```

## Dependency Graph

```
Wave 0:  A (Express scaffold)     B (Prisma ORM setup)
            \        /               \        /
Wave 1:      C (Task CRUD)           D (User CRUD)
            /        \               /        \
Wave 2:  E (User-task assoc.)     F (Validation + errors)
            |
Wave 3:  G (Pagination + sorting)
```

9 dependency relations:
- C blocked by A, B
- D blocked by A, B
- E blocked by C, D
- F blocked by C, D
- G blocked by E

## Manifest (`test-manifest.json`)

Written by setup, read by teardown. Contains:

```json
{
  "createdAt": "ISO string",
  "projectId": "uuid",
  "projectName": "[Test] Task Manager REST API - <timestamp>",
  "teamId": "uuid",
  "teamKey": "ENG",
  "issues": [
    { "key": "A", "id": "uuid", "identifier": "ENG-101", "title": "...", "wave": 0, "blockedByKeys": [] }
  ],
  "dependencyMap": { "C": ["A", "B"], "D": ["A", "B"], "E": ["C", "D"], "F": ["C", "D"], "G": ["E"] },
  "waves": { "0": ["A", "B"], "1": ["C", "D"], "2": ["E", "F"], "3": ["G"] },
  "testRepoPath": "/abs/path/to/.test-repos/task-manager-api-<ts>"
}
```

## Troubleshooting

**"test-manifest.json already exists"** — Run teardown first, or delete the manifest manually if a previous run failed mid-setup.

**"No teams found"** — Verify your `LINEAR_API_KEY` has access to at least one team. Set `LINEAR_TEAM_KEY` to target a specific team.

**"Failed to create project"** — Check that your API key has project creation permissions in the workspace.
