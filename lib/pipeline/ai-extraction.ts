/**
 * AI-powered extraction using Groq API (free tier, llama3).
 *
 * Gated by GROQ_API_KEY — if not set, returns null and pipeline falls back to rules.
 * Output is validated with Zod before use — LLM output is never trusted raw.
 * Extracts: category, severity, summary, isRiskEvent, city, country.
 * Replaces the separate location-enrichment Groq call — one round-trip per article.
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
  isRiskEvent: z.boolean(),
  city: z.string().nullable(),
  country: z.string().nullable()
});

export type AiExtraction = z.infer<typeof AiExtractionSchema> & {
  category: EventCategory;
  severity: Severity;
};

function isEnabled(): boolean {
  return Boolean(process.env.GROQ_API_KEY);
}

const SYSTEM_PROMPT = `You are a risk intelligence analyst. Extract structured fields from a news article.

Respond with ONLY valid JSON — no markdown, no explanation:
{
  "category": one of ["DISEASE_OUTBREAK","NATURAL_DISASTER","CYBER_ATTACK","TRANSPORT_DISRUPTION","POLITICAL_UNREST","FOOD_SAFETY_ALERT","UNKNOWN"],
  "severity": one of ["LOW","MEDIUM","HIGH","CRITICAL"],
  "summary": string (1-2 sentences, max 400 chars, factual),
  "isRiskEvent": boolean,
  "city": string or null,
  "country": string or null
}

isRiskEvent: true for active incidents, advisories, alerts, outbreaks, attacks, recalls, disasters.
Set false ONLY for: statistics reports, policy negotiations, awards, organizational news, historical overviews.

Category guide:
- CYBER_ATTACK: vulnerabilities (CVE), exploits, ransomware, breaches, ICS/SCADA advisories, supply chain compromises
- DISEASE_OUTBREAK: active cases, epidemics, travel health alerts, drug-resistant infections, wastewater detections
- NATURAL_DISASTER: earthquakes, floods, wildfires, hurricanes, tsunamis
- TRANSPORT_DISRUPTION: airport/rail/port closures, strikes, accidents
- POLITICAL_UNREST: protests, riots, coups, armed conflict
- FOOD_SAFETY_ALERT: recalls, contamination, undeclared allergens, medical device corrections
- UNKNOWN: only if none of the above fits

Severity guide:
- CRITICAL: mass casualties, state of emergency, catastrophic infrastructure failure
- HIGH: confirmed deaths/hospitalizations, evacuations, exploited vulnerability in critical infrastructure, major breach
- MEDIUM: confirmed cases/incidents, active warnings, significant disruptions
- LOW: advisories, monitoring alerts, precautionary measures, potential risks

city: specific city or district name only (e.g. "Gaziantep", not "Southern Turkey" or "EU/EEA"). null if not mentioned.
country: full English country name. null if global scope or not mentioned.`;

export async function extractWithAI(
  title: string,
  rawText: string
): Promise<AiExtraction | null> {
  if (!isEnabled()) return null;

  const apiKey = process.env.GROQ_API_KEY!;
  const head = rawText.slice(0, 900);
  const tail = rawText.length > 900 ? "\n...\n" + rawText.slice(-400) : "";
  const userContent = `Title: ${title}\n\nContent: ${head}${tail}`;

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
        max_tokens: 384
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
