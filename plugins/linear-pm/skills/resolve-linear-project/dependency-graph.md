# Dependency Graph Analysis

Transform Linear issue `blockedBy` relationships into a wave-based
execution plan for the Agent Teams shared task list.

## Algorithm

### Input
List of issues, each with: id, identifier, title, status, blockedBy[]

### Step 1: Filter
Remove issues with status Done or Canceled.

### Step 2: Build adjacency map

```
depends_on[issue_id] = [blocker_id_1, blocker_id_2, ...]
```

Remove any blockers that are already Done (they are satisfied).

### Step 3: Topological sort into waves

```
wave = 0
while unassigned issues remain:
    current_wave = issues where ALL blockers are in prior waves (or none)
    if current_wave is empty:
        ERROR: Cycle detected among remaining issues
    assign current_wave to wave number
    wave++
```

### Step 4: Validate
- All issues assigned to a wave = success
- Any remaining = report cycle with involved issue IDs

### Output

```
Wave 0: [ENG-101, ENG-102]    (independent, start immediately)
Wave 1: [ENG-103, ENG-104]    (depend on Wave 0)
Wave 2: [ENG-105]             (depends on Wave 1)
```

## Mapping to Task List

- Wave 0 tasks: no blockedBy
- Wave 1 tasks: blockedBy = [task IDs of their Wave 0 dependencies]
- Wave N tasks: blockedBy = [task IDs of their Wave N-1 dependencies]

Teammates automatically see tasks become available as dependencies
are marked completed.
