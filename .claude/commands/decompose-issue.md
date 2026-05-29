# Decompose Issue

Fetch a GitHub issue and decompose it into an implementation plan using the project's planner format.

Usage: /decompose-issue <issue-number>

## Process

1. Fetch issue #$ARGUMENTS from AlexanderSerhiienko/CID using the GitHub MCP.

2. Read `agents/planner.md` to understand the planning format.

3. Produce a plan in exactly this format:

```
## Feature: [issue title]

### What it does
[one sentence]

### Layers affected
- [ ] schema.prisma
- [ ] lib/pipeline/
- [ ] app/api/
- [ ] app/ (UI)
- [ ] workers/
- [ ] tests

### Implementation steps
1. ...
2. ...

### Tests needed
- ...

### Risks
- ...

### Definition of done
- [ ] typecheck passes
- [ ] lint passes
- [ ] tests pass
- [ ] PR opened with Closes #NUMBER
```

4. After printing the plan, ask: "Ready to implement? (use /issue-fix or tell me what to change)"

## Constraints

- Follow all rules from agents/planner.md
- If the issue involves deduplication or scoring, flag it prominently in Risks
- If a DB migration is needed, make it step 1
- Estimate complexity: S / M / L based on number of layers affected and steps count
