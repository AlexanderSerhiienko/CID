# ADR 003: BullMQ For Ingestion Jobs

## Status

Accepted

## Context

RSS and open-data ingestion should not depend on a user request staying open. Feeds can be slow, unavailable, malformed, or large. Ingestion also needs retries, failure tracking, and safe background execution.

## Decision

Use BullMQ with Redis for ingestion jobs.

API routes may enqueue ingestion work, while workers perform feed fetching, parsing, raw article storage, extraction, deduplication, and scoring.

## Alternatives Considered

### Simple cron inside the web process

Easy to start but weak for retries, concurrency control, and failure visibility.

### External workflow system

Powerful but too heavy for the MVP.

### BullMQ and Redis

Good fit for a portfolio project because it demonstrates realistic background processing without a large distributed system.

## Consequences

- Redis becomes a local development and deployment dependency.
- Workers must be idempotent because retries can happen.
- Failed jobs should be observable through logs or a dead-letter queue.
- Tests should cover duplicate prevention under retry behavior.

