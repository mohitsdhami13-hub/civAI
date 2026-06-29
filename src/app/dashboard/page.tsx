"use client";

import { useEffect, useState } from "react";
import { collection, query, where, onSnapshot, doc, setDoc, deleteDoc } from "firebase/firestore";
import { db } from "../../lib/firebase";
import { 
  Car, Droplet, Lightbulb, AlertTriangle, Trophy, Loader2, 
  Phone, Mail, Send, CheckCircle, FileText, ChevronDown, ChevronUp, Trash2
} from "lucide-react";
import Link from "next/link";

const triggerHaptic = (pattern: number | number[] = 50) => {
  if (typeof window !== "undefined" && navigator.vibrate) {
    navigator.vibrate(pattern);
  }
};

export default function DashboardPage() {
  const [complaints, setComplaints] = useState<any[]>([]);
  const [pendingReports, setPendingReports] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedDraftId, setExpandedDraftId] = useState<string | null>(null);
  const [isSubmittingId, setIsSubmittingId] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const currentUserId = "user_solan_resident_01";

  const triggerToast = (msg: string) => {
    triggerHaptic([30, 50, 30]);
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3000);
  };

  // Real-time Listeners for database updates
  useEffect(() => {
    const qComplaints = query(collection(db, "complaints"), where("userId", "==", currentUserId));
    const qPending = query(collection(db, "pending_reports"), where("userId", "==", currentUserId));

    const getTimestamp = (item: any) => {
      if (!item.createdAt) return 0;
      if (item.createdAt.seconds) return item.createdAt.seconds * 1000;
      return new Date(item.createdAt).getTime();
    };

    // Listen to permanently filed complaints
    const unsubscribeComplaints = onSnapshot(qComplaints, (snapshot) => {
      const records = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      records.sort((a, b) => getTimestamp(b) - getTimestamp(a));
      setComplaints(records);
      setLoading(false);
    }, (err) => console.error("Firestore Complaints Error:", err));

    // Listen to background AI processing queue
    const unsubscribePending = onSnapshot(qPending, (snapshot) => {
      const records = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      records.sort((a, b) => getTimestamp(b) - getTimestamp(a));
      setPendingReports(records);
    }, (err) => console.error("Firestore Queue Error:", err));

    return () => {
      unsubscribeComplaints();
      unsubscribePending();
    };
  }, []);

  // Finalizes the draft document and moves it to public complaints list
  const finalizeDraftReport = async (draft: any) => {
    triggerHaptic(30);
    setIsSubmittingId(draft.id);

    const targetComplaintId = draft.agentResult?.complaint_id || `CIV-${Math.floor(100000 + Math.random() * 900000)}`;
    
    const payload = {
      complaintId: targetComplaintId,
      createdAt: new Date().toISOString(), 
      status: "filed",
      userId: currentUserId,
      location: { 
        lat: draft.location?.lat || 30.9045, 
        lng: draft.location?.lng || 77.0967, 
        address: draft.agentResult?.resolved_location_name || "Solan District", 
        district: "Solan" 
      },
      analysis: draft.visionData || { category: "Civic Issue", severity: 3 },
      formalComplaint: draft.agentResult?.formal_complaint || "Automated civic assessment logged.",
      mediaUrl: draft.mediaUrl || ""
    };

    try {
      // 1. Commit finalized asset to main collection
      const complaintsRef = doc(collection(db, "complaints"));
      await setDoc(complaintsRef, payload);

      // 2. Erase tracking element from processing queue
      await deleteDoc(doc(db, "pending_reports", draft.id));
      triggerToast("Report Successfully Filed!");
    } catch (err) {
      console.error("Failed to commit final report:", err);
      triggerToast("Submission Error");
    } finally {
      setIsSubmittingId(null);
    }
  };

  const deleteDraft = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    triggerHaptic(60);
    try {
      await deleteDoc(doc(db, "pending_reports", id));
      triggerToast("Draft Discarded");
    } catch (err) {
      console.error("Discard failed:", err);
    }
  };

  const getCategoryConfig = (type = "") => {
    const t = type.toLowerCase();
    if (t.includes("water") || t.includes("leak") || t.includes("pipe") || t.includes("drain")) {
      return { Icon: Droplet, color: "text-[#EF4444]", bg: "bg-[#FEE2E2] dark:bg-[#7F1D1D]/40" };
    }
    if (t.includes("light") || t.includes("electric") || t.includes("wire")) {
      return { Icon: Lightbulb, color: "text-[#3B82F6]", bg: "bg-[#DBEAFE] dark:bg-[#1E3A8A]/50" };
    }
    if (t.includes("road") || t.includes("pothole") || t.includes("street")) {
      return { Icon: Car, color: "text-[#F59E0B]", bg: "bg-[#FEF3C7] dark:bg-[#78350F]/50" };
    }
    return { Icon: AlertTriangle, color: "text-[#516B8B] dark:text-[#E5E7EB]", bg: "bg-[#E2E8F0] dark:bg-[#27272A]" };
  };

  const formatDate = (dateObj: any) => {
    if (!dateObj) return "Just now";
    const date = dateObj.seconds ? new Date(dateObj.seconds * 1000) : new Date(dateObj);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  const resolvedCount = complaints.filter(c => c.status === "resolved").length;

  return (
    <main className="px-5 py-4 w-full max-w-md mx-auto flex flex-col min-h-[calc(100vh-76px)] pb-24 bg-[#FCFAF5] dark:bg-[#09090B]">
      
      {toastMessage && (
        <div className="fixed top-12 left-1/2 -translate-x-1/2 z-50 bg-[#516B8B] dark:bg-[#27272A] text-white font-bold px-5 py-3 rounded-2xl shadow-xl text-[14px] animate-in fade-in slide-in-from-top-4 duration-300 flex items-center gap-2">
          <CheckCircle size={16} /> {toastMessage}
        </div>
      )}

      {/* MAIN TRACKING HEADER */}
      <div className="flex items-center justify-between mt-2 mb-6">
        <h1 className="text-[26px] font-black text-[#1E293B] dark:text-[#E5E7EB] leading-tight" style={{fontFamily: 'var(--font-jakarta)'}}>
          My Reports
        </h1>
        {pendingReports.length > 0 && (
          <div className="bg-[#FEF3C7] dark:bg-[#78350F]/50 text-[#D97706] dark:text-[#FBBF24] px-3 py-1 rounded-full text-[12px] font-bold">
            {pendingReports.length} in queue
          </div>
        )}
      </div>

      {loading ? (
        <div className="flex-1 flex flex-col justify-center items-center py-20 gap-3">
          <Loader2 size={32} className="text-[#516B8B] dark:text-[#E5E7EB] animate-spin" />
          <p className="text-[#6B7280] dark:text-[#A1A1AA] font-bold text-sm">Syncing records...</p>
        </div>
      ) : (
        <div className="flex flex-col gap-6">

          {/* SECTION 1: ACTIVE ANALYSIS QUEUE */}
          {pendingReports.length > 0 && (
            <div className="flex flex-col gap-3">
              <h2 className="text-[13px] font-bold text-[#6B7280] dark:text-[#A1A1AA] uppercase tracking-wider px-1">
                Active Analysis & Queue
              </h2>
              
              {pendingReports.map((draft) => {
                const isProcessing = draft.status === "processing";
                const isReady = draft.status === "ready";
                const isFailed = draft.status === "failed";
                const isExpanded = expandedDraftId === draft.id;

                const catConfig = isReady 
                  ? getCategoryConfig(draft.visionData?.sub_type || draft.visionData?.issue_category)
                  : { Icon: Loader2, color: "text-[#F59E0B]", bg: "bg-[#FFF3D6] dark:bg-[#78350F]/30" };
                
                const Icon = catConfig.Icon;

                return (
                  <div 
                    key={draft.id} 
                    onClick={() => isReady && setExpandedDraftId(isExpanded ? null : draft.id)}
                    className={`bg-white dark:bg-[#18181B] border border-[#E2E8F0] dark:border-transparent rounded-[24px] p-4 flex flex-col shadow-sm transition-all ${isReady ? 'cursor-pointer border-l-4 border-l-[#10B981]' : ''}`}
                  >
                    <div className="flex items-start gap-4">
                      <div className={`w-14 h-14 rounded-[16px] ${catConfig.bg} flex items-center justify-center shrink-0`}>
                        <Icon size={24} className={`${catConfig.color} ${isProcessing ? 'animate-spin' : ''}`} strokeWidth={2.5} />
                      </div>
                      
                      <div className="flex-1 pt-1">
                        <div className="flex justify-between items-start mb-1">
                          <h3 className="font-bold text-[16px] text-[#1E293B] dark:text-[#E5E7EB] capitalize leading-tight pr-2 line-clamp-1">
                            {isReady ? (draft.visionData?.sub_type || draft.visionData?.issue_category) : isFailed ? "Analysis Failed" : "AI Processing Anomaly..."}
                          </h3>
                          <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider shrink-0 ${
                            isReady ? 'bg-[#D1FAE5] text-[#10B981]' : isFailed ? 'bg-[#FEE2E2] text-[#EF4444]' : 'bg-[#FEF3C7] text-[#D97706]'
                          }`}>
                            {draft.status}
                          </span>
                        </div>
                        
                        <p className="text-[12px] font-semibold text-[#6B7280] dark:text-[#A1A1AA]">
                          {isReady ? draft.agentResult?.resolved_location_name?.split(',')[0] : "Extracting Coordinates..."} • {formatDate(draft.createdAt)}
                        </p>

                        {/* Animated Queue Line Progress */}
                        <div className="w-full h-1 bg-[#F3F4F6] dark:bg-[#09090B] rounded-full mt-3 overflow-hidden">
                          <div 
                            className={`h-full rounded-full transition-all duration-500 ${isReady ? 'bg-[#10B981] w-full' : isFailed ? 'bg-[#EF4444] w-full' : 'bg-[#F59E0B] w-[35%] animate-pulse'}`} 
                          />
                        </div>

                        {isReady && (
                          <div className="text-[11px] text-[#516B8B] dark:text-[#A1A1AA] font-bold flex items-center gap-1 mt-2.5">
                            {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />} Click card to review & deploy report
                          </div>
                        )}
                      </div>

                      {isFailed && (
                        <button onClick={(e) => deleteDraft(draft.id, e)} className="text-[#EF4444] p-2 hover:bg-[#FEE2E2] dark:hover:bg-[#7F1D1D]/40 rounded-xl transition-colors">
                          <Trash2 size={18} />
                        </button>
                      )}
                    </div>

                    {/* EXPANDED ASSIGNED JURISDICTION DATA DRAWER */}
                    {isReady && isExpanded && (
                      <div className="mt-4 pt-4 border-t border-[#F3F4F6] dark:border-[#27272A] flex flex-col gap-4 animate-in fade-in slide-in-from-top-2 duration-300" onClick={(e) => e.stopPropagation()}>
                        
                        {/* 1. Contact Info Block */}
                        <div>
                          <span className="text-[11px] font-bold text-[#6B7280] dark:text-[#A1A1AA] uppercase tracking-wider">Assigned Department</span>
                          <h4 className="text-[15px] font-black text-[#1E293B] dark:text-[#E5E7EB] mt-0.5">
                            {draft.agentResult?.authority_contact?.department || draft.visionData?.department}
                          </h4>
                        </div>

                        {/* 2. Direct Channels */}
                        <div className="grid grid-cols-2 gap-2">
                          <a href={`tel:${draft.agentResult?.authority_contact?.phone}`} className="flex items-center justify-center gap-2 bg-[#F8F9FC] dark:bg-[#09090B] border border-[#E2E8F0] dark:border-[#27272A] text-[#1E293B] dark:text-[#E5E7EB] rounded-xl py-2.5 text-xs font-bold active:scale-95 transition-transform">
                            <Phone size={14} className="text-[#516B8B]" /> Call Office
                          </a>
                          <a href={`mailto:${draft.agentResult?.authority_contact?.email}`} className="flex items-center justify-center gap-2 bg-[#F8F9FC] dark:bg-[#09090B] border border-[#E2E8F0] dark:border-[#27272A] text-[#1E293B] dark:text-[#E5E7EB] rounded-xl py-2.5 text-xs font-bold active:scale-95 transition-transform">
                            <Mail size={14} className="text-[#516B8B]" /> Email Logs
                          </a>
                        </div>

                        {/* 3. Formal System Letter */}
                        <div className="flex flex-col gap-1.5">
                          <span className="text-[11px] font-bold text-[#6B7280] dark:text-[#A1A1AA] uppercase tracking-wider flex items-center gap-1">
                            <FileText size={12} /> Generated Formal Complaint
                          </span>
                          <div className="bg-[#FCFAF5] dark:bg-[#09090B] p-3 rounded-xl text-[12px] text-[#6B7280] dark:text-[#A1A1AA] font-serif leading-relaxed max-h-[120px] overflow-y-auto border border-[#E2E8F0] dark:border-[#27272A] whitespace-pre-wrap">
                            {draft.agentResult?.formal_complaint}
                          </div>
                        </div>

                        {/* 4. Submission Dispatches */}
                        <div className="flex flex-col gap-2 pt-1">
                          <a 
                            href={`https://wa.me/${(draft.agentResult?.authority_contact?.whatsappNumber || "").replace(/\D/g, "")}?text=${encodeURIComponent(draft.agentResult?.whatsapp_message || "")}`} 
                            target="_blank" 
                            rel="noopener noreferrer" 
                            className="w-full bg-[#10B981] text-white font-bold text-[14px] py-3 rounded-xl flex items-center justify-center gap-2 active:scale-[0.98] transition-transform shadow-sm"
                          >
                            <Send size={14} /> Send via WhatsApp Channel
                          </a>

                          <button 
                            onClick={() => finalizeDraftReport(draft)}
                            disabled={isSubmittingId === draft.id}
                            className="w-full bg-[#516B8B] dark:bg-[#27272A] disabled:opacity-50 text-white font-bold text-[14px] py-3 rounded-xl flex items-center justify-center gap-2 active:scale-[0.98] transition-all"
                          >
                            {isSubmittingId === draft.id ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle size={16} />}
                            Finalize & File Official Report
                          </button>
                        </div>

                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* SECTION 2: PERMANENTLY FILED COMPLAINTS */}
          <div className="flex flex-col gap-3">
            <h2 className="text-[13px] font-bold text-[#6B7280] dark:text-[#A1A1AA] uppercase tracking-wider px-1">
              Filed Infrastructure Reports
            </h2>
            
            {complaints.length === 0 ? (
              <div className="flex flex-col items-center justify-center text-center gap-4 py-8 px-6 bg-white dark:bg-[#18181B] border border-[#E2E8F0] dark:border-transparent rounded-[24px] shadow-sm">
                <AlertTriangle size={28} className="text-[#516B8B] dark:text-[#E5E7EB]" />
                <p className="text-[13px] text-[#6B7280] dark:text-[#A1A1AA]">No active logs tracked in database.</p>
              </div>
            ) : (
              complaints.map((complaint) => {
                const s = (complaint.status || "filed").toLowerCase();
                
                const statusConfig = s === "resolved" 
                  ? { label: "Resolved", color: "text-[#10B981]", bg: "bg-[#D1FAE5] dark:bg-[#064E3B]", width: "100%", bar: "bg-[#10B981]" }
                  : s === "in-progress" || s === "escalated"
                    ? { label: "In progress", color: "text-[#3B82F6]", bg: "bg-[#DBEAFE] dark:bg-[#1E3A8A]", width: "65%", bar: "bg-[#3B82F6]" }
                    : { label: "Pending Review", color: "text-[#EF4444]", bg: "bg-[#FEE2E2] dark:bg-[#7F1D1D]/40", width: "25%", bar: "bg-[#EF4444]" };

                const catConfig = getCategoryConfig(complaint.analysis?.subType || complaint.analysis?.category);
                const Icon = catConfig.Icon;
                const locationShort = complaint.location?.address?.split(',')[0] || "Solan District";

                return (
                  <Link href={`/track/${complaint.complaintId || complaint.id}`} key={complaint.id}>
                    <div className="bg-white dark:bg-[#18181B] border border-[#E2E8F0] dark:border-transparent rounded-[24px] p-4 flex items-start gap-4 shadow-sm active:scale-[0.98] transition-all">
                      <div className={`w-14 h-14 rounded-[16px] ${catConfig.bg} flex items-center justify-center shrink-0`}>
                        <Icon size={24} className={catConfig.color} strokeWidth={2.5} />
                      </div>
                      
                      <div className="flex-1 pt-1">
                        <div className="flex justify-between items-start mb-1">
                          <h3 className="font-bold text-[16px] text-[#1E293B] dark:text-[#E5E7EB] capitalize leading-tight pr-2 line-clamp-1">
                            {complaint.analysis?.subType || complaint.analysis?.category || "Civic Issue"}
                          </h3>
                          <span className={`${statusConfig.bg} ${statusConfig.color} px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider shrink-0`}>
                            {statusConfig.label}
                          </span>
                        </div>
                        
                        <p className="text-[12px] font-semibold text-[#6B7280] dark:text-[#A1A1AA]">
                          {locationShort} • {formatDate(complaint.createdAt)}
                        </p>

                        <div className="w-full h-1 bg-[#F3F4F6] dark:bg-[#09090B] rounded-full mt-3 overflow-hidden">
                          <div className={`h-full ${statusConfig.bar} rounded-full`} style={{ width: statusConfig.width }} />
                        </div>
                      </div>
                    </div>
                  </Link>
                );
              })
            )}
          </div>

          {/* IMPACT METRIC SCORE */}
          <div className="bg-[#F8F9FC] dark:bg-[#18181B] border border-[#E2E8F0] dark:border-transparent rounded-[24px] p-5 mt-2 flex items-center gap-4 shadow-sm">
            <div className="w-12 h-12 bg-white dark:bg-[#09090B] rounded-full flex items-center justify-center shrink-0 shadow-sm">
              <Trophy size={24} className="text-[#516B8B] dark:text-[#E5E7EB]" />
            </div>
            <div>
              <h4 className="font-bold text-[16px] text-[#1E293B] dark:text-[#E5E7EB]" style={{fontFamily: 'var(--font-jakarta)'}}>Your impact this month</h4>
              <p className="text-[12px] font-semibold text-[#516B8B] dark:text-[#A1A1AA] mt-0.5">
                {complaints.length} filed • {resolvedCount} resolved • 45 neighborhood verifications
              </p>
            </div>
          </div>

        </div>
      )}
    </main>
  );
}