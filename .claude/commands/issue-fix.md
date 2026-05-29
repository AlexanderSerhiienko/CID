# Issue Fix

Pick up the next GitHub Issue from the Ready to Fix column of the CID Bug Tracker project and resolve it.

## Process

1. Fetch open issues from AlexanderSerhiienko/CID that have label ready-to-fix or are in the Ready to Fix column of the CID Bug Tracker project.

2. Pick the highest severity issue. If multiple, pick the oldest by creation date.

3. Read the issue body carefully. Go to the exact file and line mentioned. Understand the bug before touching any code.

4. Follow the standard workflow from CLAUDE.md:
   - Create a branch: fix/issue-NUMBER-short-slug
   - Fix the bug, minimal change, no refactoring
   - Add or update a test that catches this bug
   - Run: npm run typecheck && npm run lint && npm run test

5. Open a PR:
   - Title: fix: issue title without [bug] prefix
   - Body: Closes #NUMBER and description of what changed and why

6. Report the PR URL to the user.

## Constraints

- Fix only what the issue describes, no bonus cleanup
- If the fix requires a DB migration or schema change, stop and ask the user
- If tests fail after the fix, debug before opening the PR
