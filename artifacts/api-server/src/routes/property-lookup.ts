import { Router } from "express";
import { openai } from "@workspace/integrations-openai-ai-server";
import { geocodeAddressString } from "../geocode-helpers";

const router = Router();

export interface PropertyLookupResult {
  address: string;
  yearBuilt: number | null;
  sqft: number | null;
  beds: number | null;
  baths: number | null;
  stories: number | null;
  propertyType: string | null;
  preLeadPaint: boolean;
  confidence: "high" | "medium" | "low";
  note: string;
}

router.post("/property-lookup", async (req, res) => {
  const { address } = req.body as { address?: string };

  if (!address || typeof address !== "string" || address.trim().length < 5) {
    return res.status(400).json({ error: "A valid address is required" });
  }

  const addr = address.trim();

  // Geocode to validate the address resolves (best-effort, non-blocking)
  let geoNote = "";
  try {
    const geo = await geocodeAddressString(addr);
    if (!geo) {
      geoNote = "Address could not be precisely geocoded — estimates based on address text only.";
    }
  } catch {
    geoNote = "Geocoding unavailable.";
  }

  // Use OpenAI to infer property characteristics
  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-5-nano",
      temperature: 0,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: `You are a property data assistant for a Kentucky general contractor. Given a US residential address, estimate the property characteristics based on your knowledge of US housing stock, neighborhood patterns, and typical construction eras by location.

Return ONLY a valid JSON object with these exact fields:
{
  "yearBuilt": <integer year or null>,
  "sqft": <integer living area in SF or null>,
  "beds": <integer or null>,
  "baths": <number e.g. 2.5 or null>,
  "stories": <1 or 2 or null>,
  "propertyType": <"single_family" | "manufactured" | "townhouse" | "duplex" | "condo" | null>,
  "confidence": <"high" | "medium" | "low">,
  "note": <string, 1-2 sentences explaining your estimate basis>
}

Estimation guidelines:
- Use your knowledge of US Census housing data, zip-code demographics, and construction era patterns
- Kentucky rural/small-town addresses: manufactured homes (1970s–2000s, 1000–1800 SF) and modest ranch homes (1200–1800 SF) are very common
- Kentucky suburban/mid-size city addresses: ranch and two-story homes (1960s–2000s, 1400–2400 SF)
- Addresses with apartment/unit numbers: propertyType "condo" or "townhouse", estimate 800–1400 SF
- "confidence": "high" if you have strong training data for this area, "medium" for reasonable estimate, "low" if uncertain
- Always return a best estimate — only return nulls when truly impossible to estimate
- The note field should briefly explain your estimate basis in plain contractor language`,
        },
        {
          role: "user",
          content: `Estimate property characteristics for: ${addr}`,
        },
      ],
    });

    const raw = JSON.parse(completion.choices[0]?.message?.content ?? "{}");
    const yearBuilt = typeof raw.yearBuilt === "number" ? raw.yearBuilt : null;

    const result: PropertyLookupResult = {
      address: addr,
      yearBuilt,
      sqft: typeof raw.sqft === "number" ? raw.sqft : null,
      beds: typeof raw.beds === "number" ? raw.beds : null,
      baths: typeof raw.baths === "number" ? raw.baths : null,
      stories: typeof raw.stories === "number" ? raw.stories : null,
      propertyType: typeof raw.propertyType === "string" ? raw.propertyType : null,
      preLeadPaint: yearBuilt !== null && yearBuilt < 1978,
      confidence: (["high", "medium", "low"].includes(raw.confidence) ? raw.confidence : "low") as "high" | "medium" | "low",
      note: [typeof raw.note === "string" ? raw.note : "", geoNote].filter(Boolean).join(" "),
    };

    return res.json(result);
  } catch (err) {
    console.error("[property-lookup] OpenAI error:", err);
    return res.status(500).json({ error: "Property lookup failed. Please try again." });
  }
});

export default router;
