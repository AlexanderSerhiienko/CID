import { describe, expect, it } from "vitest";
import { formatDate, formatRelativeTime, hoursUntilNextDailyRun } from "./utils";

const FIXED_NOW = new Date("2025-05-29T12:00:00Z");

describe("formatRelativeTime", () => {
  it("returns 'just now' for <60s ago", () => {
    const date = new Date(FIXED_NOW.getTime() - 30_000);
    expect(formatRelativeTime(date, FIXED_NOW)).toBe("just now");
  });

  it("returns minutes for <60min ago", () => {
    const date = new Date(FIXED_NOW.getTime() - 5 * 60_000);
    expect(formatRelativeTime(date, FIXED_NOW)).toBe("5 minutes ago");
  });

  it("returns singular minute", () => {
    const date = new Date(FIXED_NOW.getTime() - 1 * 60_000);
    expect(formatRelativeTime(date, FIXED_NOW)).toBe("1 minute ago");
  });

  it("returns hours for <24h ago", () => {
    const date = new Date(FIXED_NOW.getTime() - 3 * 3600_000);
    expect(formatRelativeTime(date, FIXED_NOW)).toBe("3 hours ago");
  });

  it("returns singular hour", () => {
    const date = new Date(FIXED_NOW.getTime() - 1 * 3600_000);
    expect(formatRelativeTime(date, FIXED_NOW)).toBe("1 hour ago");
  });

  it("returns days for <30 days ago", () => {
    const date = new Date(FIXED_NOW.getTime() - 2 * 86400_000);
    expect(formatRelativeTime(date, FIXED_NOW)).toBe("2 days ago");
  });

  it("returns months for >=30 days ago", () => {
    const date = new Date(FIXED_NOW.getTime() - 60 * 86400_000);
    expect(formatRelativeTime(date, FIXED_NOW)).toBe("2 months ago");
  });
});

describe("formatDate", () => {
  it("omits year when same year as now", () => {
    const date = new Date("2025-03-15T10:00:00Z");
    const result = formatDate(date, FIXED_NOW);
    expect(result).toBe("Mar 15");
  });

  it("includes year when different year", () => {
    const date = new Date("2024-03-15T10:00:00Z");
    const result = formatDate(date, FIXED_NOW);
    expect(result).toContain("2024");
    expect(result).toContain("Mar");
  });
});

describe("hoursUntilNextDailyRun", () => {
  it("returns correct hours when cron has not yet run today", () => {
    const now = new Date("2025-05-29T06:00:00Z"); // 6am UTC, cron at 8am
    expect(hoursUntilNextDailyRun(now)).toBe(2);
  });

  it("returns hours until tomorrow when past 8am UTC", () => {
    const now = new Date("2025-05-29T09:00:00Z"); // 9am UTC, past today's run
    // next run is at 8am tomorrow = 23 hours away → ceil = 23
    expect(hoursUntilNextDailyRun(now)).toBe(23);
  });
});
