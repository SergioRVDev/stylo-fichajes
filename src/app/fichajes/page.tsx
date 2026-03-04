"use client";

import { useEffect, useState, useCallback, useRef, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/components/AuthProvider";
import { subscribeToDayLogs, getAllCompanyLogs, submitCorrectionRequest } from "@/lib/firebase/database";
import { saveSignature, getSignature, type MonthlySignature } from "@/lib/firebase/storage";
import { getTodaySchedule, formatScheduleTime } from "@/components/ScheduleForm";
import { ChevronLeft, ChevronRight, Calendar, Clock, Edit3, X, Check, Coffee, AlertCircle, ChevronDown, ChevronUp } from "lucide-react";
import SignatureCanvas from "react-signature-canvas";
import { DialogConfig, GlobalDialog } from "@/components/GlobalDialog";
import type { TimeLog, TimeLogType } from "@/types";

type ViewMode = "day" | "week" | "month";

const DAYS_ES = ["L", "M", "X", "J", "V", "S", "D"];

function fmt(ts: number): string {
  return new Date(ts).toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

function dur(ms: number): string {
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

function dateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

interface Session { type: "WORK" | "BREAK"; date: string; inTime: number; outTime: number | null; ms: number; }

function toSessions(logs: TimeLog[]): Session[] {
  const raw: { type: "WORK" | "BREAK"; inTime: number; outTime: number | null }[] = [];
  let currentMode: "WORK" | "BREAK" | null = null;
  let modeStart: number | null = null;

  for (const l of logs) {
    if (l.type === "IN") {
      if (currentMode === null) { currentMode = "WORK"; modeStart = l.timestamp; }
    } else if (l.type === "BREAK_START") {
      if (currentMode === "WORK" && modeStart !== null) {
        raw.push({ type: "WORK", inTime: modeStart, outTime: l.timestamp });
        currentMode = "BREAK"; modeStart = l.timestamp;
      }
    } else if (l.type === "BREAK_END") {
      if (currentMode === "BREAK" && modeStart !== null) {
        raw.push({ type: "BREAK", inTime: modeStart, outTime: l.timestamp });
        currentMode = "WORK"; modeStart = l.timestamp;
      }
    } else if (l.type === "OUT") {
      if (currentMode !== null && modeStart !== null) {
        raw.push({ type: currentMode, inTime: modeStart, outTime: l.timestamp });
        currentMode = null; modeStart = null;
      }
    }
  }

  if (currentMode !== null && modeStart !== null) {
    raw.push({ type: currentMode, inTime: modeStart, outTime: null });
  }

  const out: Session[] = [];
  for (const r of raw) {
    const end = r.outTime ?? Date.now();
    let cursor = r.inTime;

    while (cursor < end) {
      const curDate = new Date(cursor);
      const nextMidnight = new Date(curDate.getFullYear(), curDate.getMonth(), curDate.getDate() + 1).getTime();
      const segEnd = Math.min(end, nextMidnight);
      const isLast = segEnd === end;

      out.push({
        type: r.type,
        date: dateStr(curDate),
        inTime: cursor,
        outTime: isLast && r.outTime === null ? null : segEnd,
        ms: r.outTime === null && isLast ? 0 : segEnd - cursor,
      });

      cursor = nextMidnight;
    }
  }
  return out;
}

function weekRange(d: Date) {
  const c = new Date(d);
  const day = c.getDay();
  c.setDate(c.getDate() - day + (day === 0 ? -6 : 1));
  const from = dateStr(c);
  c.setDate(c.getDate() + 6);
  return { from, to: dateStr(c) };
}

function monthRange(d: Date) {
  const y = d.getFullYear(), m = d.getMonth();
  const last = new Date(y, m + 1, 0).getDate();
  const mo = String(m + 1).padStart(2, "0");
  return { from: `${y}-${mo}-01`, to: `${y}-${mo}-${String(last).padStart(2, "0")}` };
}

function FichajesContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, schedule, loading, role } = useAuth();
  const [view, setView] = useState<ViewMode>("day");
  const [sel, setSel] = useState(() => new Date());
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loadingLogs, setLoadingLogs] = useState(true);
  const [expandedDay, setExpandedDay] = useState<string | null>(null);

  // Digital Signature States
  const [signature, setSignature] = useState<MonthlySignature | null>(null);
  const [showSigModal, setShowSigModal] = useState(false);
  const [savingSig, setSavingSig] = useState(false);
  const sigCanvas = useRef<any>(null); // Type 'any' due to SignatureCanvas export quirks

  // Correction Request States
  const [showCorrModal, setShowCorrModal] = useState(false);
  const [corrSession, setCorrSession] = useState<Session | null>(null);
  const [corrDate, setCorrDate] = useState("");
  const [corrType, setCorrType] = useState<TimeLogType>("OUT");
  const [corrTime, setCorrTime] = useState("");
  const [corrReason, setCorrReason] = useState("");
  const [corrSending, setCorrSending] = useState(false);
  const [corrSent, setCorrSent] = useState(false);

  // Dialog State
  const [dialogConfig, setDialogConfig] = useState<DialogConfig>({
    isOpen: false,
    title: "",
    message: "",
    type: "alert"
  });

  const closeDialog = () => setDialogConfig(prev => ({ ...prev, isOpen: false }));
  // Which side is the user editing: "in" | "out" | null (still choosing)
  const [corrSide, setCorrSide] = useState<"in" | "out" | null>(null);

  const uidParam = searchParams.get("uid");
  const isManager = role === "manager";
  const targetUid = (isManager && uidParam) ? uidParam : user?.uid;
  const isReadOnly = Boolean(targetUid && targetUid !== user?.uid);

  useEffect(() => { if (!loading && !user) router.replace("/login"); }, [user, loading, router]);

  // Day view — fetch prev+current+next day to handle cross-midnight sessions
  useEffect(() => {
    if (!user || view !== "day") return;
    setLoadingLogs(true);

    const prevDay = new Date(sel);
    prevDay.setDate(prevDay.getDate() - 1);
    const nextDay = new Date(sel);
    nextDay.setDate(nextDay.getDate() + 1);
    const from = dateStr(prevDay);
    const to = dateStr(nextDay);
    const targetDay = dateStr(sel);

    getAllCompanyLogs("default", from, to)
      .then((all) => {
        const ul = all[targetUid as string] ?? {};
        const entries: TimeLog[] = [];
        for (const date of Object.keys(ul).sort()) {
          const dayLogs = ul[date];
          if (dayLogs) entries.push(...dayLogs);
        }
        entries.sort((a, b) => a.timestamp - b.timestamp);
        const allSessions = toSessions(entries);
        setSessions(allSessions.filter(s => s.date === targetDay));
      })
      .catch(() => setSessions([]))
      .finally(() => setLoadingLogs(false));
  }, [user, view, sel, targetUid]);

  // Week/Month
  useEffect(() => {
    if (!user || view === "day") return;
    setLoadingLogs(true);
    const r = view === "week" ? weekRange(sel) : monthRange(sel);
    // Fetch one day before range to catch cross-midnight sessions
    const prevDay = new Date(r.from + "T00:00:00");
    prevDay.setDate(prevDay.getDate() - 1);
    const fetchFrom = dateStr(prevDay);

    getAllCompanyLogs("default", fetchFrom, r.to)
      .then((all) => {
        const ul = all[targetUid as string] ?? {};
        const entries: TimeLog[] = [];
        for (const date of Object.keys(ul).sort()) {
          const dayLogs = ul[date];
          if (dayLogs) entries.push(...dayLogs);
        }
        entries.sort((a, b) => a.timestamp - b.timestamp);
        const allSessions = toSessions(entries);
        // Only show sessions within the actual range
        setSessions(allSessions.filter(s => s.date >= r.from && s.date <= r.to));
      })
      .catch(() => setSessions([]))
      .finally(() => setLoadingLogs(false));

    // Also fetch signature if viewing month
    if (view === "month" && targetUid) {
      const yearMonth = `${sel.getFullYear()}-${String(sel.getMonth() + 1).padStart(2, "0")}`;
      getSignature(targetUid, yearMonth)
        .then(sig => setSignature(sig))
        .catch(console.error);
    } else {
      setSignature(null);
    }
  }, [user, view, sel, targetUid]);

  const nav = useCallback((off: number) => {
    setSel(p => {
      const d = new Date(p);
      if (view === "day") d.setDate(d.getDate() + off);
      else if (view === "week") d.setDate(d.getDate() + off * 7);
      else d.setMonth(d.getMonth() + off);
      return d;
    });
    setExpandedDay(null);
    setSignature(null);
  }, [view]);

  const handleSaveSignature = async () => {
    if (!user || !sigCanvas.current || sigCanvas.current.isEmpty()) return;
    setSavingSig(true);
    try {
      const base64Data = sigCanvas.current.getTrimmedCanvas().toDataURL('image/png');
      const yearMonth = `${sel.getFullYear()}-${String(sel.getMonth() + 1).padStart(2, "0")}`;
      const url = await saveSignature(user.uid, yearMonth, base64Data);
      setSignature({ url, timestamp: Date.now() });
      setShowSigModal(false);
    } catch (err) {
      console.error("Error saving signature", err);
      setDialogConfig({
        isOpen: true,
        title: "Error",
        message: "Error al guardar la firma.",
        type: "alert"
      });
    } finally {
      setSavingSig(false);
    }
  };

  const openCorrModal = (session: Session) => {
    setCorrSession(session);
    setCorrDate(session.date);
    setCorrSide(null); // Let user choose which side first
    setCorrType("OUT");
    setCorrTime("");
    setCorrReason("");
    setCorrSent(false);
    setShowCorrModal(true);
  };

  const selectCorrSide = (side: "in" | "out") => {
    if (!corrSession) return;
    setCorrSide(side);
    if (side === "in") {
      setCorrType(corrSession.type === "WORK" ? "IN" : "BREAK_START");
      const d = new Date(corrSession.inTime);
      setCorrTime(`${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`);
    } else {
      setCorrType(corrSession.type === "WORK" ? "OUT" : "BREAK_END");
      if (corrSession.outTime) {
        const d = new Date(corrSession.outTime);
        setCorrTime(`${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`);
      } else {
        setCorrTime(""); // Missing exit — let user type it
      }
    }
  };

  const handleSendCorrection = async () => {
    if (!user || !corrDate || !corrTime || !corrReason.trim()) return;
    setCorrSending(true);
    try {
      await submitCorrectionRequest("default", {
        employeeUid: user.uid,
        employeeEmail: user.email ?? "",
        employeeName: user.displayName ?? user.email ?? user.uid,
        date: corrDate,
        logType: corrType,
        proposedTime: corrTime,
        reason: corrReason.trim(),
      });

      // Dispatch push notification to managers
      await fetch("/api/notify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companyId: "default",
          title: "Solicitud de Corrección",
          body: `${user.displayName ?? user.email} solicita cambio en fichaje del ${corrDate}.`,
          url: "/usuarios?tab=solicitudes",
        }),
      });

      setCorrSent(true);
    } catch (err) {
      console.error(err);
      setDialogConfig({
        isOpen: true,
        title: "Error",
        message: "Error al enviar la solicitud. Inténtalo de nuevo.",
        type: "alert"
      });
    } finally {
      setCorrSending(false);
    }
  };

  if (loading || !user) return (
    <main className="flex min-h-dvh items-center justify-center pb-20"><p className="text-muted">Cargando...</p></main>
  );

  const workSessions = sessions.filter(s => s.type === "WORK");
  const breakSessions = sessions.filter(s => s.type === "BREAK");
  const totalMs = workSessions.reduce((s, x) => s + x.ms, 0);
  const totalBreakMs = breakSessions.reduce((s, x) => s + x.ms, 0);
  const today = dateStr(new Date());
  const isToday = dateStr(sel) === today;
  const todaySched = getTodaySchedule(schedule ?? undefined);

  // Period label
  let label = "";
  if (view === "day") {
    label = sel.toLocaleDateString("es-ES", { weekday: "long", day: "numeric", month: "long" });
  } else if (view === "week") {
    const r = weekRange(sel);
    const f = new Date(r.from + "T00:00:00").toLocaleDateString("es-ES", { day: "numeric", month: "short" });
    const t = new Date(r.to + "T00:00:00").toLocaleDateString("es-ES", { day: "numeric", month: "short" });
    label = `${f} — ${t}`;
  } else {
    label = sel.toLocaleDateString("es-ES", { month: "long", year: "numeric" });
  }

  // Group by date
  const byDate: Record<string, Session[]> = {};
  for (const s of sessions) { if (!byDate[s.date]) byDate[s.date] = []; byDate[s.date]!.push(s); }

  const signatureModal = (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
      <div className="w-full max-w-sm overflow-hidden rounded-2xl bg-background shadow-xl">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <h3 className="font-semibold">Firmar cierre de mes</h3>
          <button
            onClick={() => setShowSigModal(false)}
            className="rounded-full p-1.5 text-muted hover:bg-muted/10 hover:text-foreground"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="p-4 flex flex-col items-center bg-surface">
          <p className="text-sm text-center text-muted mb-4 max-w-[280px]">
            Firma en el cuadro blanco para dar conformidad al registro horario de <b>{label}</b>.
          </p>
          <div className="bg-white rounded-lg overflow-hidden border-2 border-primary/20 shadow-inner w-full touch-none">
            <SignatureCanvas
              ref={sigCanvas}
              penColor="black"
              canvasProps={{ width: 300, height: 200, className: 'sigCanvas w-full h-[200px]' }}
            />
          </div>
          <div className="mt-4 flex w-full gap-3">
            <button
              type="button"
              onClick={() => sigCanvas.current?.clear()}
              disabled={savingSig}
              className="flex-1 rounded-xl border border-border bg-white py-2.5 text-sm font-medium transition-colors hover:bg-muted/10 disabled:opacity-50"
            >
              Borrar
            </button>
            <button
              type="button"
              onClick={handleSaveSignature}
              disabled={savingSig}
              className="flex-1 rounded-xl bg-primary py-2.5 text-sm font-medium text-white transition-colors hover:bg-primary-dark disabled:opacity-50"
            >
              {savingSig ? "Guardando..." : "Confirmar"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <main className="flex flex-col flex-1 w-full relative">
      {/* Dark Header Area */}
      <div className="flex h-[130px] items-start pt-6 px-4 relative justify-between text-white shrink-0">
        <button onClick={() => router.back()} className="w-[42px] h-[42px] bg-white text-primary rounded-[14px] flex items-center justify-center shadow-sm">
          <ChevronLeft className="w-5 h-5" />
        </button>
        <div className="flex flex-col items-center mt-1">
           <h1 className="text-lg font-medium leading-[1.2] text-center tracking-wide">Fichajes<br/>y horarios</h1>
        </div>
        <button className="w-[42px] h-[42px] bg-white text-primary rounded-[14px] flex items-center justify-center shadow-sm">
          <AlertCircle className="w-5 h-5" />
        </button>
      </div>

      {/* Main White Card Context */}
      <div className="flex-1 bg-surface rounded-t-[36px] px-5 pb-6 shadow-[0_-10px_30px_-15px_rgba(0,0,0,0.3)] w-full flex flex-col relative mt-[-20px] min-h-[calc(100vh-110px)]">

        {/* Top Floating Summary Card */}
        <div className="bg-white rounded-[24px] border border-[#fce7f3] shadow-lg p-5 w-full flex items-center justify-between -mt-[30px] mb-6 relative z-10">
           <button onClick={() => nav(-1)} className="p-2 text-[#f472b6] hover:bg-surface rounded-full"><ChevronLeft className="w-5 h-5" /></button>
           <div className="flex flex-col items-center">
              <span className="text-xs text-muted font-medium mb-1 capitalize text-center">{label}</span>
              <span className="text-foreground font-bold text-[15px]">
                 {view === "day" ? (isToday ? "Horas totales hoy" : "Horas totales") : view === "week" ? "Horas totales semanales" : "Horas totales mes"}
              </span>
              <span className="text-primary font-extrabold text-[22px] mt-0.5">{dur(totalMs)}</span>
           </div>
           <button onClick={() => nav(1)} disabled={view === "day" && isToday} className="p-2 text-[#f472b6] disabled:opacity-30 hover:bg-surface rounded-full"><ChevronRight className="w-5 h-5" /></button>
        </div>

        {/* View tabs - Re-styled as minimal pills */}
        <div className="flex items-center justify-center gap-2 mb-6">
          {(["day", "week", "month"] as ViewMode[]).map((m) => (
            <button key={m} onClick={() => { setView(m); setExpandedDay(null); }}
              className={`px-4 py-2 rounded-full text-sm font-bold transition-all ${view === m ? "bg-primary/10 text-primary" : "text-muted hover:bg-surface"}`}>
              {m === "day" ? "Día" : m === "week" ? "Semana" : "Mes"}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 flex flex-col">
        {loadingLogs ? (
          <p className="text-center text-sm text-[#f472b6] mt-10">Cargando...</p>
        ) : sessions.length === 0 && view === "day" ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <Clock className="h-10 w-10 text-muted/30" />
            <p className="mt-3 text-sm text-muted">No hay fichajes en este periodo</p>
          </div>
        ) : view === "day" ? (
          /* ─── DAY: Clean table ─── */
          <div className="overflow-hidden rounded-xl border border-border">
            {!isReadOnly && (
              <div className="px-3 py-2 bg-surface border-b border-border">
                <span className="text-xs font-medium text-muted uppercase">Toca un fichaje para solicitar corrección</span>
              </div>
            )}
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-surface">
                  <th className="px-3 py-2 text-left text-xs font-medium uppercase text-muted">Tipo</th>
                  <th className="px-3 py-2 text-left text-xs font-medium uppercase text-muted">Entrada</th>
                  <th className="px-3 py-2 text-left text-xs font-medium uppercase text-muted">Salida</th>
                  <th className="px-3 py-2 text-right text-xs font-medium uppercase text-muted">Dur.</th>
                </tr>
              </thead>
              <tbody>
                {sessions.map((s, i) => (
                  <tr
                    key={i}
                    onClick={() => !isReadOnly && openCorrModal(s)}
                    className={`border-b border-border last:border-0 transition-colors ${!isReadOnly ? 'cursor-pointer hover:bg-primary/5 active:bg-primary/10' : ''}`}
                    title={!isReadOnly ? "Toca para solicitar corrección" : undefined}
                  >
                    <td className="px-3 py-2.5">
                      <span className={`inline-flex items-center gap-1 text-xs font-medium px-1.5 py-0.5 rounded-full ${
                        s.type === "WORK" ? "bg-success/10 text-success" : "bg-amber-100 text-amber-700"
                      }`}>
                        {s.type === "WORK" ? "Trabajo" : <><Coffee className="w-3 h-3" /> Pausa</>}
                      </span>
                    </td>
                    <td className="px-3 py-2.5">
                      <span className="inline-flex items-center gap-1.5">
                        <span className={`h-2 w-2 rounded-full ${s.type === "WORK" ? "bg-success" : "bg-amber-500"}`} />{fmt(s.inTime)}
                      </span>
                    </td>
                    <td className="px-3 py-2.5">
                      {s.outTime ? (
                        <span className="inline-flex items-center gap-1.5">
                          <span className="h-2 w-2 rounded-full bg-danger" />{fmt(s.outTime)}
                        </span>
                      ) : <span className="text-xs font-medium text-primary">En curso</span>}
                    </td>
                    <td className="px-3 py-2.5 text-right font-medium">{s.outTime ? dur(s.ms) : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : view === "week" ? (
          /* ─── WEEK: 24h timeline bars ─── */
          <div className="space-y-2">
            {(() => {
              const r = weekRange(sel);
              const days: string[] = [];
              const d = new Date(r.from + "T00:00:00");
              const end = new Date(r.to + "T00:00:00");
              while (d <= end) { days.push(dateStr(d)); d.setDate(d.getDate() + 1); }

              return days.map(day => {
                const ds = byDate[day] ?? [];
                const dayMs = ds.filter(s => s.type === "WORK").reduce((s, x) => s + x.ms, 0);
                const isExp = expandedDay === day;
                const dayLabel = new Date(day + "T00:00:00").toLocaleDateString("es-ES", { weekday: "short", day: "numeric" });

                // Build segments as % of 24h
                const dayStart = new Date(day + "T00:00:00").getTime();
                const MS_24H = 86400000;
                const segments = ds.map(s => {
                  const start = ((s.inTime - dayStart) / MS_24H) * 100;
                  const endPct = ((( s.outTime ?? Date.now()) - dayStart) / MS_24H) * 100;
                  return { type: s.type, left: Math.max(0, Math.min(start, 100)), width: Math.max(0.5, Math.min(endPct - start, 100 - start)) };
                });

                return (
                  <div key={day} className="rounded-xl border border-border bg-surface overflow-hidden">
                    <button
                      onClick={() => setExpandedDay(isExp ? null : day)}
                      className="flex w-full items-center gap-3 px-3 py-2.5 text-sm"
                    >
                      <span className="w-16 shrink-0 text-left capitalize">{dayLabel}</span>
                      <div className="relative flex-1 h-6 rounded-lg bg-muted/10 overflow-hidden">
                        {/* Hour markers */}
                        {[6, 12, 18].map(h => (
                          <div key={h} className="absolute top-0 bottom-0 w-px bg-muted/15" style={{ left: `${(h / 24) * 100}%` }} />
                        ))}
                        {/* Session blocks */}
                        {segments.map((seg, i) => (
                          <div
                            key={i}
                            className={`absolute inset-y-1 rounded ${seg.type === 'WORK' ? 'bg-primary/80' : 'bg-amber-400'}`}
                            style={{ left: `${seg.left}%`, width: `${seg.width}%` }}
                          />
                        ))}
                      </div>
                      <span className="w-12 shrink-0 text-right font-medium text-xs">
                        {dayMs > 0 ? dur(dayMs) : "—"}
                      </span>
                    </button>
                    {isExp && ds.length > 0 && (
                      <div className="border-t border-border px-3 py-2 space-y-1">
                        {!isReadOnly && <p className="text-[10px] text-muted uppercase font-medium mb-1">Toca para solicitar corrección ↓</p>}
                        {ds.map((s, i) => (
                          <button
                            key={i}
                            onClick={() => !isReadOnly && openCorrModal(s)}
                            className={`flex w-full items-center justify-between text-xs py-1.5 px-2 rounded-lg transition-colors text-left ${!isReadOnly ? 'hover:bg-primary/5 active:bg-primary/10 cursor-pointer' : 'cursor-default'}`}
                          >
                            <span className="inline-flex items-center gap-1">
                              <span className={`h-1.5 w-1.5 rounded-full ${s.type === 'WORK' ? 'bg-success' : 'bg-amber-500'}`} />{fmt(s.inTime)}
                              <span className="text-muted mx-1">→</span>
                              {s.outTime ? (
                                <><span className="h-1.5 w-1.5 rounded-full bg-danger" />{fmt(s.outTime)}</>
                              ) : <span className="text-primary font-medium">En curso</span>}
                              {s.type === "BREAK" && <Coffee className="w-3 h-3 text-amber-600 ml-1" />}
                            </span>
                            <span className="font-medium">{s.outTime ? dur(s.ms) : "—"}</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                );
              });
            })()}
          </div>
        ) : (
          /* ─── MONTH: Calendar grid ─── */
          <div>
            {(() => {
              const y = sel.getFullYear(), m = sel.getMonth();
              const firstDay = new Date(y, m, 1).getDay();
              const daysInMonth = new Date(y, m + 1, 0).getDate();
              const offset = firstDay === 0 ? 6 : firstDay - 1; // Monday start
              const cells: (number | null)[] = Array(offset).fill(null);
              for (let i = 1; i <= daysInMonth; i++) cells.push(i);
              while (cells.length % 7 !== 0) cells.push(null);

              return (
                <>
                  {/* Weekday headers */}
                  <div className="grid grid-cols-7 mb-1">
                    {DAYS_ES.map(d => (
                      <div key={d} className="py-1 text-center text-xs font-medium text-muted">{d}</div>
                    ))}
                  </div>
                  {/* Day cells */}
                  <div className="grid grid-cols-7 gap-1">
                    {cells.map((day, i) => {
                      if (day === null) return <div key={i}></div>;
                      const ds = dateStr(new Date(y, m, day));
                      const daySessions = byDate[ds] ?? [];
                      const dayMs = daySessions.filter(s => s.type === "WORK").reduce((s, x) => s + x.ms, 0);
                      const isSelected = expandedDay === ds;
                      const isT = ds === today;

                      return (
                        <button
                          key={i}
                          onClick={() => setExpandedDay(isSelected ? null : ds)}
                          className={`relative flex flex-col items-center rounded-lg py-1.5 text-sm transition-colors ${
                            isSelected ? "bg-primary text-white" :
                            isT ? "bg-primary/10 text-primary font-bold" :
                            dayMs > 0 ? "bg-surface hover:bg-muted/10" : "text-muted/50"
                          }`}
                        >
                          {day}
                          {dayMs > 0 && !isSelected && (
                            <span className="mt-0.5 h-1 w-1 rounded-full bg-primary" />
                          )}
                          {isSelected && dayMs > 0 && (
                            <span className="text-[9px] font-medium">{dur(dayMs)}</span>
                          )}
                        </button>
                      );
                    })}
                  </div>

                  {/* Expanded day detail */}
                  {expandedDay && (byDate[expandedDay] ?? []).length > 0 && (
                    <div className="mt-3 rounded-xl border border-border bg-surface p-3">
                      <p className="mb-1 text-xs font-semibold capitalize">
                        {new Date(expandedDay + "T00:00:00").toLocaleDateString("es-ES", { weekday: "long", day: "numeric", month: "long" })}
                      </p>
                      {!isReadOnly && <p className="text-[10px] text-muted mb-2">Toca un fichaje para solicitar corrección</p>}
                      <div className="space-y-1">
                        {(byDate[expandedDay] ?? []).map((s, i) => (
                          <button
                            key={i}
                            onClick={() => !isReadOnly && openCorrModal(s)}
                            className={`flex w-full items-center justify-between text-sm py-2 px-2 rounded-lg transition-colors ${!isReadOnly ? 'hover:bg-primary/5 active:bg-primary/10 cursor-pointer' : 'cursor-default'}`}
                          >
                            <span className="inline-flex items-center gap-1.5">
                              <span className={`h-2 w-2 rounded-full ${s.type === 'WORK' ? 'bg-success' : 'bg-amber-500'}`} />{fmt(s.inTime)}
                              <span className="text-muted mx-1">→</span>
                              {s.outTime ? (
                                <><span className="h-2 w-2 rounded-full bg-danger" />{fmt(s.outTime)}</>
                              ) : <span className="text-xs font-medium text-primary">En curso</span>}
                              {s.type === "BREAK" && <Coffee className="w-3 h-3 text-amber-600 ml-1" />}
                            </span>
                            <span className="font-medium">{s.outTime ? dur(s.ms) : "—"}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              );
            })()}
          </div>
        )}

        {/* Signature Block for Month View */}
        {view === "month" && (
          <div className="mt-6 border-t border-border pt-6 pb-4 flex flex-col items-center">
            {signature ? (
               <div className="flex flex-col items-center text-center">
                 <p className="text-sm font-medium text-success mb-2 flex items-center gap-1.5"><Check className="h-4 w-4" /> Cierre firmado digitalmente</p>
                 <div className="bg-white border rounded-lg p-2 max-w-[200px] shadow-sm mb-2">
                   {/* eslint-disable-next-line @next/next/no-img-element */}
                   <img src={signature.url} alt="Firma del empleado" className="w-full h-auto object-contain max-h-[80px]" />
                 </div>
                 <p className="text-xs text-muted/70">
                   Firmado el {new Date(signature.timestamp).toLocaleDateString("es-ES")} a las {new Date(signature.timestamp).toLocaleTimeString("es-ES", {hour: '2-digit', minute:'2-digit'})}
                 </p>
               </div>
            ) : (!isReadOnly && sessions.length > 0) ? (
              // Comentado temporalmente por error CORS en Firebase Storage
              null
              /*
              <button
                onClick={() => setShowSigModal(true)}
                className="flex items-center gap-2 rounded-xl bg-primary px-6 py-3 text-sm font-medium text-white shadow transition-colors hover:bg-primary-dark"
              >
                <Edit3 className="h-4 w-4" />
                Firmar cierre de este mes
              </button>
              */
            ) : null}
          </div>
        )}
      </div>
    </div>

      {/* Correction Request Modal */}
      {showCorrModal && corrSession && (
        <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="w-full h-full max-w-sm rounded-t-3xl sm:rounded-2xl bg-background shadow-2xl overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-border px-5 py-4">
              <div>
                <h3 className="font-bold text-base">Solicitar Corrección</h3>
                <p className="text-xs text-muted mt-0.5">
                  {new Date(corrDate + "T00:00:00").toLocaleDateString("es-ES", { weekday: "long", day: "numeric", month: "long" })}
                </p>
              </div>
              <button onClick={() => { setShowCorrModal(false); setCorrSide(null); }} className="rounded-full p-2 hover:bg-muted/10">
                <X className="h-5 w-5 text-muted" />
              </button>
            </div>

            {corrSent ? (
              /* Success */
              <div className="flex flex-col items-center justify-center py-10 px-6 text-center gap-3">
                <div className="h-14 w-14 rounded-full bg-success/10 flex items-center justify-center">
                  <Check className="h-7 w-7 text-success" />
                </div>
                <p className="font-semibold">¡Solicitud enviada!</p>
                <p className="text-sm text-muted">Tu manager recibirá una notificación y revisará el cambio.</p>
                <button onClick={() => setShowCorrModal(false)} className="mt-2 px-6 py-2 bg-primary text-white rounded-xl text-sm font-medium">Cerrar</button>
              </div>
            ) : corrSide === null ? (
              /* Step 1: session card + pick which side */
              <div className="p-5 space-y-4">
                <div className={`rounded-2xl border p-4 ${corrSession.type === "WORK" ? "border-success/20 bg-success/5" : "border-amber-200 bg-amber-50/50"}`}>
                  <p className={`text-[10px] font-bold uppercase mb-3 tracking-wide ${corrSession.type === "WORK" ? "text-success" : "text-amber-600"}`}>
                    {corrSession.type === "WORK" ? "Periodo de Trabajo" : "☕ Pausa"}
                  </p>
                  <div className="flex items-center gap-4">
                    <div className="flex flex-col">
                      <span className="text-[10px] text-muted uppercase font-medium mb-0.5">Entrada</span>
                      <span className="font-bold text-xl">{fmt(corrSession.inTime)}</span>
                    </div>
                    <span className="text-muted text-lg font-light">→</span>
                    <div className="flex flex-col">
                      <span className="text-[10px] text-muted uppercase font-medium mb-0.5">Salida</span>
                      {corrSession.outTime
                        ? <span className="font-bold text-xl">{fmt(corrSession.outTime)}</span>
                        : <span className="text-primary font-semibold text-sm">Sin fichar</span>}
                    </div>
                  </div>
                </div>

                <p className="text-sm font-semibold text-center">¿Qué quieres corregir?</p>

                <div className="grid grid-cols-2 gap-3">
                  <button onClick={() => selectCorrSide("in")}
                    className="flex flex-col items-center gap-1.5 rounded-2xl border-2 border-border py-5 text-sm font-medium hover:border-primary hover:bg-primary/5 transition-all active:scale-95">
                    <span className="text-2xl">🕐</span>
                    <span>Entrada</span>
                    <span className="text-xs text-muted font-normal">{fmt(corrSession.inTime)}</span>
                  </button>
                  <button onClick={() => selectCorrSide("out")}
                    className="flex flex-col items-center gap-1.5 rounded-2xl border-2 border-border py-5 text-sm font-medium hover:border-danger hover:bg-danger/5 transition-all active:scale-95">
                    <span className="text-2xl">{corrSession.outTime ? "🕔" : "➕"}</span>
                    <span>{corrSession.outTime ? "Salida" : "Añadir salida"}</span>
                    <span className="text-xs text-muted font-normal">{corrSession.outTime ? fmt(corrSession.outTime) : "No registrada"}</span>
                  </button>
                </div>
              </div>
            ) : (
              /* Step 2: edit time + reason */
              <div className="p-5 space-y-4">
                <button onClick={() => setCorrSide(null)} className="text-xs text-primary flex items-center gap-1 hover:underline">
                  ← Cambiar selección
                </button>

                <div className={`rounded-xl p-3 text-sm border ${corrSide === "in" ? "border-success/20 bg-success/5" : "border-danger/20 bg-danger/5"}`}>
                  <p className="font-semibold">
                    {corrSide === "in" ? "Corrigiendo Entrada" : (corrSession.outTime ? "Corrigiendo Salida" : "Añadiendo Salida")}
                  </p>
                  <p className="text-xs text-muted mt-0.5">
                    {corrSide === "in" ? `Actual: ${fmt(corrSession.inTime)}` : corrSession.outTime ? `Actual: ${fmt(corrSession.outTime)}` : "Sin salida registrada"}
                  </p>
                </div>

                <div>
                  <label className="block text-xs font-medium text-muted mb-1">
                    {corrSide === "in" ? "Nueva hora de entrada" : (corrSession.outTime ? "Nueva hora de salida" : "Hora de salida propuesta")}
                  </label>
                  <input type="time" value={corrTime} onChange={(e) => setCorrTime(e.target.value)} autoFocus
                    className="w-full rounded-xl border-2 border-border bg-surface px-3 py-3 text-center text-2xl font-bold focus:border-primary outline-none" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-muted mb-1">Motivo <span className="text-danger">*</span></label>
                  <textarea value={corrReason} onChange={(e) => setCorrReason(e.target.value)} rows={3}
                    placeholder="Ej: Se me apagó el móvil y no pude fichar la salida a las 18:30"
                    className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm resize-none placeholder:text-muted/50" />
                </div>
                <button onClick={handleSendCorrection} disabled={corrSending || !corrTime || !corrReason.trim()}
                  className="w-full py-3 bg-primary text-white rounded-xl font-bold text-sm hover:bg-primary-dark transition-all disabled:opacity-50">
                  {corrSending ? <span className="animate-pulse">Enviando...</span> : "Enviar Solicitud"}
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {showSigModal && signatureModal}
      
      {/* Global Dialog Modal */}
      <GlobalDialog config={dialogConfig} onClose={closeDialog} />
    </main>
  );
}

export default function FichajesPage() {
  return (
    <Suspense fallback={<div className="flex-1 flex items-center justify-center p-8 bg-surface">Cargando fichajes...</div>}>
      <FichajesContent />
    </Suspense>
  );
}
