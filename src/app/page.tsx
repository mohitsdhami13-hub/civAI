"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { storage, db } from "../lib/firebase";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { collection, addDoc, updateDoc, doc } from "firebase/firestore";
import {
  Camera as CameraIcon, Image as ImageIcon, X,
  TrendingUp, Check, Video, Square, Plus, Trash2, Send,
  MapPin, AlertCircle
} from "lucide-react";

const triggerHaptic = (pattern: number | number[] = 50) => {
  if (typeof window !== "undefined" && navigator.vibrate) {
    navigator.vibrate(pattern);
  }
};

type CapturedItem = {
  id: string;
  blob: Blob;
  mimeType: string;
  previewUrl: string;
  base64ForAI: string;
};

type LocationState = "idle" | "requesting" | "granted" | "denied" | "unsupported";
type CameraErrorReason =
  | null
  | "denied"
  | "not-found"
  | "insecure-context"
  | "unsupported"
  | "unknown";

export default function Home() {
  const router = useRouter();
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [pipelineStatus, setPipelineStatus] = useState<string>("");
  const [error, setError] = useState<string | null>(null);

  // Video Recording States
  const [isRecording, setIsRecording] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const videoChunks = useRef<BlobPart[]>([]);

  // Multi-capture queue
  const [capturedItems, setCapturedItems] = useState<CapturedItem[]>([]);
  const [description, setDescription] = useState("");

  // Location — now an explicit, visible state machine instead of a silent
  // background call. This is what makes the permission prompt behavior
  // visible/debuggable instead of "nothing happens."
  const [locationState, setLocationState] = useState<LocationState>("idle");
  const [cityName, setCityName] = useState<string | null>(null);
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);

  // Camera error — surfaced explicitly instead of silently opening gallery.
  const [cameraError, setCameraError] = useState<CameraErrorReason>(null);
  // Tracks whether the live <video> actually has frames yet, separate from
  // "stream exists." This closes the gap where the 60vh box appeared
  // instantly but stayed blank for a beat while the camera warmed up.
  const [videoReady, setVideoReady] = useState(false);
  // Proactive permission state read via the Permissions API where supported,
  // so we can warn the user *before* they tap "Take photo" if Chrome has
  // already silently revoked a previously-granted permission (the
  // auto-cancel behavior described). null = unknown/unsupported API.
  const [cameraPermState, setCameraPermState] = useState<PermissionState | null>(null);

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  // Separate input strictly for the camera-capture fallback, so we never
  // confuse "user explicitly chose gallery" with "camera failed, here's gallery"
  const cameraFallbackInputRef = useRef<HTMLInputElement>(null);

  const currentUserId = "user_solan_resident_01";

  // --- LOCATION ---
  // FIX: previously this fired silently on mount with no UI feedback at all,
  // so on browsers/webviews that suppress or delay the permission prompt,
  // it looked like "the app never asks." Now it's wrapped in a visible
  // state + a retry button is shown if it's denied/unsupported.
  const requestLocation = () => {
    if (typeof window === "undefined" || !("geolocation" in navigator)) {
      setLocationState("unsupported");
      return;
    }
    // navigator.geolocation requires a secure context (https or localhost).
    // On plain http:// hosting, the browser silently refuses to even show
    // the prompt — this check makes that failure mode visible instead of
    // looking like nothing happened.
    if (typeof window !== "undefined" && !window.isSecureContext) {
      setLocationState("denied");
      return;
    }

    setLocationState("requesting");
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        setCoords({ lat, lng });
        setLocationState("granted");
        try {
          const res = await fetch(
            `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=10`,
            { headers: { Accept: "application/json" } }
          );
          const data = await res.json();
          const resolvedCity =
            data?.address?.city ||
            data?.address?.town ||
            data?.address?.village ||
            data?.address?.county ||
            null;
          if (resolvedCity) setCityName(resolvedCity);
        } catch {
          // Reverse geocoding failed — coords still saved, just no city label
        }
      },
      (geoErr) => {
        // geoErr.code: 1 = PERMISSION_DENIED, 2 = POSITION_UNAVAILABLE, 3 = TIMEOUT
        setLocationState("denied");
      },
      { enableHighAccuracy: false, timeout: 8000 }
    );
  };

  useEffect(() => {
    requestLocation();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // --- PROACTIVE PERMISSION CHECK ---
  // Chrome on Android silently auto-revokes camera/mic permission for sites
  // that are dismissed/ignored repeatedly ("abusive permission" heuristics)
  // or unused for a while. When that happens, getUserMedia() just throws
  // NotAllowedError again with zero warning beforehand. Polling
  // navigator.permissions.query lets us catch that *before* the user taps
  // the button, so we can show a calmer, more specific prompt instead of
  // them hitting a wall and having to dig through Chrome settings blind.
  useEffect(() => {
    if (typeof navigator === "undefined" || !("permissions" in navigator)) return;

    let cameraStatus: PermissionStatus | null = null;

    (async () => {
      try {
        // 'camera' isn't in the TS lib.dom PermissionName union in all
        // versions, hence the cast — it is supported in Chrome.
        cameraStatus = await navigator.permissions.query({ name: "camera" as PermissionName });
        setCameraPermState(cameraStatus.state);
        cameraStatus.onchange = () => {
          if (cameraStatus) setCameraPermState(cameraStatus.state);
        };
      } catch {
        // Permissions API doesn't support 'camera' on this browser — silently
        // fall back to the reactive getUserMedia error path instead.
      }
    })();

    return () => {
      if (cameraStatus) cameraStatus.onchange = null;
    };
  }, []);

  // --- CAMERA PIPELINE ---
  // FIX: previously any getUserMedia failure silently triggered the gallery
  // file picker with zero explanation, which is exactly the bug you saw
  // ("Take photo just opens gallery"). Now we classify *why* it failed and
  // show that to the user, and gallery is offered as an explicit choice
  // rather than a silent substitution.
  const startCameraPipeline = async () => {
    triggerHaptic(30);
    setError(null);
    setCameraError(null);
    setVideoReady(false);

    if (typeof window !== "undefined" && !window.isSecureContext) {
      setCameraError("insecure-context");
      return;
    }
    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      setCameraError("unsupported");
      return;
    }

    try {
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment" },
        audio: false,
      });
      setStream(mediaStream);
      // FIX (blank 60vh box): previously a blind setTimeout(50) attached
      // srcObject and hoped for the best, so the box jumped to 60vh
      // instantly while staying visually empty until the camera warmed
      // up. Now we attach srcObject as soon as the ref exists, and flip
      // videoReady only once the video element actually reports it has
      // dimensions/frames (onloadedmetadata), so the UI can show a
      // spinner during that gap instead of a blank card.
      requestAnimationFrame(() => {
        if (videoRef.current) {
          videoRef.current.srcObject = mediaStream;
          videoRef.current.onloadedmetadata = () => setVideoReady(true);
        }
      });
    } catch (err: any) {
      console.warn("Camera access failed:", err?.name, err?.message);
      if (err?.name === "NotAllowedError" || err?.name === "SecurityError") {
        setCameraError("denied");
        setCameraPermState("denied");
      } else if (err?.name === "NotFoundError" || err?.name === "OverconstrainedError") {
        setCameraError("not-found");
      } else {
        setCameraError("unknown");
      }
    }
  };

  const stopCameraPipeline = () => {
    if (stream) {
      stream.getTracks().forEach((track) => track.stop());
      setStream(null);
    }
    setVideoReady(false);
  };

  // --- IMAGE CAPTURE ---
  const captureImage = () => {
    triggerHaptic(50);
    if (videoRef.current && canvasRef.current) {
      const context = canvasRef.current.getContext("2d");
      canvasRef.current.width = videoRef.current.videoWidth;
      canvasRef.current.height = videoRef.current.videoHeight;
      context?.drawImage(videoRef.current, 0, 0);
      const base64ForAI = canvasRef.current.toDataURL("image/jpeg", 0.8);
      canvasRef.current.toBlob((blob) => {
        if (blob) {
          addCapturedItem(blob, "image/jpeg", base64ForAI);
        }
      }, "image/jpeg", 0.8);
    }
  };

  // --- VIDEO CAPTURE ---
  const startRecording = () => {
    if (!stream) return;
    triggerHaptic(50);
    videoChunks.current = [];
    const mediaRecorder = new MediaRecorder(stream, { mimeType: "video/webm" });

    mediaRecorder.ondataavailable = (e) => {
      if (e.data.size > 0) videoChunks.current.push(e.data);
    };

    mediaRecorder.onstop = () => {
      const videoBlob = new Blob(videoChunks.current, { type: "video/webm" });
      let base64ForAI = "";
      if (videoRef.current && canvasRef.current) {
        const context = canvasRef.current.getContext("2d");
        canvasRef.current.width = videoRef.current.videoWidth;
        canvasRef.current.height = videoRef.current.videoHeight;
        context?.drawImage(videoRef.current, 0, 0);
        base64ForAI = canvasRef.current.toDataURL("image/jpeg", 0.8);
      }
      addCapturedItem(videoBlob, "video/webm", base64ForAI);
    };

    mediaRecorderRef.current = mediaRecorder;
    mediaRecorder.start();
    setIsRecording(true);
  };

  const stopRecording = () => {
    triggerHaptic([30, 30]);
    mediaRecorderRef.current?.stop();
    setIsRecording(false);
  };

  // --- ADD CAPTURED ITEM TO QUEUE ---
  const addCapturedItem = (blob: Blob, mimeType: string, base64ForAI: string) => {
    const previewUrl = URL.createObjectURL(blob);
    const id = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    setCapturedItems((prev) => [...prev, { id, blob, mimeType, previewUrl, base64ForAI }]);
  };

  const removeCapturedItem = (id: string) => {
    triggerHaptic(20);
    setCapturedItems((prev) => {
      const target = prev.find((i) => i.id === id);
      if (target) URL.revokeObjectURL(target.previewUrl);
      return prev.filter((i) => i.id !== id);
    });
  };

  // --- GALLERY UPLOAD (multi-file) ---
  const handleGalleryUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    Array.from(files).forEach((file) => {
      const isVideo = file.type.startsWith("video/");
      if (isVideo) {
        addCapturedItem(file, file.type, "");
      } else {
        const reader = new FileReader();
        reader.onloadend = () => {
          addCapturedItem(file, file.type, reader.result as string);
        };
        reader.readAsDataURL(file);
      }
    });

    e.target.value = "";
  };

  // --- SUBMIT ---
  const submitReport = async () => {
    if (capturedItems.length === 0) return;
    setIsProcessing(true);
    setError(null);

    try {
      setPipelineStatus(
        capturedItems.length > 1
          ? `Uploading ${capturedItems.length} files securely...`
          : "Uploading media securely..."
      );

      const uploadedMedia = await Promise.all(
        capturedItems.map(async (item) => {
          const ext = item.mimeType.includes("video") ? "webm" : "jpg";
          const storageRef = ref(
            storage,
            `reports/${currentUserId}/${Date.now()}_${item.id}.${ext}`
          );
          const snapshot = await uploadBytes(storageRef, item.blob);
          const downloadURL = await getDownloadURL(snapshot.ref);
          return { url: downloadURL, mimeType: item.mimeType };
        })
      );

      setPipelineStatus("Creating tracking token...");

      const pendingRef = await addDoc(collection(db, "pending_reports"), {
        userId: currentUserId,
        mediaUrl: uploadedMedia[0].url,
        mediaType: uploadedMedia[0].mimeType,
        media: uploadedMedia,
        description: description.trim(),
        status: "processing",
        createdAt: new Date().toISOString(),
        location: coords ?? { lat: 30.9045, lng: 77.0967 },
        cityLabel: cityName ?? null,
      });

      const aiSource = capturedItems.find((i) => i.base64ForAI);
      if (aiSource) {
        runBackgroundAI(aiSource.base64ForAI, pendingRef.id, description.trim());
      } else {
        updateDoc(doc(db, "pending_reports", pendingRef.id), {
          status: "failed",
          error: "Video processing requires active camera recording.",
        });
      }

      setPipelineStatus("Queued! Redirecting...");
      triggerHaptic([50, 100]);

      capturedItems.forEach((i) => URL.revokeObjectURL(i.previewUrl));

      setTimeout(() => {
        router.push("/dashboard");
      }, 800);
    } catch (err: any) {
      console.error("Upload failed:", err);
      setError("Failed to upload media. Check your connection.");
      setIsProcessing(false);
    }
  };

  // --- BACKGROUND AI RUNNER ---
  const runBackgroundAI = (base64Img: string, docId: string, userDescription: string) => {
    const cleanBase64 = base64Img.includes(",")
      ? base64Img.split(",")[1]
      : base64Img;

    fetch("/api/analyze", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        image: cleanBase64,
        mimeType: "image/jpeg",
        lat: coords?.lat ?? 30.9045,
        lng: coords?.lng ?? 77.0967,
        description: userDescription,
      }),
      cache: "no-store",
    })
      .then((res) => res.json())
      .then(async (payload) => {
        if (payload.success) {
          await updateDoc(doc(db, "pending_reports", docId), {
            status: "ready",
            visionData: payload.visionData,
            agentResult: payload.agentResult,
          });
        } else {
          await updateDoc(doc(db, "pending_reports", docId), {
            status: "failed",
            error: payload.error,
          });
        }
      })
      .catch(async () => {
        await updateDoc(doc(db, "pending_reports", docId), {
          status: "failed",
          error: "AI Timeout",
        });
      });
  };

  const cameraErrorMessage = (() => {
    switch (cameraError) {
      case "denied":
        return "Camera permission was denied. Check your browser's site settings to allow camera access, or use gallery instead.";
      case "not-found":
        return "No camera was found on this device. You can pick a photo or video from your gallery instead.";
      case "insecure-context":
        return "Camera requires a secure (https) connection. This page must be loaded over https for camera access to work.";
      case "unsupported":
        return "This browser doesn't support camera access. Try Chrome or Safari, or use gallery instead.";
      case "unknown":
        return "Couldn't open the camera. You can try again or use gallery instead.";
      default:
        return null;
    }
  })();

  // ─── COLOUR TOKENS ────────────────────────────────────────────────────────
  // Light:  page #F7F5F0 · card #FFFFFF · icon-pill #E8EBF0
  //         text-primary #1E293B · text-muted #64748B
  //         accent #516B8B · accent-tint #EEF1F6
  // Dark:   page #161616 · card #1e1e1e · icon-pill #1c2330
  //         text-primary #F0F0F0 · text-muted #555555
  //         accent #B6C2D2 · accent-tint #1c2330
  // ──────────────────────────────────────────────────────────────────────────

  return (
    // FIX (blank space / keyboard breakage):
    // min-h-[100dvh] removed from here — <body> in layout.tsx is now the
    // single height authority. This page just flows naturally inside it,
    // so there's no longer a second dvh container fighting the first when
    // the mobile keyboard opens or the browser chrome collapses/expands.
    <main className="w-full max-w-md mx-auto flex flex-col gap-4 px-5 pt-2 pb-6 bg-[#F7F5F0] dark:bg-[#161616]">
      <style dangerouslySetInnerHTML={{ __html: `
        @keyframes scan { 0%,100%{transform:translateY(0)} 50%{transform:translateY(160px)} }
        .animate-scan { animation: scan 2.5s cubic-bezier(0.4,0,0.2,1) infinite; }
        @keyframes pulse-ring { 0%{box-shadow:0 0 0 0 rgba(239,68,68,0.7)} 70%{box-shadow:0 0 0 15px rgba(239,68,68,0)} 100%{box-shadow:0 0 0 0 rgba(239,68,68,0)} }
        .animate-pulse-ring { animation: pulse-ring 1.5s cubic-bezier(0.4,0,0.6,1) infinite; }
        .civic-btn { transition: transform 0.12s ease, opacity 0.12s ease; }
        .civic-btn:active { transform: scale(0.97); opacity: 0.85; }
      ` }} />

      {/* ── HERO + STATS (hidden when camera active) ── */}
      {!stream && (
        <>
          {/* Hero card */}
          <div className="rounded-[20px] px-6 py-[22px] relative bg-white dark:bg-[#1e1e1e]">
            <div className="flex items-center gap-1.5 mb-2">
              <p className="text-[11px] font-semibold tracking-[1.2px] uppercase text-[#516B8B] dark:text-[#B6C2D2]">
                {cityName ? cityName.toUpperCase() : "YOUR CITY"}
              </p>
              {locationState === "requesting" && (
                <span className="w-3 h-3 border-[1.5px] rounded-full animate-spin border-[#516B8B]/30 border-t-[#516B8B] dark:border-[#B6C2D2]/30 dark:border-t-[#B6C2D2]" />
              )}
            </div>
            <h1 className="text-[28px] font-bold leading-[1.15] tracking-tight text-[#1E293B] dark:text-[#F0F0F0]">
              Spot it.<br />Report it.
            </h1>
            <p className="text-[14px] mt-1.5 text-[#64748B] dark:text-[#555]">
              {cityName ? `Fix ${cityName} together` : "Fix your city together"}
            </p>

            {/* Location permission retry — only shows if denied/unsupported,
                gives users a visible, explicit way to grant it rather than
                it silently never working. */}
            {(locationState === "denied" || locationState === "unsupported") && (
              <button
                onClick={requestLocation}
                className="civic-btn mt-2.5 flex items-center gap-1.5 text-[11px] font-semibold text-[#516B8B] dark:text-[#B6C2D2] underline underline-offset-2"
              >
                <MapPin size={12} />
                {locationState === "unsupported"
                  ? "Location not supported on this browser"
                  : "Enable location for accurate reports"}
              </button>
            )}

            {/* accent circle */}
            <div className="absolute right-5 top-1/2 -translate-y-1/2 w-12 h-12 rounded-full flex items-center justify-center bg-[#EEF1F6] dark:bg-[#1c2330] border border-[#D4DAE4] dark:border-[rgba(182,194,210,0.18)]">
              <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
                <path d="M11 4v3M11 15v3M4 11h3M15 11h3"
                  stroke="#516B8B" className="dark:stroke-[#B6C2D2]"
                  strokeWidth="1.8" strokeLinecap="round"/>
                <circle cx="11" cy="11" r="3"
                  stroke="#516B8B" className="dark:stroke-[#B6C2D2]"
                  strokeWidth="1.8"/>
              </svg>
            </div>
          </div>

          {/* Stat cards */}
          <div className="grid grid-cols-2 gap-2.5">
            <div className="rounded-[16px] p-4 flex items-center gap-3 bg-white dark:bg-[#1e1e1e]">
              <div className="w-[38px] h-[38px] rounded-[12px] flex items-center justify-center shrink-0 bg-[#EEF1F6] dark:bg-[#1c2330]">
                <TrendingUp size={18} className="text-[#516B8B] dark:text-[#B6C2D2]" strokeWidth={2} />
              </div>
              <div>
                <p className="text-[20px] font-bold leading-none tracking-tight text-[#1E293B] dark:text-[#F0F0F0]">
                  #12
                </p>
                <p className="text-[12px] mt-1 text-[#64748B] dark:text-[#555]">
                  {cityName ? `${cityName} rank` : "City rank"}
                </p>
                <p className="text-[11px] font-semibold text-[#516B8B] dark:text-[#B6C2D2]">
                  ↑ 3 this week
                </p>
              </div>
            </div>

            <div className="rounded-[16px] p-4 flex items-center gap-3 bg-white dark:bg-[#1e1e1e]">
              <div className="w-[38px] h-[38px] rounded-[12px] flex items-center justify-center shrink-0 bg-[#EEF1F6] dark:bg-[#1c2330]">
                <Check size={18} className="text-[#516B8B] dark:text-[#B6C2D2]" strokeWidth={2.5} />
              </div>
              <div>
                <p className="text-[20px] font-bold leading-none tracking-tight text-[#1E293B] dark:text-[#F0F0F0]">
                  1.2k
                </p>
                <p className="text-[12px] mt-1 text-[#64748B] dark:text-[#555]">Resolved</p>
                <p className="text-[11px] font-semibold text-[#516B8B] dark:text-[#B6C2D2]">
                  this month
                </p>
              </div>
            </div>
          </div>
        </>
      )}

      {/* ── SCANNER / CAMERA ZONE ── */}
      {/*
        FIX (blank space before camera actually shows anything):
        Previously this jumped straight from min-h-[200px] to a fixed
        h-[60vh] the instant `stream` was set, but the <video> had no
        frames yet for a beat — so users saw an empty 60vh box. Now the
        height transition is the same, but we render a spinner overlay
        for that exact gap (stream exists but videoReady is false), so
        there's never a moment of "blank" — only idle, loading, or live.
      */}
      <div
        className={`relative w-full ${
          stream ? "h-[60vh]" : "min-h-[200px]"
        } rounded-[20px] overflow-hidden flex flex-col items-center justify-center transition-all duration-300 bg-white dark:bg-[#1e1e1e]`}
      >
        {stream ? (
          /* ── LIVE CAMERA VIEW ── */
          <>
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-200 ${
                videoReady ? "opacity-100" : "opacity-0"
              }`}
            />

            {/* Camera warming up — fills the gap instead of a blank box */}
            {!videoReady && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 z-10">
                <div
                  className="w-9 h-9 border-[3px] rounded-full animate-spin"
                  style={{ borderColor: "rgba(81,107,139,0.2)", borderTopColor: "#516B8B" }}
                />
                <span className="text-[12px] font-medium text-[#64748B] dark:text-[#999]">
                  Starting camera...
                </span>
              </div>
            )}

            <div className="absolute inset-0 z-10 p-8 flex flex-col justify-between pointer-events-none">
              <div className="flex justify-between w-full">
                <div className="w-8 h-8 border-t-[2.5px] border-l-[2.5px] border-white/70 rounded-tl-sm" />
                <div className="w-8 h-8 border-t-[2.5px] border-r-[2.5px] border-white/70 rounded-tr-sm" />
              </div>
              {isRecording && (
                <div className="absolute top-5 left-1/2 -translate-x-1/2 bg-black/60 backdrop-blur-md text-white font-bold px-4 py-1.5 rounded-full flex items-center gap-2 text-sm z-20">
                  <span className="w-2.5 h-2.5 rounded-full bg-red-500 animate-pulse inline-block" />
                  Recording
                </div>
              )}
              {capturedItems.length > 0 && !isRecording && videoReady && (
                <div className="absolute top-5 left-1/2 -translate-x-1/2 bg-black/60 backdrop-blur-md text-white font-bold px-4 py-1.5 rounded-full text-sm z-20">
                  {capturedItems.length} captured · tap to add more
                </div>
              )}
              <div className="flex justify-between w-full">
                <div className="w-8 h-8 border-b-[2.5px] border-l-[2.5px] border-white/70 rounded-bl-sm" />
                <div className="w-8 h-8 border-b-[2.5px] border-r-[2.5px] border-white/70 rounded-br-sm" />
              </div>
            </div>

            {!isProcessing && (
              <button
                onClick={stopCameraPipeline}
                className="civic-btn absolute top-4 right-4 w-10 h-10 bg-black/40 backdrop-blur-md rounded-full flex items-center justify-center text-white z-20"
              >
                <X size={18} />
              </button>
            )}
          </>
        ) : (
          /* ── IDLE SCANNER UI ── */
          <div className="flex flex-col items-center justify-center gap-0 px-6 pb-6 pt-7 w-full">
            <div className="w-24 h-24 rounded-full flex items-center justify-center mb-[18px] border border-[#D4DAE4] dark:border-[rgba(182,194,210,0.15)]">
              <div className="w-[72px] h-[72px] rounded-full flex items-center justify-center border border-[#C2CAD6] dark:border-[rgba(182,194,210,0.25)]">
                <div className="w-[50px] h-[50px] rounded-full flex items-center justify-center bg-[#EEF1F6] dark:bg-[#1c2330] border border-[#516B8B] dark:border-[#B6C2D2]">
                  <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
                    <rect x="3" y="3" width="7" height="7" rx="1.5"
                      stroke="#516B8B" className="dark:stroke-[#B6C2D2]" strokeWidth="1.6"/>
                    <rect x="12" y="3" width="7" height="7" rx="1.5"
                      stroke="#516B8B" className="dark:stroke-[#B6C2D2]" strokeWidth="1.6"/>
                    <rect x="3" y="12" width="7" height="7" rx="1.5"
                      stroke="#516B8B" className="dark:stroke-[#B6C2D2]" strokeWidth="1.6"/>
                    <path d="M12 15.5h7M15.5 12v7"
                      stroke="#516B8B" className="dark:stroke-[#B6C2D2]"
                      strokeWidth="1.6" strokeLinecap="round"/>
                  </svg>
                </div>
              </div>
            </div>

            <p className="text-[13px] font-medium mb-1 text-center text-[#64748B] dark:text-[#555]">
              {isProcessing ? pipelineStatus : "Aim at any civic issue to report it"}
            </p>

            {!isProcessing && !cameraError && (
              <div className="flex items-center gap-[5px] mb-[18px]">
                <span className="w-[6px] h-[6px] rounded-full inline-block bg-[#516B8B] dark:bg-[#B6C2D2]" />
                <span className="text-[11px] font-medium tracking-[0.3px] text-[#516B8B] dark:text-[#B6C2D2]">
                  Camera ready
                </span>
              </div>
            )}

            {/*
              Proactive warning — Chrome on Android sometimes auto-revokes
              a previously granted camera permission (after repeated
              dismissals or inactivity). Without this, the user taps "Take
              photo," nothing happens or it silently fails, and they have
              no idea they need to dig through Chrome's site settings. This
              catches that state ahead of time via the Permissions API.
            */}
            {cameraPermState === "denied" && !cameraError && (
              <div className="w-full mb-3 rounded-[12px] px-3.5 py-3 flex gap-2 bg-[#FFF7ED] dark:bg-[#2A1F12] border border-[#FDBA74]/50 dark:border-[#92400E]/50">
                <AlertCircle size={15} className="text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                <div className="text-[12px] leading-snug text-amber-700 dark:text-amber-400">
                  Camera access was turned off, likely by Chrome automatically.
                  Tap the lock/info icon in your address bar → Permissions →
                  turn Camera back on, then return here.
                </div>
              </div>
            )}

            {/* Explicit camera error — replaces the old silent fallback */}
            {cameraErrorMessage && (
              <div className="w-full mb-3 rounded-[12px] px-3.5 py-3 flex gap-2 bg-[#FEF2F2] dark:bg-[#2A1717] border border-[#FCA5A5]/50 dark:border-[#7F1D1D]/50">
                <AlertCircle size={15} className="text-red-500 dark:text-red-400 shrink-0 mt-0.5" />
                <p className="text-[12px] leading-snug text-red-600 dark:text-red-400">
                  {cameraErrorMessage}
                </p>
              </div>
            )}

            {error && (
              <p className="text-[12px] font-semibold text-red-500 dark:text-red-400 mb-3">
                {error}
              </p>
            )}

            {/* ── ACTION BUTTONS ── */}
            {!isProcessing && (
              <div className="grid grid-cols-2 gap-2.5 w-full">
                <button
                  onClick={startCameraPipeline}
                  disabled={isProcessing}
                  className="civic-btn h-[52px] rounded-[14px] flex items-center justify-center gap-2 disabled:opacity-40
                    bg-[#EEF1F6] border border-[#516B8B]
                    dark:bg-[#1c2330] dark:border-[#B6C2D2]"
                >
                  <CameraIcon size={17}
                    className="text-[#516B8B] dark:text-[#B6C2D2]"
                    strokeWidth={2} />
                  <span className="text-[14px] font-bold text-[#516B8B] dark:text-[#B6C2D2]">
                    Take photo
                  </span>
                </button>

                <button
                  onClick={() => { triggerHaptic(30); fileInputRef.current?.click(); }}
                  disabled={isProcessing}
                  className="civic-btn h-[52px] rounded-[14px] flex items-center justify-center gap-2 disabled:opacity-40
                    bg-[#EEF1F6] border border-[#A3B0C0]
                    dark:bg-[#1c2330] dark:border-[rgba(182,194,210,0.35)]"
                >
                  <ImageIcon size={17}
                    className="text-[#64748B] dark:text-[rgba(182,194,210,0.7)]"
                    strokeWidth={2} />
                  <span className="text-[14px] font-medium text-[#64748B] dark:text-[rgba(182,194,210,0.7)]">
                    Choose photos
                  </span>
                </button>
              </div>
            )}
          </div>
        )}

        <canvas ref={canvasRef} className="hidden" />
        {/* Explicit gallery input — chosen by the user directly */}
        <input
          type="file"
          ref={fileInputRef}
          onChange={handleGalleryUpload}
          accept="image/*,video/*"
          multiple
          className="hidden"
        />

        {isProcessing && (
          <div className="absolute inset-0 bg-white/60 dark:bg-black/50 backdrop-blur-sm z-50 flex flex-col items-center justify-center gap-3">
            <div
              className="w-10 h-10 border-4 rounded-full animate-spin"
              style={{
                borderColor: "rgba(81,107,139,0.2)",
                borderTopColor: "#516B8B",
              }}
            />
            <span className="text-[14px] font-semibold text-[#516B8B] dark:text-[#B6C2D2]">
              {pipelineStatus}
            </span>
          </div>
        )}
      </div>

      {/* ── IN-CAMERA CONTROLS ── */}
      {stream && !isProcessing && (
        <div className="flex gap-3 w-full">
          <button
            onClick={captureImage}
            disabled={isRecording || isProcessing}
            className="civic-btn flex-1 h-[60px] rounded-[18px] flex items-center justify-center gap-2 font-bold text-[16px] disabled:opacity-40
              bg-[#EEF1F6] border border-[#516B8B] text-[#516B8B]
              dark:bg-[#1c2330] dark:border-[#B6C2D2] dark:text-[#B6C2D2]"
          >
            <CameraIcon size={20} strokeWidth={2} />
            Photo
          </button>

          {isRecording ? (
            <button
              onClick={stopRecording}
              className="civic-btn flex-1 h-[60px] rounded-[18px] flex items-center justify-center gap-2 font-bold text-[16px] text-white bg-red-500 animate-pulse-ring"
            >
              <Square size={18} fill="currentColor" />
              Stop
            </button>
          ) : (
            <button
              onClick={startRecording}
              disabled={isProcessing}
              className="civic-btn flex-1 h-[60px] rounded-[18px] flex items-center justify-center gap-2 font-bold text-[16px] disabled:opacity-40
                bg-[#EEF1F6] border border-[#A3B0C0] text-[#64748B]
                dark:bg-[#1c2330] dark:border-[rgba(182,194,210,0.35)] dark:text-[rgba(182,194,210,0.75)]"
            >
              <Video size={18} strokeWidth={2} />
              Video
            </button>
          )}

          {capturedItems.length > 0 && (
            <button
              onClick={stopCameraPipeline}
              className="civic-btn shrink-0 w-[60px] h-[60px] rounded-[18px] flex items-center justify-center
                bg-[#516B8B] dark:bg-[#B6C2D2]"
            >
              <Check size={22} className="text-white dark:text-[#0d1420]" strokeWidth={2.5} />
            </button>
          )}
        </div>
      )}

      {/* ── CAPTURED MEDIA QUEUE + DESCRIPTION + SUBMIT ── */}
      {!stream && capturedItems.length > 0 && (
        <div className="rounded-[20px] p-4 flex flex-col gap-3 bg-white dark:bg-[#1e1e1e]">
          <div className="flex gap-2.5 overflow-x-auto pb-1">
            {capturedItems.map((item) => (
              <div key={item.id} className="relative shrink-0 w-[64px] h-[64px] rounded-[12px] overflow-hidden bg-[#EEF1F6] dark:bg-[#1c2330]">
                {item.mimeType.startsWith("video/") ? (
                  <video src={item.previewUrl} className="w-full h-full object-cover" muted />
                ) : (
                  <img src={item.previewUrl} className="w-full h-full object-cover" alt="captured issue" />
                )}
                {item.mimeType.startsWith("video/") && (
                  <div className="absolute bottom-1 left-1 bg-black/60 rounded-full p-0.5">
                    <Video size={10} className="text-white" />
                  </div>
                )}
                <button
                  onClick={() => removeCapturedItem(item.id)}
                  className="civic-btn absolute top-1 right-1 w-5 h-5 rounded-full bg-black/55 flex items-center justify-center"
                >
                  <Trash2 size={11} className="text-white" />
                </button>
              </div>
            ))}

            <button
              onClick={() => { triggerHaptic(20); fileInputRef.current?.click(); }}
              disabled={isProcessing}
              className="civic-btn shrink-0 w-[64px] h-[64px] rounded-[12px] flex items-center justify-center border border-dashed border-[#A3B0C0] dark:border-[rgba(182,194,210,0.35)] disabled:opacity-40"
            >
              <Plus size={20} className="text-[#64748B] dark:text-[rgba(182,194,210,0.7)]" />
            </button>
          </div>

          {/*
            FIX (UI breaking when typing): the textarea itself was never the
            problem — it was the double 100dvh containers fighting the
            keyboard. With layout.tsx now using interactive-widget:
            resizes-content and only ONE dvh authority (body), this field
            resizes correctly instead of getting squeezed/overlapped.
            font-size kept at 16px equivalent (text-[16px] on focus would
            be ideal, but 14px below 16px can trigger iOS Safari's
            auto-zoom-on-focus, which is its own layout-jump bug) — using
            16px here specifically to prevent that.
          */}
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            disabled={isProcessing}
            placeholder="Describe the issue — what's wrong, how long it's been there, anything that helps the AI assess it..."
            rows={3}
            className="w-full resize-none rounded-[14px] px-3.5 py-3 text-[16px] leading-snug outline-none
              bg-[#F7F5F0] dark:bg-[#161616]
              text-[#1E293B] dark:text-[#F0F0F0]
              placeholder:text-[#9AA5B1] dark:placeholder:text-[#5b5b5b]
              border border-[#E2E8F0] dark:border-[#27272A]
              focus:border-[#516B8B] dark:focus:border-[#B6C2D2]
              disabled:opacity-50"
          />

          <button
            onClick={submitReport}
            disabled={isProcessing}
            className="civic-btn w-full h-[52px] rounded-[14px] flex items-center justify-center gap-2 font-bold text-[15px] text-white disabled:opacity-50
              bg-[#516B8B] dark:bg-[#B6C2D2] dark:text-[#0d1420]"
          >
            <Send size={17} strokeWidth={2.2} />
            Submit report
          </button>
        </div>
      )}
    </main>
  );
}