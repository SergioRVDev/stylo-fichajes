"use client";

import { usePathname } from "next/navigation";
import { BottomNav } from "@/components/BottomNav";

export function ClientLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isInspector = pathname === "/inspector";

  if (isInspector) {
    return <div className="w-full min-h-dvh bg-slate-50">{children}</div>;
  }

  return (
    <div className="relative min-h-dvh bg-[#fdf2f8] overflow-hidden">
      <div className="absolute top-0 left-0 w-full h-[400px] pointer-events-none z-0 overflow-hidden flex justify-center">
        <div className="relative w-full max-w-lg h-full">
          {/* Abstract background shapes mimicking the image */}
          <svg viewBox="0 0 400 300" className="absolute top-[-20%] left-[-15%] w-[130%] opacity-80" preserveAspectRatio="none">
            <path d="M0,0 L400,0 L400,200 Q250,50 150,250 Q50,200 0,300 Z" fill="#fbcfe8" />
            <path d="M-50,-50 L350,-50 L250,150 Q120,50 0,220 Z" fill="#f9a8d4" />
            <path d="M150,-50 L450,-50 L450,100 Q300,100 200,250 Z" fill="#f472b6" />
          </svg>
        </div>
      </div>

      <div className="mx-auto min-h-dvh w-full max-w-lg relative z-10 pb-20 flex flex-col pt-safe">
        {children}
      </div>
      <BottomNav />
    </div>
  );
}
