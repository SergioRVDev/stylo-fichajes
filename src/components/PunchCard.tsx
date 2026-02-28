"use client";

import { useState, useEffect } from "react";
import { usePunchCard, formatDuration } from "@/hooks/usePunchCard";

function formatTimestamp(timestamp: number): string {
  return new Date(timestamp).toLocaleTimeString("es-ES", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function PunchCard() {
  const {
    isClockedIn,
    lastInTimestamp,
    totalWorkedMs,
    loading,
    punching,
    error,
    punch,
    logs,
  } = usePunchCard();
  const [now, setNow] = useState(0);

  useEffect(() => {
    if (!isClockedIn) return;

    const tick = () => setNow(Date.now());
    const interval = setInterval(tick, 1000);
    tick();
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
    <div className="flex flex-1 flex-col items-center pt-6">
      {/* Status Indicator */}
      <div className="flex items-center gap-2">
        <span
          className={`h-3 w-3 rounded-full transition-colors duration-500 ${
            isClockedIn ? "bg-success" : "bg-muted"
          }`}
        />
        <span
          className={`text-sm font-medium transition-colors duration-500 ${
            isClockedIn ? "text-success" : "text-muted"
          }`}
        >
          {isClockedIn ? "Fichado" : "Fuera de servicio"}
        </span>
      </div>

      {/* Timer */}
      <p className="mt-4 font-mono text-5xl font-bold tracking-tight">
        {formatDuration(displayMs)}
      </p>
      <p className="mt-1 text-sm text-muted">Jornada actual</p>

      {/* Punch Button */}
      <div className="mt-10 flex flex-col items-center">
        <div className="relative flex items-center justify-center">
          {isClockedIn && (
            <span className="absolute h-36 w-36 animate-pulse-ring rounded-full bg-danger/30" />
          )}
          <button
            onClick={punch}
            disabled={punching}
            className={`relative z-10 h-36 w-36 rounded-full text-xl font-bold text-white shadow-lg transition-all duration-500 active:scale-95 disabled:opacity-70 ${
              isClockedIn
                ? "bg-danger shadow-danger/25 hover:bg-danger/90"
                : "bg-success shadow-success/25 hover:bg-success/90"
            }`}
          >
            {punching ? "..." : isClockedIn ? "Salida" : "Entrada"}
          </button>
        </div>
        <p className="mt-4 text-sm text-muted">
          {isClockedIn
            ? "Pulsa para fichar salida"
            : "Pulsa para fichar entrada"}
        </p>
      </div>

      {/* Error */}
      {error && (
        <p className="mt-4 text-center text-sm text-danger">{error}</p>
      )}

      {/* Today's Log */}
      {logs.length > 0 && (
        <div className="mt-auto w-full pt-8">
          <h2 className="text-sm font-semibold text-muted">Registro de hoy</h2>
          <ul className="mt-2 space-y-1.5">
            {logs.map((log) => (
              <li key={log.id} className="flex items-center gap-2 text-sm">
                <span
                  className={`h-2 w-2 rounded-full ${
                    log.type === "IN" ? "bg-success" : "bg-danger"
                  }`}
                />
                <span className="text-muted">
                  {formatTimestamp(log.timestamp)}
                </span>
                <span>{log.type === "IN" ? "Entrada" : "Salida"}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
