"use client";

import { useState, useRef, useEffect } from "react";
import { 
  Camera as CameraIcon, Image as ImageIcon, X, RefreshCw, CheckCircle, 
  AlertTriangle, Phone, Mail, Copy, Share2, Send, Check, 
  Landmark, Target, TrendingUp, MapPin
} from "lucide-react";
import { db } from "../lib/firebase";
import { collection, doc } from "firebase/firestore";

const triggerHaptic = (pattern: number | number[] = 50) => {
  if (typeof window !== "undefined" && navigator.vibrate) {
    navigator.vibrate(pattern);
  }
};

export default function Home() {
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [image, setImage] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [pipelineStatus, setPipelineStatus] = useState<string>("");
  const [error, setError] = useState<string | null>(null);

  const [isOnline, setIsOnline] = useState(true);
  const [offlineQueue, setOfflineQueue] = useState(0);

  const [visionResult, setVisionResult] = useState<any | null>(null);
  const [agentResult, setAgentResult] = useState<any | null>(null);
  
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [copiedField, setCopiedField] = useState<string | null>(null);

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const currentUserId = "user_solan_resident_01";

  useEffect(() => {
    setIsOnline(navigator.onLine);
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    const queue = JSON.parse(localStorage.getItem('civic_offline_queue') || '[]');
    setOfflineQueue(queue.length);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const triggerToast = (msg: string) => {
    triggerHaptic([30, 50, 30]);
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3000);
  };

  const handleClipboardCopy = (text: string, fieldId: string) => {
    navigator.clipboard.writeText(text);
    setCopiedField(fieldId);
    triggerToast("Copied to clipboard");
    setTimeout(() => setCopiedField(null), 2000);
  };

  const handleNativeShare = async () => {
    if (!agentResult || !visionResult) return;
    const shareData = {
      title: `CivicAI Alert: ${agentResult.complaint_id}`,
      text: `Grievance logged: ${visionResult.sub_type || "Infrastructure anomaly"} at ${agentResult.resolved_location_name}. Track ID: ${agentResult.complaint_id}`,
      url: window.location.origin
    };

    if (navigator.share && navigator.canShare(shareData)) {
      try { await navigator.share(shareData); } 
      catch (err) { console.warn("Share aborted", err); }
    } else {
      handleClipboardCopy(shareData.text, "share");
    }
  };

  const startCameraPipeline = async () => {
    triggerHaptic(30);
    setImage(null);
    setError(null);
    setVisionResult(null);
    setAgentResult(null);
    try {
      const mediaStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
      setStream(mediaStream);
      setTimeout(() => { if (videoRef.current) videoRef.current.srcObject = mediaStream; }, 50);
    } catch (err) {
      fileInputRef.current?.click();
    }
  };

  const stopCameraPipeline = () => {
    if (stream) {
      stream.getTracks().forEach(track => track.stop());
      setStream(null);
    }
  };

  const captureFrame = () => {
    triggerHaptic(50);
    if (videoRef.current && canvasRef.current) {
      const context = canvasRef.current.getContext("2d");
      canvasRef.current.width = videoRef.current.videoWidth;
      canvasRef.current.height = videoRef.current.videoHeight;
      context?.drawImage(videoRef.current, 0, 0);
      const base64 = canvasRef.current.toDataURL("image/jpeg", 0.8);
      setImage(base64);
      stopCameraPipeline();
      executeAutonomousProcessing(base64); 
    }
  };

  const handleGalleryUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setImage(reader.result as string);
        executeAutonomousProcessing(reader.result as string); 
      };
      reader.readAsDataURL(file);
    }
  };

  const executeAutonomousProcessing = async (base64Img: string) => {
    setIsProcessing(true);
    setPipelineStatus("Analyzing evidence...");
    setError(null);
    
    try {
      // FIX 1: Point to the correct folder (/api/analyze)
      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // FIX 2: Pass the full image string and remove the dummy 'demoMode' flag
        body: JSON.stringify({ 
          image: base64Img, 
          mimeType: "image/jpeg", 
          lat: 30.9045, 
          lng: 77.0967 
        }),
        // FIX 3: Force Next.js PWA to ignore the cache!
        cache: 'no-store'
      });
      
      const payload = await res.json().catch(() => null);
      
      // FIX 4: Actually read the error from the backend instead of ignoring it
      if (!res.ok) {
        throw new Error(payload?.error || `Server responded with status ${res.status}`);
      }
      if (!payload?.success) {
        throw new Error(payload?.error || "Failed to process image.");
      }

      triggerHaptic([50, 100, 50]); 
      setVisionResult(payload.visionData);
      setAgentResult(payload.agentResult);
    } catch (err: any) {
      console.error("API Pipeline Error:", err);
      triggerHaptic([50, 50, 50]); 
      // FIX 5: No more dummy data! Actually show the user why it failed (e.g., "Image rejected: Non-civic subject")
      setError(err.message || "Failed to connect to AI core.");
    } finally {
      setIsProcessing(false);
    }
  };

  const commitComplaintToStorage = async () => {
    if (!visionResult || !agentResult) return;
    triggerHaptic(30);
    setIsSubmitting(true);

    const payload = {
      complaintId: agentResult.complaint_id,
      createdAt: new Date().toISOString(), 
      status: "filed",
      userId: currentUserId,
      location: { lat: 30.9045, lng: 77.0967, address: agentResult.resolved_location_name, district: "Solan" },
      analysis: visionResult,
      formalComplaint: agentResult.formal_complaint,
    };

    if (!isOnline) {
      const queue = JSON.parse(localStorage.getItem('civic_offline_queue') || '[]');
      queue.push(payload);
      localStorage.setItem('civic_offline_queue', JSON.stringify(queue));
      setOfflineQueue(queue.length);
      triggerToast("Offline mode. Saved to device sync queue.");
      setTimeout(() => { window.location.href = "/dashboard"; }, 2000);
      return;
    }

    try {
      const { setDoc } = await import("firebase/firestore");
      const complaintsRef = doc(collection(db, "complaints"));
      await setDoc(complaintsRef, payload);

      triggerToast("Report Secured in Database.");
      setTimeout(() => { window.location.href = "/dashboard"; }, 1500);
    } catch (err: any) {
      console.error("Firebase Save Error:", err);
      triggerToast("Database Error - Check Console");
      setIsSubmitting(false);
    }
  };

  const getSeverityStyles = (severity: number) => {
    switch(severity) {
      case 5: return "bg-[#FEF2F2] dark:bg-[#7F1D1D]/40 text-[#EF4444] dark:text-[#F87171] border-[#FCA5A5] dark:border-[#991B1B]";
      case 4: return "bg-[#FFFBEB] dark:bg-[#78350F]/40 text-[#F59E0B] dark:text-[#FBBF24] border-[#FDE68A] dark:border-[#92400E]";
      default: return "bg-[#F3F4F6] dark:bg-[#18181B] text-[#111827] dark:text-[#E5E7EB] border-[#E5E7EB] dark:border-[#3F3F46]";
    }
  };

  return (
    <main className="px-5 py-4 w-full max-w-md mx-auto flex flex-col gap-5 min-h-[100dvh] pb-32">
      
      <style dangerouslySetInnerHTML={{__html: `
        @keyframes scan { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(160px); } }
        .animate-scan { animation: scan 2.5s cubic-bezier(0.4, 0, 0.2, 1) infinite; }
      `}} />

      {/* TOAST SYSTEM */}
      {toastMessage && (
        <div className="fixed top-24 left-1/2 -translate-x-1/2 z-50 bg-[#516B8B] dark:bg-[#27272A] text-white font-bold px-5 py-3 rounded-2xl shadow-xl text-[15px] animate-in fade-in slide-in-from-top-4 duration-300 flex items-center gap-2">
          <CheckCircle size={18} /> {toastMessage}
        </div>
      )}

      {/* SUCCESS SCREEN */}
      {agentResult && visionResult ? (
        <div className="flex flex-col gap-4 animate-in fade-in slide-in-from-bottom-6 duration-300 w-full pb-8">
          
          <div className="flex justify-between items-center bg-white dark:bg-[#18181B] border border-[#E2E8F0] dark:border-transparent p-4 rounded-[20px] shadow-sm">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-[#D1FAE5] dark:bg-[#064E3B] flex items-center justify-center text-[#10B981]">
                <CheckCircle size={22} className="animate-pulse" />
              </div>
              <div>
                <h2 className="text-[18px] font-bold text-[#1E293B] dark:text-[#E5E7EB] leading-none" style={{fontFamily: 'var(--font-jakarta)'}}>Issue Detected</h2>
                <p className="text-xs text-[#6B7280] dark:text-[#A1A1AA] mt-1">Ready for submission</p>
              </div>
            </div>
            <button onClick={handleNativeShare} className="w-12 h-12 rounded-xl bg-[#F8F9FC] dark:bg-[#09090B] active:scale-95 transition-transform flex items-center justify-center text-[#6B7280] dark:text-[#A1A1AA]">
              <Share2 size={20} />
            </button>
          </div>

          <div className="bg-white dark:bg-[#18181B] border border-[#E2E8F0] dark:border-transparent p-5 rounded-[20px] shadow-sm flex flex-col gap-4">
            <div className="flex justify-between items-start">
              <div>
                <span className="text-[11px] font-bold text-[#6B7280] dark:text-[#A1A1AA] uppercase tracking-wider">Classification</span>
                <h3 className="text-[20px] font-black text-[#1E293B] dark:text-[#E5E7EB] capitalize mt-0.5 leading-tight" style={{fontFamily: 'var(--font-jakarta)'}}>
                  {visionResult.sub_type || visionResult.issue_category}
                </h3>
              </div>
              <span className={`text-[13px] font-bold px-3 py-1.5 rounded-full border uppercase tracking-wider ${getSeverityStyles(visionResult.severity)}`}>
                Lvl {visionResult.severity}
              </span>
            </div>
          </div>

          <div className="bg-white dark:bg-[#18181B] border border-[#E2E8F0] dark:border-transparent p-5 rounded-[20px] shadow-sm flex flex-col gap-4">
            <div className="flex items-center gap-3 border-b border-[#F8F9FC] dark:border-[#27272A] pb-4">
              <div className="w-10 h-10 rounded-xl bg-[#E2E8F0] dark:bg-[#27272A] flex items-center justify-center text-[#516B8B] dark:text-[#E5E7EB]">
                <Landmark size={20} />
              </div>
              <div>
                <h4 className="text-[16px] font-bold text-[#1E293B] dark:text-[#E5E7EB] leading-tight">
                  {agentResult.authority_contact?.department || visionResult.department}
                </h4>
                <p className="text-xs text-[#6B7280] dark:text-[#A1A1AA] mt-0.5">Assigned Jurisdiction</p>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <a href={`tel:${agentResult.authority_contact?.phone}`} className="flex items-center justify-center gap-2 bg-[#F8F9FC] dark:bg-[#09090B] active:scale-[0.98] transition-all text-[#1E293B] dark:text-[#E5E7EB] rounded-xl min-h-[48px] text-sm font-semibold">
                <Phone size={16} className="text-[#516B8B] dark:text-[#E5E7EB]" /> Call Office
              </a>
              <a href={`mailto:${agentResult.authority_contact?.email}`} className="flex items-center justify-center gap-2 bg-[#F8F9FC] dark:bg-[#09090B] active:scale-[0.98] transition-all text-[#1E293B] dark:text-[#E5E7EB] rounded-xl min-h-[48px] text-sm font-semibold">
                <Mail size={16} className="text-[#516B8B] dark:text-[#E5E7EB]" /> Email
              </a>
            </div>
          </div>

          <div className="bg-white dark:bg-[#18181B] border border-[#E2E8F0] dark:border-transparent p-4 rounded-[20px] shadow-sm flex items-center justify-between">
            <div>
              <span className="text-[11px] font-bold text-[#6B7280] dark:text-[#A1A1AA] uppercase tracking-wider">Record Token</span>
              <div className="text-[22px] font-black text-[#10B981] tracking-tight mt-0.5">{agentResult.complaint_id}</div>
            </div>
            <button onClick={() => handleClipboardCopy(agentResult.complaint_id, "id")} className="w-12 h-12 rounded-xl bg-[#F8F9FC] dark:bg-[#09090B] active:scale-95 transition-transform flex items-center justify-center text-[#6B7280] dark:text-[#A1A1AA]">
              {copiedField === "id" ? <CheckCircle size={20} className="text-[#10B981]" /> : <Copy size={20} />}
            </button>
          </div>

          <div className="flex flex-col gap-3 mt-2">
            <a href={`https://wa.me/${(agentResult.authority_contact?.whatsappNumber || "").replace(/\D/g, "")}?text=${encodeURIComponent(agentResult.whatsapp_message || "")}`} target="_blank" rel="noopener noreferrer" className="w-full bg-[#10B981] text-white font-bold text-[16px] min-h-[52px] rounded-full flex items-center justify-center gap-2 shadow-[0_8px_20px_rgba(16,185,129,0.25)] active:scale-[0.98] transition-transform">
              <Send size={18} /> Share via WhatsApp
            </a>

            <button onClick={commitComplaintToStorage} disabled={isSubmitting} className="w-full bg-[#516B8B] dark:bg-[#27272A] disabled:opacity-50 text-white font-bold text-[16px] min-h-[52px] rounded-full flex items-center justify-center gap-2 shadow-[0_8px_20px_rgba(81,107,139,0.25)] dark:shadow-none active:scale-[0.98] transition-all mt-2">
              {isSubmitting ? <RefreshCw size={20} className="animate-spin" /> : <CheckCircle size={20} />}
              {isSubmitting ? "Saving Report..." : "Submit to CivicAI"}
            </button>
          </div>

        </div>
      ) : (
        /* MAIN CAPTURE & HOME SCREEN */
        <div className="flex flex-col gap-4 w-full">

          <div className="relative w-full h-[160px] bg-[#E2E8F0] dark:bg-[#18181B] rounded-[24px] overflow-hidden p-6 flex flex-col justify-center">
            <div className="absolute top-1/2 left-0 right-0 h-1 bg-[#516B8B] dark:bg-[#3F3F46] opacity-30 transform -translate-y-1/2 rotate-[-8deg] scale-110"></div>
            <div className="absolute top-1/2 left-0 right-0 h-1 bg-[#516B8B] dark:bg-[#3F3F46] opacity-60 transform -translate-y-1/2 rotate-[5deg] scale-110"></div>
            <div className="absolute left-[20%] top-[45%] w-10 h-10 bg-[#FFD166] rounded-full opacity-40 blur-md dark:opacity-10"></div>
            <div className="absolute left-[25%] top-[50%] w-6 h-8 bg-black dark:bg-white rounded-lg opacity-80 rotate-12 z-10 flex items-center justify-center">
               <div className="w-1 h-3 bg-white dark:bg-black rounded-full"></div>
            </div>
            <div className="absolute right-[30%] top-[30%] w-8 h-8 bg-[#FFD166] dark:bg-[#27272A] rounded-full z-10 flex items-center justify-center font-black text-[#516B8B] dark:text-[#E5E7EB] text-lg shadow-sm">!</div>

            <div className="relative z-20">
              <h1 className="text-[28px] font-black text-[#1E293B] dark:text-[#E5E7EB] leading-[1.1]" style={{fontFamily: 'var(--font-jakarta)'}}>
                Spot it.<br/>Report it.
              </h1>
              <p className="text-[14px] font-semibold text-[#516B8B] dark:text-[#A1A1AA] mt-1 tracking-wide">Fix your city together</p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="bg-white dark:bg-[#18181B] border border-[#E2E8F0] dark:border-transparent rounded-[20px] p-4 flex items-center gap-3 shadow-sm">
              <div className="w-10 h-10 rounded-xl bg-[#FFF8E7] dark:bg-[#27272A] flex items-center justify-center shrink-0">
                <TrendingUp size={20} className="text-[#F59E0B] dark:text-[#E5E7EB]" strokeWidth={3} />
              </div>
              <div className="flex flex-col">
                <span className="text-[20px] font-black text-[#1E293B] dark:text-[#E5E7EB] leading-none" style={{fontFamily: 'var(--font-jakarta)'}}>#12</span>
                <span className="text-[11px] font-medium text-[#6B7280] dark:text-[#A1A1AA] mt-1">City rank <span className="text-[#10B981] font-bold">↑3</span></span>
              </div>
            </div>
            <div className="bg-white dark:bg-[#18181B] border border-[#E2E8F0] dark:border-transparent rounded-[20px] p-4 flex items-center gap-3 shadow-sm">
              <div className="w-10 h-10 rounded-xl bg-[#D1FAE5] dark:bg-[#27272A] flex items-center justify-center shrink-0">
                <Check size={20} className="text-[#10B981] dark:text-[#10B981]" strokeWidth={3} />
              </div>
              <div className="flex flex-col">
                <span className="text-[20px] font-black text-[#1E293B] dark:text-[#E5E7EB] leading-none" style={{fontFamily: 'var(--font-jakarta)'}}>1.2k</span>
                <span className="text-[11px] font-medium text-[#6B7280] dark:text-[#A1A1AA] mt-1">Resolved this month</span>
              </div>
            </div>
          </div>

          <div className="w-full bg-[#FFF9C4] dark:bg-[#18181B] rounded-[16px] py-3.5 px-4 flex items-center gap-3 shadow-sm border dark:border-transparent">
            <div className="w-8 h-8 rounded-full bg-[#F59E0B]/20 flex items-center justify-center shrink-0">
              <MapPin size={16} className="text-[#F59E0B]" fill="currentColor" />
            </div>
            <span className="text-[13px] font-bold text-[#B45309] dark:text-[#E5E7EB]">247 issues fixed near you this week</span>
          </div>

          {/* THE UPDATED CAMERA HERO AREA */}
          <div className="relative w-full h-[220px] bg-[#FFF3D6] dark:bg-[#09090B] rounded-[24px] overflow-hidden flex flex-col items-center justify-center shadow-inner dark:shadow-md transition-colors border dark:border-[#27272A]">
            {stream && !image ? (
              <>
                <video ref={videoRef} autoPlay playsInline className="absolute inset-0 w-full h-full object-cover" />
                <div className="absolute inset-0 z-10 p-8 flex flex-col justify-between pointer-events-none">
                  <div className="flex justify-between w-full h-10">
                    <div className="w-8 h-8 border-t-[3px] border-l-[3px] border-[#516B8B]/80 dark:border-[#52525B]"></div>
                    <div className="w-8 h-8 border-t-[3px] border-r-[3px] border-[#516B8B]/80 dark:border-[#52525B]"></div>
                  </div>
                  <div className="absolute left-10 right-10 top-12 h-[2px] bg-[#516B8B] dark:bg-[#A1A1AA] shadow-[0_0_15px_2px_rgba(81,107,139,0.6)] dark:shadow-[0_0_15px_2px_rgba(161,161,170,0.4)] animate-scan z-20"></div>
                  <div className="flex justify-between w-full h-10">
                    <div className="w-8 h-8 border-b-[3px] border-l-[3px] border-[#516B8B]/80 dark:border-[#52525B]"></div>
                    <div className="w-8 h-8 border-b-[3px] border-r-[3px] border-[#516B8B]/80 dark:border-[#52525B]"></div>
                  </div>
                </div>
                <button onClick={stopCameraPipeline} className="absolute top-3 right-3 w-10 h-10 bg-black/40 backdrop-blur-md rounded-full flex items-center justify-center text-white z-20 active:scale-90">
                  <X size={20} />
                </button>
              </>
            ) : image ? (
              <>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={image} alt="Captured" className="absolute inset-0 w-full h-full object-cover opacity-30" />
                <div className="relative z-10 flex flex-col items-center text-center p-4">
                  {isProcessing ? (
                    <div className="flex flex-col items-center gap-3">
                      <Target size={32} className="text-[#516B8B] dark:text-[#E5E7EB] animate-pulse" />
                      <span className="text-[14px] font-bold text-[#516B8B] dark:text-[#E5E7EB]">{pipelineStatus}</span>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center gap-3">
                      <AlertTriangle size={32} className="text-[#EF4444]" />
                      <span className="text-[14px] font-bold text-[#1E293B] dark:text-[#E5E7EB]">{error || "Error"}</span>
                      <button onClick={() => setImage(null)} className="px-5 py-2 bg-[#516B8B] dark:bg-[#27272A] rounded-full text-[13px] font-bold text-white active:scale-95">Try Again</button>
                    </div>
                  )}
                </div>
              </>
            ) : (
              <div className="flex flex-col items-center justify-center w-full h-full relative p-8">
                <div className="flex justify-between w-full h-full absolute inset-0 p-8 pointer-events-none">
                  <div className="flex flex-col justify-between">
                    <div className="w-6 h-6 border-t-[3px] border-l-[3px] border-[#516B8B]/60 dark:border-[#52525B]"></div>
                    <div className="w-6 h-6 border-b-[3px] border-l-[3px] border-[#516B8B]/60 dark:border-[#52525B]"></div>
                  </div>
                  <div className="flex flex-col justify-between">
                    <div className="w-6 h-6 border-t-[3px] border-r-[3px] border-[#516B8B]/60 dark:border-[#52525B]"></div>
                    <div className="w-6 h-6 border-b-[3px] border-r-[3px] border-[#516B8B]/60 dark:border-[#52525B]"></div>
                  </div>
                </div>
                <div className="flex flex-col items-center gap-2 relative z-10">
                  <Target size={24} className="text-[#516B8B] dark:text-[#A1A1AA]" />
                  <div className="w-24 h-[1.5px] bg-[#516B8B]/40 dark:bg-[#52525B] absolute top-3"></div>
                  <span className="text-[13px] font-bold text-[#516B8B] dark:text-[#A1A1AA] mt-2 tracking-wide">AI scanning ready</span>
                </div>
              </div>
            )}
            <canvas ref={canvasRef} className="hidden" />
            <input type="file" ref={fileInputRef} onChange={handleGalleryUpload} accept="image/*" capture="environment" className="hidden" />
          </div>

          <div className="flex items-center gap-3 w-full">
            <button 
              onClick={!stream ? startCameraPipeline : captureFrame}
              disabled={isProcessing}
              className="flex-1 h-[60px] bg-[#516B8B] dark:bg-[#27272A] text-white rounded-[20px] font-black text-[18px] flex items-center justify-center gap-2 shadow-[0_8px_24px_rgba(81,107,139,0.3)] dark:shadow-[0_8px_24px_rgba(0,0,0,0.5)] active:scale-[0.98] transition-transform disabled:opacity-50"
              style={{fontFamily: 'var(--font-jakarta)'}}
            >
              <CameraIcon size={22} strokeWidth={2.5} /> Report Hazard
            </button>
            <button 
              onClick={() => { triggerHaptic(30); fileInputRef.current?.click(); }}
              disabled={isProcessing}
              className="w-[60px] h-[60px] shrink-0 bg-[#E2E8F0] dark:bg-[#27272A] text-[#516B8B] dark:text-[#E5E7EB] rounded-[20px] flex items-center justify-center transition-colors active:scale-95 disabled:opacity-50"
            >
              <ImageIcon size={24} />
            </button>
          </div>
        </div>
      )}
    </main>
  );
}