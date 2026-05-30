/**
 * Direct test of location enrichment — simulates what would happen
 * for a WHO Ebola article or CDC notice that passed the quality gate.
 */
import { enrichLocation, shouldEnrichLocation } from "../lib/pipeline/location-enrichment";
import { EventCategory } from "@prisma/client";

const testCases = [
  {
    label: "WHO Ebola DRC",
    title: "Epidemic of Ebola Disease caused by Bundibugyo virus in the Democratic Republic of the Congo and Uganda",
    rawText: `Eight laboratory-confirmed cases, 246 suspected cases and 80 suspected deaths have been reported
    in Ituri Province, Democratic Republic of the Congo. Two laboratory confirmed cases have been reported
    in Kampala, Uganda. The outbreak is centered in the Bunia health zone within Ituri Province.
    Cases have also been reported in Rwampara and Mongbwalu health zones.`,
    country: "Democratic Republic of the Congo",
    params: { isLikelyRiskEvent: true, riskSignals: ["outbreak", "cases", "deaths", "death"], category: EventCategory.DISEASE_OUTBREAK, locationConfidence: 0.65 }
  },
  {
    label: "CDC Diphtheria Guinea",
    title: "Level 2 - Diphtheria in Guinea",
    rawText: `There are confirmed and suspect cases of diphtheria in the Kankan region of Guinea.
    The outbreak has been ongoing since early 2026. Travelers to the Kankan region should be aware of the risk.`,
    country: "Guinea",
    params: { isLikelyRiskEvent: true, riskSignals: ["outbreak", "cases", "confirmed"], category: EventCategory.DISEASE_OUTBREAK, locationConfidence: 0.65 }
  },
  {
    label: "CDC RMSF Mexico",
    title: "Level 1 - Rocky Mountain Spotted Fever in Mexico",
    rawText: `Rocky Mountain Spotted Fever (RMSF) cases and deaths have been reported in northern Mexico,
    particularly in Tijuana and Mexicali in Baja California, and in Hermosillo, Sonora.
    The disease is transmitted by tick bites.`,
    country: "Mexico",
    params: { isLikelyRiskEvent: true, riskSignals: ["cases", "deaths", "death", "confirmed"], category: EventCategory.DISEASE_OUTBREAK, locationConfidence: 0.65 }
  },
  {
    label: "ECDC Shigellosis Cabo Verde",
    title: "Epidemiological update: Shigellosis in travellers returning from Cabo Verde",
    rawText: `Most affected individuals stayed at the same hotel chain in the Santa Maria region on the island of Sal.
    The likelihood of travellers contracting Shigella when visiting the Santa Maria region in Cabo Verde is moderate.`,
    country: "Cabo Verde",
    params: { isLikelyRiskEvent: true, riskSignals: ["cases", "outbreak", "infection", "contamination"], category: EventCategory.DISEASE_OUTBREAK, locationConfidence: 0.65 }
  },
  {
    label: "FDA Recall (should FAIL gate - only 1 signal)",
    title: "HH Fresh Trading Recalls Enoki Mushrooms Because of Possible Health Risk",
    rawText: `HH Fresh Trading is recalling Enoki Mushrooms because of possible health risk.`,
    country: "United States",
    params: { isLikelyRiskEvent: true, riskSignals: ["recall"], category: EventCategory.FOOD_SAFETY_ALERT, locationConfidence: 0.65 }
  },
];

async function main() {
  for (const tc of testCases) {
    const gate = shouldEnrichLocation({ ...tc.params, country: tc.country });
    console.log(`\n[${tc.label}]`);
    console.log(`  Gate: ${gate ? "✅ PASS" : "❌ SKIP"}`);

    if (!gate) continue;

    const result = await enrichLocation({ title: tc.title, rawText: tc.rawText, country: tc.country });
    if (result) {
      console.log(`  AI extracted: "${result.placeName}"`);
      console.log(`  Geocoded: ${result.country} → ${result.lat.toFixed(4)}, ${result.lon.toFixed(4)}`);
    } else {
      console.log(`  Result: null (Groq returned NONE or Nominatim failed)`);
    }
  }
}

main().catch(console.error);
