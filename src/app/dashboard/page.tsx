"use client";

import { useEffect, useState } from "react";
import { collection, query, where, getDocs } from "firebase/firestore";
import { db } from "../../lib/firebase";
import { Car, Droplet, Lightbulb, AlertTriangle, Trophy, Loader2 } from "lucide-react";
import Link from "next/link";

export default function DashboardPage() {
  const [complaints, setComplaints] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Fetch from Firebase (Both Processed and Pending)
  useEffect(() => {
    const fetchComplaints = async () => {
      try {
        // 1. Fetch Finished AI Reports
        const q = query(collection(db, "complaints"), where("userId", "==", "user_solan_resident_01"));
        const snapshot = await getDocs(q);
        const finishedData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data(), isPending: false }));
        
        // 2. Fetch Pending/Uploading Media Drafts
        const p = query(collection(db, "pending_reports"), where("userId", "==", "user_solan_resident_01"));
        const pendingSnapshot = await getDocs(p);
        const pendingData = pendingSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data(), isPending: true }));

        // 3. Combine and Sort Locally
        const combinedData = [...finishedData, ...pendingData];
        combinedData.sort((a: any, b: any) => {
          const dateA = a.createdAt?.seconds ? a.createdAt.seconds * 1000 : new Date(a.createdAt).getTime();
          const dateB = b.createdAt?.seconds ? b.createdAt.seconds * 1000 : new Date(b.createdAt).getTime();
          return dateB - dateA;
        });

        setComplaints(combinedData);
      } catch (error) { 
        console.error("Error fetching reports:", error); 
      } finally { 
        setLoading(false); 
      }
    };
    fetchComplaints();
  }, []);

  // --- DYNAMIC UI HELPERS ---

  const getStatusConfig = (status = "pending") => {
    const s = status.toLowerCase();
    if (s === "resolved") return { 
      label: "Resolved", color: "text-[#10B981]", bg: "bg-[#D1FAE5] dark:bg-[#064E3B]", barColor: "bg-[#10B981]", width: "100%" 
    };
    if (s === "in-progress" || s === "escalated") return { 
      label: "In progress", color: "text-[#3B82F6]", bg: "bg-[#DBEAFE] dark:bg-[#1E3A8A]", barColor: "bg-[#3B82F6]", width: "60%" 
    };
    return { 
      label: "Pending", color: "text-[#EF4444]", bg: "bg-[#FEE2E2] dark:bg-[#7F1D1D]/50", barColor: "bg-[#EF4444]", width: "25%" 
    };
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

  // --- CALCULATED STATS ---
  const activeCount = complaints.filter(c => c.status !== "resolved").length;
  const resolvedCount = complaints.filter(c => c.status === "resolved").length;

  return (
    <main className="px-5 py-4 w-full max-w-md mx-auto flex flex-col min-h-[calc(100vh-76px)] pb-24">
      
      {/* HEADER */}
      <div className="flex items-center justify-between mt-2 mb-6">
        <h1 className="text-[26px] font-black text-[#1E293B] dark:text-[#E5E7EB] leading-tight" style={{fontFamily: 'var(--font-jakarta)'}}>
          My Reports
        </h1>
        {activeCount > 0 && (
          <div className="bg-[#FEF3C7] dark:bg-[#78350F]/50 text-[#D97706] dark:text-[#FBBF24] px-3 py-1 rounded-full text-[12px] font-bold">
            {activeCount} active
          </div>
        )}
      </div>

      {loading ? (
        <div className="flex-1 flex flex-col justify-center items-center py-20 gap-3">
          <Loader2 size={32} className="text-[#516B8B] dark:text-[#E5E7EB] animate-spin" />
          <p className="text-[#6B7280] dark:text-[#A1A1AA] font-bold text-sm">Syncing records...</p>
        </div>
      ) : complaints.length === 0 ? (
        /* EMPTY STATE */
        <div className="flex-1 flex flex-col items-center justify-center text-center gap-4 py-12 px-6 bg-white dark:bg-[#18181B] border border-[#E2E8F0] dark:border-transparent rounded-[24px] shadow-sm">
          <div className="w-20 h-20 bg-[#F8F9FC] dark:bg-[#09090B] rounded-full flex justify-center items-center">
            <AlertTriangle size={32} className="text-[#516B8B] dark:text-[#E5E7EB]" />
          </div>
          <div>
            <h3 className="text-[20px] font-bold text-[#1E293B] dark:text-[#E5E7EB]" style={{fontFamily: 'var(--font-jakarta)'}}>No Reports Yet</h3>
            <p className="text-[14px] text-[#6B7280] dark:text-[#A1A1AA] mt-2 leading-relaxed">You haven't filed a report yet. Be the first to make a difference in your neighborhood.</p>
          </div>
          <Link href="/" className="mt-2 bg-[#516B8B] dark:bg-[#27272A] text-white font-bold py-3.5 px-8 rounded-full shadow-lg shadow-[#516B8B]/20 dark:shadow-none active:scale-95 transition-transform">
            Report an Issue
          </Link>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          
          {/* COMPLAINTS LIST */}
          {complaints.map((complaint) => {
            const isPending = complaint.isPending;
            
            // Dynamic configurations based on status
            const statusConfig = isPending 
              ? { label: "Processing", color: "text-[#F59E0B]", bg: "bg-[#FEF3C7] dark:bg-[#78350F]/50", barColor: "bg-[#F59E0B]", width: "15%" }
              : getStatusConfig(complaint.status || "filed");
              
            const catConfig = isPending
              ? { Icon: Loader2, color: "text-[#516B8B] dark:text-[#E5E7EB]", bg: "bg-[#F3F4F6] dark:bg-[#27272A]" }
              : getCategoryConfig(complaint.analysis?.subType || complaint.analysis?.category);
              
            const Icon = catConfig.Icon;
            
            // Fallbacks for missing AI data during pending state
            const locationShort = isPending ? "Processing Location..." : (complaint.location?.address?.split(',')[0] || "Solan District");
            const title = isPending ? "AI Analyzing Media..." : (complaint.analysis?.subType || complaint.analysis?.category || "Civic Issue");

            // The reusable Card UI
            const CardContent = (
              <div className={`bg-white dark:bg-[#18181B] border border-[#E2E8F0] dark:border-transparent rounded-[24px] p-4 flex items-start gap-4 shadow-sm relative overflow-hidden transition-all ${isPending ? 'opacity-80' : 'active:scale-[0.98]'}`}>
                
                {/* Category Icon Block */}
                <div className={`w-14 h-14 rounded-[16px] ${catConfig.bg} flex items-center justify-center shrink-0`}>
                  <Icon size={24} className={`${catConfig.color} ${isPending ? 'animate-spin' : ''}`} strokeWidth={2.5} />
                </div>
                
                {/* Content Block */}
                <div className="flex-1 pt-1 pb-2">
                  <div className="flex justify-between items-start mb-1">
                    <h3 className="font-bold text-[16px] text-[#1E293B] dark:text-[#E5E7EB] capitalize leading-tight pr-2 line-clamp-1" style={{fontFamily: 'var(--font-jakarta)'}}>
                      {title}
                    </h3>
                    <span className={`${statusConfig.bg} ${statusConfig.color} px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider shrink-0`}>
                      {statusConfig.label}
                    </span>
                  </div>
                  
                  <p className="text-[12px] font-semibold text-[#6B7280] dark:text-[#A1A1AA]">
                    {locationShort} • {formatDate(complaint.createdAt)} {isPending ? '• Queued' : (statusConfig.label === 'Resolved' ? '' : '• Awaiting review')}
                  </p>

                  {/* Progress Bar Line */}
                  <div className="w-full h-1 bg-[#F3F4F6] dark:bg-[#09090B] rounded-full mt-3 overflow-hidden">
                    <div className={`h-full ${statusConfig.barColor} rounded-full transition-all duration-1000 ease-out ${isPending ? 'animate-pulse' : ''}`} style={{ width: statusConfig.width }} />
                  </div>
                </div>
              </div>
            );

            // If it's pending, render as a static div (no click). If processed, wrap in a Link.
            return isPending ? (
              <div key={complaint.id} className="cursor-wait">
                {CardContent}
              </div>
            ) : (
              <Link href={`/track/${complaint.complaintId || complaint.id}`} key={complaint.id}>
                {CardContent}
              </Link>
            );
          })}

          {/* IMPACT SUMMARY CARD */}
          <div className="bg-[#F8F9FC] dark:bg-[#18181B] border border-[#E2E8F0] dark:border-transparent rounded-[24px] p-5 mt-2 flex items-center gap-4 shadow-sm">
            <div className="w-12 h-12 bg-white dark:bg-[#09090B] rounded-full flex items-center justify-center shrink-0 shadow-sm">
              <Trophy size={24} className="text-[#516B8B] dark:text-[#E5E7EB]" />
            </div>
            <div>
              <h4 className="font-bold text-[16px] text-[#1E293B] dark:text-[#E5E7EB]" style={{fontFamily: 'var(--font-jakarta)'}}>Your impact this month</h4>
              <p className="text-[12px] font-semibold text-[#516B8B] dark:text-[#A1A1AA] mt-0.5">
                {complaints.filter(c => !c.isPending).length} filed • {resolvedCount} resolved • 45 verifications
              </p>
            </div>
          </div>

        </div>
      )}
    </main>
  );
}