"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { doc, getDoc, collection, query, where, getDocs, updateDoc } from "firebase/firestore";
import { db } from "../../../lib/firebase"; 
import { 
  ChevronLeft, Loader2, AlertTriangle, Car, Droplet, 
  Lightbulb, MapPin, Landmark, CheckCircle, Clock, FileText, 
  Flame, Timer, ShieldAlert
} from "lucide-react";

const triggerHaptic = (pattern: number | number[] = 50) => {
  if (typeof window !== "undefined" && navigator.vibrate) {
    navigator.vibrate(pattern);
  }
};

export default function TrackReportPage() {
  const { id } = useParams();
  const router = useRouter();
  const [report, setReport] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [isEscalating, setIsEscalating] = useState(false);

  useEffect(() => {
    const fetchReport = async () => {
      try {
        let reportData = null;

        const docRef = doc(db, "complaints", id as string);
        const docSnap = await getDoc(docRef);
        
        if (docSnap.exists()) {
          reportData = { id: docSnap.id, ...docSnap.data() };
        } else {
          
          const q = query(collection(db, "complaints"), where("complaintId", "==", id));
          const qSnap = await getDocs(q);
          if (!qSnap.empty) {
            reportData = { id: qSnap.docs[0].id, ...qSnap.docs[0].data() };
          }
        }

        if (reportData) setReport(reportData);
        else setError(true);
      } catch (err) {
        console.error("Error fetching report:", err);
        setError(true);
      } finally {
        setLoading(false);
      }
    };

    if (id) fetchReport();
  }, [id]);

  const handleEscalate = async () => {
    if (!report || report.status === 'escalated' || report.status === 'resolved') return;
    
    triggerHaptic(30);
    setIsEscalating(true);
    try {
      const docRef = doc(db, "complaints", report.id);
      await updateDoc(docRef, { status: "escalated" });
      
      triggerHaptic([30, 50, 30]);
      setReport({ ...report, status: "escalated" });
    } catch (err) {
      console.error("Escalation failed", err);
      triggerHaptic([100, 50, 100]);
    } finally {
      setIsEscalating(false);
    }
  };

  const getCategoryConfig = (type = "") => {
    const t = type.toLowerCase();
    if (t.includes("water") || t.includes("leak") || t.includes("pipe")) return { Icon: Droplet, color: "text-[#EF4444]", bg: "bg-[#FEE2E2] dark:bg-[#7F1D1D]/40" };
    if (t.includes("light") || t.includes("electric")) return { Icon: Lightbulb, color: "text-[#3B82F6]", bg: "bg-[#DBEAFE] dark:bg-[#1E3A8A]/50" };
    if (t.includes("road") || t.includes("pothole")) return { Icon: Car, color: "text-[#F59E0B]", bg: "bg-[#FEF3C7] dark:bg-[#78350F]/50" };
    return { Icon: AlertTriangle, color: "text-[#516B8B] dark:text-[#E5E7EB]", bg: "bg-[#E2E8F0] dark:bg-[#27272A]" };
  };

  const formatDate = (dateStr: string) => {
    if (!dateStr) return "Recently";
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  };

  const getDaysElapsed = () => {
    if (!report?.createdAt) return 0;
    const date = report.createdAt.seconds ? new Date(report.createdAt.seconds * 1000) : new Date(report.createdAt);
    const diff = new Date().getTime() - date.getTime();
    return Math.max(0, Math.floor(diff / (1000 * 60 * 60 * 24)));
  };

  const getTimelineState = (currentStatus = "filed") => {
    const s = currentStatus.toLowerCase();
    const steps = [
      { id: 'filed', label: 'Report Filed', desc: 'AI successfully documented issue', completed: true, active: s === 'filed', color: 'bg-[#10B981]' },
      { id: 'review', label: s === 'escalated' ? 'Escalated to L2' : 'Under Review', desc: s === 'escalated' ? 'Priority review by higher authority' : 'Assigned to proper jurisdiction', completed: ['escalated', 'in-progress', 'resolved'].includes(s), active: s === 'escalated', color: s === 'escalated' ? 'bg-[#F59E0B]' : 'bg-[#10B981]' },
      { id: 'progress', label: 'In Progress', desc: 'Maintenance team dispatched', completed: ['in-progress', 'resolved'].includes(s), active: s === 'in-progress', color: 'bg-[#10B981]' },
      { id: 'resolved', label: 'Resolved', desc: 'Issue has been fixed', completed: s === 'resolved', active: s === 'resolved', color: 'bg-[#10B981]' }
    ];
    if (s === 'filed') steps[1].active = true; 
    return steps;
  };

  if (loading) {
    return (
      <div className="flex-1 flex flex-col justify-center items-center h-screen bg-[#FCFAF5] dark:bg-[#09090B]">
        <Loader2 size={32} className="text-[#516B8B] dark:text-[#E5E7EB] animate-spin" />
        <p className="text-[#6B7280] dark:text-[#A1A1AA] font-bold text-sm mt-3">Locating record...</p>
      </div>
    );
  }

  if (error || !report) {
    return (
      <div className="flex-1 flex flex-col justify-center items-center h-screen bg-[#FCFAF5] dark:bg-[#09090B] px-6 text-center">
        <AlertTriangle size={48} className="text-[#EF4444] mb-4" />
        <h1 className="text-[22px] font-black text-[#1E293B] dark:text-[#E5E7EB] mb-2" style={{fontFamily: 'var(--font-jakarta)'}}>Record Not Found</h1>
        <p className="text-[#6B7280] dark:text-[#A1A1AA] text-[15px] mb-6">We couldn't locate this specific report in the database.</p>
        <button onClick={() => router.back()} className="px-6 py-3 bg-[#516B8B] dark:bg-[#27272A] text-white rounded-full font-bold active:scale-95 transition-transform">
          Go Back
        </button>
      </div>
    );
  }

  const catConfig = getCategoryConfig(report.analysis?.subType || report.analysis?.category);
  const Icon = catConfig.Icon;
  const timeline = getTimelineState(report.status);
  
  const daysElapsed = getDaysElapsed();
  const slaPercentage = Math.min((daysElapsed / 7) * 100, 100);
  const isEscalatable = report.status !== 'resolved' && report.status !== 'escalated';

  return (
    <main className="w-full max-w-md mx-auto flex flex-col min-h-screen bg-[#FCFAF5] dark:bg-[#09090B] pb-10">
      
      {}
      <nav className="sticky top-0 z-50 bg-[#FCFAF5]/90 dark:bg-[#09090B]/90 backdrop-blur-xl px-4 h-16 flex items-center justify-between border-b border-[#E2E8F0] dark:border-[#27272A]">
        <button onClick={() => router.back()} className="w-10 h-10 flex items-center justify-center rounded-full bg-white dark:bg-[#18181B] shadow-sm text-[#1E293B] dark:text-[#E5E7EB] active:scale-90 transition-transform">
          <ChevronLeft size={24} />
        </button>
        <h1 className="font-bold text-[18px] text-[#1E293B] dark:text-[#E5E7EB] tracking-wide" style={{fontFamily: 'var(--font-jakarta)'}}>Track Status</h1>
        <div className="w-10 h-10" />
      </nav>

      <div className="px-5 pt-6 flex flex-col gap-6">
        
        {}
        <div className="bg-white dark:bg-[#18181B] border border-[#E2E8F0] dark:border-transparent rounded-[24px] p-6 shadow-sm flex flex-col items-center text-center">
          <div className={`w-16 h-16 rounded-[20px] ${catConfig.bg} flex items-center justify-center mb-4`}>
            <Icon size={32} className={catConfig.color} strokeWidth={2.5} />
          </div>
          <h2 className="text-[22px] font-black text-[#1E293B] dark:text-[#E5E7EB] capitalize leading-tight mb-1" style={{fontFamily: 'var(--font-jakarta)'}}>
            {report.analysis?.subType || report.analysis?.category || "Infrastructure Issue"}
          </h2>
          <div className="flex flex-col items-center gap-1.5 mt-2">
            <span className="flex items-center gap-1.5 text-[13px] font-bold text-[#6B7280] dark:text-[#A1A1AA]">
              <MapPin size={14} className="text-[#516B8B] dark:text-[#E5E7EB]" /> {report.location?.address}
            </span>
            <span className="flex items-center gap-1.5 text-[13px] font-bold text-[#6B7280] dark:text-[#A1A1AA]">
              <Clock size={14} className="text-[#516B8B] dark:text-[#E5E7EB]" /> {formatDate(report.createdAt)}
            </span>
          </div>
        </div>

        {}
        {report.status !== 'resolved' && (
          <div className="bg-white dark:bg-[#18181B] border border-[#E2E8F0] dark:border-transparent rounded-[24px] p-5 shadow-sm">
            <div className="flex justify-between items-end mb-3">
              <div>
                <h3 className="font-black text-[15px] text-[#1E293B] dark:text-[#E5E7EB] flex items-center gap-2" style={{fontFamily: 'var(--font-jakarta)'}}>
                  <Timer size={18} className="text-[#516B8B] dark:text-[#E5E7EB]" /> 7-Day SLA Timer
                </h3>
                <p className="text-[12px] font-medium text-[#6B7280] dark:text-[#A1A1AA] mt-1">
                  {daysElapsed >= 7 ? "SLA Breached - Escalation Recommended" : `${7 - daysElapsed} days remaining for standard resolution`}
                </p>
              </div>
              <span className="text-[20px] font-black text-[#516B8B] dark:text-[#E5E7EB]">{daysElapsed}<span className="text-[14px] text-[#9CA3AF] dark:text-[#71717A]">/7</span></span>
            </div>
            
            {}
            <div className="w-full h-2.5 bg-[#F3F4F6] dark:bg-[#09090B] rounded-full overflow-hidden mb-5">
              <div 
                className={`h-full rounded-full transition-all duration-1000 ${daysElapsed >= 7 ? 'bg-[#EF4444]' : 'bg-[#516B8B] dark:bg-[#E5E7EB]'}`} 
                style={{ width: `${slaPercentage}%` }} 
              />
            </div>

            {}
            {isEscalatable ? (
              <button 
                onClick={handleEscalate}
                disabled={isEscalating}
                className="w-full bg-[#FFF3D6] dark:bg-[#27272A] text-[#D97706] dark:text-[#FCD34D] border border-[#FDE68A] dark:border-[#3F3F46] font-bold text-[15px] min-h-[48px] rounded-xl flex items-center justify-center gap-2 active:scale-[0.98] transition-transform disabled:opacity-50"
              >
                {isEscalating ? <Loader2 size={18} className="animate-spin" /> : <Flame size={18} />}
                Escalate to Higher Authority
              </button>
            ) : report.status === 'escalated' ? (
              <div className="w-full bg-[#FEF2F2] dark:bg-[#7F1D1D]/40 text-[#EF4444] dark:text-[#F87171] border border-[#FCA5A5] dark:border-[#991B1B] font-bold text-[14px] py-3 rounded-xl flex items-center justify-center gap-2">
                <ShieldAlert size={18} /> Escalated to L2 Authority
              </div>
            ) : null}
            
            {daysElapsed < 7 && isEscalatable && (
              <p className="text-[10px] text-center text-[#9CA3AF] dark:text-[#71717A] mt-2 italic">*Demo Mode: Escalation unlocked early</p>
            )}
          </div>
        )}

        {}
        <div className="bg-white dark:bg-[#18181B] border border-[#E2E8F0] dark:border-transparent rounded-[24px] p-6 shadow-sm">
          <h3 className="font-black text-[16px] text-[#1E293B] dark:text-[#E5E7EB] mb-5" style={{fontFamily: 'var(--font-jakarta)'}}>Resolution Progress</h3>
          
          <div className="flex flex-col relative">
            <div className="absolute left-[15px] top-[20px] bottom-[20px] w-0.5 bg-[#E2E8F0] dark:bg-[#27272A] z-0" />

            {timeline.map((step) => (
              <div key={step.id} className="flex gap-4 relative z-10 mb-6 last:mb-0">
                <div className="flex flex-col items-center">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 transition-colors ${
                    step.completed 
                      ? `${step.color} text-white shadow-md` 
                      : step.active 
                        ? "bg-[#FFF3D6] dark:bg-[#27272A] text-[#F59E0B] border-2 border-[#F59E0B]" 
                        : "bg-[#F3F4F6] dark:bg-[#09090B] text-[#9CA3AF] dark:text-[#71717A] border border-[#E2E8F0] dark:border-[#27272A]"
                  }`}>
                    {step.completed ? <CheckCircle size={16} strokeWidth={3} /> : <div className={`w-2.5 h-2.5 rounded-full ${step.active ? 'bg-[#F59E0B]' : 'bg-transparent'}`} />}
                  </div>
                </div>
                
                <div className="flex flex-col pt-1.5 pb-2">
                  <span className={`text-[15px] font-bold leading-none ${step.completed || step.active ? (step.id === 'review' && report.status === 'escalated' ? 'text-[#F59E0B]' : 'text-[#1E293B] dark:text-[#E5E7EB]') : "text-[#9CA3AF] dark:text-[#71717A]"}`}>
                    {step.label}
                  </span>
                  <span className={`text-[12px] mt-1.5 ${step.completed || step.active ? "text-[#6B7280] dark:text-[#A1A1AA]" : "text-[#9CA3AF] dark:text-[#71717A]"}`}>
                    {step.desc}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {}
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-[#F8F9FC] dark:bg-[#18181B] border border-[#E2E8F0] dark:border-transparent p-4 rounded-[20px] shadow-sm">
            <span className="text-[11px] font-bold text-[#516B8B] dark:text-[#E5E7EB] uppercase tracking-wider">Record Token</span>
            <div className="text-[16px] font-black text-[#1E293B] dark:text-[#E5E7EB] mt-1 font-mono tracking-tight">{report.complaintId || report.id.substring(0, 8)}</div>
          </div>
          
          <div className="bg-[#F8F9FC] dark:bg-[#18181B] border border-[#E2E8F0] dark:border-transparent p-4 rounded-[20px] shadow-sm">
            <span className="text-[11px] font-bold text-[#516B8B] dark:text-[#E5E7EB] uppercase tracking-wider">Lvl {report.analysis?.severity || 3} Hazard</span>
            <div className="text-[14px] font-bold text-[#1E293B] dark:text-[#E5E7EB] mt-1 leading-tight line-clamp-2">
              {report.analysis?.department || "Public Works"}
            </div>
          </div>
        </div>

        {}
        {report.formalComplaint && (
          <div className="bg-white dark:bg-[#18181B] border border-[#E2E8F0] dark:border-transparent rounded-[24px] p-6 shadow-sm mb-6">
            <div className="flex items-center gap-2 mb-3">
              <FileText size={18} className="text-[#6B7280] dark:text-[#A1A1AA]" />
              <h3 className="font-black text-[15px] text-[#1E293B] dark:text-[#E5E7EB]" style={{fontFamily: 'var(--font-jakarta)'}}>Automated AI Report Log</h3>
            </div>
            <div className="bg-[#FCFAF5] dark:bg-[#09090B] p-4 rounded-[16px] text-[13px] text-[#6B7280] dark:text-[#A1A1AA] font-serif leading-relaxed whitespace-pre-wrap border border-[#E2E8F0] dark:border-transparent">
              {report.formalComplaint}
            </div>
          </div>
        )}

      </div>
    </main>
  );
}