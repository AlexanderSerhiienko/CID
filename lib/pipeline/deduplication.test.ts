import { describe, expect, it } from "vitest";
import { EventCategory } from "@prisma/client";
import { isDuplicateCandidate } from "@/lib/pipeline/deduplication";
import { jaccardSimilarity } from "@/lib/pipeline/similarity";

describe("jaccardSimilarity", () => {
  it("detects similar titles", () => {
    expect(
      jaccardSimilarity(
        "Hantavirus cases reported in Patagonia",
        "Argentina investigates new hantavirus cases"
      )
    ).toBeGreaterThan(0.2);
  });

  it("returns 0 for two empty token sets — no false dedup on short-word-only titles", () => {
    // All tokens are ≤ 2 chars and are filtered out, producing empty sets.
    // Must return 0 (not similar), not 1 (identical).
    expect(jaccardSimilarity("M 3.1 in US", "M 4.2 in UK")).toBe(0);
  });

  it("returns 0 for two empty strings", () => {
    expect(jaccardSimilarity("", "")).toBe(0);
  });
});

describe("isDuplicateCandidate", () => {
  it("matches likely duplicate events", () => {
    const createdAt = new Date("2026-05-18T10:00:00Z");

    expect(
      isDuplicateCandidate(
        {
          title: "Hantavirus cases reported in Patagonia",
          summary: "Health officials confirmed cases in southern Argentina.",
          category: EventCategory.DISEASE_OUTBREAK,
          country: "Argentina",
          city: null,
          publishedAt: new Date("2026-05-19T10:00:00Z")
        },
        {
          title: "Argentina investigates new hantavirus cases",
          summary: "Officials are investigating hantavirus cases in Argentina.",
          category: EventCategory.DISEASE_OUTBREAK,
          country: "Argentina",
          city: null,
          createdAt
        }
      )
    ).toBe(true);
  });

  it("does not merge different categories", () => {
    const createdAt = new Date("2026-05-18T10:00:00Z");

    expect(
      isDuplicateCandidate(
        {
          title: "Airport disruption in Paris",
          summary: "Flights delayed after airport strike.",
          category: EventCategory.TRANSPORT_DISRUPTION,
          country: "France",
          city: "Paris",
          publishedAt: createdAt
        },
        {
          title: "Paris protest causes clashes",
          summary: "Political unrest reported in Paris.",
          category: EventCategory.POLITICAL_UNREST,
          country: "France",
          city: "Paris",
          createdAt
        }
      )
    ).toBe(false);
  });

  it("does not merge distinct events in the same country (low title overlap)", () => {
    const createdAt = new Date("2026-05-18T10:00:00Z");

    // "earthquake Japan" vs "flood Japan" — only country token shared
    expect(
      isDuplicateCandidate(
        {
          title: "Major 7.0 earthquake strikes northern Japan coastline",
          summary: "A strong earthquake caused damage along Japan's northern coast.",
          category: EventCategory.NATURAL_DISASTER,
          country: "Japan",
          city: null,
          publishedAt: new Date("2026-05-19T10:00:00Z")
        },
        {
          title: "Severe flooding kills five in western Japan after heavy rainfall",
          summary: "Floodwaters swept through western Japan following record rainfall.",
          category: EventCategory.NATURAL_DISASTER,
          country: "Japan",
          city: null,
          createdAt
        }
      )
    ).toBe(false);
  });

  it("does not merge unknown-location events automatically", () => {
    const createdAt = new Date("2026-05-18T10:00:00Z");

    expect(
      isDuplicateCandidate(
        {
          title: "Green forest fire notification",
          summary: "A forest fire started near an unknown location.",
          category: EventCategory.NATURAL_DISASTER,
          country: null,
          city: null,
          publishedAt: createdAt
        },
        {
          title: "Green forest fire notification",
          summary: "A forest fire started near another unknown location.",
          category: EventCategory.NATURAL_DISASTER,
          country: null,
          city: null,
          createdAt
        }
      )
    ).toBe(false);
  });
});
