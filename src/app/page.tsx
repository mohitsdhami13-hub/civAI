"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { storage, db } from "../lib/firebase";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { collection, addDoc, updateDoc, doc } from "firebase/firestore";
import {
  Camera as CameraIcon, Image as ImageIcon, X, AlertTriangle,
  Target, TrendingUp, MapPin, Check, Video, Square
} from "lucide-react";

const triggerHaptic = (pattern: number | number[] = 50) => {
  if (typeof window !== "undefined" && navigator.vibrate) {
    navigator.vibrate(pattern);
  }
};

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

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const currentUserId = "user_solan_resident_01"; // Hardcoded for demo

  // --- CAMERA PIPELINE ---
  const startCameraPipeline = async () => {
    triggerHaptic(30);
    setError(null);
    try {
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment" },
        audio: false
      });
      setStream(mediaStream);
      setTimeout(() => { if (videoRef.current) videoRef.current.srcObject = mediaStream; }, 50);
    } catch (err) {
      console.warn("Camera access denied or unavailable.");
      fileInputRef.current?.click();
    }
  };

  const stopCameraPipeline = () => {
    if (stream) {
      stream.getTracks().forEach(track => track.stop());
      setStream(null);
    }
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

      canvasRef.current.toBlob(async (blob) => {
        if (blob) {
          stopCameraPipeline();
          await uploadAndQueueReport(blob, "image/jpeg", base64ForAI);
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

    mediaRecorder.onstop = async () => {
      const videoBlob = new Blob(videoChunks.current, { type: "video/webm" });

      let base64ForAI = "";
      if (videoRef.current && canvasRef.current) {
        const context = canvasRef.current.getContext("2d");
        canvasRef.current.width = videoRef.current.videoWidth;
        canvasRef.current.height = videoRef.current.videoHeight;
        context?.drawImage(videoRef.current, 0, 0);
        base64ForAI = canvasRef.current.toDataURL("image/jpeg", 0.8);
      }

      stopCameraPipeline();
      await uploadAndQueueReport(videoBlob, "video/webm", base64ForAI);
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

  // --- GALLERY UPLOAD ---
  const handleGalleryUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const isVideo = file.type.startsWith("video/");
      const reader = new FileReader();

      reader.onloadend = async () => {
        const base64ForAI = isVideo
          ? "data:image/jpeg;base64,/9j/4AAQSkZJRgABAAAAAQABAAD/2wBDAP..."
          : (reader.result as string);

        await uploadAndQueueReport(file, file.type, base64ForAI);
      };

      if (!isVideo) {
        reader.readAsDataURL(file);
      } else {
        uploadAndQueueReport(file, file.type, "");
      }
    }
  };

  // --- THE MASTER QUEUE FUNCTION ---
  const uploadAndQueueReport = async (fileBlob: Blob | File, mimeType: string, base64ForAI: string) => {
    setIsProcessing(true);
    setPipelineStatus("Uploading media securely...");
    setError(null);

    try {
      const ext = mimeType.includes("video") ? "webm" : "jpg";
      const storageRef = ref(storage, `reports/${currentUserId}/${Date.now()}.${ext}`);
      const snapshot = await uploadBytes(storageRef, fileBlob);
      const downloadURL = await getDownloadURL(snapshot.ref);

      setPipelineStatus("Creating tracking token...");

      const pendingRef = await addDoc(collection(db, "pending_reports"), {
        userId: currentUserId,
        mediaUrl: downloadURL,
        mediaType: mimeType,
        status: "processing",
        createdAt: new Date().toISOString(),
        location: { lat: 30.9045, lng: 77.0967 },
      });

      if (base64ForAI) {
        runBackgroundAI(base64ForAI, pendingRef.id);
      } else {
        updateDoc(doc(db, "pending_reports", pendingRef.id), {
          status: "failed",
          error: "Video processing requires active camera recording."
        });
      }

      setPipelineStatus("Queued! Redirecting...");
      triggerHaptic([50, 100]);
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
  const runBackgroundAI = (base64Img: string, docId: string) => {
    const cleanBase64 = base64Img.includes(",") ? base64Img.split(",")[1] : base64Img;

    fetch("/api/analyze", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        image: cleanBase64,
        mimeType: "image/jpeg",
        lat: 30.9045,
        lng: 77.0967
      }),
      cache: "no-store"
    })
      .then(res => res.json())
      .then(async (payload) => {
        if (payload.success) {
          await updateDoc(doc(db, "pending_reports", docId), {
            status: "ready",
            visionData: payload.visionData,
            agentResult: payload.agentResult
          });
        } else {
          await updateDoc(doc(db, "pending_reports", docId), { status: "failed", error: payload.error });
        }
      })
      .catch(async () => {
        await updateDoc(doc(db, "pending_reports", docId), { status: "failed", error: "AI Timeout" });
      });
  };

  // ─── DESIGN TOKENS ────────────────────────────────────────────────────────
  // bg:       #161616  (page)
  // card:     #1e1e1e  (surfaces)
  // accent:   #B6C2D2  (Kashmir blue — RGB 182,194,210)
  // accent-dim: #1c2330 (tinted dark bg for icon wells & rings)
  // muted:    #555     (secondary labels)
  // text:     #f0f0f0  (primary)
  // ──────────────────────────────────────────────────────────────────────────

  return (
    <main
      className="w-full max-w-md mx-auto min-h-[100dvh] pb-32 flex flex-col gap-4 px-5 py-5"
      style={{ background: "#161616" }}
    >
      <style dangerouslySetInnerHTML={{ __html: `
        @keyframes scan { 0%,100%{transform:translateY(0)} 50%{transform:translateY(160px)} }
        .animate-scan { animation: scan 2.5s cubic-bezier(0.4,0,0.2,1) infinite; }
        @keyframes pulse-ring { 0%{box-shadow:0 0 0 0 rgba(239,68,68,0.7)} 70%{box-shadow:0 0 0 15px rgba(239,68,68,0)} 100%{box-shadow:0 0 0 0 rgba(239,68,68,0)} }
        .animate-pulse-ring { animation: pulse-ring 1.5s cubic-bezier(0.4,0,0.6,1) infinite; }
        .civic-btn { transition: transform 0.12s ease, opacity 0.12s ease; }
        .civic-btn:active { transform: scale(0.97); opacity: 0.88; }
      ` }} />

      {/* ── TOPBAR ── */}
      <div className="flex items-center justify-between pt-1">
        <div className="flex items-center gap-2.5">
          <div
            className="w-9 h-9 rounded-[10px] flex items-center justify-center"
            style={{ background: "#1e1e1e" }}
          >
            {/* brand mark */}
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
              <path d="M10 3v7M10 10l-5 5M10 10l5 5" stroke="#B6C2D2" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              <circle cx="10" cy="10" r="2.5" fill="#B6C2D2"/>
            </svg>
          </div>
          <span className="text-[18px] font-bold tracking-tight" style={{ color: "#f0f0f0" }}>CivicAI</span>
        </div>
        <div className="flex gap-2">
          {/* theme icon */}
          <button className="civic-btn w-9 h-9 rounded-full flex items-center justify-center" style={{ background: "#1e1e1e" }}>
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <circle cx="8" cy="8" r="3" stroke="#666" strokeWidth="1.5"/>
              <path d="M8 1v1.5M8 13.5V15M1 8h1.5M13.5 8H15M3.05 3.05l1.06 1.06M11.89 11.89l1.06 1.06M3.05 12.95l1.06-1.06M11.89 4.11l1.06-1.06" stroke="#666" strokeWidth="1.5" strokeLinecap="round"/>
            </svg>
          </button>
          {/* notifications */}
          <button className="civic-btn w-9 h-9 rounded-full flex items-center justify-center relative" style={{ background: "#1e1e1e" }}>
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path d="M8 1.5a4.5 4.5 0 00-4.5 4.5c0 2.5-.5 3.5-1 4h11c-.5-.5-1-1.5-1-4A4.5 4.5 0 008 1.5z" stroke="#666" strokeWidth="1.5" strokeLinejoin="round"/>
              <path d="M6.5 10v.5a1.5 1.5 0 003 0V10" stroke="#666" strokeWidth="1.5" strokeLinecap="round"/>
            </svg>
            <span className="absolute top-1.5 right-1.5 w-[7px] h-[7px] rounded-full bg-red-500 border-[1.5px] border-[#161616]" />
          </button>
        </div>
      </div>

      {/* ── HERO + STATS (hidden when camera is active) ── */}
      {!stream && (
        <>
          {/* Hero card */}
          <div
            className="rounded-[20px] px-6 py-[22px] relative"
            style={{ background: "#1e1e1e" }}
          >
            <p className="text-[11px] font-semibold tracking-[1.2px] uppercase mb-2" style={{ color: "#B6C2D2" }}>
              Your city
            </p>
            <h1 className="text-[28px] font-bold leading-[1.15] tracking-tight" style={{ color: "#f0f0f0" }}>
              Spot it.<br />Report it.
            </h1>
            <p className="text-[14px] mt-1.5" style={{ color: "#555" }}>Fix your city together</p>

            {/* accent circle */}
            <div
              className="absolute right-5 top-1/2 -translate-y-1/2 w-12 h-12 rounded-full flex items-center justify-center"
              style={{ background: "#1c2330", border: "1.5px solid rgba(182,194,210,0.18)" }}
            >
              <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
                <path d="M11 4v3M11 15v3M4 11h3M15 11h3" stroke="#B6C2D2" strokeWidth="1.8" strokeLinecap="round"/>
                <circle cx="11" cy="11" r="3" stroke="#B6C2D2" strokeWidth="1.8"/>
              </svg>
            </div>
          </div>

          {/* Stat cards */}
          <div className="grid grid-cols-2 gap-2.5">
            <div className="rounded-[16px] p-4 flex items-center gap-3" style={{ background: "#1e1e1e" }}>
              <div className="w-[38px] h-[38px] rounded-[12px] flex items-center justify-center shrink-0" style={{ background: "#1c2330" }}>
                <TrendingUp size={18} color="#B6C2D2" strokeWidth={2} />
              </div>
              <div>
                <p className="text-[20px] font-bold leading-none tracking-tight" style={{ color: "#f0f0f0" }}>#12</p>
                <p className="text-[12px] mt-1" style={{ color: "#555" }}>City rank</p>
                <p className="text-[11px] font-semibold" style={{ color: "#B6C2D2" }}>↑ 3 this week</p>
              </div>
            </div>
            <div className="rounded-[16px] p-4 flex items-center gap-3" style={{ background: "#1e1e1e" }}>
              <div className="w-[38px] h-[38px] rounded-[12px] flex items-center justify-center shrink-0" style={{ background: "#1c2330" }}>
                <Check size={18} color="#B6C2D2" strokeWidth={2.5} />
              </div>
              <div>
                <p className="text-[20px] font-bold leading-none tracking-tight" style={{ color: "#f0f0f0" }}>1.2k</p>
                <p className="text-[12px] mt-1" style={{ color: "#555" }}>Resolved</p>
                <p className="text-[11px] font-semibold" style={{ color: "#B6C2D2" }}>this month</p>
              </div>
            </div>
          </div>
        </>
      )}

      {/* ── SCANNER / CAMERA ZONE ── */}
      <div
        className={`relative w-full ${stream ? "h-[60vh]" : "min-h-[190px]"} rounded-[20px] overflow-hidden flex flex-col items-center justify-center transition-all duration-300`}
        style={{ background: "#1e1e1e" }}
      >
        {stream ? (
          /* ── LIVE CAMERA VIEW ── */
          <>
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className="absolute inset-0 w-full h-full object-cover"
            />

            {/* corner brackets overlay */}
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
              <div className="flex justify-between w-full">
                <div className="w-8 h-8 border-b-[2.5px] border-l-[2.5px] border-white/70 rounded-bl-sm" />
                <div className="w-8 h-8 border-b-[2.5px] border-r-[2.5px] border-white/70 rounded-br-sm" />
              </div>
            </div>

            {/* close button */}
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
            {/* concentric rings */}
            <div
              className="w-24 h-24 rounded-full flex items-center justify-center mb-[18px]"
              style={{ border: "1.5px solid rgba(182,194,210,0.15)" }}
            >
              <div
                className="w-[72px] h-[72px] rounded-full flex items-center justify-center"
                style={{ border: "1.5px solid rgba(182,194,210,0.25)" }}
              >
                <div
                  className="w-[50px] h-[50px] rounded-full flex items-center justify-center"
                  style={{ background: "#1c2330", border: "1.5px solid #B6C2D2" }}
                >
                  {/* scanner QR icon */}
                  <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
                    <rect x="3" y="3" width="7" height="7" rx="1.5" stroke="#B6C2D2" strokeWidth="1.6"/>
                    <rect x="12" y="3" width="7" height="7" rx="1.5" stroke="#B6C2D2" strokeWidth="1.6"/>
                    <rect x="3" y="12" width="7" height="7" rx="1.5" stroke="#B6C2D2" strokeWidth="1.6"/>
                    <path d="M12 15.5h7M15.5 12v7" stroke="#B6C2D2" strokeWidth="1.6" strokeLinecap="round"/>
                  </svg>
                </div>
              </div>
            </div>

            <p className="text-[13px] font-medium mb-1" style={{ color: "#555" }}>
              {isProcessing ? pipelineStatus : "Aim at any civic issue to report it"}
            </p>

            {/* status dot */}
            {!isProcessing && (
              <div className="flex items-center gap-[5px] mb-[18px]">
                <span className="w-[6px] h-[6px] rounded-full inline-block" style={{ background: "#B6C2D2" }} />
                <span className="text-[11px] font-medium tracking-[0.3px]" style={{ color: "#B6C2D2" }}>Camera ready</span>
              </div>
            )}

            {error && (
              <p className="text-[12px] font-semibold text-red-400 mb-3">{error}</p>
            )}

            {/* ── ACTION BUTTONS (inside card) ── */}
            {!isProcessing && (
              <div className="grid grid-cols-2 gap-2.5 w-full">
                {/* Take photo → opens camera */}
                <button
                  onClick={startCameraPipeline}
                  disabled={isProcessing}
                  className="civic-btn h-[52px] rounded-[14px] flex items-center justify-center gap-2 disabled:opacity-40"
                  style={{ background: "#1c2330", border: "1.5px solid #B6C2D2" }}
                >
                  <CameraIcon size={17} color="#B6C2D2" strokeWidth={2} />
                  <span className="text-[14px] font-bold" style={{ color: "#B6C2D2" }}>Take photo</span>
                </button>

                {/* Choose photo → gallery */}
                <button
                  onClick={() => { triggerHaptic(30); fileInputRef.current?.click(); }}
                  disabled={isProcessing}
                  className="civic-btn h-[52px] rounded-[14px] flex items-center justify-center gap-2 disabled:opacity-40"
                  style={{ background: "#1c2330", border: "1.5px solid rgba(182,194,210,0.35)" }}
                >
                  <ImageIcon size={17} color="rgba(182,194,210,0.7)" strokeWidth={2} />
                  <span className="text-[14px] font-medium" style={{ color: "rgba(182,194,210,0.7)" }}>Choose photo</span>
                </button>
              </div>
            )}
          </div>
        )}

        {/* hidden utility elements */}
        <canvas ref={canvasRef} className="hidden" />
        <input
          type="file"
          ref={fileInputRef}
          onChange={handleGalleryUpload}
          accept="image/*,video/*"
          capture="environment"
          className="hidden"
        />

        {/* Loading overlay */}
        {isProcessing && (
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm z-50 flex flex-col items-center justify-center gap-3">
            <div className="w-10 h-10 border-4 rounded-full animate-spin" style={{ borderColor: "rgba(182,194,210,0.25)", borderTopColor: "#B6C2D2" }} />
            <span className="text-[14px] font-semibold" style={{ color: "#B6C2D2" }}>{pipelineStatus}</span>
          </div>
        )}
      </div>

      {/* ── IN-CAMERA CONTROLS (photo + video) — shown only when stream is active ── */}
      {stream && !isProcessing && (
        <div className="flex gap-3 w-full">
          {/* Photo capture */}
          <button
            onClick={captureImage}
            disabled={isRecording || isProcessing}
            className="civic-btn flex-1 h-[60px] rounded-[18px] flex items-center justify-center gap-2 font-bold text-[16px] disabled:opacity-40"
            style={{ background: "#1c2330", border: "1.5px solid #B6C2D2", color: "#B6C2D2" }}
          >
            <CameraIcon size={20} strokeWidth={2} />
            Photo
          </button>

          {/* Video record / stop */}
          {isRecording ? (
            <button
              onClick={stopRecording}
              className="civic-btn flex-1 h-[60px] rounded-[18px] flex items-center justify-center gap-2 font-bold text-[16px] text-white animate-pulse-ring"
              style={{ background: "#EF4444" }}
            >
              <Square size={18} fill="currentColor" />
              Stop
            </button>
          ) : (
            <button
              onClick={startRecording}
              disabled={isProcessing}
              className="civic-btn flex-1 h-[60px] rounded-[18px] flex items-center justify-center gap-2 font-bold text-[16px] disabled:opacity-40"
              style={{ background: "#1c2330", border: "1.5px solid rgba(182,194,210,0.35)", color: "rgba(182,194,210,0.75)" }}
            >
              <Video size={18} strokeWidth={2} />
              Video
            </button>
          )}
        </div>
      )}
    </main>
  );
}