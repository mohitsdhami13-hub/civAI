"use client";

import { useEffect, useState } from "react";
import { collection, query, where, onSnapshot, doc, setDoc, deleteDoc } from "firebase/firestore";
import { db } from "../../lib/firebase";
import { 
  Car, Droplet, Lightbulb, AlertTriangle, Trophy, Loader2, 
  Phone, Mail, Send, CheckCircle, FileText, ChevronDown, ChevronUp, Trash2,
  Inbox, History, Share2, ExternalLink, Link as LinkIcon, ShieldAlert, Copy, Check, Video
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
  
  const [activeTab, setActiveTab] = useState<'queue' | 'filed'>('queue');
  
  const [expandedDraftId, setExpandedDraftId] = useState<string | null>(null);
  const [isSubmittingId, setIsSubmittingId] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  // Tracks which draft's "Copy" button should show the brief checkmark
  // confirmation, so each card's button state is independent.
  const [copiedDraftId, setCopiedDraftId] = useState<string | null>(null);

  const currentUserId = "user_solan_resident_01";

  const triggerToast = (msg: string) => {
    triggerHaptic([30, 50, 30]);
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3000);
  };

  useEffect(() => {
    const qComplaints = query(collection(db, "complaints"), where("userId", "==", currentUserId));
    const qPending = query(collection(db, "pending_reports"), where("userId", "==", currentUserId));

    const getTimestamp = (item: any) => {
      if (!item.createdAt) return 0;
      if (item.createdAt.seconds) return item.createdAt.seconds * 1000;
      return new Date(item.createdAt).getTime();
    };

    const unsubscribeComplaints = onSnapshot(qComplaints, (snapshot) => {
      const records = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      records.sort((a, b) => getTimestamp(b) - getTimestamp(a));
      setComplaints(records);
      setLoading(false);
    }, (err) => {
      console.error("Firestore Complaints Error:", err);
      setLoading(false);
    });

    const unsubscribePending = onSnapshot(qPending, (snapshot) => {
      const records = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      records.sort((a, b) => getTimestamp(b) - getTimestamp(a));
      setPendingReports(records);
      if (records.length === 0 && activeTab === 'queue' && !loading) {
        setActiveTab('filed');
      }
    }, (err) => {
      console.error("Firestore Queue Error:", err);
      setLoading(false);
    });

    return () => {
      unsubscribeComplaints();
      unsubscribePending();
    };
  }, []);

  const finalizeDraftReport = async (draft: any) => {
    triggerHaptic(30);
    setIsSubmittingId(draft.id);

    const targetComplaintId = draft.agentResult?.complaint_id || `CIV-${Math.floor(100000 + Math.random() * 900000)}`;
    
    // FIX (share-by-link / multi-contributor support): previously only
    // mediaUrl (a single file) was carried over to the filed complaint
    // record, even though page.tsx's submit flow now uploads a `media`
    // array. Carrying the full array forward means the public share page
    // (/track/[id]) can show every photo/video a citizen attached, and
    // any future "contribute more evidence" flow has something to append
    // to instead of overwriting a single field.
    const payload = {
      complaintId: targetComplaintId,
      createdAt: new Date().toISOString(), 
      status: "filed",
      userId: currentUserId,
      location: { 
        lat: draft.location?.lat || 30.9045, 
        lng: draft.location?.lng || 77.0967, 
        address: draft.agentResult?.resolved_location_name || draft.cityLabel || "Unknown location", 
        district: draft.agentResult?.resolved_city || "Solan",
        state: draft.agentResult?.resolved_state || "Himachal Pradesh"
      },
      analysis: draft.visionData || { category: "Civic Issue", severity: 3 },
      formalComplaint: draft.agentResult?.formal_complaint || "Automated civic assessment logged.",
      mediaUrl: draft.mediaUrl || "",
      media: draft.media || (draft.mediaUrl ? [{ url: draft.mediaUrl, mimeType: draft.mediaType || "image/jpeg" }] : []),
      description: draft.description || "",
      // Public flag — the /track/[id] page reads this to know it's safe to
      // render without requiring the viewer to be logged in, which is what
      // makes the share-by-link feature actually work for non-app-users.
      isPubliclyShareable: true,
      contributionCount: 0,
    };

    try {
      const complaintsRef = doc(collection(db, "complaints"));
      await setDoc(complaintsRef, payload);
      await deleteDoc(doc(db, "pending_reports", draft.id));
      triggerToast("Report Successfully Filed!");
      setActiveTab('filed');
    } catch (err) {
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

  // --- COPY COMPLAINT TEXT ---
  // FIX: when no verified email exists for a location (most fallback-tier
  // and all national-fallback cases), the user still needs a way to get
  // the formal complaint text into a government portal's text box — those
  // portals (CPGRAMS, state PWD sites, etc.) require pasting into a web
  // form, not an email. This makes the generated text available to copy
  // unconditionally, independent of which contact channels exist.
  const copyComplaintText = async (draft: any, e: React.MouseEvent) => {
    e.stopPropagation();
    triggerHaptic(30);

    const text = draft.agentResult?.formal_complaint || "";
    if (!text) return;

    try {
      await navigator.clipboard.writeText(text);
      setCopiedDraftId(draft.id);
      setTimeout(() => setCopiedDraftId((current) => (current === draft.id ? null : current)), 2000);
    } catch {
      triggerToast("Couldn't copy — try selecting the text manually");
    }
  };


  // FIX: only ever called when authority_contact.hasEmail is true (gated in
  // the JSX below) — this function no longer assumes an email exists.
  const generateMailtoLink = (draft: any) => {
    const email = draft.agentResult?.authority_contact?.email || "";
    const department = draft.agentResult?.authority_contact?.department || "Civic Department";
    const category = draft.visionData?.sub_type || draft.visionData?.issue_category || "Infrastructure Issue";
    const location = draft.agentResult?.resolved_location_name?.split(',')[0] || "your area";

    const subject = draft.agentResult?.email_subject || `Urgent Civic Report: ${category} at ${location}`;
    // FIX (formal + powerful + evidence-linked): body now prefers the AI's
    // dedicated email_body (which was prompted to include location,
    // severity, evidence links, and a firm call to action) over the older
    // generic template, and always appends the media links explicitly
    // since mailto: cannot carry real attachments.
    const mediaLinks = (draft.media || []).map((m: any, i: number) => `${i + 1}. ${m.url}`).join("\n");
    const bodyCore = draft.agentResult?.email_body ||
      `To the ${department},\n\nI am writing to formally report an issue regarding a ${category.toLowerCase()} located at ${location}.\n\nAI Assessment Details:\n${draft.agentResult?.formal_complaint || "Please review the logged civic infrastructure report."}\n\nTracking ID: ${draft.id}\n\nPlease look into this matter at your earliest convenience.\n\nSincerely,\nA Concerned Resident`;
    const body = mediaLinks
      ? `${bodyCore}\n\nEvidence (photo/video) attached via the following link(s):\n${mediaLinks}`
      : bodyCore;

    return `mailto:${email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  };

  // --- SHARE-BY-LINK ---
  // Lets anyone with the link view (and, on the public page, contribute
  // evidence to) a filed complaint without installing the app or having an
  // account — uses the public /track/[id] route, which must read from
  // Firestore with rules that allow unauthenticated reads scoped to
  // isPubliclyShareable: true documents (see note at bottom of file).
  const shareReport = async (complaint: any, e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    triggerHaptic(30);

    const trackId = complaint.complaintId || complaint.id;
    const shareUrl = `${window.location.origin}/track/${trackId}`;
    const category = complaint.analysis?.subType || complaint.analysis?.category || "civic issue";
    const locationShort = complaint.location?.address?.split(',')[0] || "this location";
    const shareText = `I reported a ${category} at ${locationShort} via CivicAI. Help by adding your own evidence or upvoting it here:`;

    if (navigator.share) {
      try {
        await navigator.share({ title: "CivicAI Report", text: shareText, url: shareUrl });
        return;
      } catch {
        // User cancelled the native share sheet — fall through to clipboard
      }
    }

    try {
      await navigator.clipboard.writeText(`${shareText} ${shareUrl}`);
      triggerToast("Link copied — share it anywhere");
    } catch {
      triggerToast("Couldn't copy link");
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

      {/* HEADER */}
      <div className="flex items-center justify-between mt-2 mb-5">
        <h1 className="text-[26px] font-black text-[#1E293B] dark:text-[#E5E7EB] leading-tight" style={{fontFamily: 'var(--font-jakarta)'}}>
          My Reports
        </h1>
      </div>

      {/* SEGMENTED CONTROL TABS */}
      <div className="w-full bg-[#E2E8F0] dark:bg-[#18181B] p-1 rounded-2xl flex items-center mb-6 shadow-inner">
        <button 
          onClick={() => { triggerHaptic(20); setActiveTab('queue'); }}
          className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-[14px] font-bold transition-all ${
            activeTab === 'queue' 
              ? 'bg-white dark:bg-[#27272A] text-[#1E293B] dark:text-white shadow-sm' 
              : 'text-[#6B7280] dark:text-[#A1A1AA] hover:text-[#1E293B] dark:hover:text-[#E5E7EB]'
          }`}
        >
          <Inbox size={16} /> 
          Action Queue 
          {pendingReports.length > 0 && (
            <span className={`ml-1 px-1.5 py-0.5 rounded-md text-[10px] ${activeTab === 'queue' ? 'bg-[#EF4444] text-white' : 'bg-[#CBD5E1] dark:bg-[#3F3F46]'}`}>
              {pendingReports.length}
            </span>
          )}
        </button>
        <button 
          onClick={() => { triggerHaptic(20); setActiveTab('filed'); }}
          className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-[14px] font-bold transition-all ${
            activeTab === 'filed' 
              ? 'bg-white dark:bg-[#27272A] text-[#1E293B] dark:text-white shadow-sm' 
              : 'text-[#6B7280] dark:text-[#A1A1AA] hover:text-[#1E293B] dark:hover:text-[#E5E7EB]'
          }`}
        >
          <History size={16} /> History
        </button>
      </div>

      {loading ? (
        <div className="flex-1 flex flex-col justify-center items-center py-20 gap-3">
          <Loader2 size={32} className="text-[#516B8B] dark:text-[#E5E7EB] animate-spin" />
          <p className="text-[#6B7280] dark:text-[#A1A1AA] font-bold text-sm">Syncing records...</p>
        </div>
      ) : (
        <div className="flex flex-col gap-6 animate-in fade-in duration-300">

          {/* TAB 1: ACTION QUEUE */}
          {activeTab === 'queue' && (
            <div className="flex flex-col gap-3">
              {pendingReports.length === 0 ? (
                <div className="flex flex-col items-center justify-center text-center gap-4 py-12 px-6 bg-white dark:bg-[#18181B] border border-[#E2E8F0] dark:border-transparent rounded-[24px] shadow-sm">
                  <div className="w-16 h-16 bg-[#F8F9FC] dark:bg-[#09090B] rounded-full flex justify-center items-center">
                    <CheckCircle size={28} className="text-[#10B981]" />
                  </div>
                  <div>
                    <h3 className="text-[18px] font-bold text-[#1E293B] dark:text-[#E5E7EB]" style={{fontFamily: 'var(--font-jakarta)'}}>You're all caught up!</h3>
                    <p className="text-[13px] text-[#6B7280] dark:text-[#A1A1AA] mt-1">No pending reports require your action.</p>
                  </div>
                </div>
              ) : (
                pendingReports.map((draft) => {
                  const isProcessing = draft.status === "processing";
                  const isReady = draft.status === "ready";
                  const isFailed = draft.status === "failed";
                  const isExpanded = expandedDraftId === draft.id;

                  const catConfig = isReady 
                    ? getCategoryConfig(draft.visionData?.sub_type || draft.visionData?.issue_category)
                    : { Icon: Loader2, color: "text-[#F59E0B]", bg: "bg-[#FFF3D6] dark:bg-[#78350F]/30" };
                  
                  const Icon = catConfig.Icon;

                  // Channel availability — read directly from what route.ts
                  // resolved, never assumed. A fallback-tier authority may
                  // have hasEmail:false / hasPhone:true (e.g. BMC, BBMP) or
                  // neither (national CPGRAMS fallback, portal-only).
                  const authority = draft.agentResult?.authority_contact;
                  const hasEmail = !!authority?.hasEmail || !!authority?.email;
                  const hasPhone = !!authority?.hasPhone || !!authority?.phone;
                  const hasPortal = !!authority?.portalUrl;
                  const isNationalFallback = authority?.matchTier === "national";
                  const jurisdictionWarning = draft.agentResult?.jurisdiction_warning;

                  // FIX (show the photo on draft cards too): same treatment
                  // as filed history below — only applies once the draft is
                  // "ready" (processing state keeps the spinning loader icon
                  // since that's a meaningful status signal, not just
                  // decorative). Falls back to category icon for video-only
                  // drafts or anything missing a usable image preview.
                  const draftFirstMedia = draft.media?.[0];
                  const draftPreviewUrl = isReady
                    ? (draftFirstMedia && !draftFirstMedia.mimeType?.startsWith("video/") ? draftFirstMedia.url : null) ||
                      (draft.mediaUrl && !draft.mediaType?.startsWith("video/") ? draft.mediaUrl : null)
                    : null;
                  const draftMediaCount = draft.media?.length || (draft.mediaUrl ? 1 : 0);
                  const draftHasVideoOnly = isReady && !draftPreviewUrl && (
                    draftFirstMedia?.mimeType?.startsWith("video/") || draft.mediaType?.startsWith("video/")
                  );

                  return (
                    <div 
                      key={draft.id} 
                      onClick={() => isReady && setExpandedDraftId(isExpanded ? null : draft.id)}
                      className={`bg-white dark:bg-[#18181B] border border-[#E2E8F0] dark:border-transparent rounded-[24px] p-4 flex flex-col shadow-sm transition-all ${isReady ? 'cursor-pointer border-l-4 border-l-[#10B981]' : ''}`}
                    >
                      <div className="flex items-start gap-4">
                        <div className={`relative w-14 h-14 rounded-[16px] ${draftPreviewUrl ? '' : catConfig.bg} flex items-center justify-center shrink-0 overflow-hidden`}>
                          {draftPreviewUrl ? (
                            <img
                              src={draftPreviewUrl}
                              alt="Captured issue"
                              className="w-full h-full object-cover"
                              loading="lazy"
                            />
                          ) : draftHasVideoOnly ? (
                            <div className="w-full h-full bg-[#1E293B] dark:bg-[#27272A] flex items-center justify-center">
                              <Video size={20} className="text-white/80" strokeWidth={2} />
                            </div>
                          ) : (
                            <Icon size={24} className={`${catConfig.color} ${isProcessing ? 'animate-spin' : ''}`} strokeWidth={2.5} />
                          )}
                          {draftPreviewUrl && (
                            <div className={`absolute bottom-0 right-0 w-5 h-5 rounded-tl-lg ${catConfig.bg} flex items-center justify-center`}>
                              <Icon size={11} className={catConfig.color} strokeWidth={2.5} />
                            </div>
                          )}
                          {draftMediaCount > 1 && (
                            <div className="absolute top-0.5 right-0.5 bg-black/60 text-white text-[9px] font-bold px-1 rounded">
                              +{draftMediaCount - 1}
                            </div>
                          )}
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

                          <div className="w-full h-1 bg-[#F3F4F6] dark:bg-[#09090B] rounded-full mt-3 overflow-hidden">
                            <div className={`h-full rounded-full transition-all duration-500 ${isReady ? 'bg-[#10B981] w-full' : isFailed ? 'bg-[#EF4444] w-full' : 'bg-[#F59E0B] w-[35%] animate-pulse'}`} />
                          </div>

                          {isReady && (
                            <div className="text-[11px] text-[#516B8B] dark:text-[#A1A1AA] font-bold flex items-center gap-1 mt-2.5">
                              {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />} Click to review & deploy
                            </div>
                          )}
                        </div>

                        {isFailed && (
                          <button onClick={(e) => deleteDraft(draft.id, e)} className="text-[#EF4444] p-2 hover:bg-[#FEE2E2] dark:hover:bg-[#7F1D1D]/40 rounded-xl transition-colors">
                            <Trash2 size={18} />
                          </button>
                        )}
                      </div>

                      {isReady && isExpanded && (
                        <div className="mt-4 pt-4 border-t border-[#F3F4F6] dark:border-[#27272A] flex flex-col gap-4 animate-in fade-in slide-in-from-top-2 duration-300" onClick={(e) => e.stopPropagation()}>
                          
                          <div>
                            <span className="text-[11px] font-bold text-[#6B7280] dark:text-[#A1A1AA] uppercase tracking-wider">Assigned Department</span>
                            <h4 className="text-[15px] font-black text-[#1E293B] dark:text-[#E5E7EB] mt-0.5">
                              {authority?.department || draft.visionData?.department}
                            </h4>
                            {/* FIX: be honest when this is a national fallback rather
                                than a verified local officer — sets correct
                                expectations instead of implying a named contact. */}
                            {isNationalFallback && (
                              <p className="text-[11px] text-[#9CA3AF] dark:text-[#71717A] mt-1">
                                No verified local contact found for this location yet — routed to India's national grievance system, which forwards to the correct department automatically.
                              </p>
                            )}
                          </div>

                          {/* FIX (cross-checked jurisdiction warning): shown only
                              when the AI flagged this might not actually be a
                              government department's responsibility. */}
                          {jurisdictionWarning && (
                            <div className="flex gap-2 bg-[#FFF7ED] dark:bg-[#2A1F12] border border-[#FDBA74]/50 dark:border-[#92400E]/50 rounded-xl px-3 py-2.5">
                              <ShieldAlert size={15} className="text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                              <p className="text-[11px] leading-snug text-amber-700 dark:text-amber-400">
                                {jurisdictionWarning}
                              </p>
                            </div>
                          )}

                          {/* Channel buttons — only ever render a button for a
                              channel that genuinely exists. No fabricated
                              email/phone ever shown. */}
                          <div className="grid grid-cols-2 gap-2">
                            {hasPhone && (
                              <a href={`tel:${authority.phone}`} className="flex items-center justify-center gap-2 bg-[#F8F9FC] dark:bg-[#09090B] border border-[#E2E8F0] dark:border-[#27272A] text-[#1E293B] dark:text-[#E5E7EB] rounded-xl py-2.5 text-xs font-bold active:scale-95 transition-transform">
                                <Phone size={14} className="text-[#516B8B]" /> {isNationalFallback ? "Call Helpline" : "Call Office"}
                              </a>
                            )}
                            {hasEmail && (
                              <a href={generateMailtoLink(draft)} className="flex items-center justify-center gap-2 bg-[#F8F9FC] dark:bg-[#09090B] border border-[#E2E8F0] dark:border-[#27272A] text-[#1E293B] dark:text-[#E5E7EB] rounded-xl py-2.5 text-xs font-bold active:scale-95 transition-transform">
                                <Mail size={14} className="text-[#516B8B]" /> Auto-fill Email
                              </a>
                            )}
                            {hasPortal && (
                              <a href={authority.portalUrl} target="_blank" rel="noopener noreferrer" className={`flex items-center justify-center gap-2 bg-[#F8F9FC] dark:bg-[#09090B] border border-[#E2E8F0] dark:border-[#27272A] text-[#1E293B] dark:text-[#E5E7EB] rounded-xl py-2.5 text-xs font-bold active:scale-95 transition-transform ${(!hasEmail || !hasPhone) ? '' : 'col-span-2'}`}>
                                <ExternalLink size={14} className="text-[#516B8B]" /> {isNationalFallback ? "File on CPGRAMS" : "Official Portal"}
                              </a>
                            )}
                          </div>

                          <div className="flex flex-col gap-1.5">
                            <div className="flex items-center justify-between">
                              <span className="text-[11px] font-bold text-[#6B7280] dark:text-[#A1A1AA] uppercase tracking-wider flex items-center gap-1">
                                <FileText size={12} /> Generated Formal Complaint
                              </span>
                              {/*
                                FIX (copy button for when email isn't an
                                option): some authorities only expose a
                                phone helpline or a web portal (e.g. BMC,
                                BBMP, CPGRAMS) with no email at all — this
                                button works regardless, so the user can
                                always grab the formal text and paste it
                                straight into whatever portal/form they end
                                up on. Independent per-card copied state so
                                tapping one card's button doesn't show a
                                false confirmation on another.
                              */}
                              <button
                                onClick={(e) => copyComplaintText(draft, e)}
                                className="flex items-center gap-1 text-[11px] font-bold text-[#516B8B] dark:text-[#A1A1AA] px-2 py-1 rounded-lg hover:bg-[#F3F4F6] dark:hover:bg-[#27272A] active:scale-95 transition-all"
                              >
                                {copiedDraftId === draft.id ? (
                                  <>
                                    <Check size={12} className="text-[#10B981]" />
                                    <span className="text-[#10B981]">Copied</span>
                                  </>
                                ) : (
                                  <>
                                    <Copy size={12} />
                                    Copy text
                                  </>
                                )}
                              </button>
                            </div>
                            <div className="bg-[#FCFAF5] dark:bg-[#09090B] p-3 rounded-xl text-[12px] text-[#6B7280] dark:text-[#A1A1AA] font-serif leading-relaxed max-h-[120px] overflow-y-auto border border-[#E2E8F0] dark:border-[#27272A] whitespace-pre-wrap">
                              {draft.agentResult?.formal_complaint}
                            </div>
                          </div>

                          <div className="flex flex-col gap-2 pt-1">
                            {authority?.whatsappNumber && (
                              <a 
                                href={`https://wa.me/${(authority.whatsappNumber || "").replace(/\D/g, "")}?text=${encodeURIComponent(draft.agentResult?.whatsapp_message || "")}`} 
                                target="_blank" 
                                rel="noopener noreferrer" 
                                className="w-full bg-[#10B981] text-white font-bold text-[14px] py-3 rounded-xl flex items-center justify-center gap-2 active:scale-[0.98] transition-transform shadow-sm"
                              >
                                <Send size={14} /> Send via WhatsApp Channel
                              </a>
                            )}

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
                })
              )}
            </div>
          )}

          {/* TAB 2: FILED HISTORY */}
          {activeTab === 'filed' && (
            <div className="flex flex-col gap-3">
              {complaints.length === 0 ? (
                <div className="flex flex-col items-center justify-center text-center gap-4 py-12 px-6 bg-white dark:bg-[#18181B] border border-[#E2E8F0] dark:border-transparent rounded-[24px] shadow-sm">
                  <AlertTriangle size={28} className="text-[#516B8B] dark:text-[#E5E7EB]" />
                  <p className="text-[13px] text-[#6B7280] dark:text-[#A1A1AA]">No active logs tracked in database.</p>
                </div>
              ) : (
                <>
                  {complaints.map((complaint) => {
                    const s = (complaint.status || "filed").toLowerCase();
                    
                    const statusConfig = s === "resolved" 
                      ? { label: "Resolved", color: "text-[#10B981]", bg: "bg-[#D1FAE5] dark:bg-[#064E3B]", width: "100%", bar: "bg-[#10B981]" }
                      : s === "in-progress" || s === "escalated"
                        ? { label: "In progress", color: "text-[#3B82F6]", bg: "bg-[#DBEAFE] dark:bg-[#1E3A8A]", width: "65%", bar: "bg-[#3B82F6]" }
                        : { label: "Pending Review", color: "text-[#EF4444]", bg: "bg-[#FEE2E2] dark:bg-[#7F1D1D]/40", width: "25%", bar: "bg-[#EF4444]" };

                    const catConfig = getCategoryConfig(complaint.analysis?.subType || complaint.analysis?.category);
                    const Icon = catConfig.Icon;
                    const locationShort = complaint.location?.address?.split(',')[0] || "Unknown location";

                    // FIX (show the actual photo in report history): the card
                    // used to always render a generic category icon, even
                    // though the original photo/video is sitting right in
                    // Firestore via `media` (array, current schema) or the
                    // older single `mediaUrl` field (pre-multi-capture
                    // reports). Prefer the first image in `media`; fall back
                    // to mediaUrl if it's an image; if all we have is a
                    // video with no thumbnail, fall back to the category
                    // icon rather than showing a broken/black video frame.
                    const firstMedia = complaint.media?.[0];
                    const previewUrl =
                      (firstMedia && !firstMedia.mimeType?.startsWith("video/") ? firstMedia.url : null) ||
                      (complaint.mediaUrl && !complaint.mediaType?.startsWith("video/") ? complaint.mediaUrl : null);
                    const mediaCount = complaint.media?.length || (complaint.mediaUrl ? 1 : 0);
                    const hasVideoOnly = !previewUrl && (
                      firstMedia?.mimeType?.startsWith("video/") || complaint.mediaType?.startsWith("video/")
                    );

                    return (
                      <div key={complaint.id} className="relative">
                        <Link href={`/track/${complaint.complaintId || complaint.id}`}>
                          <div className="bg-white dark:bg-[#18181B] border border-[#E2E8F0] dark:border-transparent rounded-[24px] p-4 flex items-start gap-4 shadow-sm active:scale-[0.98] transition-all">
                            <div className={`relative w-14 h-14 rounded-[16px] ${previewUrl ? '' : catConfig.bg} flex items-center justify-center shrink-0 overflow-hidden`}>
                              {previewUrl ? (
                                <img
                                  src={previewUrl}
                                  alt="Reported issue"
                                  className="w-full h-full object-cover"
                                  loading="lazy"
                                />
                              ) : hasVideoOnly ? (
                                <div className="w-full h-full bg-[#1E293B] dark:bg-[#27272A] flex items-center justify-center">
                                  <Video size={20} className="text-white/80" strokeWidth={2} />
                                </div>
                              ) : (
                                <Icon size={24} className={catConfig.color} strokeWidth={2.5} />
                              )}
                              {/* small category badge in the corner when showing a real photo,
                                  so the category is still glanceable even with the thumbnail */}
                              {previewUrl && (
                                <div className={`absolute bottom-0 right-0 w-5 h-5 rounded-tl-lg ${catConfig.bg} flex items-center justify-center`}>
                                  <Icon size={11} className={catConfig.color} strokeWidth={2.5} />
                                </div>
                              )}
                              {mediaCount > 1 && (
                                <div className="absolute top-0.5 right-0.5 bg-black/60 text-white text-[9px] font-bold px-1 rounded">
                                  +{mediaCount - 1}
                                </div>
                              )}
                            </div>
                            
                            {/*
                              FIX (share button overlapping status text):
                              The share button used to be `absolute top-3
                              right-3`, floating completely outside this
                              flex layout — so it landed directly on top of
                              the status pill ("IN PROGRE...") which the
                              flex engine had no awareness needed to make
                              room for it, clipping the text as shown in
                              the screenshot. It's now a real flex sibling
                              inside the header row (pr-7 added below
                              reserves space; gap-1.5 sets the spacing), so
                              the status pill and share button each get
                              their own slot and never overlap regardless
                              of label length ("Pending Review" vs
                              "Resolved" etc).
                            */}
                            <div className="flex-1 pt-1 min-w-0 pr-7">
                              <div className="flex justify-between items-start mb-1 gap-1.5">
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

                        {/*
                          Share button now sits in the card's top-right
                          corner padding zone only — pr-7 above guarantees
                          the text content never extends underneath it, so
                          this can stay visually "floating" without
                          actually colliding with anything.
                        */}
                        <button
                          onClick={(e) => shareReport(complaint, e)}
                          className="absolute top-4 right-4 w-7 h-7 rounded-full bg-[#F8F9FC] dark:bg-[#27272A] flex items-center justify-center active:scale-90 transition-transform z-10"
                          aria-label="Share this report"
                        >
                          <Share2 size={13} className="text-[#516B8B] dark:text-[#A1A1AA]" />
                        </button>
                      </div>
                    );
                  })}
                  
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
                </>
              )}
            </div>
          )}
        </div>
      )}
    </main>
  );
}

