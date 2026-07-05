CivicAI handles citizen-submitted photos, GPS coordinates, formal government
complaint documents, and personal identity data from Google Sign-In. We take
the security of this civic data seriously and welcome responsible disclosure.


Supported Versions

VersionStatusNotes1.x.x:white_check_mark:Current — actively maintained< 1.0:x:Pre-release — not supported


Reporting a Vulnerability

Do not open a public GitHub Issue for security vulnerabilities.

Report privately via:


GitHub Private Advisory — click "Report a Vulnerability" on the
Security tab of this repository (preferred)
Email — mohit.s.dhami13@gmail.com


What to include


Description of the vulnerability and its potential impact
Steps to reproduce (proof of concept if available)
Affected component — Firestore rules, Gemini pipeline, auth flow,
Storage bucket, Edge API route, Maps layer, etc.
Screenshots, request/response samples, or logs if applicable


Response timeline

MilestoneTargetAcknowledgmentWithin 48 hoursSeverity assessmentWithin 7 daysFix for Critical/HighWithin 14 daysFix for Medium/LowWithin 30 daysPublic disclosureAfter fix is deployed, coordinated with reporter


Scope

In scope


Gemini AI pipeline — prompt injection via malicious image content or
metadata, hallucinated authority routing, structured output bypass
Firebase Firestore rules — unauthorized read/write of any complaints
or pending_reports collection document
Firebase Cloud Storage — unauthorized access to citizen-uploaded
evidence photos or videos
Firebase Auth — account takeover, session hijacking, unauthorized
Google Sign-In flow manipulation
Edge API routes (/api/analyze, /api/submit) — rate limit bypass,
input validation bypass, server-side request forgery
Google Maps / Places API — API key exposure, unauthorized usage via
missing referrer restrictions
Community verification system — vote manipulation, fake upvote loops,
verificationCount tampering in Firestore
Public tracking page (/track/[id]) — complaint ID enumeration
exposing other users' private complaint data


Out of scope


Google infrastructure (Firebase platform itself, Google Maps servers)
Nominatim / OpenStreetMap third-party geocoding service
Denial of service / DDoS attacks
Social engineering against team members
Bugs with no security impact (UI issues, typos, broken links)
Vulnerabilities in unsupported versions (< 1.0)



Severity Classification

Critical — Immediate response, fix within 14 days


Full Firestore database read/write without authentication
Firebase Storage — bulk download of all citizen evidence photos
Gemini prompt injection that leaks other users' complaint data
Google Maps or Gemini API key fully exposed and usable externally
Authentication bypass allowing access to any user's complaint history


High — Fix within 14 days


verificationCount manipulation at scale (fake community verification)
Complaint ID enumeration on /track/[id] exposing other citizens' data
Firebase Storage rules allowing authenticated users to read others' files
Edge API rate limiting bypass enabling abuse of Gemini API quota


Medium — Fix within 30 days


GPS coordinates exposed in public API responses for private complaints
XSS in complaint display, tracking page, or map InfoWindow
CORS misconfiguration on Edge API routes
Nominatim geocoding SSRF via manipulated coordinates


Low — Next scheduled release


Non-sensitive information in error messages
Missing security headers (CSP, X-Frame-Options)
Minor information disclosure in client-side bundles



Data We Handle — Security Context

Understanding what CivicAI stores helps identify high-impact targets:

Data TypeStorageAccess LevelEvidence photos / videosFirebase Cloud StoragePrivate, owner onlyGPS coordinatesFirestore complaints collectionPrivate, owner onlyGoogle display name + emailFirebase Auth + Firestore /usersPrivate, owner onlyFormal complaint letter textFirestore complaints collectionPrivate, owner onlyAuthority contact detailsauthority_map.json (static)PublicCommunity verification countsFirestore complaints.verificationCountPublic readComplaint ID + public statusFirestore via /track/[id]Public read

Evidence photos and GPS coordinates are the most sensitive assets.
Unauthorized bulk access to these would be treated as Critical severity.


AI Pipeline Security

CivicAI uses Gemini 3.5 Flash with structured output schemas and a
two-stage pipeline. We are specifically interested in reports of:


Prompt injection — malicious image EXIF metadata or pixel-embedded
text that alters Gemini's classification or complaint generation output
Schema bypass — techniques that cause Gemini to return output outside
the defined 17-category enum or structured JSON schema
Anti-misuse bypass — methods to pass fake/staged images through the
image-description cross-verification guardrail
Hallucinated authority routing — edge cases where Gemini routes a
complaint to a wrong or non-existent government authority



Firestore Security Rules — Policy

All Firestore access follows these principles:


Users can only read and write their own complaint documents
(userId == request.auth.uid)
verificationCount is publicly readable, write-restricted
(only via authenticated server-side increment)
Authority map data is publicly readable, write-locked to admin only
pending_reports collection is write-accessible to authenticated users
only, read-restricted to owner
No unauthenticated write access to any collection


A bypass of any of these rules is a Critical severity report.


Google Maps API Key Security

Our Maps JavaScript API key is restricted to:


HTTP referrer: the deployed Firebase Hosting domain only
APIs: Maps JavaScript API, Places API (Nearby Search) only


If you find the key is usable from an unauthorized referrer or for
unauthorized APIs, that is a High severity report.


Responsible Disclosure

We ask that you:


Allow us reasonable time to fix before public disclosure
Not access, modify, or delete real citizen complaint data beyond what is
minimally needed to demonstrate the vulnerability
Not run automated scanners against the production deployment
Not perform attacks that affect service availability for other users


In return, we commit to:


Acknowledging your report within 48 hours
Keeping you informed throughout the fix process
Crediting you in our release notes (with your permission)
Not pursuing legal action against good-faith security researchers
