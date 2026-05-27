# ADR 002: Hybrid Extraction With Rules Before Ollama

## Status

Accepted

## Context

The system needs to convert raw article text into structured candidate risk events. Local AI through Ollama can help extract summaries, locations, categories, and severity hints, but it may be slow, unavailable, or return invalid JSON.

The MVP must remain reliable without external paid AI APIs.

## Decision

The extraction pipeline will start with deterministic rules and treat Ollama as optional enrichment.

```text
RawArticle
  -> rules-based extraction
  -> optional Ollama extraction
  -> schema validation
  -> merge valid fields
  -> fallback to rules
  -> needs_review or published candidate
```

Ollama output must be validated before it affects a `RiskEvent`. Missing, vague, or low-confidence fields should send the event to human review.

## Alternatives Considered

### AI-only extraction

Rejected because local models can be unreliable and hard to deploy consistently.

### Rules-only extraction forever

Acceptable for MVP, but less flexible for ambiguous text and summaries.

### Hybrid extraction

Chosen because it demonstrates practical AI usage while keeping deterministic behavior.

## Consequences

- The app works without Ollama.
- AI hallucination risk is reduced by schema validation and human review.
- The extraction code needs clear fallback behavior.
- Tests must cover AI timeout, invalid JSON, and missing fields.

