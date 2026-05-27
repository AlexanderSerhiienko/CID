# ADR 001: AI-Assisted Engineering Workflow

## Status

Accepted

## Context

The project is intended to demonstrate both fullstack engineering and practical AI usage. If AI usage only happens in private chats, reviewers cannot evaluate the reasoning process or engineering discipline behind the project.

The project also should not depend on paid external AI APIs for its core runtime behavior.

## Decision

AI is embedded into the development workflow through structured context files, not through a separate audit trail.

The repository includes:

- `CLAUDE.md` — project context, conventions, and workflow instructions read automatically by Claude Code
- `agents/` — role-specific instructions for planning, coding, review, testing, refactoring, and DevOps
- `ROADMAP.md` — next features with architecture and acceptance criteria
- Architecture Decision Records for important tradeoffs

Runtime AI is optional. The application may use local Ollama for structured extraction from article text, but deterministic rules must remain the fallback.

## Alternatives Considered

### Use AI only privately

Easy but leaves no evidence of the engineering process or workflow.

### Maintain a separate ai-workflow/ audit trail

Produces a large volume of historical documents that quickly become stale and don't help AI tools work on the project.

### Embed AI workflow into the codebase as context

Chosen because `CLAUDE.md` and `agents/` are read by Claude Code automatically, making the workflow active rather than archived.

## Consequences

- Claude Code reads `CLAUDE.md` on every session and follows the defined workflow.
- Agent roles are explicit and can be invoked per task.
- Documentation stays lean and accurate — no graveyard of historical prompts.
- AI outputs are treated as engineering input, not authoritative decisions.

