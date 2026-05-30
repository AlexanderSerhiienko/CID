import { describe, expect, it } from "vitest";
import { contentHash } from "./hash";

describe("contentHash", () => {
  it("returns a 64-char hex string", () => {
    expect(contentHash("some text")).toMatch(/^[a-f0-9]{64}$/);
  });

  it("produces the same hash for identical input", () => {
    expect(contentHash("flood in germany")).toBe(contentHash("flood in germany"));
  });

  it("produces different hashes for different input", () => {
    expect(contentHash("flood in germany")).not.toBe(contentHash("earthquake in japan"));
  });

  it("is case-insensitive (normalises to lowercase)", () => {
    expect(contentHash("Flood In Germany")).toBe(contentHash("flood in germany"));
  });

  it("strips HTML tags before hashing", () => {
    expect(contentHash("<p>flood in germany</p>")).toBe(contentHash("flood in germany"));
  });

  it("handles empty string without throwing", () => {
    expect(() => contentHash("")).not.toThrow();
    expect(contentHash("")).toMatch(/^[a-f0-9]{64}$/);
  });
});
