import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { extractWithAI } from "./ai-extraction";

const validGroqResponse = (overrides: Record<string, unknown> = {}) =>
  JSON.stringify({
    choices: [
      {
        message: {
          content: JSON.stringify({
            category: "DISEASE_OUTBREAK",
            severity: "HIGH",
            summary: "Ebola outbreak confirmed in the Democratic Republic of Congo.",
            isRiskEvent: true,
            city: "Kinshasa",
            country: "Democratic Republic of Congo",
            ...overrides
          })
        }
      }
    ]
  });

describe("extractWithAI", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
    process.env.GROQ_API_KEY = "test-key";
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.GROQ_API_KEY;
  });

  it("returns null when GROQ_API_KEY is not set", async () => {
    delete process.env.GROQ_API_KEY;
    const result = await extractWithAI("Ebola in DRC", "...");
    expect(result).toBeNull();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("returns parsed extraction on valid Groq response", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(validGroqResponse(), { status: 200 })
    );

    const result = await extractWithAI("Ebola outbreak in DRC", "Confirmed cases...");
    expect(result).toMatchObject({
      category: "DISEASE_OUTBREAK",
      severity: "HIGH",
      isRiskEvent: true,
      summary: expect.any(String),
      city: "Kinshasa",
      country: "Democratic Republic of Congo"
    });
  });

  it("returns null when Groq API returns non-200", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response("Too Many Requests", { status: 429 })
    );

    const result = await extractWithAI("Some article", "...");
    expect(result).toBeNull();
  });

  it("returns null when LLM response fails Zod validation (invalid category)", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(validGroqResponse({ category: "VOLCANO_ERUPTION" }), { status: 200 })
    );

    const result = await extractWithAI("Volcano in Iceland", "...");
    expect(result).toBeNull();
  });

  it("returns null when LLM returns non-JSON text", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          choices: [{ message: { content: "Sorry, I cannot help with that." } }]
        }),
        { status: 200 }
      )
    );

    const result = await extractWithAI("Some article", "...");
    expect(result).toBeNull();
  });

  it("returns null on fetch timeout / network error", async () => {
    vi.mocked(fetch).mockRejectedValueOnce(new Error("AbortError"));

    const result = await extractWithAI("Some article", "...");
    expect(result).toBeNull();
  });

  it("strips markdown code fences from LLM response", async () => {
    const contentWithFences =
      "```json\n" +
      JSON.stringify({
        category: "NATURAL_DISASTER",
        severity: "CRITICAL",
        summary: "Major earthquake struck southern Turkey.",
        isRiskEvent: true,
        city: "Gaziantep",
        country: "Turkey"
      }) +
      "\n```";

    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(
        JSON.stringify({ choices: [{ message: { content: contentWithFences } }] }),
        { status: 200 }
      )
    );

    const result = await extractWithAI("Earthquake in Turkey", "...");
    expect(result).toMatchObject({ category: "NATURAL_DISASTER", severity: "CRITICAL" });
  });
});
