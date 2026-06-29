import { NextResponse } from "next/server";
import { GoogleGenAI } from "@google/genai";
import authorityMap from "@/data/authority_map.json"; 

export const runtime = "edge";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
const timeout = (ms: number) => new Promise((_, reject) => setTimeout(() => reject(new Error("TIMEOUT")), ms));

// ==========================================
// HACKATHON SECURITY & RATE LIMITING
// ==========================================
let globalRequestCount = 0;
const MAX_GLOBAL_REQUESTS = 200; 
const MAX_IMAGE_SIZE_MB = 30; // Bumped to 30MB for high-res modern phone cameras
const rateLimitMap = new Map<string, { count: number; timestamp: number }>();

async function reverseGeocode(lat: number, lng: number): Promise<{ addressName: string; district: string }> {
  try {
    const response = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1`,
      { headers: { "User-Agent": "CivicAI-Hackathon-App" } }
    );
    const data = await response.json();
    if (data && data.address) {
      const city = data.address.city || data.address.town || data.address.village || data.address.suburb || "";
      const state = data.address.state || "";
      const district = data.address.county || data.address.state_district || "Solan";
      const addressName = city && state ? `${city}, ${state}` : data.display_name.split(',').slice(0, 3).join(', ');
      return { addressName, district };
    }
  } catch (e) {
    console.error("Geocoding failed", e);
  }
  return { addressName: "Solan, Himachal Pradesh", district: "Solan" };
}

export async function POST(request: Request) {
  // 1. GLOBAL KILL SWITCH
  if (globalRequestCount >= MAX_GLOBAL_REQUESTS) {
    return NextResponse.json({ success: false, error: "Hackathon demo limit reached (200 requests)." }, { status: 429 });
  }
  globalRequestCount++;

  // 2. IP RATE LIMITING (Max 10 reqs per minute)
  const ip = request.headers.get("x-forwarded-for") || "unknown_ip";
  const now = Date.now();
  const userLimit = rateLimitMap.get(ip);
  
  if (userLimit && now - userLimit.timestamp < 60000) {
    if (userLimit.count >= 10) {
      return NextResponse.json({ success: false, error: "Too many requests. Please wait 60 seconds." }, { status: 429 });
    }
    userLimit.count++;
  } else {
    rateLimitMap.set(ip, { count: 1, timestamp: now });
  }

  try {
    const body = await request.json();
    const { image, mimeType, lat, lng } = body; 

    if (!image || !mimeType) {
      return NextResponse.json({ success: false, error: "Missing image data." }, { status: 400 });
    }

    // 3. FILE SIZE LIMITER (30MB Limit)
    const base64String = image.includes(',') ? image.split(',')[1] : image;
    const sizeInBytes = (base64String.length * 3) / 4;
    if (sizeInBytes > MAX_IMAGE_SIZE_MB * 1024 * 1024) {
      return NextResponse.json({ success: false, error: `Image too large. Maximum size is ${MAX_IMAGE_SIZE_MB}MB.` }, { status: 413 });
    }

    const complaintId = `CIV-${Math.floor(100000 + Math.random() * 900000)}`;
    const { addressName, district } = await reverseGeocode(lat, lng);

    const defaultAuthority = {
      department: "Municipal Corporation Sanitation Cell",
      officerName: "Chief Sanitary Inspector",
      phone: "+91-177-2802711",
      email: "sanitation-mc-hp@nic.in",
      portalUrl: "https://shimlamc.hp.gov.in",
      whatsappNumber: "+919816012345"
    };

    // ==========================================
    // 4. LIVE VISION AGENT EXECUTION (Strict Guardrails)
    // ==========================================
    const visionConfig: any = {
      temperature: 0.0, // FORCES STRICT, DETERMINISTIC, ZERO-HALLUCINATION LOGIC
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

    // Advanced, strict prompt to eliminate false positives
    const strictPrompt = `You are a highly analytical, strict Civic Infrastructure Hazard Assessor. 
    
    CRITICAL RULES FOR SCANNING:
    1. FILTER NON-CIVIC IMAGES: First, explicitly scan for human faces, selfies, pets, indoor residential rooms, or screens. If ANY of these are the primary subject, set "is_genuine_civic_issue" to false and state "Image rejected: Non-civic subject detected" in rejection_reason.
    2. FILTER OPTICAL ILLUSIONS & PATTERNS: Carefully distinguish between actual physical damage and visual patterns. DO NOT classify shadows, wet patches on roads, textured floor tiles, decorative brickwork, or printed designs as hazards (e.g., do not mistake a tile pattern for an electrical circuit, or a dark shadow for a pothole).
    3. STRICT HAZARD DEFINITION: A genuine civic hazard must be a clear, verifiable case of outdoor public infrastructure failure. Valid examples: a deep physical structural pothole in a paved road, exposed active electrical wires on a public street pole, or a massive uncontained public garbage dump. 
    4. ZERO HALLUCINATION: If the image is ambiguous, blurry, or you are not 100% certain it is a physical public infrastructure hazard, set "is_genuine_civic_issue" to false. Do not guess.`;

    const visionApiCall = ai.models.generateContent({
      model: "gemini-3.5-flash",
      contents: [
        {
          role: "user",
          parts: [
            { text: strictPrompt },
            { inlineData: { data: image, mimeType: mimeType } },
          ],
        },
      ],
      config: visionConfig,
    });

    const visionResponse: any = await Promise.race([visionApiCall, timeout(15000)]);
    const visionData = JSON.parse(visionResponse.text || "{}");

    // Block the request if the AI triggered the rejection rule
    if (visionData.is_genuine_civic_issue === false) {
      return NextResponse.json({ success: false, error: visionData.rejection_reason || "Image rejected by Civic Guardrails." }, { status: 400 });
    }

    // ==========================================
    // 5. LIVE DRAFTING AGENT EXECUTION
    // ==========================================
    let authorityData: any = authorityMap.find((entry: any) => entry.district?.toLowerCase() === district.toLowerCase() && entry.category === visionData.issue_category);
    if (!authorityData) authorityData = defaultAuthority;

    const draftConfig: any = {
      temperature: 0.2, // Slightly higher to allow natural language generation, but still highly grounded
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

    const draftPrompt = `Generate a structured civic grievance response for ${visionData.issue_category} located at ${addressName} (${lat}, ${lng}). Include Complaint ID: ${complaintId}. Keep text sharp, legal, and under structural length rules. Targeted Authority: ${authorityData.department}`;

    const draftApiCall = ai.models.generateContent({
      model: "gemini-3.5-flash", 
      contents: [{ role: "user", parts: [{ text: draftPrompt }] }],
      config: draftConfig
    });

    const draftResponse: any = await Promise.race([draftApiCall, timeout(10000)]);
    const agentResult = JSON.parse(draftResponse.text || "{}");
    
    agentResult.authority_contact = authorityData;
    agentResult.resolved_location_name = addressName;
    agentResult.complaint_id = complaintId;

    return NextResponse.json({ success: true, visionData, agentResult });

  } catch (error: any) {
    console.error("Live Gemini API Error:", error);
    return NextResponse.json({ success: false, error: error.message || "Internal Server Error" }, { status: 500 });
  }
}