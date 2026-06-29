"use client";

import { useState, useEffect } from "react";
import { Download, X } from "lucide-react";

export default function InstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [showPrompt, setShowPrompt] = useState(false);

  useEffect(() => {
    const isDismissed = localStorage.getItem("pwa-prompt-dismissed");
    
    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e);
      if (!isDismissed) setShowPrompt(true);
    };

    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    return () => window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
  }, []);

  const handleInstall = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') {
      setShowPrompt(false);
    }
    setDeferredPrompt(null);
  };

  const handleDismiss = () => {
    localStorage.setItem("pwa-prompt-dismissed", "true");
    setShowPrompt(false);
  };

  if (!showPrompt) return null;

  return (
    <div className="fixed top-16 left-0 right-0 z-40 p-4 bg-emerald-900/95 backdrop-blur-md border-b border-emerald-500/50 flex items-center justify-between shadow-xl">
      <div className="flex flex-col">
        <span className="text-white font-bold text-[16px]">Install CivicAI</span>
        <span className="text-emerald-200 text-sm">Add to home screen for offline use</span>
      </div>
      <div className="flex items-center gap-3">
        <button onClick={handleInstall} className="bg-emerald-500 text-slate-950 px-4 py-3 rounded-lg font-bold flex items-center gap-2 min-h-[48px] min-w-[48px]">
          <Download size={18} /> Add
        </button>
        <button onClick={handleDismiss} className="text-emerald-200 p-2 rounded-full min-h-[48px] min-w-[48px] flex justify-center items-center">
          <X size={24} />
        </button>
      </div>
    </div>
  );
}