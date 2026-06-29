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
      // Request video (audio optional to prevent permission crashes)
      const mediaStream = await navigator.mediaDevices.getUserMedia({ 
        video: { facingMode: "environment" },
        audio: false 
      });
      setStream(mediaStream);
      setTimeout(() => { if (videoRef.current) videoRef.current.srcObject = mediaStream; }, 50);
    } catch (err) {
      console.warn("Camera access denied or unavailable.");
      fileInputRef.current?.click(); // Fallback to gallery
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
    const mediaRecorder = new MediaRecorder(stream, { mimeType: 'video/webm' });
    
    mediaRecorder.ondataavailable = (e) => {
      if (e.data.size > 0) videoChunks.current.push(e.data);
    };
    
    mediaRecorder.onstop = async () => {
      const videoBlob = new Blob(videoChunks.current, { type: 'video/webm' });
      
      // Extract a single frame to send to the Vision AI 
      // (because 15s edge functions can't process a full raw video file)
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
      const isVideo = file.type.startsWith('video/');
      const reader = new FileReader();
      
      reader.onloadend = async () => {
        // If it's a video from gallery, we'll send a placeholder image to AI to prevent crash
        // In a true prod app, you'd extract a frame here.
        const base64ForAI = isVideo 
          ? "data:image/jpeg;base64,/9j/4AAQSkZJRgABAAAAAQABAAD/2wBDAP..." // Dummy clear frame fallback
          : (reader.result as string);
          
        await uploadAndQueueReport(file, file.type, base64ForAI);
      };
      
      if (!isVideo) {
        reader.readAsDataURL(file);
      } else {
        uploadAndQueueReport(file, file.type, ""); // Pass empty for video fallback
      }
    }
  };

  // --- THE MASTER QUEUE FUNCTION ---
  const uploadAndQueueReport = async (fileBlob: Blob | File, mimeType: string, base64ForAI: string) => {
    setIsProcessing(true);
    setPipelineStatus("Uploading media securely...");
    setError(null);

    try {
      // 1. Upload Media to Firebase Storage
      const ext = mimeType.includes('video') ? 'webm' : 'jpg';
      const storageRef = ref(storage, `reports/${currentUserId}/${Date.now()}.${ext}`);
      const snapshot = await uploadBytes(storageRef, fileBlob);
      const downloadURL = await getDownloadURL(snapshot.ref);

      setPipelineStatus("Creating tracking token...");

      // 2. Create the "Pending" Draft in Firestore
      const pendingRef = await addDoc(collection(db, "pending_reports"), {
        userId: currentUserId,
        mediaUrl: downloadURL,
        mediaType: mimeType,
        status: "processing", // The Dashboard reads this!
        createdAt: new Date().toISOString(),
        location: { lat: 30.9045, lng: 77.0967 }, // Demo coordinates
      });

      // 3. Trigger the AI in the background (Do NOT await this)
      if (base64ForAI) {
        runBackgroundAI(base64ForAI, pendingRef.id);
      } else {
        // Fallback if gallery video extraction fails
        updateDoc(doc(db, "pending_reports", pendingRef.id), { 
          status: "failed", 
          error: "Video processing requires active camera recording." 
        });
      }

      // 4. Send user to Dashboard instantly
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
  // This runs asynchronously so the user doesn't have to wait on this screen!
  const runBackgroundAI = (base64Img: string, docId: string) => {
    const cleanBase64 = base64Img.includes(',') ? base64Img.split(',')[1] : base64Img;

    fetch("/api/analyze", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        image: cleanBase64,
        mimeType: "image/jpeg",
        lat: 30.9045,
        lng: 77.0967
      }),
      cache: 'no-store'
    })
    .then(res => res.json())
    .then(async (payload) => {
      if (payload.success) {
        // Update the draft to "ready" - Dashboard will let user click it!
        await updateDoc(doc(db, "pending_reports", docId), {
          status: "ready", 
          visionData: payload.visionData,
          agentResult: payload.agentResult
        });
      } else {
        await updateDoc(doc(db, "pending_reports", docId), { status: "failed", error: payload.error });
      }
    })
    .catch(async (err) => {
      await updateDoc(doc(db, "pending_reports", docId), { status: "failed", error: "AI Timeout" });
    });
  };

  return (
    <main className="px-5 py-4 w-full max-w-md mx-auto flex flex-col gap-5 min-h-[100dvh] pb-32 bg-[#FCFAF5] dark:bg-[#09090B]">
      
      <style dangerouslySetInnerHTML={{__html: `
        @keyframes scan { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(160px); } }
        .animate-scan { animation: scan 2.5s cubic-bezier(0.4, 0, 0.2, 1) infinite; }
        @keyframes pulse-ring { 0% { box-shadow: 0 0 0 0 rgba(239, 68, 68, 0.7); } 70% { box-shadow: 0 0 0 15px rgba(239, 68, 68, 0); } 100% { box-shadow: 0 0 0 0 rgba(239, 68, 68, 0); } }
        .animate-pulse-ring { animation: pulse-ring 1.5s cubic-bezier(0.4, 0, 0.6, 1) infinite; }
      `}} />

      <div className="flex flex-col gap-4 w-full">
        {/* HERO HEADER */}
        {!stream && (
          <>
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
          </>
        )}

        {/* CAMERA FEED & PROCESSING UI */}
        <div className={`relative w-full ${stream ? 'h-[60vh]' : 'h-[180px]'} bg-[#E2E8F0] dark:bg-[#09090B] rounded-[24px] overflow-hidden flex flex-col items-center justify-center shadow-inner dark:shadow-md transition-all duration-300 border dark:border-[#27272A]`}>
          
          {stream ? (
            <>
              <video ref={videoRef} autoPlay playsInline muted className="absolute inset-0 w-full h-full object-cover" />
              
              {/* Camera Overlays */}
              <div className="absolute inset-0 z-10 p-8 flex flex-col justify-between pointer-events-none">
                <div className="flex justify-between w-full h-10">
                  <div className="w-8 h-8 border-t-[3px] border-l-[3px] border-white/80 shadow-sm"></div>
                  <div className="w-8 h-8 border-t-[3px] border-r-[3px] border-white/80 shadow-sm"></div>
                </div>
                
                {isRecording && (
                  <div className="absolute top-6 left-1/2 -translate-x-1/2 bg-black/60 backdrop-blur-md text-white font-bold px-4 py-1.5 rounded-full flex items-center gap-2 text-sm z-20">
                    <div className="w-2.5 h-2.5 rounded-full bg-red-500 animate-pulse"></div> Recording
                  </div>
                )}

                <div className="flex justify-between w-full h-10">
                  <div className="w-8 h-8 border-b-[3px] border-l-[3px] border-white/80 shadow-sm"></div>
                  <div className="w-8 h-8 border-b-[3px] border-r-[3px] border-white/80 shadow-sm"></div>
                </div>
              </div>
              
              {!isProcessing && (
                <button onClick={stopCameraPipeline} className="absolute top-4 right-4 w-10 h-10 bg-black/40 backdrop-blur-md rounded-full flex items-center justify-center text-white z-20 active:scale-90">
                  <X size={20} />
                </button>
              )}
            </>
          ) : (
            <div className="flex flex-col items-center justify-center w-full h-full relative p-8">
              <div className="flex flex-col items-center gap-2 relative z-10">
                <Target size={32} className="text-[#516B8B] dark:text-[#A1A1AA] mb-2" />
                <span className="text-[14px] font-bold text-[#516B8B] dark:text-[#A1A1AA] tracking-wide">
                  {isProcessing ? pipelineStatus : "Camera Ready"}
                </span>
                {error && <span className="text-[12px] text-red-500 font-bold">{error}</span>}
              </div>
            </div>
          )}
          
          {/* Hidden utility elements */}
          <canvas ref={canvasRef} className="hidden" />
          <input type="file" ref={fileInputRef} onChange={handleGalleryUpload} accept="image/*,video/*" capture="environment" className="hidden" />
          
          {/* Loading Overlay */}
          {isProcessing && (
            <div className="absolute inset-0 bg-black/50 backdrop-blur-sm z-50 flex flex-col items-center justify-center">
               <div className="w-10 h-10 border-4 border-white/30 border-t-white rounded-full animate-spin mb-3"></div>
               <span className="text-white font-bold">{pipelineStatus}</span>
            </div>
          )}
        </div>

        {/* CONTROLS */}
        <div className="flex items-center gap-3 w-full">
          {!stream ? (
            <button 
              onClick={startCameraPipeline}
              disabled={isProcessing}
              className="flex-1 h-[60px] bg-[#516B8B] dark:bg-[#27272A] text-white rounded-[20px] font-black text-[18px] flex items-center justify-center gap-2 shadow-[0_8px_24px_rgba(81,107,139,0.3)] dark:shadow-[0_8px_24px_rgba(0,0,0,0.5)] active:scale-[0.98] transition-transform disabled:opacity-50"
            >
              <CameraIcon size={22} strokeWidth={2.5} /> Open Scanner
            </button>
          ) : (
            <div className="flex-1 flex gap-3">
              {/* Photo Button */}
              <button 
                onClick={captureImage}
                disabled={isRecording || isProcessing}
                className="flex-1 h-[60px] bg-white dark:bg-[#27272A] text-[#1E293B] dark:text-white border-2 border-[#E2E8F0] dark:border-[#3F3F46] rounded-[20px] font-bold text-[16px] flex items-center justify-center gap-2 active:scale-95 transition-transform disabled:opacity-50"
              >
                <CameraIcon size={20} /> Photo
              </button>
              
              {/* Video Button */}
              {isRecording ? (
                <button 
                  onClick={stopRecording}
                  className="flex-1 h-[60px] bg-[#EF4444] text-white rounded-[20px] font-bold text-[16px] flex items-center justify-center gap-2 active:scale-95 transition-transform animate-pulse-ring"
                >
                  <Square size={20} fill="currentColor" /> Stop
                </button>
              ) : (
                <button 
                  onClick={startRecording}
                  disabled={isProcessing}
                  className="flex-1 h-[60px] bg-[#1E293B] text-white rounded-[20px] font-bold text-[16px] flex items-center justify-center gap-2 active:scale-95 transition-transform disabled:opacity-50"
                >
                  <Video size={20} /> Video
                </button>
              )}
            </div>
          )}

          {!stream && (
            <button 
              onClick={() => { triggerHaptic(30); fileInputRef.current?.click(); }}
              disabled={isProcessing}
              className="w-[60px] h-[60px] shrink-0 bg-[#E2E8F0] dark:bg-[#27272A] text-[#516B8B] dark:text-[#E5E7EB] rounded-[20px] flex items-center justify-center transition-colors active:scale-95 disabled:opacity-50"
            >
              <ImageIcon size={24} />
            </button>
          )}
        </div>

      </div>
    </main>
  );
}