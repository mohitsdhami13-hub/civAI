"use client";

import { Award, Shield, Target, Zap, CheckCircle } from "lucide-react";

export default function ProfilePage() {
  // Mocked state for presentation
  const xp = 850;
  const nextLevel = 1000;
  const progress = (xp / nextLevel) * 100;

  const badges = [
    { id: 1, icon: "🏅", name: "First Report", desc: "Logged your first issue", earned: true },
    { id: 2, icon: "🦸", name: "Civic Hero", desc: "Resolved 5+ issues", earned: true },
    { id: 3, icon: "⚡", name: "RTI Warrior", desc: "Escalated to Level 2", earned: false },
    { id: 4, icon: "👁️", name: "Neighborhood Watch", desc: "Verified 10 hazards", earned: false },
  ];

  return (
    <main className="p-5 flex flex-col gap-6 w-full max-w-md mx-auto min-h-[calc(100vh-76px)] pb-24">
      
      {/* GOOGLE IDENTITY & XP CARD */}
      <div className="bg-white dark:bg-[#18181B] border border-[#E2E8F0] dark:border-transparent rounded-[24px] p-6 relative overflow-hidden shadow-sm mt-2">
        <div className="flex items-center gap-4 relative z-10">
          {/* Avatar with Theme Ring */}
          <div className="w-16 h-16 rounded-full overflow-hidden border-[3px] border-[#516B8B] dark:border-[#52525B] shadow-lg shadow-[#516B8B]/20 shrink-0 bg-[#E2E8F0] dark:bg-[#09090B]">
            <img src="https://api.dicebear.com/7.x/avataaars/svg?seed=Mohit&backgroundColor=E2E8F0" alt="Avatar" className="w-full h-full object-cover" />
          </div>
          <div>
            <h1 className="text-[22px] font-black text-[#1E293B] dark:text-[#E5E7EB] leading-tight" style={{fontFamily: 'var(--font-jakarta)'}}>Mohit Dhami</h1>
            <p className="text-[#6B7280] dark:text-[#A1A1AA] text-[13px] mt-0.5">mohit@example.com</p>
            <div className="flex items-center gap-1.5 mt-2 bg-[#F8F9FC] dark:bg-[#09090B] w-fit px-2.5 py-1 rounded-full text-[11px] font-bold text-[#6B7280] dark:text-[#A1A1AA] border border-[#E2E8F0] dark:border-[#27272A]">
              <img src="https://www.svgrepo.com/show/475656/google-color.svg" alt="Google" className="w-3.5 h-3.5" />
              Verified Account
            </div>
          </div>
        </div>

        {/* XP PROGRESS BAR */}
        <div className="mt-6 pt-5 border-t border-[#E2E8F0] dark:border-[#27272A]">
          <div className="flex justify-between text-[13px] font-bold mb-2">
            <span className="text-[#516B8B] dark:text-[#E5E7EB] flex items-center gap-1"><Award size={16}/> Level 4 Citizen</span>
            <span className="text-[#6B7280] dark:text-[#A1A1AA]">{xp} / {nextLevel} XP</span>
          </div>
          <div className="w-full h-3 bg-[#F8F9FC] dark:bg-[#09090B] rounded-full overflow-hidden">
            <div className="h-full bg-gradient-to-r from-[#516B8B] to-[#FFD166] dark:from-[#52525B] dark:to-[#F59E0B] rounded-full" style={{ width: `${progress}%` }} />
          </div>
        </div>
      </div>

      {/* HERO IMPACT SCORE */}
      <div className="bg-[#516B8B] dark:bg-[#27272A] rounded-[24px] p-5 text-white shadow-[0_10px_30px_rgba(81,107,139,0.3)] dark:shadow-none flex items-center justify-between relative overflow-hidden">
        {/* Abstract Background Shapes */}
        <div className="absolute -right-6 -top-6 w-24 h-24 bg-white/10 rounded-full blur-xl"></div>
        <div className="absolute right-10 -bottom-10 w-20 h-20 bg-[#FFD166]/20 rounded-full blur-xl"></div>
        
        <div className="relative z-10">
          <p className="text-[#E2E8F0] dark:text-[#A1A1AA] text-[12px] font-bold uppercase tracking-wider mb-0.5">City Impact Score</p>
          <div className="text-[32px] font-black leading-none tracking-tight dark:text-white" style={{fontFamily: 'var(--font-jakarta)'}}>
            8,450 <span className="text-[16px] font-semibold text-[#E2E8F0] dark:text-[#A1A1AA]">pts</span>
          </div>
        </div>
        <div className="w-14 h-14 bg-white/20 dark:bg-[#3F3F46]/50 rounded-[16px] flex items-center justify-center backdrop-blur-md relative z-10 shadow-sm border border-white/10 dark:border-white/5">
          <Zap size={28} className="text-white" fill="currentColor" />
        </div>
      </div>

      {/* STATS GRID */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-white dark:bg-[#18181B] border border-[#E2E8F0] dark:border-transparent rounded-[20px] p-4 text-center shadow-sm">
          <Target size={24} className="text-[#516B8B] dark:text-[#E5E7EB] mx-auto mb-2" />
          <p className="text-[24px] font-black text-[#1E293B] dark:text-[#E5E7EB] leading-none" style={{fontFamily: 'var(--font-jakarta)'}}>12</p>
          <p className="text-[11px] text-[#6B7280] dark:text-[#A1A1AA] font-bold uppercase mt-1">Filed</p>
        </div>
        <div className="bg-white dark:bg-[#18181B] border border-[#E2E8F0] dark:border-transparent rounded-[20px] p-4 text-center shadow-sm">
          <CheckCircle size={24} className="text-[#10B981] mx-auto mb-2" />
          <p className="text-[24px] font-black text-[#1E293B] dark:text-[#E5E7EB] leading-none" style={{fontFamily: 'var(--font-jakarta)'}}>8</p>
          <p className="text-[11px] text-[#6B7280] dark:text-[#A1A1AA] font-bold uppercase mt-1">Resolved</p>
        </div>
        <div className="bg-white dark:bg-[#18181B] border border-[#E2E8F0] dark:border-transparent rounded-[20px] p-4 text-center shadow-sm">
          <Shield size={24} className="text-[#F59E0B] mx-auto mb-2" />
          <p className="text-[24px] font-black text-[#1E293B] dark:text-[#E5E7EB] leading-none" style={{fontFamily: 'var(--font-jakarta)'}}>45</p>
          <p className="text-[11px] text-[#6B7280] dark:text-[#A1A1AA] font-bold uppercase mt-1">Verifications</p>
        </div>
      </div>

      {/* HORIZONTAL BADGES */}
      <div>
        <h2 className="text-[15px] font-black text-[#1E293B] dark:text-[#E5E7EB] mb-3 px-1" style={{fontFamily: 'var(--font-jakarta)'}}>Achievements</h2>
        <div 
          className="flex overflow-x-auto gap-3 pb-4 snap-x hide-scrollbar" 
          style={{ scrollbarWidth: 'none' }}
          /* THE FIX: Stop the swipe from bubbling up to the page navigator */
          onTouchStart={(e) => e.stopPropagation()}
          onTouchMove={(e) => e.stopPropagation()}
          onTouchEnd={(e) => e.stopPropagation()}
        >
          {badges.map(badge => (
            <div 
              key={badge.id} 
              className={`snap-center shrink-0 w-[140px] bg-white dark:bg-[#18181B] border rounded-[20px] p-5 flex flex-col items-center text-center transition-all ${
                badge.earned 
                  ? 'border-[#FFE4A0] dark:border-[#78350F] shadow-[0_4px_20px_rgba(245,158,11,0.15)]' 
                  : 'border-[#E2E8F0] dark:border-[#27272A] opacity-60 grayscale'
              }`}
            >
              <div className="text-[40px] mb-3 drop-shadow-md">{badge.icon}</div>
              <h3 className={`text-[13px] font-bold leading-tight ${badge.earned ? 'text-[#D97706] dark:text-[#FCD34D]' : 'text-[#6B7280] dark:text-[#A1A1AA]'}`}>{badge.name}</h3>
              <p className="text-[11px] text-[#9CA3AF] dark:text-[#71717A] mt-1.5 leading-tight">{badge.desc}</p>
            </div>
          ))}
        </div>
      </div>
      
    </main>
  );
}