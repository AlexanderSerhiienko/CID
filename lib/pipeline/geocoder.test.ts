import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { geocodeLocation } from "./geocoder";

const nominatimResponse = (country: string, lat: string, lon: string) =>
  JSON.stringify([
    {
      lat,
      lon,
      display_name: `Some place, ${country}`,
      address: { country }
    }
  ]);

describe("geocodeLocation", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
    process.env.NOMINATIM_ENABLED = "true";
    // Reset module-level cache between tests by clearing it via the module itself
    // We rely on vitest module isolation for a clean state between test files
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.NOMINATIM_ENABLED;
  });

  it("returns null when NOMINATIM_ENABLED=false", async () => {
    process.env.NOMINATIM_ENABLED = "false";
    const result = await geocodeLocation("Costa Rica");
    expect(result).toBeNull();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("returns geocoder result for a known country", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(nominatimResponse("Costa Rica", "9.7489", "-83.7534"), { status: 200 })
    );

    const result = await geocodeLocation("Costa Rica");
    expect(result).toMatchObject({
      country: "Costa Rica",
      lat: 9.7489,
      lon: -83.7534,
      confidence: expect.any(Number)
    });
    expect(result!.confidence).toBeGreaterThan(0);
  });

  it("returns null when Nominatim returns empty array", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response("[]", { status: 200 })
    );

    const result = await geocodeLocation("xyzzy-not-a-place");
    expect(result).toBeNull();
  });

  it("returns null when Nominatim returns non-200", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response("Too Many Requests", { status: 429 })
    );

    const result = await geocodeLocation("Ukraine");
    expect(result).toBeNull();
  });

  it("returns null on fetch error (timeout)", async () => {
    vi.mocked(fetch).mockRejectedValueOnce(new Error("AbortError"));

    const result = await geocodeLocation("Vanuatu");
    expect(result).toBeNull();
  });

  it("returns null for empty query", async () => {
    const result = await geocodeLocation("");
    expect(result).toBeNull();
    expect(fetch).not.toHaveBeenCalled();
  });
});
