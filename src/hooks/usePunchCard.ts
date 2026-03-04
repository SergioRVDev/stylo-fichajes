"use client";

import { useEffect, useState, useCallback } from "react";
import { useAuth } from "@/components/AuthProvider";
import {
  writeTimeLog,
  subscribeToDayLogs,
  registerEmployee,
} from "@/lib/firebase/database";
import type { TimeLog } from "@/types";

const DEFAULT_COMPANY_ID = "default";



export function formatDuration(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function getTodayDate(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getYesterdayDate(): string {
  const yesterday = new Date(Date.now() - 86400000);
  const year = yesterday.getFullYear();
  const month = String(yesterday.getMonth() + 1).padStart(2, "0");
  const day = String(yesterday.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

interface Interval { type: "WORK" | "BREAK"; date: string; start: number; end: number | null; ms: number; }

function processLogs(logs: TimeLog[]): Interval[] {
  const raw: { type: "WORK"|"BREAK", start: number, end: number | null }[] = [];
  let currentMode: "WORK" | "BREAK" | null = null;
  let modeStart: number | null = null;

  for (const l of logs) {
    if (l.type === "IN") {
      if (currentMode === null) { currentMode = "WORK"; modeStart = l.timestamp; }
    } else if (l.type === "BREAK_START") {
      if (currentMode === "WORK" && modeStart !== null) {
        raw.push({ type: "WORK", start: modeStart, end: l.timestamp });
        currentMode = "BREAK"; modeStart = l.timestamp;
      }
    } else if (l.type === "BREAK_END") {
      if (currentMode === "BREAK" && modeStart !== null) {
        raw.push({ type: "BREAK", start: modeStart, end: l.timestamp });
        currentMode = "WORK"; modeStart = l.timestamp;
      }
    } else if (l.type === "OUT") {
      if (currentMode !== null && modeStart !== null) {
        raw.push({ type: currentMode, start: modeStart, end: l.timestamp });
        currentMode = null; modeStart = null;
      }
    }
  }

  if (currentMode !== null && modeStart !== null) {
    raw.push({ type: currentMode, start: modeStart, end: null });
  }

  const out: Interval[] = [];
  for (const r of raw) {
    const end = r.end ?? Date.now();
    let cursor = r.start;

    while (cursor < end) {
      const curDate = new Date(cursor);
      const nextMidnight = new Date(curDate.getFullYear(), curDate.getMonth(), curDate.getDate() + 1).getTime();
      const segEnd = Math.min(end, nextMidnight);
      const isLast = segEnd === end;
      
      const dateStr = `${curDate.getFullYear()}-${String(curDate.getMonth() + 1).padStart(2, "0")}-${String(curDate.getDate()).padStart(2, "0")}`;

      out.push({
        type: r.type,
        date: dateStr,
        start: cursor,
        end: isLast && r.end === null ? null : segEnd,
        ms: r.end === null && isLast ? 0 : segEnd - cursor,
      });

      cursor = nextMidnight;
    }
  }
  return out;
}

export function computeStatus(logs: (TimeLog & { id: string })[], targetDate: string) {
  const intervals = processLogs(logs);
  
  let isClockedIn = false;
  let isPaused = false;

  if (intervals.length > 0) {
    const ongoing = intervals.find(i => i.end === null);
    if (ongoing) {
      isClockedIn = true;
      if (ongoing.type === "BREAK") {
        isPaused = true;
      }
    }
  }

  const todayIntervals = intervals.filter(i => i.date === targetDate);
  const totalWorkedMs = todayIntervals.filter(i => i.type === "WORK").reduce((sum, i) => sum + i.ms, 0);
  const totalBreakMs = todayIntervals.filter(i => i.type === "BREAK").reduce((sum, i) => sum + i.ms, 0);

  let todayActiveWorkStart: number | null = null;
  let todayActiveBreakStart: number | null = null;

  if (isClockedIn) {
    const todayOngoing = todayIntervals.find(i => i.end === null);
    if (todayOngoing) {
      if (todayOngoing.type === "WORK") todayActiveWorkStart = todayOngoing.start;
      if (todayOngoing.type === "BREAK") todayActiveBreakStart = todayOngoing.start;
    }
  }

  return {
    isClockedIn,
    isPaused,
    activeWorkStart: todayActiveWorkStart,
    activeBreakStart: todayActiveBreakStart,
    totalWorkedMs,
    totalBreakMs,
  };
}

export function usePunchCard() {
  const { user } = useAuth();
  const [isClockedIn, setIsClockedIn] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [logs, setLogs] = useState<(TimeLog & { id: string })[]>([]);
  const [activeWorkStart, setActiveWorkStart] = useState<number | null>(null);
  const [activeBreakStart, setActiveBreakStart] = useState<number | null>(null);
  const [totalWorkedMs, setTotalWorkedMs] = useState(0);
  const [totalBreakMs, setTotalBreakMs] = useState(0);

  const [loading, setLoading] = useState(true);
  const [punching, setPunching] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!user) return;

    if (user.email) {
      registerEmployee(DEFAULT_COMPANY_ID, user.uid, user.email).catch(() => {});
    }

    const today = getTodayDate();
    const yesterday = getYesterdayDate();

    let yesterdayLogs: (TimeLog & { id: string })[] = [];
    let todayLogs: (TimeLog & { id: string })[] = [];

    let yesterdayLoaded = false;
    let todayLoaded = false;

    const updateCombined = () => {
      if (!yesterdayLoaded || !todayLoaded) return;
      const combined = [...yesterdayLogs, ...todayLogs].sort((a, b) => a.timestamp - b.timestamp);
      const status = computeStatus(combined, today);
      
      setLogs(combined);
      setIsClockedIn(status.isClockedIn);
      setIsPaused(status.isPaused);
      setActiveWorkStart(status.activeWorkStart);
      setActiveBreakStart(status.activeBreakStart);
      setTotalWorkedMs(status.totalWorkedMs);
      setTotalBreakMs(status.totalBreakMs);
      
      setLoading(false);
      setPunching(false);
    };

    const unsubYest = subscribeToDayLogs(DEFAULT_COMPANY_ID, user.uid, yesterday, (incoming) => {
      yesterdayLogs = incoming;
      yesterdayLoaded = true;
      updateCombined();
    }, (err) => { setError(err.message); setLoading(false); });

    const unsubToday = subscribeToDayLogs(DEFAULT_COMPANY_ID, user.uid, today, (incoming) => {
      todayLogs = incoming;
      todayLoaded = true;
      updateCombined();
    }, (err) => { setError(err.message); setLoading(false); });

    return () => {
      unsubYest();
      unsubToday();
    };
  }, [user]);

  const punch = useCallback(async () => {
    if (!user || punching) return;
    
    if (isClockedIn && isPaused) {
      setError("Debes finalizar la pausa antes de fichar la salida.");
      return;
    }

    setError("");
    setPunching(true);
    try {
      const type = isClockedIn ? "OUT" : "IN";
      await writeTimeLog(DEFAULT_COMPANY_ID, user.uid, type, true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al fichar");
      setPunching(false);
    }
  }, [user, isClockedIn, isPaused, punching]);

  const toggleBreak = useCallback(async () => {
    if (!user || punching || !isClockedIn) return;
    setError("");
    setPunching(true);
    try {
      const type = isPaused ? "BREAK_END" : "BREAK_START";
      // Adding `true` indicates updating the user record's latest state/timestamp.
      await writeTimeLog(DEFAULT_COMPANY_ID, user.uid, type, true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al registrar pausa");
      setPunching(false);
    }
  }, [user, isClockedIn, isPaused, punching]);

  return {
    isClockedIn,
    isPaused,
    activeWorkStart,
    activeBreakStart,
    totalWorkedMs,
    totalBreakMs,
    logs,
    loading,
    punching,
    error,
    punch,
    toggleBreak,
  };
}
