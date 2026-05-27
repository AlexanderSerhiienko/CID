# ADR 004: First Vertical Slice Before Feature Expansion

## Status

Accepted

## Context

The project has many possible features: richer source management, more feeds, local Ollama extraction, map filters, event merging, job dashboards, authentication, and operational tooling.

After the first implementation pass, the repository has a working skeleton, but the end-to-end ingestion loop still needs validation with a real database and live feed data.

## Decision

Prioritize one verified vertical slice before adding more features:

```text
Source -> RawArticle -> extracted RiskEvent -> review -> published dashboard event
```

The next milestone is stabilization, not scope expansion.

## Alternatives Considered

### Add more UI first

This would make the app look richer but would not prove the core ingestion pipeline.

### Add Ollama extraction first

This would make the project sound more AI-heavy, but it would add uncertainty before deterministic behavior is verified.

### Verify the vertical slice first

This demonstrates engineering discipline and gives every later feature a reliable base.

## Consequences

- The project may look simpler for a short period.
- The core story becomes stronger because the main pipeline is proven.
- Future AI extraction can be compared against deterministic fallback behavior.
- Tests and documentation can map directly to real behavior.

