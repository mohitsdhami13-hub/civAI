"use client";

import { useState, useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import { Camera, LayoutList, Map as MapIcon, User } from "lucide-react";

const routes = ["/", "/dashboard", "/map", "/profile"];

export default function NavigationWrapper({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  
  const [touchStart, setTouchStart] = useState<{ x: number; y: number } | null>(null);
  const [touchEnd, setTouchEnd] = useState<{ x: number; y: number } | null>(null);
  
  const [activeRoute, setActiveRoute] = useState(pathname);
  const [slideDir, setSlideDir] = useState<"left" | "right" | "none">("none");

  useEffect(() => {
    setActiveRoute(pathname);
  }, [pathname]);

  const minSwipeDistance = 75; 

  const onTouchStart = (e: React.TouchEvent) => {
    setTouchEnd(null);
    setTouchStart({ 
      x: e.targetTouches[0].clientX, 
      y: e.targetTouches[0].clientY 
    });
  };

  const onTouchMove = (e: React.TouchEvent) => {
    setTouchEnd({ 
      x: e.targetTouches[0].clientX, 
      y: e.targetTouches[0].clientY 
    });
  };

  const onTouchEndHandler = () => {
    if (!touchStart || !touchEnd) return;
    
    if (pathname === '/map' || pathname.startsWith('/track/')) return;

    const deltaX = touchStart.x - touchEnd.x;
    const deltaY = touchStart.y - touchEnd.y;

    const isHorizontalSwipe = Math.abs(deltaX) > Math.abs(deltaY) * 1.5;

    if (isHorizontalSwipe) {
      const isLeftSwipe = deltaX > minSwipeDistance;
      const isRightSwipe = deltaX < -minSwipeDistance;

      const currentIndex = routes.indexOf(pathname);
      if (currentIndex === -1) return; 

      if (isLeftSwipe && currentIndex < routes.length - 1) {
        const next = routes[currentIndex + 1];
        setActiveRoute(next);
        setSlideDir("left"); 
        router.push(next);
      }
      if (isRightSwipe && currentIndex > 0) {
        const prev = routes[currentIndex - 1];
        setActiveRoute(prev); 
        setSlideDir("right"); 
        router.push(prev);
      }
    }
  };

  const navItems = [
    { path: "/", icon: Camera, label: "Report" },
    { path: "/dashboard", icon: LayoutList, label: "Reports" },
    { path: "/map", icon: MapIcon, label: "Map" },
    { path: "/profile", icon: User, label: "Me" },
  ];

  const hideNav = pathname.startsWith('/track/');

  let animClass = "animate-in fade-in duration-500 ease-out";
  if (slideDir === "left") animClass += " slide-in-from-right-12";
  if (slideDir === "right") animClass += " slide-in-from-left-12";

  return (
    <div 
      className="flex flex-col min-h-[100dvh] w-full overflow-x-hidden"
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEndHandler}
    >
      <div key={pathname} className={`flex-1 w-full max-w-md mx-auto ${animClass}`}>
        {children}
      </div>

      {!hideNav && (
        <nav className="fixed bottom-0 left-0 right-0 z-50 bg-white/95 dark:bg-[#18181B]/95 backdrop-blur-2xl border-t border-[#E2E8F0] dark:border-[#27272A] pb-safe shadow-[0_-4px_24px_rgba(0,0,0,0.06)] transition-colors">
          <div className="flex items-center justify-around h-[76px] max-w-md mx-auto px-2">
            {navItems.map((item) => {
              const isActive = activeRoute === item.path;
              const Icon = item.icon;
              return (
                <Link 
                  key={item.path}
                  href={item.path} 
                  onClick={() => {
                    const currIdx = routes.indexOf(activeRoute);
                    const nextIdx = routes.indexOf(item.path);
                    setActiveRoute(item.path);
                    setSlideDir(nextIdx > currIdx ? "left" : "right");
                  }}
                  className={`flex flex-col items-center justify-center w-1/4 gap-1 transition-all duration-300 active:scale-90 ${
                    isActive 
                      ? "text-[#516B8B] dark:text-[#E5E7EB] scale-110 drop-shadow-md" 
                      : "text-[#9CA3AF] dark:text-[#52525B] hover:text-[#516B8B] dark:hover:text-[#E5E7EB]"
                  }`}
                >
                  <Icon size={24} strokeWidth={isActive ? 2.5 : 2} className="transition-transform duration-300" />
                  <span className={`text-[11px] tracking-wide transition-all duration-300 ${isActive ? "font-bold" : "font-medium"}`}>
                    {item.label}
                  </span>
                </Link>
              );
            })}
          </div>
        </nav>
      )}
    </div>
  );
}