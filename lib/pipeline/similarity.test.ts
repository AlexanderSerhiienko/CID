import { describe, expect, it } from "vitest";
import { jaccardSimilarity } from "./similarity";

describe("jaccardSimilarity", () => {
  it("returns 1 for identical strings", () => {
    expect(jaccardSimilarity("flood in germany", "flood in germany")).toBe(1);
  });

  it("returns 0 for completely different strings", () => {
    expect(jaccardSimilarity("earthquake in japan", "hurricane in florida")).toBe(0);
  });

  it("returns partial score for overlapping tokens", () => {
    const score = jaccardSimilarity("flood in germany", "flood in france");
    // intersection: {flood, germany} ∩ {flood, france} = {flood} → 1
    // union: {flood, germany, france} → 3
    expect(score).toBeCloseTo(1 / 3);
  });

  it("ignores tokens of length <= 2", () => {
    // "in" and "a" filtered out — only "flood" and "germany" / "france" remain
    const score = jaccardSimilarity("a flood in germany", "a flood in france");
    expect(score).toBeCloseTo(1 / 3);
  });

  it("returns 0 when both strings have no meaningful tokens", () => {
    // All tokens ≤ 2 chars — prevents false dedup of short seismic event titles
    expect(jaccardSimilarity("M 3.1 in US", "M 4.2 in US")).toBe(0);
  });

  it("is case-insensitive", () => {
    expect(jaccardSimilarity("Flood In Germany", "flood in germany")).toBe(1);
  });

  it("strips punctuation before comparing", () => {
    expect(jaccardSimilarity("flood, germany!", "flood germany")).toBe(1);
  });

  it("returns 0 for empty strings", () => {
    expect(jaccardSimilarity("", "")).toBe(0);
  });

  it("returns 0 when one string is empty", () => {
    expect(jaccardSimilarity("flood in germany", "")).toBe(0);
  });
});
