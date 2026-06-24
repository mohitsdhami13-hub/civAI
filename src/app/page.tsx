"use client";

import { useState, useRef } from "react";
import { Camera, Upload, RefreshCw, AlertTriangle, CheckCircle, FileText, MessageCircle, Mail, Save, Check, Copy, ExternalLink, ArrowRight, ShieldCheck } from "lucide-react";
import { analyzeImageAction, generateComplaintAgentAction } from "./actions";
import { db } from "../lib/firebase";
import { collection, addDoc, serverTimestamp } from "firebase/firestore";
import { useRouter } from "next/navigation";

export default function Home() {
  const router = useRouter();

  const [image, setImage] = useState<string | null>(null);
  const [mimeType, setMimeType] = useState<string>("");
  const [loadingStep, setLoadingStep] = useState<string>(""); 
  const [visionResult, setVisionResult] = useState<any | null>(null);
  const [agentResult, setAgentResult] = useState<any | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [locationStr, setLocationStr] = useState<string>("");
  
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [isSubmitted, setIsSubmitted] = useState<boolean>(false); 
  const [copiedPanel, setCopiedPanel] = useState<string | null>(null);

  // DEMO STABILITY CONTROL VALVE
  const [demoMode, setDemoMode] = useState<boolean>(true);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleCopy = (text: string, panelId: string) => {
    navigator.clipboard.writeText(text);
    setCopiedPanel(panelId);
    setTimeout(() => setCopiedPanel(null), 2000);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setMimeType(file.type);
    setError(null);
    setVisionResult(null);
    setAgentResult(null);
    setLocationStr("");
    setIsSubmitted(false);

    const reader = new FileReader();
    reader.onloadend = () => {
      setImage(reader.result as string);
    };
    reader.readAsDataURL(file);
  };

  // RESTORED: This is the missing function that clicks the hidden file input!
  const triggerFileSelect = () => {
    fileInputRef.current?.click();
  };

  const runAutonomousPipeline = async () => {
    if (!image) return;
    setError(null);
    setVisionResult(null);
    setAgentResult(null);
    setIsSubmitted(false);

    try {
      const base64Data = image.split(",")[1];

      setLoadingStep("Vision Agent: Verifying evidence validity...");
      const visionRes = await analyzeImageAction(base64Data, mimeType, demoMode);
      if (!visionRes.success) throw new Error((visionRes as any).error || "Vision analysis failed.");
      
      if (visionRes.data.is_genuine_civic_issue === false) {
        setError(visionRes.data.rejection_reason || "Invalid Submission: Image doesn't document public infrastructure hazards.");
        setLoadingStep("");
        return;
      }

      setVisionResult(visionRes.data);

      setLoadingStep("Location Agent: Synchronizing orbital GPS grid lock...");
      let lat = 30.9045; 
      let lng = 77.0967;
      
      try {
        const position: any = await new Promise((resolve, reject) => {
          if (!navigator.geolocation) reject("No hardware geolocation access");
          navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 4000 });
        });
        lat = position.coords.latitude;
        lng = position.coords.longitude;
        setLocationStr(`${lat.toFixed(4)}, ${lng.toFixed(4)}`);
      } catch (e) {
        setLocationStr(`${lat.toFixed(4)}, ${lng.toFixed(4)} (Simulated)`);
      }

      setLoadingStep("Drafting Agent: Compiling legal frameworks and text vectors...");
      const agentRes = await generateComplaintAgentAction(visionRes.data, lat, lng, demoMode);
      if (!agentRes.success) throw new Error((agentRes as any).error || "Drafting agent failed.");
      setAgentResult(agentRes.data);

      setLoadingStep("");
    } catch (err: any) {
      setError(err.message || "Autonomous pipeline tracking interrupted.");
      setLoadingStep("");
    }
  };

  const submitComplaint = async () => {
    if (!visionResult || !agentResult) return;
    setIsSubmitting(true);
    setError(null);

    try {
      setLoadingStep("Committing records to remote Firestore instance...");
      
      const complaintData = {
        complaintId: agentResult.complaint_id, 
        createdAt: serverTimestamp(),
        status: "filed",
        imageUrl: "Bypassed for hackathon pipeline testing",
        location: {
          lat: Number(locationStr.split(",")[0]) || 30.9045,
          lng: Number(locationStr.split(",")[1]) || 77.0967,
          address: agentResult.resolved_location_name || "Municipal Center Area", 
          ward: "Ward 4",
          district: "Solan"
        },
        analysis: {
          category: visionResult.issue_category || "infrastructure",
          subType: visionResult.sub_type || "unspecified failure",
          severity: visionResult.severity || 3,
          department: visionResult.department || "Public Safety",
          confidence: visionResult.confidence || 0.95
        },
        formalComplaint: agentResult.formal_complaint,
        whatsappMessage: agentResult.whatsapp_message,
        emailBody: agentResult.email_body,
        authorityContact: agentResult.authority_contact,
      };

      await addDoc(collection(db, "complaints"), complaintData);
      setIsSubmitted(true);
      setLoadingStep("");
    } catch (err: any) {
      setError(err.message || "Failed to commit record.");
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
    setIsSubmitted(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  return (
    <main className="max-w-6xl mx-auto p-4 md:p-8">
      <header className="mb-8 border-b border-slate-800 pb-6 flex flex-col sm:flex-row justify-between items-start sm:items-end gap-4">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight bg-gradient-to-r from-emerald-400 to-cyan-400 bg-clip-text text-transparent">
            CivicAI
          </h1>
          <p className="text-slate-400 text-sm mt-1">
            Autonomous Civic Grievance Agent — Multi-Step Pipeline Validation
          </p>
        </div>

        {/* INTERACTIVE DEMO MODE SYSTEM STABILITY TOGGLE */}
        <div className="flex items-center gap-3 bg-slate-900 border border-slate-800 rounded-xl p-2 px-4 shadow-inner">
          <ShieldCheck className={demoMode ? "text-emerald-400" : "text-slate-500"} size={18} />
          <span className="text-xs font-mono font-bold tracking-wider text-slate-300">DEMO PROTECTION</span>
          <button 
            type="button"
            onClick={() => setDemoMode(!demoMode)}
            className={`w-12 h-6 flex items-center rounded-full p-1 cursor-pointer transition-colors duration-300 ${demoMode ? "bg-emerald-500" : "bg-slate-700"}`}
          >
            <div className={`bg-slate-950 w-4 h-4 rounded-full shadow-md transform transition-transform duration-300 ${demoMode ? "translate-x-6" : "translate-x-0"}`} />
          </button>
        </div>
      </header>

      {isSubmitted ? (
        <div className="flex flex-col items-center justify-center py-16 animate-in fade-in zoom-in duration-500">
          <div className="w-24 h-24 bg-emerald-900/30 rounded-full flex items-center justify-center mb-6 border-4 border-emerald-500 shadow-lg shadow-emerald-900/50">
            <CheckCircle size={48} className="text-emerald-400" />
          </div>
          
          <h2 className="text-4xl font-black text-slate-100 mb-2 text-center">Complaint Filed Successfully</h2>
          <p className="text-slate-400 mb-10 text-center max-w-lg">
            Your grievance has been securely logged in the central database and routed to the correct municipal authority.
          </p>

          <div className="bg-slate-900 border border-slate-800 p-6 rounded-xl flex flex-col items-center mb-10 shadow-xl w-full max-w-md">
            <p className="text-sm text-emerald-500 font-bold uppercase tracking-wider mb-2">Official Tracking ID</p>
            <div className="flex items-center gap-4">
              <span className="text-4xl font-mono font-black text-emerald-400 tracking-tight">{agentResult.complaint_id}</span>
              <button onClick={() => handleCopy(agentResult.complaint_id, 'id')} className="p-2 bg-slate-800 hover:bg-slate-700 rounded-lg text-slate-300 transition shadow-sm">
                {copiedPanel === 'id' ? <Check className="text-emerald-400" size={20} /> : <Copy size={20} />}
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 w-full max-w-3xl mb-12">
            <a 
              href={`https://wa.me/${(agentResult.authority_contact?.whatsappNumber || "910000000000").replace(/\D/g, '')}?text=${encodeURIComponent(agentResult.whatsapp_message || "")}`} 
              target="_blank" rel="noopener noreferrer" 
              className="bg-[#25D366]/10 border border-[#25D366]/30 hover:bg-[#25D366]/20 text-[#25D366] py-5 px-6 rounded-xl flex flex-col items-center justify-center gap-3 transition-all hover:-translate-y-1"
            >
              <MessageCircle size={28} />
              <span className="font-bold">Open WhatsApp</span>
            </a>

            <a 
              href={`mailto:${agentResult.authority_contact?.email}?subject=${encodeURIComponent(agentResult.email_subject || "")}&body=${encodeURIComponent(agentResult.email_body || "")}`}
              className="bg-blue-500/10 border border-blue-500/30 hover:bg-blue-500/20 text-blue-400 py-5 px-6 rounded-xl flex flex-col items-center justify-center gap-3 transition-all hover:-translate-y-1"
            >
              <Mail size={28} />
              <span className="font-bold">Send Email</span>
            </a>

            <button 
              onClick={() => router.push(`/track/${agentResult.complaint_id}`)}
              className="bg-emerald-500/10 border border-emerald-500/30 hover:bg-emerald-500/20 text-emerald-400 py-5 px-6 rounded-xl flex flex-col items-center justify-center gap-3 transition-all hover:-translate-y-1"
            >
              <ExternalLink size={28} />
              <span className="font-bold">Track Complaint</span>
            </button>
          </div>

          <button onClick={clearAll} className="text-slate-400 hover:text-white font-medium flex items-center gap-2 hover:underline underline-offset-4 transition-colors">
            Report Another Issue <ArrowRight size={16} />
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          
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
              <input type="file" ref={fileInputRef} onChange={handleFileChange} accept="image/*" className="hidden" />
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
          </div>

          <div className="lg:col-span-8 flex flex-col h-full space-y-4">
            {!agentResult ? (
              <div className="flex-1 bg-slate-900 border border-slate-800 rounded-xl p-8 flex items-center justify-center text-slate-500 text-center italic min-h-[400px]">
                Awaiting deployment. Upload evidence to generate formal complaints, emails, and WhatsApp escalations.
              </div>
            ) : (
              <>
                <div className="bg-emerald-950/40 border border-emerald-900/50 p-5 rounded-xl shadow-sm flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                  <div>
                    <p className="text-xs text-emerald-500 font-bold uppercase tracking-wider mb-1">Official Complaint ID</p>
                    <h2 className="text-3xl font-black text-slate-200 tracking-tight">{agentResult.complaint_id}</h2>
                  </div>
                  <div className="sm:text-right border-t sm:border-t-0 sm:border-l border-emerald-900/50 pt-3 sm:pt-0 sm:pl-5">
                    <p className="text-xs text-emerald-500 font-bold uppercase tracking-wider mb-1">Verified Location</p>
                    <p className="text-lg font-medium text-slate-300">{agentResult.resolved_location_name}</p>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 flex-1">
                  <div className="bg-slate-900 border border-slate-800 rounded-xl flex flex-col overflow-hidden md:col-span-2">
                    <div className="bg-slate-950 p-3 border-b border-slate-800 flex items-center justify-between text-emerald-400 font-semibold text-sm">
                      <div className="flex items-center gap-2"><FileText size={16} /> Formal Legal Complaint</div>
                      <button onClick={() => handleCopy(agentResult.formal_complaint, 'formal')} className="text-slate-400 hover:text-white transition flex items-center gap-1">
                        {copiedPanel === 'formal' ? <><Check size={14} className="text-emerald-400" /> <span className="text-emerald-400 text-xs">Copied!</span></> : <><Copy size={14} /> <span className="text-xs">Copy</span></>}
                      </button>
                    </div>
                    <div className="p-4 text-sm text-slate-300 whitespace-pre-wrap font-serif overflow-auto max-h-[250px]">
                      {agentResult.formal_complaint}
                    </div>
                  </div>

                  <div className="bg-slate-900 border border-slate-800 rounded-xl flex flex-col overflow-hidden">
                    <div className="bg-[#128C7E]/20 p-3 border-b border-slate-800 flex items-center justify-between text-[#25D366] font-semibold text-sm">
                      <div className="flex items-center gap-2"><MessageCircle size={16} /> WhatsApp Escalation</div>
                      <button onClick={() => handleCopy(agentResult.whatsapp_message, 'whatsapp')} className="text-slate-400 hover:text-white transition flex items-center gap-1">
                        {copiedPanel === 'whatsapp' ? <><Check size={14} className="text-[#25D366]" /> <span className="text-[#25D366] text-xs">Copied!</span></> : <><Copy size={14} /> <span className="text-xs">Copy</span></>}
                      </button>
                    </div>
                    <div className="p-4 text-sm text-slate-300 whitespace-pre-wrap overflow-auto h-[130px]">
                      {agentResult.whatsapp_message}
                    </div>
                  </div>

                  <div className="bg-slate-900 border border-slate-800 rounded-xl flex flex-col overflow-hidden">
                    <div className="bg-blue-900/20 p-3 border-b border-slate-800 flex items-center justify-between text-blue-400 font-semibold text-sm">
                      <div className="flex items-center gap-2"><Mail size={16} /> Email Draft</div>
                      <button onClick={() => handleCopy(`Subject: ${agentResult.email_subject}\n\n${agentResult.email_body}`, 'email')} className="text-slate-400 hover:text-white transition flex items-center gap-1">
                        {copiedPanel === 'email' ? <><Check size={14} className="text-blue-400" /> <span className="text-blue-400 text-xs">Copied!</span></> : <><Copy size={14} /> <span className="text-xs">Copy</span></>}
                      </button>
                    </div>
                    <div className="p-4 text-sm text-slate-300 overflow-auto h-[130px] flex flex-col">
                      <div className="border-b border-slate-800 pb-2 mb-2">
                        <span className="text-slate-500">Subject:</span> {agentResult.email_subject}
                      </div>
                      <div className="whitespace-pre-wrap flex-1">{agentResult.email_body}</div>
                    </div>
                  </div>
                </div>

                <div className="mt-4 flex justify-end">
                  <button
                    onClick={submitComplaint}
                    disabled={isSubmitting}
                    className="bg-emerald-600 hover:bg-emerald-500 disabled:bg-emerald-800 text-white font-medium py-3 px-8 rounded-lg flex items-center justify-center gap-2 transition-all shadow-lg shadow-emerald-900/20 hover:scale-[1.02]"
                  >
                    {isSubmitting ? <RefreshCw size={18} className="animate-spin" /> : <Save size={18} />}
                    {isSubmitting ? "Securing Record..." : "Submit Official Complaint"}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </main>
  );
}