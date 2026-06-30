# CivicAI — Community Hero: Hyperlocal Problem Solver

---

## 🚩 Problem Statement Selected

**Community Hero — Hyperlocal Problem Solver**

Communities across India face daily struggles with potholes, water leakages, broken streetlights, overflowing garbage bins, damaged drains, and crumbling public infrastructure. Yet the process of reporting these issues remains deeply fragmented:

- Citizens don't know *which government department* to contact
- Existing portals are text-heavy, unintuitive, and offer no feedback loop
- Reports lack photo evidence and precise geolocation, making verification impossible
- There is **zero community participation** — one person files a report and it disappears
- Authorities receive vague, unstructured complaints that are hard to act on
- There is no transparency on whether a reported issue was ever resolved

The result is a broken cycle of civic neglect: infrastructure deteriorates, citizens feel powerless, and accountability erodes completely.

---

## 💡 Solution Overview

**CivicAI** is an AI-powered, mobile-first civic engagement platform that transforms how communities identify, report, validate, track, and resolve public infrastructure issues — turning every citizen into an active contributor to their neighborhood's well-being.

A citizen opens the app, photographs a public hazard (pothole, broken drain, illegal dump, damaged streetlight), and within **under 60 seconds**:

1. **Gemini Vision AI** validates the image, classifies the issue from 17 civic categories, assesses severity (1–5), and determines urgency
2. A **Drafting AI Agent** generates a formal, government-ready grievance letter addressed to the *exact* responsible authority — district officer, city body (BMC, BBMP), state department, or CPGRAMS national portal
3. The complaint is **geo-pinned** to a live community map visible to all neighbors
4. Other citizens can **verify the same hazard** with a single tap, crowd-amplifying its urgency
5. The complaint is **tracked in real-time** and shareable via a public link — creating full transparency

This is not just a reporting app. It is a **collaborative civic intelligence platform** — where AI removes the burden of knowing bureaucracy, and community participation ensures no genuine issue goes unnoticed.

---

## ✨ Key Features

### 📷 1. Image & Video-Based Issue Reporting ✅
Citizens capture evidence directly through the in-app camera or upload from their gallery. The platform supports:
- **Live camera** with back-camera preference and automatic fallback
- **Photo capture** (JPEG) and **video recording** (WebM) — multiple pieces of evidence per report
- Evidence is uploaded to **Firebase Cloud Storage** and permanently linked to the complaint
- Uploaded media URLs are embedded in the formal complaint email, giving government officials direct access to visual proof

### 🤖 2. AI-Powered Issue Categorization ✅
A two-stage **Gemini 3.5 Flash** pipeline runs on every submission:

**Stage 1 — Civic Vision Guardrail:**
> Validates that the image is a genuine outdoor public-domain hazard (rejects selfies, indoor shots, private property, and mismatched descriptions). Classifies the issue into one of **17 structured civic categories** using a strict response schema:

| Category | Category | Category |
|---|---|---|
| Pothole | Road Damage | Garbage |
| Drainage | Sewage | Water Supply |
| Streetlight | Electricity | Traffic Signal |
| Public Toilet | Tree / Park | Encroachment |
| Illegal Construction | Stray Animal Hazard | Air Pollution |
| Water Pollution | Noise Pollution | |

Outputs: `issue_category`, `sub_type`, `severity (1–5)`, `urgency_flag`, `confidence`, `affected_radius_meters`, and a jurisdiction check.

**Stage 2 — Drafting Agent:**
> Generates a formal grievance letter, WhatsApp-ready message, and email (subject + body) — written in the tone of official Indian government correspondence — addressed to the resolved authority. Includes complaint ID and Firebase Storage evidence links.

**Anti-Misuse Guardrail:** Cross-checks the citizen's written description against the image to prevent gaming the system. Rejects submissions where text and image don't match.

### 📍 3. Geo-Location & Mapping ✅
- GPS coordinates captured automatically at report time
- **Nominatim OpenStreetMap** API resolves coordinates to city, district, and state in real time
- All active complaints are **geo-pinned** on a live **Google Maps** canvas with a custom dark stealth style
- Clicking any hazard marker reveals its category, severity, address, and evidence photo
- **Toggleable map layers**: Reported Hazards, Nearby Police Stations, Hospitals & Clinics, CCTV Coverage zones — giving citizens a full safety situational picture of their neighborhood
- Police stations and hospitals are fetched in real time via the **Google Places API** (Nearby Search, 10km radius) and rendered with coverage radius circles

### 🤝 4. Community Verification ✅
- Every hazard on the map has an **"✋ I See This Too"** button
- Neighbors who witness the same issue can upvote it with a single tap
- Upvote count (`verificationCount`) is stored in **Firestore** and reflects crowd-validated severity
- This transforms isolated reports into **collectively verified community signals** — making it objectively harder for authorities to deprioritize high-upvote issues
- The map evidence photo (pulled from Firebase Storage) is now visible directly in the bottom sheet when clicking a hazard, letting citizens confirm a report is genuine before upvoting

### 📊 5. Real-Time Issue Tracking ✅
- Every filed complaint gets a unique `CIV-XXXXXX` complaint ID
- Citizens track their complaint at `/track/[id]` — a **publicly shareable page** that works without login
- The page shows: full AI analysis, severity, evidence media, formal complaint text, assigned authority, and current resolution status
- The personal **Dashboard** uses Firestore `onSnapshot` for live, instant updates — no polling, no refresh needed
- Reports move from "Draft Queue" → "Filed" → "Resolved" with status visible at all times

### 📈 6. Impact Dashboard ✅
- The Dashboard shows a running count of total filed complaints vs. resolved complaints
- The map header chip displays the number of **active community issues** at a glance
- Each complaint card surfaces: category, severity badge, location, assigned authority, timestamps, and contribution count
- The platform tracks `contributionCount` — how many additional pieces of evidence the community has added to a single report — enabling a data-driven picture of issue engagement

### 🔮 7. Predictive Insights *(Architecture-Ready)*
The existing data model is built to support predictive analytics:
- Every complaint stores: `lat/lng`, `issue_category`, `severity`, `verificationCount`, `district`, `state`, `createdAt`, `status`
- This structured dataset can directly feed a **BigQuery** analytics pipeline or **Gemini Data Analytics** to surface: seasonal hotspots, category trends by neighborhood, predicted issue recurrence zones, and authority response time metrics
- The authority resolution database (`authority_map.json`) can be enriched with response-time data to generate authority performance scores

### 🏆 8. Gamification for Citizen Engagement ✅
- **Contribution tracking**: Citizens earn contribution count for each report filed
- **Community verification**: Upvoting hazards is a participatory, visible action that rewards civic awareness
- **Share-by-link**: Citizens can share their complaint publicly — creating social accountability and recognition
- **Trophy / achievement icon** present in the Dashboard UI, providing the foundation for a full leaderboard and badge system for top civic contributors in a neighborhood

---

## 🛠️ Technologies Used

| Category | Technology |
|---|---|
| **Frontend Framework** | Next.js 14 (App Router, React 18, Edge Runtime) |
| **Language** | TypeScript |
| **Styling** | Tailwind CSS |
| **Icons** | Lucide React |
| **Database** | Cloud Firestore (real-time `onSnapshot`) |
| **File Storage** | Firebase Cloud Storage |
| **AI / ML** | Google Gemini 3.5 Flash via `@google/genai` SDK |
| **Maps** | Google Maps JS API + `@react-google-maps/api` |
| **Places Discovery** | Google Places API (Nearby Search) |
| **Reverse Geocoding** | Nominatim OpenStreetMap API |
| **Media Capture** | Web APIs — `getUserMedia`, `MediaRecorder`, `Canvas` |
| **Geolocation** | Browser Geolocation API |
| **Rate Limiting** | In-memory IP-based sliding window (Edge Runtime) |
| **PWA Features** | Haptic feedback (`navigator.vibrate`), mobile-first layout |

---

## 🌐 Google Technologies Utilized

| Google Product | Role in CivicAI |
|---|---|
| **Gemini 3.5 Flash** | Core AI engine for both Vision Guardrail (image classification, severity, urgency, jurisdiction check) and Drafting Agent (formal complaint, email, WhatsApp message generation) |
| **Structured Output / Response Schema** | Forces Gemini to return a validated, typed JSON object — `issue_category` constrained to a 17-slug enum, `severity` as integer, `is_genuine_civic_issue` as boolean — eliminating hallucination and enabling reliable downstream authority routing |
| **Gemini Thinking Mode** (`thinkingLevel: "low"`) | Enables lightweight chain-of-thought reasoning for the image-description cross-verification anti-misuse check, without high latency overhead |
| **Firebase App Hosting** | Next.js serverless deployment environment via Google Cloud Run |
| **Firebase Firestore** | NoSQL real-time database for `complaints` and `pending_reports` collections; powers live Dashboard via `onSnapshot` |
| **Firebase Cloud Storage** | Hosts all uploaded evidence photos and videos; provides permanent public download URLs embedded in complaints and rendered on the community map |
| **Google Maps JavaScript API** | Powers the Community Map — custom dark-themed styles, Marker and Circle overlays, InfoWindow labels, geo-pinned hazard visualization |
| **Google Places API (Nearby Search)** | Fetches real police stations and hospitals within 10km of the user's GPS position, rendered with coverage radius circles on the map |
| **@google/genai SDK** | Server-side SDK used in the Edge API route to call Gemini with inline base64 image data, structured schemas, and parallel Promise execution for minimum latency |

---

## 🎯 Evaluation Focus Alignment

| Evaluation Criterion | How CivicAI Delivers |
|---|---|
| **AI helps communities report issues** | Gemini Vision AI auto-classifies any photo into 17 civic categories — citizens need zero knowledge of government departments |
| **AI improves verification** | Two-stage guardrail: genuine hazard check + image-description alignment check eliminates fake/spam reports before they reach authorities |
| **AI improves tracking** | Auto-generated `CIV-XXXXXX` complaint ID, shareable public tracking page, real-time Firestore status updates |
| **AI improves resolution** | 4-tier authority resolution (district → city → state → national CPGRAMS) ensures every complaint reaches the *right* department with a ready-to-send formal letter |
| **Transparency** | Public `/track/[id]` page — any citizen, any device, no login — can see complaint status, AI analysis, and evidence media |
| **Accountability** | Named government authority + contact details on every complaint; shareable links create social pressure |
| **Community Participation** | "I See This Too" upvoting, community verification count, share-by-link social loop, gamification foundation |

---

> **Project:** CivicAI — Community Hero Platform
> **Track:** AI for Community Impact / Firebase & Google AI
> **Submission Type:** Progressive Web App (PWA) — mobile-first, works on any device with a camera
