import { onSchedule } from "firebase-functions/v2/scheduler";
import * as admin from "firebase-admin";
import { GoogleGenAI } from "@google/genai";

admin.initializeApp();
const db = admin.firestore();
const messaging = admin.messaging();

// Set to 'true' for 30-minute intervals during the live pitch
const DEMO_MODE = true; 
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" });

export const escalationEngine = onSchedule("every 1 hours", async (event: any) => {
  const now = new Date();
  const timeThresholdL1 = DEMO_MODE ? 30 * 60 * 1000 : 30 * 24 * 60 * 60 * 1000; // 30 mins vs 30 days
  const timeThresholdL2 = DEMO_MODE ? 60 * 60 * 1000 : 60 * 24 * 60 * 60 * 1000; // 60 mins vs 60 days

  const complaintsRef = db.collection("complaints");
  const activeComplaints = await complaintsRef.where("status", "!=", "resolved").get();

  const batch = db.batch();

  for (const doc of activeComplaints.docs) {
    const data = doc.data();
    
    // Skip if the document doesn't have a createdAt timestamp yet
    if (!data.createdAt) continue;

    const ageMs = now.getTime() - data.createdAt.toDate().getTime();
    const currentLevel = data.escalationLevel || 0;

    // LEVEL 1 ESCALATION (RTI & DM Letter)
    if (ageMs > timeThresholdL1 && currentLevel === 0) {
      console.log(`Escalating ${doc.id} to Level 1`);
      
      const prompt = `Draft a formal Right to Information (RTI) application and a District Magistrate escalation letter for an unresolved civic issue: ${data.analysis?.category || 'General Hazard'} located at ${data.location?.address || 'Solan area'}.`;
      
      const response = await ai.models.generateContent({
        model: "gemini-3.5-flash",
        contents: prompt
      });

      // Save documents to subcollection
      const escalationRef = doc.ref.collection("escalations").doc("level_1");
      batch.set(escalationRef, {
        type: "RTI & DM Escalation",
        content: response.text,
        generatedAt: admin.firestore.FieldValue.serverTimestamp()
      });

      // Update main document
      batch.update(doc.ref, { 
        escalationLevel: 1, 
        status: "escalated" 
      });

      // Send Push Notification
      if (data.fcmToken) {
        await messaging.send({
          token: data.fcmToken,
          notification: {
            title: "⚡ Auto-Escalation Triggered",
            body: `Your complaint ${data.complaintId || doc.id} has been escalated with an RTI notice.`
          }
        });
      }
    }

    // LEVEL 2 ESCALATION (Vigilance Bureau)
    else if (ageMs > timeThresholdL2 && currentLevel === 1) {
       console.log(`Escalating ${doc.id} to Level 2`);
       batch.update(doc.ref, { escalationLevel: 2, status: "vigilance_review" });
       
       if (data.fcmToken) {
        await messaging.send({
          token: data.fcmToken,
          notification: { 
              title: "🔴 Escalated to Vigilance Bureau", 
              body: `Action required for ${data.complaintId || doc.id}` 
            }
        });
      }
    }
  }

  await batch.commit();
  console.log("Escalation sweep complete.");
});