import { NextResponse } from "next/server";
import { GoogleGenAI } from "@google/genai";
import authorityMap from "@/data/authority_map.json";

export const runtime = "edge";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

const timeout = (ms: number, message: string = "Request timed out") =>
  new Promise<never>((_, reject) => setTimeout(() => reject(new Error(message)), ms));

const MAX_IMAGE_SIZE_MB = 30;

const RATE_LIMIT_WINDOW_MS = 60_000;
const MAX_REQS_PER_WINDOW = 10;
const rateLimitMap = new Map<string, { count: number; timestamp: number }>();

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
//      any department/state in India.
//
// IMPORTANT: this function never fabricates a contact. If hasEmail/hasPhone
// aren't explicitly true on a fallback-tier entry, the UI must not render
// a button for that channel — see authority_contact.hasEmail/hasPhone in
// the response, which the dashboard reads directly.
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
          // FIX (cross-check it's actually a government-jurisdiction issue):
          // previously the schema had no field distinguishing "this is a
          // real hazard" from "this is a real hazard AND it's something a
          // government department is actually responsible for" (vs e.g.
          // private property damage, a civil dispute, or something outside
          // any civic department's mandate). Adding this as its own
          // checked field, with required reasoning, so the AI has to
          // justify the jurisdiction call rather than just inferring it
          // silently from issue_category.
          is_government_jurisdiction: { type: "boolean" },
          jurisdiction_reasoning: { type: "string" },
          issue_category: { type: "string" },
          sub_type: { type: "string" },
          severity: { type: "integer" },
          confidence: { type: "number" },
          department: { type: "string" },
          complaint_title: { type: "string" },
          evidence_description: { type: "string" },
          urgency_flag: { type: "string" },
          estimated_affected_radius_meters: { type: "integer" },
        },
        required: [
          "is_genuine_civic_issue", "rejection_reason", "is_government_jurisdiction",
          "jurisdiction_reasoning", "issue_category", "sub_type", "severity",
          "confidence", "department", "complaint_title", "evidence_description",
          "urgency_flag", "estimated_affected_radius_meters"
        ],
      },
    };

    const userContext = description?.trim()
      ? `\n\nThe citizen who captured this also provided this description in their own words: "${description.trim()}". Use it as supporting context for severity/category, but the image evidence is still the primary source of truth — do not let the description override what the image actually shows.`
      : "";

    const strictPrompt = `You are a highly analytical, strict Civic Infrastructure Hazard Assessor for India.

CRITICAL RULES:
1. FILTER NON-CIVIC: Explicitly scan for human faces, selfies, pets, indoor residential rooms, or screens. If ANY are the primary subject, set "is_genuine_civic_issue" to false and state "Image rejected: Non-civic subject" in rejection_reason.
2. FILTER ILLUSIONS: Do not classify shadows, wet patches, textured tiles, or prints as hazards.
3. STRICT DEFINITION: A genuine hazard must be a clear outdoor public infrastructure failure (e.g., severe potholes, collapsed structures, exposed wiring, illegal dumping).
4. JURISDICTION CHECK: Separately assess whether this is something a government civic department is actually responsible for (public roads, public utilities, public sanitation, public land) versus something outside government jurisdiction (private property, a civil/neighbor dispute, something on private land not affecting public safety). Set "is_government_jurisdiction" accordingly and explain your reasoning in "jurisdiction_reasoning" — be specific about which public body would plausibly own this responsibility.
5. ZERO HALLUCINATION: If ambiguous, dark, or blurry, set "is_genuine_civic_issue" to false.${userContext}

Analyze this image and map it strictly to the provided JSON schema based on these rules.`;

    const visionPromise = Promise.race([
      ai.models.generateContent({
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
      }),
      timeout(15000, "Vision AI took too long to respond.")
    ]);

    const [geocodeData, visionResponse] = await Promise.all([geocodePromise, visionPromise]);
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

    const draftApiCall = ai.models.generateContent({
      model: VISION_MODEL,
      contents: [{ role: "user", parts: [{ text: draftPrompt }] }],
      config: draftConfig
    });

    const draftResponse: any = await Promise.race([
      draftApiCall,
      timeout(10000, "Drafting AI took too long to respond.")
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