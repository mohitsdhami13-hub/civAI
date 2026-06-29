"use client";

import { useEffect, useState } from "react";
import { collection, query, where, getDocs } from "firebase/firestore";
import { db } from "../../lib/firebase";
import { Car, Droplet, Lightbulb, AlertTriangle, Trophy, Loader2 } from "lucide-react";
import Link from "next/link";

export default function DashboardPage() {
  const [complaints, setComplaints] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Fetch from Firebase
  useEffect(() => {
    const fetchComplaints = async () => {
      try {
        // REMOVED orderBy() so Firebase doesn't require a composite index
        const q = query(collection(db, "complaints"), where("userId", "==", "user_solan_resident_01"));
        const snapshot = await getDocs(q);
        
        const fetchedData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        
        // Sort locally in JavaScript instead of making Firebase do it
        fetchedData.sort((a: any, b: any) => {
          return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
        });

        setComplaints(fetchedData);
      } catch (error) { 
        console.error("Error fetching reports:", error); 
      } finally { 
        setLoading(false); 
      }
    };
    fetchComplaints();
  }, []);

  // --- DYNAMIC UI HELPERS ---

  // 1. Status configuration (Colors, labels, and progress bar width)
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

  // 2. Icon & Color configuration based on AI classification text
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

  // 3. Format Firestore Timestamps to "Jun 10" style
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
            const statusConfig = getStatusConfig(complaint.status || "filed");
            const catConfig = getCategoryConfig(complaint.analysis?.subType || complaint.analysis?.category);
            const Icon = catConfig.Icon;
            
            // Extract a short sector/district name
            const locationShort = complaint.location?.address?.split(',')[0] || "Solan District";

            return (
              <Link href={`/track/${complaint.complaintId || complaint.id}`} key={complaint.id}>
                <div className="bg-white dark:bg-[#18181B] border border-[#E2E8F0] dark:border-transparent rounded-[24px] p-4 flex items-start gap-4 shadow-sm active:scale-[0.98] transition-transform relative overflow-hidden">
                  
                  {/* Category Icon Block */}
                  <div className={`w-14 h-14 rounded-[16px] ${catConfig.bg} flex items-center justify-center shrink-0`}>
                    <Icon size={24} className={catConfig.color} strokeWidth={2.5} />
                  </div>
                  
                  {/* Content Block */}
                  <div className="flex-1 pt-1 pb-2">
                    <div className="flex justify-between items-start mb-1">
                      <h3 className="font-bold text-[16px] text-[#1E293B] dark:text-[#E5E7EB] capitalize leading-tight pr-2 line-clamp-1" style={{fontFamily: 'var(--font-jakarta)'}}>
                        {complaint.analysis?.subType || complaint.analysis?.category || "Civic Issue"}
                      </h3>
                      <span className={`${statusConfig.bg} ${statusConfig.color} px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider shrink-0`}>
                        {statusConfig.label}
                      </span>
                    </div>
                    
                    <p className="text-[12px] font-semibold text-[#6B7280] dark:text-[#A1A1AA]">
                      {locationShort} • {formatDate(complaint.createdAt)} {statusConfig.label === 'Resolved' ? '' : '• Awaiting review'}
                    </p>

                    {/* Progress Bar Line */}
                    <div className="w-full h-1 bg-[#F3F4F6] dark:bg-[#09090B] rounded-full mt-3 overflow-hidden">
                      <div className={`h-full ${statusConfig.barColor} rounded-full transition-all duration-1000 ease-out`} style={{ width: statusConfig.width }} />
                    </div>
                  </div>
                </div>
              </Link>
            );
          })}

          {/* IMPACT SUMMARY CARD (Matches Screenshot) */}
          <div className="bg-[#F8F9FC] dark:bg-[#18181B] border border-[#E2E8F0] dark:border-transparent rounded-[24px] p-5 mt-2 flex items-center gap-4 shadow-sm">
            <div className="w-12 h-12 bg-white dark:bg-[#09090B] rounded-full flex items-center justify-center shrink-0 shadow-sm">
              <Trophy size={24} className="text-[#516B8B] dark:text-[#E5E7EB]" />
            </div>
            <div>
              <h4 className="font-bold text-[16px] text-[#1E293B] dark:text-[#E5E7EB]" style={{fontFamily: 'var(--font-jakarta)'}}>Your impact this month</h4>
              <p className="text-[12px] font-semibold text-[#516B8B] dark:text-[#A1A1AA] mt-0.5">
                {complaints.length} filed • {resolvedCount} resolved • 45 verifications
              </p>
            </div>
          </div>

        </div>
      )}
    </main>
  );
}