"use client";

import dynamic from "next/dynamic";
import { Loader2 } from "lucide-react";

const CommunityMap = dynamic(() => import("../../components/CommunityMap"), {
  ssr: false,
  loading: () => (
    <div className="w-full h-full flex flex-col items-center justify-center bg-[#FCFAF5] dark:bg-[#09090B]">
      <Loader2 size={32} className="text-[#516B8B] dark:text-[#E5E7EB] animate-spin" />
      <p className="text-[#6B7280] dark:text-[#A1A1AA] font-bold text-sm mt-3">Loading civic data...</p>
    </div>
  ),
});

export default function MapPage() {
  return (
    <main className="w-full h-[calc(100vh-76px)] bg-[#FCFAF5] dark:bg-[#09090B]">
      <CommunityMap />
    </main>
  );
}