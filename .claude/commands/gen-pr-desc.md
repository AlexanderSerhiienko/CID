# Generate PR Description

Generate a pull request title and body from the current branch diff.

## Process

1. Run `git log main..HEAD --oneline` to see commits on this branch.

2. Run `git diff main...HEAD --stat` to see changed files.

3. Run `git diff main...HEAD` for the full diff (read key changes, not every line).

4. Extract the issue number from the branch name (pattern: fix/NUMBER- or feat/NUMBER-).

5. Generate:

**Title** (under 60 chars, imperative, no "Co-Authored-By"):
- bug fix → `fix: <what was fixed>`
- feature → `feat: <what was added>`

**Body:**
```
## What changed
- [bullet per logical change]

## Why
[one sentence — the problem this solves or the issue it closes]

## How to test
- [ ] [specific step]
- [ ] [specific step]

Closes #NUMBER
```

6. Print the title and body so the user can copy it, or ask: "Создать PR прямо сейчас?"

7. If user confirms, use the GitHub MCP `create_pull_request` tool with:
   - repo: AlexanderSerhiienko/CID
   - base: main
   - head: current branch name
   - title and body as generated

## Constraints

- Never include "Co-Authored-By" in the PR body
- Keep body concise — no padding, no "this PR"
- If no issue number found in branch name, omit "Closes #"
