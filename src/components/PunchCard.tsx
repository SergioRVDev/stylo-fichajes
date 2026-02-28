"use client";

import { useState, useEffect } from "react";
import { usePunchCard, formatDuration } from "@/hooks/usePunchCard";

export function PunchCard() {
  const {
    isClockedIn,
    lastInTimestamp,
    totalWorkedMs,
    loading,
    punching,
    punch,
  } = usePunchCard();
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    if (!isClockedIn) return;

    setNow(Date.now());
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, [isClockedIn]);

  if (loading) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <p className="text-muted">Cargando fichajes...</p>
      </div>
    );
  }

  const currentSessionMs =
    isClockedIn && lastInTimestamp ? now - lastInTimestamp : 0;
  const displayMs = totalWorkedMs + currentSessionMs;

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-8">
      <div
        className={`rounded-full px-4 py-1.5 text-sm font-medium transition-colors duration-300 ${
          isClockedIn
            ? "bg-success/10 text-success"
            : "bg-muted/10 text-muted"
        }`}
      >
        {isClockedIn ? "Fichado" : "Fuera de servicio"}
      </div>

      <p className="font-mono text-5xl font-bold tracking-tight">
        {formatDuration(displayMs)}
      </p>

      <div className="relative flex items-center justify-center">
        {isClockedIn && (
          <span className="absolute h-36 w-36 animate-pulse-ring rounded-full bg-danger/30" />
        )}
        <button
          onClick={punch}
          disabled={punching}
          className={`relative z-10 h-36 w-36 rounded-full text-xl font-bold text-white shadow-lg transition-all duration-500 active:scale-95 disabled:opacity-70 ${
            isClockedIn
              ? "bg-danger hover:bg-danger/90"
              : "bg-success hover:bg-success/90"
          }`}
        >
          {punching ? "..." : isClockedIn ? "Salida" : "Entrada"}
        </button>
      </div>

      <p className="text-sm text-muted">
        {isClockedIn
          ? "Pulsa para fichar salida"
          : "Pulsa para fichar entrada"}
      </p>
    </div>
  );
}
