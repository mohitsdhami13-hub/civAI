import { NextResponse } from "next/server";
import { GoogleGenAI } from "@google/genai";
import authorityMap from "@/data/authority_map.json"; 

export const runtime = "edge";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

// Robust timeout function
const timeout = (ms: number, message: string = "Request timed out") => 
  new Promise<never>((_, reject) => setTimeout(() => reject(new Error(message)), ms));

const MAX_IMAGE_SIZE_MB = 30; 
const RATE_LIMIT_WINDOW_MS = 60_000;
const MAX_REQS_PER_WINDOW = 10;
const rateLimitMap = new Map<string, { count: number; timestamp: number }>();

async function reverseGeocode(lat: number, lng: number): Promise<{ addressName: string; district: string }> {
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
      
      return { addressName, district };
    }
  } catch (e) {
    console.warn("Geocoding failed, falling back to default location:", e);
  }
  return { addressName: "Solan, Himachal Pradesh", district: "Solan" };
}

export async function POST(request: Request) {
  // 1. IP-BASED RATE LIMITING
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
    const { image, mimeType, lat, lng } = body; 

    // 2. STRICT INPUT VALIDATION
    if (!image || typeof image !== 'string') {
      return NextResponse.json({ success: false, error: "Missing or invalid image data." }, { status: 400 });
    }
    if (!mimeType || !mimeType.startsWith('image/')) {
      return NextResponse.json({ success: false, error: "Invalid mime type. Must be an image." }, { status: 400 });
    }
    if (typeof lat !== 'number' || typeof lng !== 'number') {
      return NextResponse.json({ success: false, error: "Missing or invalid coordinates." }, { status: 400 });
    }

    // 3. SECURE FILE SIZE LIMITER
    const base64String = image.includes(',') ? image.split(',')[1] : image;
    const sizeInBytes = (base64String.length * 3) / 4;
    
    if (sizeInBytes > MAX_IMAGE_SIZE_MB * 1024 * 1024) {
      return NextResponse.json({ success: false, error: `Image exceeds ${MAX_IMAGE_SIZE_MB}MB limit.` }, { status: 413 });
    }

    const complaintId = `CIV-${Math.floor(100000 + Math.random() * 900000)}`;

    // ==========================================
    // 4. PARALLEL EXECUTION: GEOCODING & VISION
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
        required: ["is_genuine_civic_issue", "rejection_reason", "issue_category", "sub_type", "severity", "confidence", "department", "complaint_title", "evidence_description", "urgency_flag", "estimated_affected_radius_meters"],
      },
    };

    // SYSTEM INSTRUCTIONS MOVED TO THE MAIN PROMPT TO FORCE COMPLIANCE
    const strictPrompt = `You are a highly analytical, strict Civic Infrastructure Hazard Assessor. 
    CRITICAL RULES:
    1. FILTER NON-CIVIC: Explicitly scan for human faces, selfies, pets, indoor residential rooms, or screens. If ANY are the primary subject, set "is_genuine_civic_issue" to false and state "Image rejected: Non-civic subject" in rejection_reason.
    2. FILTER ILLUSIONS: Do not classify shadows, wet patches, textured tiles, or prints as hazards.
    3. STRICT DEFINITION: A genuine hazard must be a clear outdoor public infrastructure failure (e.g., severe potholes, collapsed structures, exposed wiring, illegal dumping).
    4. ZERO HALLUCINATION: If ambiguous, dark, or blurry, set "is_genuine_civic_issue" to false. 
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
    const { addressName, district } = geocodeData;
    
    let visionData;
    try {
      visionData = JSON.parse((visionResponse as any).text || "{}");
    } catch (e) {
      console.error("Vision JSON parse error", e);
      return NextResponse.json({ success: false, error: "Failed to parse Vision AI output." }, { status: 500 });
    }

    // Guardrail Check: Block request if AI rejects it
    if (visionData.is_genuine_civic_issue === false) {
      return NextResponse.json({ success: false, error: visionData.rejection_reason || "Image rejected by Civic Guardrails." }, { status: 400 });
    }

    // ==========================================
    // 5. LIVE DRAFTING AGENT EXECUTION
    // ==========================================
    const defaultAuthority = {
      department: "Municipal Corporation Sanitation Cell",
      officerName: "Chief Sanitary Inspector",
      phone: "+91-177-2802711",
      email: "sanitation-mc-hp@nic.in",
      portalUrl: "https://shimlamc.hp.gov.in",
      whatsappNumber: "+919816012345"
    };

    let authorityData: any = authorityMap.find((entry: any) => 
      entry.district?.toLowerCase() === district.toLowerCase() && entry.category === visionData.issue_category
    );
    if (!authorityData) authorityData = defaultAuthority;

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

    const draftPrompt = `Generate a structured, formal civic grievance response for ${visionData.issue_category} located at ${addressName} (${lat}, ${lng}). Include Complaint ID: ${complaintId}. Keep text sharp, legal, and actionable. Targeted Authority: ${authorityData.department}.`;

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
    agentResult.complaint_id = complaintId;

    return NextResponse.json({ success: true, visionData, agentResult });

  } catch (error: any) {
    console.error("Live Gemini API Error:", error.message || error);
    const statusCode = error.message?.includes("timed out") ? 504 : 500;
    return NextResponse.json({ success: false, error: error.message || "Internal Server Error" }, { status: statusCode });
  }
}