"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { db } from "@/lib/firebase"; // Adjust path if your lib is elsewhere
import { collection, query, where, getDocs, updateDoc, doc } from "firebase/firestore";
import { CheckCircle, Clock, MapPin, User, FileText, AlertTriangle, ShieldCheck, ArrowUpRight, Loader2 } from "lucide-react";

const TIMELINE_STAGES = [
  { id: "filed", label: "Complaint Filed", desc: "Logged securely in database" },
  { id: "submitted", label: "Submitted to Authority", desc: "Routed to appropriate department" },
  { id: "review", label: "Under Review", desc: "Authority is assessing the hazard" },
  { id: "action", label: "Action Taken", desc: "Field team dispatched for rectification" },
  { id: "resolved", label: "Resolved", desc: "Issue has been officially fixed" }
];

export default function TrackComplaint() {
  const params = useParams();
  const complaintId = params.complaintId as string;

  const [complaint, setComplaint] = useState<any>(null);
  const [docId, setDocId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchComplaint = async () => {
      try {
        const q = query(collection(db, "complaints"), where("complaintId", "==", complaintId));
        const querySnapshot = await getDocs(q);

        if (querySnapshot.empty) {
          setError("Complaint not found. Please check the ID and try again.");
        } else {
          const docSnap = querySnapshot.docs[0];
          setDocId(docSnap.id);
          setComplaint(docSnap.data());
        }
      } catch (err: any) {
        setError("Failed to fetch complaint tracking data.");
        console.error(err);
      } finally {
        setLoading(false);
      }
    };

    if (complaintId) fetchComplaint();
  }, [complaintId]);

  const handleStatusUpdate = async (newStatus: string) => {
    if (!docId) return;
    setUpdating(true);
    try {
      const docRef = doc(db, "complaints", docId);
      await updateDoc(docRef, { 
        status: newStatus,
        resolvedAt: newStatus === "resolved" ? new Date() : null
      });
      setComplaint((prev: any) => ({ ...prev, status: newStatus }));
    } catch (err) {
      console.error("Update failed", err);
      alert("Failed to update status.");
    } finally {
      setUpdating(false);
    }
  };

  const handleEscalate = async () => {
    if (!docId) return;
    setUpdating(true);
    try {
      const docRef = doc(db, "complaints", docId);
      const newLevel = (complaint.escalationLevel || 0) + 1;
      await updateDoc(docRef, { 
        escalationLevel: newLevel,
        lastEscalatedAt: new Date()
      });
      setComplaint((prev: any) => ({ ...prev, escalationLevel: newLevel }));
      alert(`Complaint escalated to Level ${newLevel}! Higher authorities have been notified.`);
    } catch (err) {
      console.error("Escalation failed", err);
    } finally {
      setUpdating(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-950">
        <div className="flex flex-col items-center gap-4 text-emerald-500">
          <Loader2 className="animate-spin" size={48} />
          <p className="font-mono tracking-widest uppercase">Locating Record...</p>
        </div>
      </div>
    );
  }

  if (error || !complaint) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-950">
        <div className="bg-red-950/40 border border-red-900/50 p-8 rounded-xl flex flex-col items-center text-red-400">
          <AlertTriangle size={48} className="mb-4" />
          <h2 className="text-xl font-bold">{error}</h2>
        </div>
      </div>
    );
  }

  // Calculate timelines
  const createdAtMs = complaint.createdAt?.toMillis() || Date.now();
  const daysElapsed = Math.floor((Date.now() - createdAtMs) / (1000 * 60 * 60 * 24));
  const escalationThreshold = 7;
  const daysToEscalate = Math.max(0, escalationThreshold - daysElapsed);
  
  // Find current stage index
  const currentStageIndex = TIMELINE_STAGES.findIndex(s => s.id === complaint.status) !== -1 
    ? TIMELINE_STAGES.findIndex(s => s.id === complaint.status) 
    : 0;

  return (
    <main className="max-w-6xl mx-auto p-4 md:p-8">
      <header className="mb-8 border-b border-slate-800 pb-6 flex justify-between items-end">
        <div>
          <p className="text-sm font-bold text-emerald-500 uppercase tracking-widest mb-1">Live Tracking Radar</p>
          <h1 className="text-4xl font-black tracking-tight text-slate-100 font-mono">
            {complaintId}
          </h1>
        </div>
        <div className="text-right">
          <div className="inline-flex items-center gap-2 bg-slate-900 border border-slate-800 px-4 py-2 rounded-full shadow-sm">
            <Clock size={16} className="text-cyan-400" />
            <span className="text-sm font-medium text-slate-300">Day <span className="text-cyan-400 font-bold">{daysElapsed}</span> active</span>
          </div>
        </div>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-10">
        
        {/* Left Column: Vertical Timeline */}
        <div className="lg:col-span-5 bg-slate-900 border border-slate-800 p-8 rounded-2xl shadow-xl">
          <h3 className="text-lg font-bold text-slate-200 mb-8 border-b border-slate-800 pb-4">Lifecycle Status</h3>
          
          <div className="space-y-8 relative before:absolute before:inset-0 before:ml-5 before:-translate-x-px md:before:mx-auto md:before:translate-x-0 before:h-full before:w-0.5 before:bg-slate-800">
            {TIMELINE_STAGES.map((stage, index) => {
              const isCompleted = index <= currentStageIndex;
              const isCurrent = index === currentStageIndex;
              
              return (
                <div key={stage.id} className="relative flex items-center justify-between md:justify-normal md:odd:flex-row-reverse group">
                  <div className={`flex items-center justify-center w-10 h-10 rounded-full border-4 shrink-0 md:order-1 md:group-odd:-translate-x-1/2 md:group-even:translate-x-1/2 shadow shadow-slate-900 relative z-10 
                    ${isCompleted ? 'bg-emerald-500 border-emerald-900 text-white' : 'bg-slate-900 border-slate-700 text-slate-500'}`}>
                    {isCompleted ? <CheckCircle size={18} /> : <Clock size={18} />}
                  </div>
                  
                  <div className={`w-[calc(100%-4rem)] md:w-[calc(50%-2.5rem)] p-4 rounded-xl border transition-all
                    ${isCurrent ? 'bg-emerald-950/30 border-emerald-500/50 shadow-lg shadow-emerald-900/20' : 'bg-slate-950/50 border-slate-800/50'}`}>
                    <h4 className={`font-bold text-base ${isCurrent ? 'text-emerald-400' : isCompleted ? 'text-slate-300' : 'text-slate-500'}`}>
                      {stage.label}
                    </h4>
                    <p className="text-xs text-slate-500 mt-1">{stage.desc}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Right Column: Details & Actions */}
        <div className="lg:col-span-7 space-y-6">
          
          {/* Action Center Widget */}
          {complaint.status !== "resolved" && (
            <div className="bg-gradient-to-br from-slate-900 to-slate-950 border border-slate-800 p-6 rounded-2xl shadow-xl flex flex-col sm:flex-row gap-6 justify-between items-center">
              <div>
                <p className="text-sm font-semibold text-slate-400 flex items-center gap-2">
                  <AlertTriangle size={16} className={daysToEscalate <= 2 ? "text-amber-500" : "text-slate-500"} />
                  SLA Auto-Escalation
                </p>
                <h3 className="text-2xl font-black text-slate-200 mt-1">
                  {daysToEscalate} <span className="text-lg text-slate-500 font-medium tracking-normal">Days Remaining</span>
                </h3>
              </div>
              
              <div className="flex flex-col sm:flex-row gap-3 w-full sm:w-auto">
                <button 
                  onClick={() => handleStatusUpdate("resolved")}
                  disabled={updating}
                  className="bg-emerald-600 hover:bg-emerald-500 text-white font-medium py-3 px-5 rounded-lg flex items-center justify-center gap-2 transition-all shadow-lg"
                >
                  <ShieldCheck size={18} /> Mark Resolved
                </button>
                <button 
                  onClick={handleEscalate}
                  disabled={updating}
                  className="bg-slate-800 hover:bg-slate-700 text-red-400 hover:text-red-300 font-medium py-3 px-5 rounded-lg flex items-center justify-center gap-2 transition-all border border-red-900/30"
                >
                  <ArrowUpRight size={18} /> Escalate Now
                </button>
              </div>
            </div>
          )}

          {/* Details Card */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl shadow-xl overflow-hidden">
            <div className="p-6 border-b border-slate-800">
              <h3 className="text-lg font-bold text-slate-200 flex items-center gap-2">
                <FileText size={18} className="text-cyan-400" /> Dossier Details
              </h3>
            </div>
            
            <div className="p-6 grid grid-cols-1 sm:grid-cols-2 gap-8">
              <div>
                <p className="text-xs text-slate-500 uppercase font-bold tracking-wider mb-2">Target Authority</p>
                <div className="flex items-start gap-3">
                  <div className="mt-1 bg-slate-800 p-2 rounded"><User size={16} className="text-cyan-400" /></div>
                  <div>
                    <p className="text-sm font-semibold text-slate-300">{complaint.authorityContact?.department}</p>
                    <p className="text-xs text-slate-500">{complaint.authorityContact?.officerName}</p>
                  </div>
                </div>
              </div>

              <div>
                <p className="text-xs text-slate-500 uppercase font-bold tracking-wider mb-2">Hazard Location</p>
                <div className="flex items-start gap-3">
                  <div className="mt-1 bg-slate-800 p-2 rounded"><MapPin size={16} className="text-emerald-400" /></div>
                  <div>
                    <p className="text-sm font-semibold text-slate-300">{complaint.location?.address}</p>
                    <p className="text-xs text-slate-500 font-mono mt-0.5">{complaint.location?.lat.toFixed(4)}, {complaint.location?.lng.toFixed(4)}</p>
                  </div>
                </div>
              </div>
            </div>
            
            <div className="bg-slate-950 p-6 border-t border-slate-800">
              <p className="text-xs text-slate-500 uppercase font-bold tracking-wider mb-3">Formal Grievance Filed</p>
              <div className="p-4 bg-slate-900/50 rounded-lg text-sm text-slate-400 font-serif whitespace-pre-wrap leading-relaxed border border-slate-800/50">
                {complaint.formalComplaint}
              </div>
            </div>
          </div>

        </div>
      </div>
    </main>
  );
}