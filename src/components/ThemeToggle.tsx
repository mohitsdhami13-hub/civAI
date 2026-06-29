"use client";

import { useState, useEffect } from "react";
import { Moon, Sun } from "lucide-react";

export default function ThemeToggle() {
  const [isDark, setIsDark] = useState(true);

  useEffect(() => {
    const savedTheme = localStorage.getItem('theme');
    if (savedTheme === 'light') {
      setIsDark(false);
      document.documentElement.classList.remove("dark");
    } else {
      setIsDark(true);
      document.documentElement.classList.add("dark");
    }
  }, []);

  const toggleTheme = () => {
    const htmlEl = document.documentElement;
    if (isDark) {
      htmlEl.classList.remove("dark");
      localStorage.setItem('theme', 'light');
      setIsDark(false);
    } else {
      htmlEl.classList.add("dark");
      localStorage.setItem('theme', 'dark');
      setIsDark(true);
    }
  };

  return (
    <button 
      onClick={toggleTheme}
      className="w-11 h-11 rounded-full bg-[#E2E8F0] dark:bg-[#27272A] flex items-center justify-center text-[#516B8B] dark:text-[#E5E7EB] transition-colors active:scale-95 shadow-sm"
      aria-label="Toggle Dark Mode"
    >
      {isDark ? <Sun size={20} /> : <Moon size={20} />}
    </button>
  );
}