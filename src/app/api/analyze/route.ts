import { NextResponse } from "next/server";
import { GoogleGenAI } from "@google/genai";
import authorityMap from "@/data/authority_map.json";

export const runtime = "edge";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

const timeout = (ms: number, message: string = "Request timed out") =>
  new Promise<never>((_, reject) => setTimeout(() => reject(new Error(message)), ms));

// Retry once on 503 "High Demand" with a 2s delay before giving up.
// gemini-3.5-flash can hit transient demand spikes; one retry resolves
// the vast majority of them without any UX impact.
async function withRetry<T>(fn: () => Promise<T>, retries = 1, delayMs = 2000): Promise<T> {
  try {
    return await fn();
  } catch (err: any) {
    const is503 = err?.message?.includes('503') ||
                  err?.message?.includes('UNAVAILABLE') ||
                  err?.message?.includes('High Demand') ||
                  err?.message?.includes('high demand');
    if (retries > 0 && is503) {
      console.warn(`Gemini 503 — retrying in ${delayMs}ms...`);
      await new Promise(r => setTimeout(r, delayMs));
      return withRetry(fn, retries - 1, delayMs);
    }
    throw err;
  }
}

const MAX_IMAGE_SIZE_MB = 30;

const RATE_LIMIT_WINDOW_MS = 60_000;
const MAX_REQS_PER_WINDOW = 10;
const rateLimitMap = new Map<string, { count: number; timestamp: number }>();

// ─── CIVIC CATEGORY TAXONOMY ────────────────────────────────────────────────
// Single source of truth for issue_category. Used both as the Vision AI's
// response schema enum (forces a consistent, predictable slug instead of a
// free-form string) and to generate the human-readable list injected into
// the prompt, so the two can never drift out of sync.
//
// IMPORTANT: "pothole" and "garbage" are kept exactly as-is because existing
// authority_map.json entries (Shimla/Solan pothole, Mumbai garbage, Punjab
// pothole, per the original dataset) key off these exact strings via an
// EXACT, case-sensitive match in resolveAuthority(). Renaming them would
// silently break those existing local-officer matches.
//
// The new categories below (traffic_signal, public_toilet, tree_park,
// stray_animal, encroachment, noise_pollution, air_pollution, etc.) have no
// district/city/state entries in authority_map.json yet. That's fine —
// resolveAuthority()'s tier logic already falls through cleanly to the
// CPGRAMS national fallback (tier 4) for any category with no specific
// match, so these route correctly today and will automatically start using
// real local contacts the moment matching entries are added to
// authority_map.json — no code change needed here when that happens.
const CIVIC_CATEGORIES: { slug: string; desc: string }[] = [
  { slug: "pothole", desc: "damaged/broken road surface, potholes, severely cracked pavement" },
  { slug: "road_damage", desc: "other road-surface failures (collapsed road edge, broken divider, missing manhole cover) distinct from a simple pothole" },
  { slug: "garbage", desc: "overflowing public bins, illegal dumping, uncollected solid waste in a public space" },
  { slug: "drainage", desc: "blocked/broken stormwater drains, open drains, waterlogging caused by blocked drainage" },
  { slug: "sewage", desc: "sewage overflow or leakage, broken public sewer lines" },
  { slug: "water_supply", desc: "broken/leaking public water pipelines or public taps" },
  { slug: "streetlight", desc: "non-functional or damaged public street lighting" },
  { slug: "electricity", desc: "exposed wiring, damaged public electricity poles/transformers" },
  { slug: "traffic_signal", desc: "broken/malfunctioning traffic lights or damaged road signage" },
  { slug: "public_toilet", desc: "damaged or unhygienic public toilet facility" },
  { slug: "tree_park", desc: "fallen/hazardous trees or damaged public park infrastructure" },
  { slug: "encroachment", desc: "illegal encroachment onto public land, footpaths, or roads" },
  { slug: "illegal_construction", desc: "unauthorized construction encroaching on public space" },
  { slug: "stray_animal", desc: "a clear public-safety hazard involving a stray or dead animal in a public space (e.g. a carcass blocking a road) — not a casual sighting of an animal" },
  { slug: "air_pollution", desc: "visible smoke, open burning of waste, or dust hazard in a public space" },
  { slug: "water_pollution", desc: "visible contamination of, or dumping into, a public water body" },
  { slug: "noise_pollution", desc: "ONLY assign this if the image shows clear supporting context (e.g. a loudspeaker, generator, construction equipment) AND the citizen's description specifically describes a noise issue — never assign it from description text alone with no visual corroboration" },
  { slug: "other_civic_issue", desc: "any other genuine, clearly visible, outdoor, public-domain civic hazard that falls under a government department's responsibility but doesn't fit the categories above" },
];

const CIVIC_CATEGORY_ENUM = CIVIC_CATEGORIES.map((c) => c.slug);
const CIVIC_CATEGORY_PROMPT_LIST = CIVIC_CATEGORIES.map((c) => `- ${c.slug}: ${c.desc}`).join("\n");

async function reverseGeocode(lat: number, lng: number): Promise<{ addressName: string; district: string; state: string; city: string }> {
  try {
    const response = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1`,
      {
        headers: { "User-Agent": "CivicAI-Production-App/1.0" },
        signal: AbortSignal.timeout(5000)
      }
    );

    if (!response.ok) throw new Error(`Geocoding API error: ${response.statusText}`);

    const data = await response.json();
    if (data?.address) {
      const city = data.address.city || data.address.town || data.address.village || data.address.suburb || "";
      const state = data.address.state || "";
      const district = data.address.county || data.address.state_district || "Solan";
      const addressName = city && state ? `${city}, ${state}` : data.display_name.split(',').slice(0, 3).join(', ');

      return { addressName, district, state, city };
    }
  } catch (e) {
    console.warn("Geocoding failed, falling back to default location:", e);
  }
  return { addressName: "Solan, Himachal Pradesh", district: "Solan", state: "Himachal Pradesh", city: "Solan" };
}

// ─── AUTHORITY RESOLUTION ───────────────────────────────────────────────────
// Resolution order, each tier only used if the previous one has no match:
//   1. Exact district + category match (e.g. Shimla + pothole) — fully
//      verified local officer contact.
//   2. City + category match (e.g. Mumbai + garbage) — verified HQ-level
//      body for that specific metro, where district-level data isn't
//      available but city-level is (e.g. BMC, BBMP).
//   3. State + category match (e.g. Punjab + pothole) — verified state HQ
//      contact when no city/district entry exists.
//   4. National CPGRAMS fallback — always exists, always real, works for
//      any department/state/category in India, including every new
//      category in CIVIC_CATEGORIES above that doesn't have a specific
//      entry in authority_map.json yet.
//
// IMPORTANT: this function never fabricates a contact. If hasEmail/hasPhone
// aren't explicitly true on a fallback-tier entry, the UI must not render
// a button for that channel — see authority_contact.hasEmail/hasPhone in
// the response, which the dashboard reads directly.
//
// Unchanged from the original implementation — left exactly as-is so
// existing district/city/state matches keep working without risk.
function resolveAuthority(category: string, district: string, state: string, city: string) {
  const entries = authorityMap as any[];

  // Tier 1: exact district match (original Shimla/Solan dataset)
  const districtMatch = entries.find(
    (e) => e.district?.toLowerCase() === district.toLowerCase() && e.category === category
  );
  if (districtMatch) return { ...districtMatch, hasEmail: !!districtMatch.email, hasPhone: !!districtMatch.phone, matchTier: "district" };

  // Tier 2: exact city match (e.g. Mumbai, Bengaluru, Delhi metro bodies)
  const cityMatch = entries.find(
    (e) => e.city?.toLowerCase() === city.toLowerCase() && e.category === category
  );
  if (cityMatch) return { ...cityMatch, matchTier: "city" };

  // Tier 3: state-level HQ match
  const stateMatch = entries.find(
    (e) => e.state?.toLowerCase() === state.toLowerCase() && e.category === category
  );
  if (stateMatch) return { ...stateMatch, matchTier: "state" };

  // Tier 4: national CPGRAMS fallback — always present, always real
  const national = entries.find((e) => e.category === "national_fallback");
  return { ...national, matchTier: "national" };
}

export async function POST(request: Request) {
  const ip = request.headers.get("x-forwarded-for")?.split(',')[0] || "unknown_ip";
  const now = Date.now();
  const userLimit = rateLimitMap.get(ip);

  if (userLimit && (now - userLimit.timestamp) < RATE_LIMIT_WINDOW_MS) {
    if (userLimit.count >= MAX_REQS_PER_WINDOW) {
      return NextResponse.json({ success: false, error: "Rate limit exceeded. Please wait 60 seconds." }, { status: 429 });
    }
    userLimit.count++;
  } else {
    rateLimitMap.set(ip, { count: 1, timestamp: now });
  }

  try {
    const body = await request.json();
    // mediaUrls: full array of uploaded Storage URLs for this report (used to
    // attach links in the formal email body, since mailto: cannot carry real
    // attachments). description: the user's own words about the issue, fed
    // to the AI as additional grounding context, not just the image alone.
    const { image, mimeType, lat, lng, description, mediaUrls } = body;

    if (!image || typeof image !== 'string') {
      return NextResponse.json({ success: false, error: "Missing or invalid image data." }, { status: 400 });
    }
    if (!mimeType || !mimeType.startsWith('image/')) {
      return NextResponse.json({ success: false, error: "Invalid mime type. Must be an image." }, { status: 400 });
    }
    if (typeof lat !== 'number' || typeof lng !== 'number') {
      return NextResponse.json({ success: false, error: "Missing or invalid coordinates." }, { status: 400 });
    }

    const base64String = image.includes(',') ? image.split(',')[1] : image;
    const sizeInBytes = (base64String.length * 3) / 4;

    if (sizeInBytes > MAX_IMAGE_SIZE_MB * 1024 * 1024) {
      return NextResponse.json({ success: false, error: `Image exceeds ${MAX_IMAGE_SIZE_MB}MB limit.` }, { status: 413 });
    }

    const complaintId = `CIV-${Math.floor(100000 + Math.random() * 900000)}`;

    // ==========================================
    // PARALLEL EXECUTION: GEOCODING & VISION
    // ==========================================
    const geocodePromise = reverseGeocode(lat, lng);
    const VISION_MODEL = "gemini-3.5-flash";

    const visionConfig: any = {
      temperature: 0.0,
      thinkingConfig: { thinkingLevel: "low" },
      responseMimeType: "application/json",
      responseSchema: {
        type: "object",
        properties: {
          is_genuine_civic_issue: { type: "boolean" },
          rejection_reason: { type: "string" },
          // Cross-check it's actually a government-jurisdiction issue,
          // separate from "is this a real hazard at all" — distinguishes
          // a real hazard from a real hazard that's also something a
          // government department is actually responsible for (vs e.g.
          // private property damage, a civil dispute, or something
          // outside any civic department's mandate).
          is_government_jurisdiction: { type: "boolean" },
          jurisdiction_reasoning: { type: "string" },
          // Constrained to a known taxonomy (see CIVIC_CATEGORIES) so the
          // category string reliably matches authority_map.json entries
          // and covers far more than roads/garbage.
          issue_category: { type: "string", enum: CIVIC_CATEGORY_ENUM },
          sub_type: { type: "string" },
          severity: { type: "integer" },
          confidence: { type: "number" },
          department: { type: "string" },
          complaint_title: { type: "string" },
          evidence_description: { type: "string" },
          urgency_flag: { type: "string" },
          estimated_affected_radius_meters: { type: "integer" },
          // Anti-misuse: whether the citizen's written description (if any)
          // is actually consistent with what's visible in the image. Lets
          // the server hard-block mismatched/gamed submissions before they
          // ever reach the (separate, token-costing) drafting call.
          is_context_aligned: { type: "boolean" },
          context_alignment_reasoning: { type: "string" },
        },
        required: [
          "is_genuine_civic_issue", "rejection_reason", "is_government_jurisdiction",
          "jurisdiction_reasoning", "issue_category", "sub_type", "severity",
          "confidence", "department", "complaint_title", "evidence_description",
          "urgency_flag", "estimated_affected_radius_meters",
          "is_context_aligned", "context_alignment_reasoning"
        ],
      },
    };

    const userContext = description?.trim()
      ? `\n\nThe citizen who captured this also provided this description in their own words: "${description.trim()}". Cross-check it against the image per the CONTEXT-MATCH CHECK rule below. Where the image and description are consistent, use the description as supporting context to help pick the right category/sub_type/severity — but the image evidence remains the primary source of truth for whether a genuine hazard exists; the description can never promote a non-civic or private-property image into a genuine public civic issue.`
      : "";

    const strictPrompt = `You are a highly analytical, strict Civic Infrastructure Hazard Assessor for India, covering the full range of municipal and government civic services — not just roads and garbage.

CRITICAL RULES:
1. FILTER NON-CIVIC: Explicitly scan for human faces, selfies, pets, indoor residential rooms, or screens. If ANY are the primary subject, set "is_genuine_civic_issue" to false and state "Image rejected: Non-civic subject" in rejection_reason.
2. FILTER ILLUSIONS: Do not classify shadows, wet patches, textured tiles, or prints as hazards.
3. STRICT DEFINITION: A genuine civic issue must be a clearly visible, outdoor, public-domain problem that falls under a government department's responsibility. This includes infrastructure failures (e.g. potholes, broken drains, damaged streetlights) as well as other public-domain civic conditions (e.g. illegal encroachment, public sanitation hazards, visible environmental hazards, dangerous public-safety conditions in a public space). It does NOT include private property issues, indoor issues, or anything not visibly tied to a public space.
4. CATEGORY TAXONOMY: Classify "issue_category" as exactly one of the following slugs (use "other_civic_issue" only if none of the specific ones genuinely fit):
${CIVIC_CATEGORY_PROMPT_LIST}
5. JURISDICTION CHECK: Separately assess whether this is something a government civic department is actually responsible for (public roads, public utilities, public sanitation, public land) versus something outside government jurisdiction (private property, a civil/neighbor dispute, something on private land not affecting public safety). Set "is_government_jurisdiction" accordingly and explain your reasoning in "jurisdiction_reasoning" — be specific about which public body would plausibly own this responsibility.
6. CONTEXT-MATCH CHECK (anti-misuse): If the citizen provided a written description, check whether it plausibly describes what's actually visible in the image. If the description is about something unrelated to the image (random/unrelated text, a different subject entirely, or an attempt to game the categorizer with text alone while the photo shows nothing relevant), set "is_genuine_civic_issue" to false, use rejection_reason "Image and description don't appear to match — please retake a clear photo of the actual issue you want to report.", set "is_context_aligned" to false, and explain why in "context_alignment_reasoning". If no description was provided, or it's clearly consistent with the image, set "is_context_aligned" to true (use "No description provided" in context_alignment_reasoning if there wasn't one).
7. ZERO HALLUCINATION: If ambiguous, dark, or blurry, set "is_genuine_civic_issue" to false and use rejection_reason "Image unclear — please click a clearer picture of the issue.".${userContext}

Analyze this image and map it strictly to the provided JSON schema based on these rules.`;

    const visionCallFn = () => ai.models.generateContent({
      model: VISION_MODEL,
      contents: [
        {
          role: "user",
          parts: [
            { text: strictPrompt },
            { inlineData: { data: base64String, mimeType: mimeType } },
          ],
        },
      ],
      config: visionConfig,
    });

    const [geocodeData, visionResponse] = await Promise.all([
      geocodePromise,
      Promise.race([
        withRetry(visionCallFn),
        timeout(35000, "Vision AI took too long to respond.")
      ])
    ]);
    const { addressName, district, state, city } = geocodeData;

    let visionData;
    try {
      visionData = JSON.parse((visionResponse as any).text || "{}");
    } catch (e) {
      console.error("Vision JSON parse error", e);
      return NextResponse.json({ success: false, error: "Failed to parse Vision AI output." }, { status: 500 });
    }

    if (visionData.is_genuine_civic_issue === false) {
      return NextResponse.json({ success: false, error: visionData.rejection_reason || "Image rejected by Civic Guardrails." }, { status: 400 });
    }

    // Belt-and-suspenders anti-misuse check: even on the rare chance the
    // model marks a submission as a "genuine" issue but still flags the
    // description as unrelated to the image, hard-block it here rather
    // than spending a second (drafting) Gemini call on a mismatched
    // submission. This is the main token-misuse guard the user asked for.
    if (description?.trim() && visionData.is_context_aligned === false) {
      return NextResponse.json({
        success: false,
        error: visionData.context_alignment_reasoning || "The description doesn't match what's visible in the photo. Please retake a clear picture of the actual issue."
      }, { status: 400 });
    }

    // Soft warning (not a hard block) if the AI thinks this may be outside
    // government jurisdiction — still let the user file (they may know
    // context the AI doesn't), but flag it honestly rather than silently
    // routing a private dispute to a government department.
    const jurisdictionWarning = visionData.is_government_jurisdiction === false
      ? visionData.jurisdiction_reasoning || "This may fall outside typical government department jurisdiction — please verify before filing."
      : null;

    // ==========================================
    // AUTHORITY RESOLUTION — INDIA-WIDE
    // ==========================================
    const authorityData = resolveAuthority(visionData.issue_category, district, state, city);

    // ==========================================
    // LIVE DRAFTING AGENT EXECUTION
    // ==========================================
    const draftConfig: any = {
      temperature: 0.2,
      thinkingConfig: { thinkingLevel: "low" },
      responseMimeType: "application/json",
      responseSchema: {
        type: "object",
        properties: {
          formal_complaint: { type: "string" },
          whatsapp_message: { type: "string" },
          email_subject: { type: "string" },
          email_body: { type: "string" },
        },
        required: ["formal_complaint", "whatsapp_message", "email_subject", "email_body"]
      }
    };

    const mediaLinksBlock = Array.isArray(mediaUrls) && mediaUrls.length > 0
      ? `\n\nEvidence media (photo/video) is hosted at the following link(s) — reference them in the email body as "Evidence attached via the links below" rather than claiming a file is physically attached, since this is a web-based submission:\n${mediaUrls.map((u: string, i: number) => `${i + 1}. ${u}`).join("\n")}`
      : "";

    const descriptionBlock = description?.trim()
      ? `\n\nThe citizen's own description of the issue: "${description.trim()}"`
      : "";

    // FIX ("formal and powerful" email): previous prompt produced a fairly
    // generic draft. This version explicitly asks for the structure of a
    // real formal grievance letter (citation of civic duty, specific
    // location/severity grounding, a clear ask, and a professional but
    // firm closing demanding acknowledgment) so the output reads like
    // something a citizen could genuinely send to a government office,
    // not a vague AI summary.
    const draftPrompt = `Generate a structured, formal civic grievance response for a ${visionData.issue_category} (${visionData.sub_type}) issue located at ${addressName} (coordinates ${lat}, ${lng}). Severity assessed as ${visionData.severity}/5, urgency: ${visionData.urgency_flag}.

Complaint ID: ${complaintId}
Targeted Authority: ${authorityData.department}${authorityData.officerName ? `, ${authorityData.officerName}` : ""}
Evidence summary from AI vision analysis: ${visionData.evidence_description}${descriptionBlock}${mediaLinksBlock}

Write the email_body as a genuinely formal grievance letter a citizen could send to a government office:
- Open with a clear statement of purpose and the specific location.
- State the civic hazard factually and reference the public safety/infrastructure duty of the relevant department.
- Cite the complaint ID and (if provided) the evidence media links as the documentary basis.
- Include a specific, reasonable request for action and an expected timeframe for acknowledgment (e.g. 7 working days), consistent with how formal Indian government grievance correspondence is typically worded.
- Close formally, identifying the sender as "A Concerned Resident" filing via the CivicAI platform.
Keep the tone firm, respectful, and unambiguous — this should read as something that compels a response, not a casual report. Keep formal_complaint and whatsapp_message in the same factual, professional register but more concise for those channels.`;

    const draftCallFn = () => ai.models.generateContent({
      model: VISION_MODEL,
      contents: [{ role: "user", parts: [{ text: draftPrompt }] }],
      config: draftConfig
    });

    const draftResponse: any = await Promise.race([
      withRetry(draftCallFn),
      timeout(25000, "Drafting AI took too long to respond.")
    ]);

    let agentResult;
    try {
      agentResult = JSON.parse(draftResponse.text || "{}");
    } catch (e) {
      console.error("Draft JSON parse error", e);
      return NextResponse.json({ success: false, error: "Failed to parse Drafting AI output." }, { status: 500 });
    }

    agentResult.authority_contact = authorityData;
    agentResult.resolved_location_name = addressName;
    agentResult.resolved_state = state;
    agentResult.resolved_city = city;
    agentResult.complaint_id = complaintId;
    agentResult.jurisdiction_warning = jurisdictionWarning;

    return NextResponse.json({ success: true, visionData, agentResult });

  } catch (error: any) {
    console.error("Live Gemini API Error:", error.message || error);
    const statusCode = error.message?.includes("timed out") ? 504 : 500;
    return NextResponse.json({ success: false, error: error.message || "Internal Server Error" }, { status: statusCode });
  }
}  