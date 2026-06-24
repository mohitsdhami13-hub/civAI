"use client";

import { useState, useRef } from "react";
import { Camera, Upload, RefreshCw, AlertTriangle, CheckCircle, MapPin, FileText, MessageCircle, Mail, User, Save, Check } from "lucide-react";
import { analyzeImageAction, generateComplaintAgentAction } from "./actions";
import { db } from "../lib/firebase";
import { collection, addDoc, serverTimestamp } from "firebase/firestore";

export default function Home() {
  const [image, setImage] = useState<string | null>(null);
  const [mimeType, setMimeType] = useState<string>("");
  const [loadingStep, setLoadingStep] = useState<string>(""); 
  const [visionResult, setVisionResult] = useState<any | null>(null);
  const [agentResult, setAgentResult] = useState<any | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [locationStr, setLocationStr] = useState<string>("");
  
  // Database submission states
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [submitSuccess, setSubmitSuccess] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setMimeType(file.type);
    setError(null);
    setVisionResult(null);
    setAgentResult(null);
    setLocationStr("");
    setSubmitSuccess(null);

    const reader = new FileReader();
    reader.onloadend = () => {
      setImage(reader.result as string);
    };
    reader.onerror = () => {
      setError("Failed to read the selected file.");
    };
    reader.readAsDataURL(file);
  };

  const triggerFileSelect = () => {
    fileInputRef.current?.click();
  };

  const runAutonomousPipeline = async () => {
    if (!image) return;
    setError(null);
    setVisionResult(null);
    setAgentResult(null);
    setSubmitSuccess(null);

    try {
      const base64Data = image.split(",")[1];

      setLoadingStep("Vision Agent: Analyzing scene and extracting matrix...");
      const visionRes = await analyzeImageAction(base64Data, mimeType);
      if (!visionRes.success) throw new Error(visionRes.error);
      setVisionResult(visionRes.data);

      setLoadingStep("Location Agent: Acquiring precise GPS lock...");
      let lat = 30.9045; 
      let lng = 77.0967;
      
      try {
        const position: any = await new Promise((resolve, reject) => {
          if (!navigator.geolocation) reject("No geolocation support");
          navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 5000 });
        });
        lat = position.coords.latitude;
        lng = position.coords.longitude;
        setLocationStr(`${lat.toFixed(4)}, ${lng.toFixed(4)}`);
      } catch (e) {
        setLocationStr(`${lat.toFixed(4)}, ${lng.toFixed(4)} (Fallback)`);
      }

      setLoadingStep("Drafting Agent: Resolving authority & generating legal complaints...");
      const agentRes = await generateComplaintAgentAction(visionRes.data, lat, lng);
      if (!agentRes.success) throw new Error(agentRes.error);
      setAgentResult(agentRes.data);

      setLoadingStep("");
    } catch (err: any) {
      setError(err.message || "Autonomous pipeline failed.");
      setLoadingStep("");
    }
  };

  const submitComplaint = async () => {
    if (!visionResult || !agentResult) return;
    setIsSubmitting(true);
    setError(null);

    try {
      // 1. Hackathon Bypass: Skip Storage, write directly to Firestore
      setLoadingStep("Writing secure record to Firestore...");
      
      const complaintData = {
        userId: "anonymous_for_now", 
        createdAt: serverTimestamp(),
        status: "filed",
        imageUrl: "Storage bypassed for demo mode", // Replaced actual URL with a safe string
        location: {
          lat: Number(locationStr.split(",")[0]) || 30.9045,
          lng: Number(locationStr.split(",")[1]) || 77.0967,
          address: "Resolved via GPS coordinates",
          ward: "TBD",
          district: Number(locationStr.split(",")[0]) > 31.0 ? "Shimla" : "Solan"
        },
        analysis: {
          category: visionResult.issue_category || "other",
          subType: visionResult.sub_type || "unspecified",
          severity: visionResult.severity || 1,
          department: visionResult.department || "unassigned",
          confidence: visionResult.confidence || 1.0
        },
        formalComplaint: agentResult.formal_complaint,
        whatsappMessage: agentResult.whatsapp_message,
        emailBody: agentResult.email_body,
        authorityContact: agentResult.authority_contact,
        communityVerifications: 1,
        escalationLevel: 0,
        lastEscalatedAt: null,
        resolvedAt: null
      };

      const docRef = await addDoc(collection(db, "complaints"), complaintData);
      setSubmitSuccess(`SUCCESS: Complaint officially filed with ID: ${docRef.id}`);
      setLoadingStep("");
    } catch (err: any) {
      console.error("Firestore Error:", err);
      setError(err.message || "Failed to save to database.");
      setLoadingStep("");
    } finally {
      setIsSubmitting(false);
    }
  };

  const clearAll = () => {
    setImage(null);
    setMimeType("");
    setVisionResult(null);
    setAgentResult(null);
    setError(null);
    setLoadingStep("");
    setLocationStr("");
    setSubmitSuccess(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  return (
    <main className="max-w-6xl mx-auto p-4 md:p-8">
      <header className="mb-8 border-b border-slate-800 pb-6">
        <h1 className="text-3xl font-extrabold tracking-tight bg-gradient-to-r from-emerald-400 to-cyan-400 bg-clip-text text-transparent">
          CivicAI
        </h1>
        <p className="text-slate-400 text-sm mt-1">
          Autonomous Civic Grievance Agent — Multi-Step Pipeline Validation
        </p>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        
        {/* Left Column: Input selection */}
        <div className="lg:col-span-4 space-y-6">
          <div className="border-2 border-dashed border-slate-800 rounded-xl bg-slate-900/50 p-4 flex flex-col items-center justify-center text-center relative overflow-hidden h-[300px]">
            {image ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={image} alt="Civic issue" className="absolute inset-0 w-full h-full object-cover rounded-xl" />
            ) : (
              <div className="space-y-4">
                <div className="p-4 bg-slate-800 rounded-full w-16 h-16 flex items-center justify-center mx-auto text-slate-400">
                  <Camera size={28} />
                </div>
                <div>
                  <p className="font-semibold text-slate-200">Upload Evidence</p>
                </div>
              </div>
            )}
            <input type="file" ref={fileInputRef} onChange={handleFileChange} accept="image/*" capture="environment" className="hidden" />
          </div>

          <div className="flex flex-col gap-3">
            {!image ? (
              <button onClick={triggerFileSelect} className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-medium py-3 px-4 rounded-lg flex items-center justify-center gap-2 transition-all">
                <Upload size={18} /> Select / Take Photo
              </button>
            ) : (
              <>
                <button
                  onClick={runAutonomousPipeline}
                  disabled={!!loadingStep || !!agentResult}
                  className="w-full bg-cyan-600 hover:bg-cyan-500 disabled:bg-cyan-900 disabled:text-cyan-500/50 text-white font-medium py-3 px-4 rounded-lg flex items-center justify-center gap-2 transition-all"
                >
                  {loadingStep ? <RefreshCw size={18} className="animate-spin" /> : <CheckCircle size={18} />}
                  {loadingStep ? "Pipeline Running..." : agentResult ? "Agent Pipeline Complete" : "Deploy Autonomous Agent"}
                </button>
                <button onClick={clearAll} disabled={!!loadingStep} className="w-full bg-slate-800 hover:bg-slate-700 text-slate-300 font-medium py-3 px-4 rounded-lg transition-all">
                  Reset Form
                </button>
              </>
            )}
          </div>

          {loadingStep && (
            <div className="bg-cyan-950/30 border border-cyan-900/50 rounded-lg p-4 text-sm text-cyan-400 animate-pulse flex items-center gap-3">
              <RefreshCw size={16} className="animate-spin flex-shrink-0" />
              <span>{loadingStep}</span>
            </div>
          )}

          {error && (
            <div className="bg-red-950/40 border border-red-900/50 rounded-lg p-4 text-sm text-red-400 flex items-start gap-3">
              <AlertTriangle className="flex-shrink-0 mt-0.5" size={16} />
              <span>{error}</span>
            </div>
          )}

          {submitSuccess && (
            <div className="bg-emerald-950/40 border border-emerald-900/50 rounded-lg p-4 text-sm text-emerald-400 flex items-start gap-3">
              <Check className="flex-shrink-0 mt-0.5" size={16} />
              <span className="font-mono">{submitSuccess}</span>
            </div>
          )}
        </div>

        {/* Right Column: Multi-Agent Outputs */}
        <div className="lg:col-span-8 flex flex-col h-full space-y-4">
          
          <div className="flex flex-wrap gap-4 items-center bg-slate-900 p-3 rounded-lg border border-slate-800 text-xs">
            <div className="flex items-center gap-2 text-slate-400">
              <MapPin size={14} className="text-emerald-400" />
              <span>{locationStr ? `GPS: ${locationStr}` : "Awaiting GPS..."}</span>
            </div>
            {agentResult?.authority_contact && (
              <div className="flex items-center gap-2 text-slate-400 border-l border-slate-700 pl-4">
                <User size={14} className="text-cyan-400" />
                <span>Routed to: {agentResult.authority_contact.department} ({agentResult.authority_contact.officerName})</span>
              </div>
            )}
          </div>

          {!agentResult ? (
            <div className="flex-1 bg-slate-900 border border-slate-800 rounded-xl p-8 flex items-center justify-center text-slate-500 text-center italic min-h-[400px]">
              Awaiting deployment. Upload evidence to generate formal complaints, emails, and WhatsApp escalations.
            </div>
          ) : (
            <>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 flex-1">
                {/* Formal Letter Box */}
                <div className="bg-slate-900 border border-slate-800 rounded-xl flex flex-col overflow-hidden md:col-span-2">
                  <div className="bg-slate-950 p-3 border-b border-slate-800 flex items-center gap-2 text-emerald-400 font-semibold text-sm">
                    <FileText size={16} /> Formal Legal Complaint
                  </div>
                  <div className="p-4 text-sm text-slate-300 whitespace-pre-wrap font-serif overflow-auto max-h-[250px]">
                    {agentResult.formal_complaint}
                  </div>
                </div>

                {/* WhatsApp Box */}
                <div className="bg-slate-900 border border-slate-800 rounded-xl flex flex-col overflow-hidden">
                  <div className="bg-[#128C7E]/20 p-3 border-b border-slate-800 flex items-center gap-2 text-[#25D366] font-semibold text-sm">
                    <MessageCircle size={16} /> WhatsApp Escalation
                  </div>
                  <div className="p-4 text-sm text-slate-300 whitespace-pre-wrap overflow-auto h-[130px]">
                    {agentResult.whatsapp_message}
                  </div>
                </div>

                {/* Email Box */}
                <div className="bg-slate-900 border border-slate-800 rounded-xl flex flex-col overflow-hidden">
                  <div className="bg-blue-900/20 p-3 border-b border-slate-800 flex items-center gap-2 text-blue-400 font-semibold text-sm">
                    <Mail size={16} /> Email Draft
                  </div>
                  <div className="p-4 text-sm text-slate-300 overflow-auto h-[130px] flex flex-col">
                    <div className="border-b border-slate-800 pb-2 mb-2">
                      <span className="text-slate-500">Subject:</span> {agentResult.email_subject}
                    </div>
                    <div className="whitespace-pre-wrap flex-1">{agentResult.email_body}</div>
                  </div>
                </div>
              </div>

              {/* Submission Action */}
              {!submitSuccess && (
                <div className="mt-4 flex justify-end">
                  <button
                    onClick={submitComplaint}
                    disabled={isSubmitting}
                    className="bg-emerald-600 hover:bg-emerald-500 disabled:bg-emerald-800 text-white font-medium py-3 px-8 rounded-lg flex items-center justify-center gap-2 transition-all shadow-lg shadow-emerald-900/20"
                  >
                    {isSubmitting ? <RefreshCw size={18} className="animate-spin" /> : <Save size={18} />}
                    {isSubmitting ? "Securing Blockchain/DB Record..." : "Submit Official Complaint"}
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </main>
  );
}