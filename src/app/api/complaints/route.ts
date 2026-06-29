import { NextResponse } from "next/server";
import { GoogleGenAI } from "@google/genai";
import authorityMap from "@/data/authority_map.json"; 

// Force the route to run on Edge to prevent serverless timeouts
export const runtime = "edge";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

// Timeout set to 15 seconds to allow for image processing
const timeout = (ms: number) => new Promise((_, reject) => setTimeout(() => reject(new Error("TIMEOUT")), ms));

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
  try {
    const body = await request.json();
    const { image, mimeType, lat, lng } = body; 

    if (!image || !mimeType) {
      return NextResponse.json({ success: false, error: "Missing image data." }, { status: 400 });
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
    // 1. LIVE VISION AGENT EXECUTION
    // ==========================================
    const visionConfig: any = {
      // Re-enabled the thinking config since 3.5 Flash supports it natively!
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

    const visionApiCall = ai.models.generateContent({
      model: "gemini-3.5-flash", // Updated to the newest model!
      contents: [
        {
          role: "user",
          parts: [
            { text: `Analyze this image for civic hazards (roads, sanitation, electrical, water/sewage). If it's a regular selfie, person, text, or household item, set is_genuine_civic_issue to false and populate rejection_reason.` },
            { inlineData: { data: image, mimeType: mimeType } },
          ],
        },
      ],
      config: visionConfig,
    });

    const visionResponse: any = await Promise.race([visionApiCall, timeout(15000)]);
    const visionData = JSON.parse(visionResponse.text || "{}");

    if (visionData.is_genuine_civic_issue === false) {
      return NextResponse.json({ success: false, error: visionData.rejection_reason || "Image rejected by Civic Guardrails." }, { status: 400 });
    }

    // ==========================================
    // 2. LIVE DRAFTING AGENT EXECUTION
    // ==========================================
    let authorityData: any = authorityMap.find((entry: any) => entry.district?.toLowerCase() === district.toLowerCase() && entry.category === visionData.issue_category);
    if (!authorityData) authorityData = defaultAuthority;

    const draftConfig: any = {
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
      model: "gemini-3.5-flash", // Updated to the newest model!
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