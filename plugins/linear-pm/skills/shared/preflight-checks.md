# Preflight Checks

Shared preflight steps for skills that modify the repository. The calling
skill **must** replace `<CONTEXT>` with a description of the work being
done (e.g., `resolving ENG-123` or `resolving project`).

---

### 0a. Clean Working Directory

Run `git status --porcelain`. If the output is non-empty, tell the user:

> "You have unsaved changes in your project. I need a clean starting point before we begin. Here are your options:"
>
> 1. **Commit (save permanently)** — I'll save your current changes as a commit so they're part of your project history. Nothing is lost.
> 2. **Stash (set aside for later)** — I'll tuck your changes away temporarily. You can bring them back later, but they won't be in your project history. Think of it like putting papers in a drawer.
> 3. **I'll handle it myself** — I'll stop here so you can take care of it however you'd like.

- If the user chooses **commit**: commit with message `chore: save work-in-progress before <CONTEXT>` and push.
- If the user chooses **stash**: run `git stash push -m "WIP before <CONTEXT>"` and tell the user: "Your changes are stashed. When you want them back later, run: `git stash pop`"
- If the user chooses to handle it themselves: **STOP** the skill entirely. Do not proceed.

### 0b. Detect Default Branch

Use a three-tier detection cascade to determine the repository's default branch:

1. `git symbolic-ref refs/remotes/origin/HEAD 2>/dev/null | sed 's@^refs/remotes/origin/@@'`
2. If empty: `git remote show origin 2>/dev/null | grep 'HEAD branch' | sed 's/.*: //'`
3. If still empty: `git branch -r --list 'origin/main' 'origin/master' 'origin/develop' 'origin/production' | head -1 | sed 's@.*origin/@@' | xargs`

If all three methods fail, ask the user for their default branch name.

Store the result as `DEFAULT_BRANCH` and use it for all branch references in the rest of this workflow.

**Persist the result:** Check the project's `CLAUDE.md` for a `Default branch:` line.
- If `CLAUDE.md` already has the line, use that value directly and skip detection.
- If it's missing, append it (e.g., `Default branch: production`) and tell the user: "I've saved your default branch as `<DEFAULT_BRANCH>` in your project's `CLAUDE.md` so I'll remember it for future sessions. You can change it there anytime."

### 0c. Safety Checkpoint

Internally note the current position (no commit is created — this just reads where you are):

- Current commit: `git rev-parse HEAD` -> `RESTORE_POINT`
- Current branch: `git branch --show-current` -> `ORIGINAL_BRANCH`

These values are used for rollback guidance in the final step. Then offer the user:

> "Before I start, I can set up a safety bookmark — this just notes where your project is right now so we can undo everything if needed. No extra changes are made. Would you like me to set that up?"

- If the user agrees, tell them: "Safety bookmark set. Your project is currently at commit `<short hash>` on branch `<ORIGINAL_BRANCH>`. If anything goes wrong, I'll give you a simple way to get back to exactly this point."
- If the user declines, that's fine — continue without mentioning it. The values are still recorded internally for rollback guidance.

### 0d. Verify Remote Access

Run `git fetch origin` to confirm the remote is accessible. If it fails, **STOP** and tell the user to check their credentials or network connection.
