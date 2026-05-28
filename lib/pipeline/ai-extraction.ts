/**
 * AI-powered extraction using Groq API (free tier, llama3).
 *
 * Gated by GROQ_API_KEY — if not set, returns null and pipeline falls back to rules.
 * Output is validated with Zod before use — LLM output is never trusted raw.
 * Improves: category detection, severity assessment, summary quality.
 * Location is intentionally NOT extracted here — GeoRSS + Nominatim handle that better.
 */

import { EventCategory, Severity } from "@prisma/client";
import { z } from "zod";

const GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions";
export const GROQ_MODEL = "llama-3.1-8b-instant";
const TIMEOUT_MS = 8_000;

const AiExtractionSchema = z.object({
  category: z.enum([
    "DISEASE_OUTBREAK",
    "NATURAL_DISASTER",
    "CYBER_ATTACK",
    "TRANSPORT_DISRUPTION",
    "POLITICAL_UNREST",
    "FOOD_SAFETY_ALERT",
    "UNKNOWN"
  ]),
  severity: z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]),
  summary: z.string().min(10).max(400),
  isRiskEvent: z.boolean()
});

export type AiExtraction = z.infer<typeof AiExtractionSchema> & {
  category: EventCategory;
  severity: Severity;
};

function isEnabled(): boolean {
  return Boolean(process.env.GROQ_API_KEY);
}

const SYSTEM_PROMPT = `You are a risk intelligence analyst. Given a news article, extract structured fields.

Respond with ONLY valid JSON matching this schema exactly — no markdown, no explanation:
{
  "category": one of ["DISEASE_OUTBREAK","NATURAL_DISASTER","CYBER_ATTACK","TRANSPORT_DISRUPTION","POLITICAL_UNREST","FOOD_SAFETY_ALERT","UNKNOWN"],
  "severity": one of ["LOW","MEDIUM","HIGH","CRITICAL"],
  "summary": string (1-2 sentences, max 400 chars, factual),
  "isRiskEvent": boolean (true if article describes an active crisis or risk event)
}

Severity guide:
- CRITICAL: mass casualties, state of emergency, catastrophic infrastructure failure
- HIGH: confirmed deaths, hospitalizations, evacuations, major cyber breach
- MEDIUM: confirmed cases, disruptions, warnings, significant incidents
- LOW: advisories, monitoring, minor incidents, precautionary measures`;

export async function extractWithAI(
  title: string,
  rawText: string
): Promise<AiExtraction | null> {
  if (!isEnabled()) return null;

  const apiKey = process.env.GROQ_API_KEY!;
  const userContent = `Title: ${title}\n\nContent: ${rawText.slice(0, 1500)}`;

  try {
    const resp = await fetch(GROQ_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: GROQ_MODEL,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: userContent }
        ],
        temperature: 0,
        max_tokens: 256
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS)
    });

    if (!resp.ok) return null;

    const data = (await resp.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };

    const raw = data.choices?.[0]?.message?.content?.trim();
    if (!raw) return null;

    // Strip markdown code fences if model wrapped JSON
    const json = raw.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "").trim();

    const parsed = JSON.parse(json) as unknown;
    const result = AiExtractionSchema.safeParse(parsed);

    if (!result.success) return null;

    return result.data as AiExtraction;
  } catch {
    // Timeout, network error, JSON parse error — fall back to rules silently
    return null;
  }
}
