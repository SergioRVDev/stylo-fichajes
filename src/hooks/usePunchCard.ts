"use client";

import { useEffect, useState, useCallback } from "react";
import { useAuth } from "@/components/AuthProvider";
import { writeTimeLog, subscribeToDayLogs } from "@/lib/firebase/database";
import type { TimeLog } from "@/types";

const DEFAULT_COMPANY_ID = "default";

export function computeStatus(logs: (TimeLog & { id: string })[]) {
  let totalWorkedMs = 0;
  let lastInTimestamp: number | null = null;
  let isClockedIn = false;

  for (const log of logs) {
    if (log.type === "IN") {
      lastInTimestamp = log.timestamp;
      isClockedIn = true;
    } else if (log.type === "OUT" && lastInTimestamp !== null) {
      totalWorkedMs += log.timestamp - lastInTimestamp;
      lastInTimestamp = null;
      isClockedIn = false;
    }
  }

  return {
    isClockedIn,
    lastInTimestamp: isClockedIn ? lastInTimestamp : null,
    totalWorkedMs,
  };
}

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

export function usePunchCard() {
  const { user } = useAuth();
  const [isClockedIn, setIsClockedIn] = useState(false);
  const [logs, setLogs] = useState<(TimeLog & { id: string })[]>([]);
  const [lastInTimestamp, setLastInTimestamp] = useState<number | null>(null);
  const [totalWorkedMs, setTotalWorkedMs] = useState(0);
  const [loading, setLoading] = useState(true);
  const [punching, setPunching] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!user) return;

    const today = getTodayDate();
    const unsubscribe = subscribeToDayLogs(
      DEFAULT_COMPANY_ID,
      user.uid,
      today,
      (newLogs) => {
        const status = computeStatus(newLogs);
        setLogs(newLogs);
        setIsClockedIn(status.isClockedIn);
        setLastInTimestamp(status.lastInTimestamp);
        setTotalWorkedMs(status.totalWorkedMs);
        setLoading(false);
        setPunching(false);
      },
      (err) => {
        setError(err.message);
        setLoading(false);
      }
    );

    return unsubscribe;
  }, [user]);

  const punch = useCallback(async () => {
    if (!user || punching) return;

    setError("");
    setPunching(true);
    try {
      const type = isClockedIn ? "OUT" : "IN";
      await writeTimeLog(DEFAULT_COMPANY_ID, user.uid, type, true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al fichar");
      setPunching(false);
    }
  }, [user, isClockedIn, punching]);

  return {
    isClockedIn,
    logs,
    lastInTimestamp,
    totalWorkedMs,
    loading,
    punching,
    error,
    punch,
  };
}
