"use client";

import { useState, useEffect, useRef } from "react";
import { Bell, X, CheckCircle, Info } from "lucide-react";

export default function NotificationBell() {
  const [hasUnread, setHasUnread] = useState(true);
  const [isOpen, setIsOpen] = useState(false);

  const dragRef = useRef({ x: 0, y: 0, isDragging: false });

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => { document.body.style.overflow = ''; };
  }, [isOpen]);

  // --- Strict Swipe vs Tap Detection ---
  const handleTouchStart = (e: React.TouchEvent) => {
    dragRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY, isDragging: false };
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    const deltaX = Math.abs(e.touches[0].clientX - dragRef.current.x);
    const deltaY = Math.abs(e.touches[0].clientY - dragRef.current.y);
    // If finger moves more than 10px, classify it as a swipe, NOT a tap
    if (deltaX > 10 || deltaY > 10) {
      dragRef.current.isDragging = true;
    }
  };

  const handleOpen = (e: React.MouseEvent) => {
    // If the user was swiping the screen, ignore the click!
    if (dragRef.current.isDragging) {
      e.preventDefault();
      return;
    }
    setIsOpen(true);
    setHasUnread(false);
  };

  // --- Swipe-to-close logic for the drawer itself ---
  const [drawerTouchStart, setDrawerTouchStart] = useState(0);
  const handleDrawerTouchStart = (e: React.TouchEvent) => setDrawerTouchStart(e.touches[0].clientX);
  const handleDrawerTouchEnd = (e: React.TouchEvent) => {
    if (e.changedTouches[0].clientX - drawerTouchStart > 60) setIsOpen(false); // Swipe right to close
  };

  return (
    <>
      <button 
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onClick={handleOpen}
        className="relative w-11 h-11 rounded-full bg-[#FFF3D6] dark:bg-[#27272A] flex items-center justify-center text-[#F59E0B] dark:text-[#E5E7EB] transition-colors active:scale-95 shadow-sm"
        aria-label="View Notifications"
      >
        <Bell size={20} />
        {hasUnread && (
          <span className="absolute top-3 right-3 w-2.5 h-2.5 bg-[#EF4444] border-2 border-[#FFF3D6] dark:border-[#27272A] rounded-full animate-pulse" />
        )}
      </button>

      {/* BACKGROUND BLUR OVERLAY */}
      {isOpen && (
        <div 
          className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[9998] animate-in fade-in duration-300"
          onClick={() => setIsOpen(false)}
        />
      )}

      {/* SLIDE-IN DASHBOARD DRAWER */}
      <div 
        onTouchStart={handleDrawerTouchStart}
        onTouchEnd={handleDrawerTouchEnd}
        className={`fixed top-0 right-0 h-[100dvh] w-[85%] max-w-[360px] bg-[#FCFAF5] dark:bg-[#09090B] shadow-[-10px_0_40px_rgba(0,0,0,0.15)] dark:shadow-[-10px_0_40px_rgba(0,0,0,0.8)] z-[9999] transform transition-transform duration-300 ease-out flex flex-col ${
          isOpen ? "translate-x-0" : "translate-x-full"
        }`}
      >
        {/* Drawer Header */}
        <div className="flex items-center justify-between p-5 border-b border-[#E2E8F0] dark:border-[#27272A] bg-[#FCFAF5] dark:bg-[#09090B]">
          <h2 className="text-[18px] font-black text-[#1E293B] dark:text-[#E5E7EB]" style={{fontFamily: 'var(--font-jakarta)'}}>
            Notifications
          </h2>
          <button 
            onClick={() => setIsOpen(false)}
            className="w-9 h-9 rounded-full bg-[#E2E8F0] dark:bg-[#18181B] flex items-center justify-center text-[#6B7280] dark:text-[#A1A1AA] active:scale-90 transition-transform"
          >
            <X size={18} />
          </button>
        </div>

        {}
        <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-3">
          
          {}
          <div className="bg-white dark:bg-[#18181B] border border-[#E2E8F0] dark:border-[#27272A] rounded-[20px] p-4 flex gap-4 shadow-sm relative overflow-hidden">
            {}
            {hasUnread && <div className="absolute top-4 right-4 w-2 h-2 bg-[#EF4444] rounded-full"></div>}
            
            <div className="w-10 h-10 rounded-full bg-[#D1FAE5] dark:bg-[#064E3B] flex items-center justify-center shrink-0">
              <CheckCircle size={20} className="text-[#10B981]" />
            </div>
            <div className="pr-4">
              <h4 className="font-bold text-[14px] text-[#1E293B] dark:text-[#E5E7EB] leading-tight">CivicAI Milestone Alert</h4>
              <p className="text-[13px] text-[#6B7280] dark:text-[#A1A1AA] mt-1 leading-relaxed">
                247 community issues have been resolved near you this week!
              </p>
              <span className="text-[10px] font-bold text-[#516B8B] dark:text-[#71717A] uppercase tracking-wider mt-2 block">Just now</span>
            </div>
          </div>

          {}
          <div className="bg-white dark:bg-[#18181B] border border-[#E2E8F0] dark:border-[#27272A] rounded-[20px] p-4 flex gap-4 shadow-sm opacity-70">
            <div className="w-10 h-10 rounded-full bg-[#E2E8F0] dark:bg-[#27272A] flex items-center justify-center shrink-0">
              <Info size={20} className="text-[#516B8B] dark:text-[#E5E7EB]" />
            </div>
            <div>
              <h4 className="font-bold text-[14px] text-[#1E293B] dark:text-[#E5E7EB] leading-tight">Welcome to CivicAI</h4>
              <p className="text-[13px] text-[#6B7280] dark:text-[#A1A1AA] mt-1 leading-relaxed">
                Spot it, report it, fix it. Tap the camera icon below to log your very first hazard.
              </p>
              <span className="text-[10px] font-bold text-[#9CA3AF] dark:text-[#71717A] uppercase tracking-wider mt-2 block">2 days ago</span>
            </div>
          </div>
          
        </div>
      </div>
    </>
  );
}