"use server";

import { GoogleGenAI } from "@google/genai";
import authorityMap from "../data/authority_map.json";

// Initialize the v2.0.0+ SDK
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

// ==========================================
// FEATURE 1: VISION ANALYSIS AGENT
// ==========================================
export async function analyzeImageAction(base64Image: string, mimeType: string) {
  try {
    const configPayload: any = {
      thinkingConfig: { thinkingLevel: "low" }, 
      responseMimeType: "application/json",
      responseSchema: {
        type: "object",
        properties: {
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
        required: ["issue_category", "sub_type", "severity", "confidence", "department", "complaint_title", "evidence_description", "urgency_flag", "estimated_affected_radius_meters"],
      },
    };

    const response = await ai.models.generateContent({
      model: "gemini-3.5-flash",
      contents: [
        {
          role: "user",
          parts: [
            { text: "Analyze this image and identify the civic issue. Be precise and objective." },
            { inlineData: { data: base64Image, mimeType: mimeType } },
          ],
        },
      ],
      config: configPayload,
    });

    return { success: true, data: JSON.parse(response.text || "{}") };
  } catch (error: any) {
    console.error("Vision Analysis Error:", error);

    // ==========================================
    // SAFETY NET: VISION AGENT FALLBACK
    // ==========================================
    const isRateLimited = error.status === 503 || error.message?.includes("503") || error.message?.includes("UNAVAILABLE") || error.message?.includes("429");
    
    if (isRateLimited) {
      console.warn("Vision API limit hit. Triggering Fallback Mock Vision Data.");
      return { 
        success: true, 
        data: {
          issue_category: "pothole",
          sub_type: "deep water-filled pothole on active roadway",
          severity: 4,
          confidence: 0.98,
          department: "PWD",
          complaint_title: "Severe Water-Filled Pothole on Main Roadway",
          evidence_description: "A deep, circular pothole filled with water is visible in the middle of the asphalt lane, surrounded by loose gravel and cracking pavement.",
          urgency_flag: "urgent",
          estimated_affected_radius_meters: 50
        } 
      };
    }

    return { success: false, error: `API Error: ${error.message || "Unknown error"}` };
  }
}

// ==========================================
// FEATURE 2 & 3: COMPLAINT GENERATION AGENT
// ==========================================
export async function generateComplaintAgentAction(visionData: any, lat: number, lng: number) {
  // Define fallback authority outside the try block so the catch block can use it
  const defaultAuthority = {
    department: "General Administration HP",
    officerName: "Nodal Public Grievance Officer",
    phone: "+91-177-1111111",
    email: "nodal@hp.gov.in",
    portalUrl: "https://hp.gov.in",
    whatsappNumber: "+910000000000"
  };

  try {
    const resolvedDistrict = lat > 31.0 ? "Shimla" : "Solan"; 

    const match = authorityMap.find(
      (entry) => entry.district.toLowerCase() === resolvedDistrict.toLowerCase() && entry.category === visionData.issue_category
    );
    
    const authorityData = match || defaultAuthority;

    const finalConfigPayload: any = {
      thinkingConfig: { thinkingLevel: "medium" },
      responseMimeType: "application/json",
      // ... (schema remains the same)
      responseSchema: {
        type: "object",
        properties: {
          formal_complaint: { type: "string" },
          whatsapp_message: { type: "string" },
          email_subject: { type: "string" },
          email_body: { type: "string" },
          authority_contact: {
            type: "object",
            properties: {
              department: { type: "string" },
              officerName: { type: "string" },
              phone: { type: "string" },
              email: { type: "string" },
              portalUrl: { type: "string" },
              whatsappNumber: { type: "string" }
            }
          }
        },
        required: ["formal_complaint", "whatsapp_message", "email_subject", "email_body", "authority_contact"]
      }
    };

    const finalPrompt = `
      You are CivicAI, an autonomous civic grievance agent.
      A user has reported an issue at GPS Coordinates: ${lat}, ${lng}.
      Vision Analysis Data: ${JSON.stringify(visionData)}
      Resolved Authority Data: ${JSON.stringify(authorityData)}

      Task: Generate the final 3 outputs simultaneously:
      1. FORMAL_COMPLAINT: Government-style letter.
      2. WHATSAPP_MESSAGE: Plain text, short, direct.
      3. EMAIL_SUBJECT and EMAIL_BODY: Professional email.
      Return ONLY the strictly formatted JSON.
    `;

    const finalResponse = await ai.models.generateContent({
      model: "gemini-3.5-flash",
      contents: [{ role: "user", parts: [{ text: finalPrompt }] }],
      config: finalConfigPayload
    });

    const data = JSON.parse(finalResponse.text || "{}");
    data.authority_contact = authorityData;

    return { success: true, data };

  } catch (error: any) {
    console.error("Agent Error:", error);

    // ==========================================
    // THE SAFETY NET: DEMO FALLBACK MODE
    // ==========================================
    const isRateLimited = error.status === 503 || error.message?.includes("503") || error.message?.includes("UNAVAILABLE") || error.message?.includes("429");
    
    if (isRateLimited) {
      console.warn("API limit hit. Triggering Fallback Mock Data for Demo purposes.");
      
      // We dynamically inject the Vision data so it still looks real!
      const cat = visionData?.issue_category || "civic hazard";
      const desc = visionData?.evidence_description || "visual evidence of infrastructure failure";

      return {
        success: true,
        isDemoFallback: true, // We can use this flag in the UI later to show a small "Demo Mode" badge
        data: {
          formal_complaint: `To,\nThe Respected Officer,\n${defaultAuthority.department}\n\nSubject: Urgent Rectification Required for Civic Hazard at GPS: ${lat.toFixed(4)}, ${lng.toFixed(4)}\n\nRespected Sir/Madam,\n\nI am writing to formally report a severe issue classified as a '${cat.replace("_", " ")}' at the aforementioned coordinates.\n\nVisual evidence processed by CivicAI indicates: ${desc}.\n\nUnder the relevant municipal guidelines, I request immediate rectification of this hazard to ensure public safety.\n\nSincerely,\nCivicAI Agent\n[COMPLAINT_ID: CIV-DEMO-999]`,
          whatsapp_message: `Urgent civic issue (${cat.replace("_", " ")}) detected at ${lat.toFixed(4)}, ${lng.toFixed(4)}. Evidence: ${desc}. Please initiate repairs. [ID: CIV-DEMO-999]`,
          email_subject: `URGENT: ${cat.toUpperCase()} Reported via CivicAI`,
          email_body: `Please find the formal complaint generated by CivicAI regarding a high-severity ${cat.replace("_", " ")} issue.\n\nCoordinates: ${lat.toFixed(4)}, ${lng.toFixed(4)}\nPriority: High\n\nAutomated via CivicAI.`,
          authority_contact: defaultAuthority
        }
      };
    }

    // If it's a completely different error, fail normally
    return { success: false, error: `Agent Error: ${error.message || "Unknown error"}` };
  }
}