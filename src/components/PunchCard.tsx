import { useState, useEffect } from "react";
import { usePunchCard, formatDuration } from "@/hooks/usePunchCard";
import { Square, Play, Pause } from "lucide-react";

export function PunchCard() {
  const {
    isClockedIn,
    isPaused,
    activeWorkStart,
    activeBreakStart,
    totalWorkedMs,
    totalBreakMs,
    loading,
    punching,
    error,
    punch,
    toggleBreak,
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
      <div className="flex w-full items-center justify-center p-6 bg-primary rounded-2xl animate-pulse">
        <p className="text-white/50 text-sm">Cargando...</p>
      </div>
    );
  }

  const currentWorkMs = isClockedIn && !isPaused && activeWorkStart ? now - activeWorkStart : 0;
  const currentBreakMs = isClockedIn && isPaused && activeBreakStart ? now - activeBreakStart : 0;

  const displayWorkMs = totalWorkedMs + currentWorkMs;
  const displayBreakMs = totalBreakMs + currentBreakMs;

  return (
    <div className="w-full">
      <div className="w-full bg-white border border-primary rounded-2xl p-4 flex items-center justify-between shadow-lg">
        {/* Toggle Button */}
        <button
          onClick={punch}
          disabled={punching || (isClockedIn && isPaused)}
          className={`h-[48px] w-[48px] rounded-xl flex items-center justify-center transition-all disabled:opacity-50 ${
            isClockedIn
              ? "bg-[#ec6a6b] text-white shadow-[0_0_15px_rgba(236,106,107,0.4)]"
              : "bg-[#22c55e] text-white shadow-[0_0_15px_rgba(34,197,94,0.4)]"
          }`}
        >
          {punching ? (
            <div className="h-5 w-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
          ) : isClockedIn ? (
            <Square className="h-5 w-5 fill-current" />
          ) : (
            <Play className="h-5 w-5 fill-current ml-1" />
          )}
        </button>

        {/* Timer Text */}
        <div className="flex-1 flex flex-col items-center justify-center">
          <p
            className={`font-medium text-xl tracking-wide ${
              isPaused ? "text-amber-400" : isClockedIn ? "text-gray-600" : "text-gray-600"
            }`}
          >
            {formatDuration(isPaused ? displayBreakMs : displayWorkMs)}
          </p>
          <p className="text-gray-600 text-sm mt-0.5">
            {isPaused ? "En pausa" : isClockedIn ? "Trabajando" : "Fuera de servicio"}
          </p>
        </div>

        {/* Pause Button (Only if clocked in) */}
        {isClockedIn ? (
          <button
            onClick={toggleBreak}
            disabled={punching}
            className={`h-[48px] w-[48px] rounded-xl flex items-center justify-center transition-all disabled:opacity-50 ${
              isPaused
                ? "bg-primary text-pink-300 border border-white/10"
                : "bg-gray-500/10 text-gray-500 hover:bg-gray-500/20"
            }`}
          >
            {isPaused ? <Play className="h-5 w-5 fill-current ml-0.5" /> : <Pause className="h-5 w-5 fill-current" />}
          </button>
        ) : (
          <div className="h-[48px] w-[48px]" /> /* Spacer when not clocked in */
        )}
      </div>

      {error && (
        <p className="mt-3 text-center text-xs font-medium text-danger bg-danger/10 px-3 py-1.5 rounded-lg">
          {error}
        </p>
      )}
    </div>
  );
}
