import type { Metadata, Viewport } from "next";
import { Plus_Jakarta_Sans, Nunito } from "next/font/google";
import "./globals.css";
import Link from "next/link";
import { TriangleAlert } from "lucide-react";
import InstallPrompt from "../components/InstallPrompt";
import ThemeToggle from "../components/ThemeToggle";
import NotificationBell from "../components/NotificationBell";
import NavigationWrapper from "../components/NavigationWrapper";

const jakarta = Plus_Jakarta_Sans({ subsets: ["latin"], variable: '--font-jakarta', display: 'swap' });
const nunito = Nunito({ subsets: ["latin"], variable: '--font-nunito', display: 'swap' });

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#FCFAF5" },
    { media: "(prefers-color-scheme: dark)", color: "#09090B" }
  ],
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  // FIX (keyboard/layout breakage on real phones):
  // Without this, mobile keyboards push the viewport instead of resizing it,
  // which is why the textarea broke the layout on real devices but looked
  // fine in Chrome DevTools (which doesn't simulate a real OS keyboard).
  // This tells supporting browsers (Chrome/Android, Safari 17+) to resize
  // the content area when the keyboard opens, instead of overlaying it.
  // interactiveWidget is a valid Next.js Viewport field as of Next 14+.
  interactiveWidget: "resizes-content",
};

export const metadata: Metadata = {
  title: "CivicAI",
  description: "Spot it. Report it. Fix your city together.",
  manifest: "/manifest.json",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark" suppressHydrationWarning>
      {/*
        FIX (blank space / double-dvh fight on real phones):
        Body keeps min-h-[100dvh] as the single height authority for the
        whole shell. page.tsx no longer also declares min-h-[100dvh] on
        <main> — two nested 100dvh elements is what produced the leftover
        blank gap on real mobile Chrome/Samsung Internet (their dvh
        recalculates on URL-bar show/hide, and nesting it doubles the
        timing mismatch). DevTools device-toolbar never reproduces this
        because it doesn't simulate a real collapsing browser chrome.
      */}
      <body className={`${jakarta.variable} ${nunito.variable} font-body bg-[#FCFAF5] dark:bg-[#09090B] text-[#1E293B] dark:text-[#E5E7EB] min-h-[100dvh] flex flex-col overflow-x-hidden transition-colors duration-300`}>

        {/* TOP HEADER */}
        <nav className="sticky top-0 z-50 bg-[#FCFAF5]/90 dark:bg-[#09090B]/90 backdrop-blur-xl px-5 h-20 flex items-center justify-between transition-colors border-b border-transparent dark:border-[#27272A]">
          <Link href="/" className="flex items-center gap-2.5">
            <div className="bg-[#E2E8F0] dark:bg-[#27272A] p-2 rounded-xl">
              <TriangleAlert size={18} className="text-[#516B8B] dark:text-[#E5E7EB]" strokeWidth={2.5} />
            </div>
            <span className="font-bold text-[22px] tracking-tight text-[#1E293B] dark:text-[#E5E7EB]" style={{ fontFamily: 'var(--font-jakarta)' }}>
              CivicAI
            </span>
          </Link>

          <div className="flex items-center gap-3">
            <ThemeToggle />
            <NotificationBell />
          </div>
        </nav>

        <InstallPrompt />

        {/* SWIPE WRAPPER & DYNAMIC NAV */}
        <NavigationWrapper>
          {children}
        </NavigationWrapper>

      </body>
    </html>
  );
}