"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/AuthProvider";
import { PunchCard } from "@/components/PunchCard";
import { getTodaySchedule, formatScheduleTime } from "@/components/ScheduleForm";
import { ChevronLeft, Home as HomeIcon, Coffee, Briefcase } from "lucide-react";
import Link from "next/link";
import { usePunchCard, formatDuration } from "@/hooks/usePunchCard";

export default function Home() {
  const router = useRouter();
  const { user, schedule, loading: authLoading } = useAuth();
  const [widgetChecked, setWidgetChecked] = useState(true);
  
  const { 
    logs, 
    isClockedIn, 
    isPaused, 
    activeWorkStart, 
    activeBreakStart, 
    totalWorkedMs, 
    totalBreakMs, 
    toggleBreak,
    loading: logsLoading 
  } = usePunchCard();

  const [currentWorkMs, setCurrentWorkMs] = useState(0);

  // Update current work session time every second
  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (isClockedIn && !isPaused && activeWorkStart) {
      interval = setInterval(() => {
        setCurrentWorkMs(Date.now() - activeWorkStart);
      }, 1000);
    } else {
      setCurrentWorkMs(0);
    }
    return () => clearInterval(interval);
  }, [isClockedIn, isPaused, activeWorkStart]);

  useEffect(() => {
    if (!authLoading && !user) {
      router.replace("/login");
    }
  }, [user, authLoading, router]);

  if (authLoading || logsLoading || !user) {
    return (
      <main className="flex min-h-dvh items-center justify-center pb-20">
        <p className="text-white">Cargando...</p>
      </main>
    );
  }

  const todaySchedule = getTodaySchedule(schedule ?? undefined);
  const now = new Date();
  const monthName = now.toLocaleDateString("es-ES", { month: "long" }).toUpperCase();
  const yearName = now.getFullYear();
  const dayName = now.toLocaleDateString("es-ES", { weekday: "long" });
  const dayNameCapitalized = dayName.charAt(0).toUpperCase() + dayName.slice(1);
  
  // Format total strings
  const totalWorkedStr = formatDuration(totalWorkedMs + currentWorkMs)
    .replace(':', 'h ')
    .replace(':', 'min ')
    .slice(0, -3); // Remove seconds

  // Extract only today's logs for the widget
  const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  
  // Reconstruct work blocks to show in the list
  const getTodayWorkBlocks = () => {
    const blocks: { start: number, end: number | null, ms: number }[] = [];
    let currentStart: number | null = null;
    
    // Sort logs just in case
    const todayLogs = logs.filter(l => {
      const d = new Date(l.timestamp);
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}` === todayStr;
    }).sort((a,b) => a.timestamp - b.timestamp);

    for (const log of todayLogs) {
      if (log.type === "IN") {
        currentStart = log.timestamp;
      } else if (log.type === "OUT" || log.type === "BREAK_START") {
        if (currentStart) {
          blocks.push({ start: currentStart, end: log.timestamp, ms: log.timestamp - currentStart });
          currentStart = null;
        }
      } else if (log.type === "BREAK_END") {
        currentStart = log.timestamp;
      }
    }
    
    // Ongoing block
    if (currentStart !== null) {
      blocks.push({ start: currentStart, end: null, ms: Date.now() - currentStart });
    }
    
    return blocks.reverse(); // Newest first
  };

  const todayBlocks = getTodayWorkBlocks();

  return (
    <main className="flex flex-col flex-1 w-full">
      {/* Dark Header Area */}
      <div className="flex h-[80px] items-center px-4 relative justify-center text-white shrink-0">
        <button className="absolute left-4 w-10 h-10 bg-white text-primary rounded-[12px] flex items-center justify-center shadow-sm">
          <ChevronLeft className="w-5 h-5" />
        </button>
        <h1 className="text-lg font-medium tracking-wide">Fichar</h1>
      </div>

      {/* Main White Card Context */}
      <div className="flex-1 bg-surface rounded-t-[32px] px-5 py-6 shadow-[0_-10px_30px_-15px_rgba(0,0,0,0.3)] min-h-[calc(100vh-80px)] w-full flex flex-col">
        <PunchCard />

        {/* Date Divider */}
        <div className="flex items-center mt-6 mb-6">
          <div className="h-px bg-border flex-1" />
          <span className="px-3 text-xs font-medium text-[#f472b6] tracking-[0.15em] leading-none">
            {monthName} {yearName}
          </span>
          <div className="h-px bg-border flex-1" />
        </div>

        {/* Schedule Card */}
        <div className="rounded-2xl bg-white border border-[#fce7f3] shadow-sm p-4 mb-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-primary text-white flex items-center justify-center font-medium shadow-sm">
                {String(now.getDate()).padStart(2, "0")}
              </div>
              <div className="flex flex-col">
                <span className="text-primary font-semibold leading-tight">{dayNameCapitalized}</span>
                <span className="text-[#a1a7b5] text-xs">
                  {todaySchedule ? formatScheduleTime(todaySchedule) : "Sin horario"}
                </span>
              </div>
            </div>
            <div className="flex flex-col items-end">
              <span className="text-primary font-medium text-[15px] leading-tight flex items-center gap-1">
                {isClockedIn && !isPaused && <span className="w-1.5 h-1.5 rounded-full bg-success absolute -ml-3 animate-pulse" />}
                {totalWorkedStr}
              </span>
              <span className="text-[#a1a7b5] text-xs">/ {todaySchedule ? "08h 00min" : "00h 00min"}</span>
            </div>
          </div>

          <div className="mt-5">
            <h3 className="text-[14px] font-bold text-primary mb-3 flex justify-between items-center">
              Mis fichajes de hoy
              {todayBlocks.length > 0 && <span className="text-xs font-normal text-muted">{todayBlocks.length} registros</span>}
            </h3>
            
            {todayBlocks.length === 0 ? (
              <div className="text-center py-4 bg-[#f8f9fa] rounded-2xl border border-dashed border-[#eef0f3] text-muted text-sm">
                No hay fichajes de trabajo hoy.
              </div>
            ) : (
              <div className="space-y-2 max-h-[160px] overflow-y-auto pr-1 custom-scrollbar">
                {todayBlocks.map((block, idx) => {
                  const sDate = new Date(block.start);
                  const sTime = `${String(sDate.getHours()).padStart(2, "0")}:${String(sDate.getMinutes()).padStart(2, "0")}`;
                  
                  let eTime = "(en curso)";
                  let isOngoing = true;
                  
                  if (block.end) {
                    const eDate = new Date(block.end);
                    eTime = `${String(eDate.getHours()).padStart(2, "0")}:${String(eDate.getMinutes()).padStart(2, "0")}`;
                    isOngoing = false;
                  }
                  
                  // For ongoing block, use dynamic time
                  const msToUse = isOngoing ? Date.now() - block.start : block.ms;
                  let durationStr = formatDuration(msToUse).slice(0, 5); // Just HH:mm
                  if (durationStr.startsWith("00:")) {
                    durationStr = durationStr.substring(3) + "m";
                  } else {
                    durationStr = durationStr.replace(":", "h ") + "m";
                  }

                  return (
                    <div key={idx} className="border border-[#eef0f3] rounded-2xl flex items-center justify-between px-4 py-3 bg-white">
                      <div className="flex items-center gap-2">
                        <span className={`w-2.5 h-2.5 rounded-full ${isOngoing && !isPaused ? 'bg-success animate-pulse' : 'bg-[#ffc36a]'}`} />
                        <span className="text-[#65778f] text-sm">
                          {sTime} - <span className={isOngoing ? "italic" : ""}>{eTime}</span>
                        </span>
                      </div>
                      <span className="text-primary text-sm font-medium">{durationStr}</span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>


        {/* Buttons */}
        <div className="flex flex-col gap-3">
          {/* Pausa/Café button */}
          <button
            onClick={toggleBreak}
            disabled={!isClockedIn}
            className={`w-full font-medium py-[18px] rounded-2xl flex items-center justify-center text-[15px] shadow-sm transition-colors border ${
              !isClockedIn 
                ? 'bg-surface text-muted border-border cursor-not-allowed hidden' 
                : isPaused 
                  ? 'bg-primary text-white hover:bg-primary-light border-transparent' 
                  : 'bg-white text-secondary border-[#eef0f3] hover:bg-surface'
            }`}
          >
            {isPaused ? (
              <><Briefcase className="w-5 h-5 mr-2" /> Volver al trabajo</>
            ) : (
              <><Coffee className="w-5 h-5 mr-2" /> Ausencia / Café</>
            )}
          </button>
          
          <Link
            href="/fichajes"
            className="w-full bg-primary hover:bg-primary-light text-white font-medium py-[18px] rounded-2xl flex items-center justify-center text-[15px] shadow-sm transition-colors border border-transparent"
          >
            Ir a mis fichajes
          </Link>
        </div>
      </div>
    </main>
  );
}
