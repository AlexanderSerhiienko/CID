# ADR 002: Hybrid Extraction With Rules Before Groq

## Status

Accepted

## Context

The system needs to convert raw article text into structured candidate risk events. Groq can help extract summaries, locations, categories, and severity hints, but it may be rate-limited, unavailable, or return invalid JSON.

The pipeline must remain reliable even when Groq is unavailable or times out.

## Decision

The extraction pipeline starts with deterministic rules and treats Groq as optional enrichment.

```text
RawArticle
  -> rules-based extraction
  -> optional Groq extraction
  -> schema validation
  -> merge valid fields
  -> fallback to rules
  -> needs_review or published candidate
```

Groq output must be validated before it affects a `RiskEvent`. Missing, vague, or low-confidence fields should send the event to human review.

## Alternatives Considered

### AI-only extraction

Rejected because Groq can be rate-limited or return inconsistent output under load.

### Rules-only extraction forever

Acceptable for MVP, but less flexible for ambiguous text and summaries.

### Hybrid extraction

Chosen because it demonstrates practical AI usage while keeping deterministic behavior as the safety net.

## Consequences

- The app works without Groq (deterministic rules always run first).
- AI hallucination risk is reduced by schema validation and human review.
- The extraction code needs clear fallback behavior.
- Tests must cover Groq timeout, invalid JSON, and missing fields.

