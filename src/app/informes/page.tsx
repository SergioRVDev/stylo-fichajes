"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/AuthProvider";
import { getAllCompanyLogs, getAllEmployeesRecord, getGeneratedReports, saveGeneratedReport, deleteGeneratedReport } from "@/lib/firebase/database";
import { getSignature, uploadReportPDF, deleteReportPDF, type MonthlySignature } from "@/lib/firebase/storage";
import { Download, FileText, ShieldCheck, ChevronLeft, Plus, Calendar, Clock, Loader2, Search, Filter, Trash2 } from "lucide-react";
import type { TimeLog, GeneratedReport } from "@/types";
import { generateReportPDF } from "@/lib/pdfGenerator";

interface Interval { type: "WORK" | "BREAK"; date: string; start: number; end: number | null; ms: number; }

interface DailySummary {
  work: Interval[];
  breaks: Interval[];
  workMs: number;
  breakMs: number;
}

interface EmployeeReport {
  email: string;
  displayName: string; // "DNI - Nombre Apellido"
  totalWorkMs: number;
  totalBreakMs: number;
  days: Record<string, DailySummary>;
  signatures: MonthlySignature[];
}

function dateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function fmt(ts: number): string {
  return new Date(ts).toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" });
}

function dur(ms: number): string {
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

function processLogs(logs: TimeLog[]): Interval[] {
  const raw: { type: "WORK" | "BREAK", start: number, end: number | null }[] = [];
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

      const dStr = `${curDate.getFullYear()}-${String(curDate.getMonth() + 1).padStart(2, "0")}-${String(curDate.getDate()).padStart(2, "0")}`;

      out.push({
        type: r.type,
        date: dStr,
        start: cursor,
        end: isLast && r.end === null ? null : segEnd,
        ms: r.end === null && isLast ? 0 : segEnd - cursor,
      });

      cursor = nextMidnight;
    }
  }
  return out;
}

function getMonthRange(): { from: string; to: string } {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const lastDay = new Date(year, now.getMonth() + 1, 0).getDate();
  return {
    from: `${year}-${month}-01`,
    to: `${year}-${month}-${String(lastDay).padStart(2, "0")}`,
  };
}

function getWeekRange(): { from: string; to: string } {
  const now = new Date();
  const day = now.getDay() || 7; // Monday = 1

  const from = new Date(now);
  from.setDate(now.getDate() - day + 1);

  const to = new Date(from);
  to.setDate(from.getDate() + 6);

  return { from: dateStr(from), to: dateStr(to) };
}

function getDayRange(): { from: string; to: string } {
  const now = new Date();
  const str = dateStr(now);
  return { from: str, to: str };
}

export default function InformesPage() {
  const router = useRouter();
  const { user, role, loading } = useAuth();

  // State for listed reports
  const [pastReports, setPastReports] = useState<GeneratedReport[]>([]);
  const [loadingPast, setLoadingPast] = useState(true);

  // State for creating new report
  const [isCreatingReport, setIsCreatingReport] = useState(false);
  const [report, setReport] = useState<EmployeeReport[]>([]);
  const [loadingReport, setLoadingReport] = useState(false);
  const [dateRange, setDateRange] = useState(getMonthRange);
  const [rangeMode, setRangeMode] = useState<"day" | "week" | "month" | "custom">("month");
  const [selectedEmails, setSelectedEmails] = useState<Set<string>>(new Set());
  const [showModal, setShowModal] = useState(false);
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterDate, setFilterDate] = useState("");
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Dialog State
  const [dialogConfig, setDialogConfig] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    type: "alert" | "confirm";
    onConfirm?: () => void;
  }>({
    isOpen: false,
    title: "",
    message: "",
    type: "alert"
  });

  const closeDialog = () => setDialogConfig(prev => ({ ...prev, isOpen: false }));

  // Inspector Modal States
  const [showInspectorModal, setShowInspectorModal] = useState(false);
  const [inspectorCode, setInspectorCode] = useState("");
  const [inspectorLoading, setInspectorLoading] = useState(false);
  const [inspectorError, setInspectorError] = useState("");

  async function generateInspectorCode() {
    setInspectorLoading(true);
    setInspectorError("");
    try {
      const res = await fetch("/api/inspector/token/generate", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setInspectorCode(data.code);
    } catch (err) {
      setInspectorError(err instanceof Error ? err.message : "Error al generar");
    } finally {
      setInspectorLoading(false);
    }
  }

  useEffect(() => {
    if (!loading && !user) router.replace("/login");
    if (!loading && role !== "manager") router.replace("/");
  }, [user, role, loading, router]);

  const loadPastReports = useCallback(async () => {
    setLoadingPast(true);
    try {
      const reports = await getGeneratedReports("default");
      setPastReports(reports);
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingPast(false);
    }
  }, []);

  useEffect(() => {
    if (user && role === "manager" && !isCreatingReport) {
      loadPastReports();
    }
  }, [user, role, isCreatingReport, loadPastReports]);

  const loadReport = async () => {
    setLoadingReport(true);
    try {
      const prevDay = new Date(dateRange.from + "T00:00:00");
      prevDay.setDate(prevDay.getDate() - 1);
      const nextDay = new Date(dateRange.to + "T00:00:00");
      nextDay.setDate(nextDay.getDate() + 1);

      const [logs, employeesMap] = await Promise.all([
        getAllCompanyLogs("default", dateStr(prevDay), dateStr(nextDay)),
        getAllEmployeesRecord("default"),
      ]);

      const reportData: EmployeeReport[] = [];
      const allUids = new Set([...Object.keys(employeesMap), ...Object.keys(logs)]);

      for (const uid of allUids) {
        const userLogs = logs[uid] ?? {};
        const entries: TimeLog[] = [];

        for (const date of Object.keys(userLogs).sort()) {
          const dayLogs = userLogs[date];
          if (dayLogs) entries.push(...dayLogs);
        }

        entries.sort((a, b) => a.timestamp - b.timestamp);
        const allSessions = processLogs(entries);

        const days: Record<string, DailySummary> = {};
        let totalWorkMs = 0;
        let totalBreakMs = 0;

        for (const s of allSessions) {
          if (s.date >= dateRange.from && s.date <= dateRange.to) {
            if (!days[s.date]) days[s.date] = { work: [], breaks: [], workMs: 0, breakMs: 0 };

            if (s.type === "WORK") {
              days[s.date]!.work.push(s);
              days[s.date]!.workMs += s.ms;
              totalWorkMs += s.ms;
            } else if (s.type === "BREAK") {
              days[s.date]!.breaks.push(s);
              days[s.date]!.breakMs += s.ms;
              totalBreakMs += s.ms;
            }
          }
        }

        // Gather unique months in "YYYY-MM" from the actual logged days
        const uniqueMonths = new Set(Object.keys(days).map(d => d.substring(0, 7)));
        const sigPromises = Array.from(uniqueMonths).map(ym => getSignature(uid, ym));
        const fetchedSigs = await Promise.all(sigPromises);
        const validSigs = fetchedSigs.filter((sig): sig is MonthlySignature => sig !== null);

        const emp = employeesMap[uid];
        const email = emp?.email ?? uid;

        let displayName = email;
        if (emp) {
          const names = [emp.displayName, emp.lastName].filter(Boolean).join(" ");
          if (emp.dni && names) {
            displayName = `${emp.dni} - ${names}`;
          } else if (emp.dni) {
            displayName = emp.dni;
          } else if (names) {
            displayName = names;
          }
        }

        reportData.push({
          email,
          displayName,
          totalWorkMs,
          totalBreakMs,
          days,
          signatures: validSigs,
        });
      }

      reportData.sort((a, b) => b.totalWorkMs - a.totalWorkMs);
      setReport(reportData);

      // Initialize selected emails with all employees if empty
      setSelectedEmails(prev => {
        if (prev.size === 0) return new Set(reportData.map(r => r.email));
        // Keep existing selections but add any new ones
        const next = new Set(prev);
        reportData.forEach(r => next.add(r.email));
        return next;
      });

      // Auto open selection modal
      setShowModal(true);
    } catch (err) {
      console.error("Error loading report:", err);
    } finally {
      setLoadingReport(false);
    }
  };

  const startCreating = () => {
    setIsCreatingReport(true);
    setReport([]);
    setShowModal(false);
  };

  const handleGeneratePDF = async () => {
    if (!user) return;
    setIsGeneratingPdf(true);
    try {
      // 1. Generate PDF Blob
      const filteredReport = report.filter(emp => selectedEmails.has(emp.email));
      const blob = await generateReportPDF("Suma Belleza C.B.", dateRange, filteredReport);

      // 2. Upload to Firebase Storage
      const filename = `informe-${Date.now()}.pdf`;
      const downloadUrl = await uploadReportPDF("default", filename, blob);

      // 3. Save reference in DB
      let reportName = `Informe ${dateRange.from} a ${dateRange.to}`;
      if (rangeMode === "day") reportName = `Informe diario ${dateRange.from}`;
      if (rangeMode === "month") reportName = `Informe mensual ${dateRange.from.substring(0, 7)}`;

      await saveGeneratedReport("default", {
        name: reportName,
        dateRange,
        generatedAt: Date.now(),
        generatedByUid: user.uid,
        downloadUrl
      });

      // 4. Reset & go back to list
      setShowModal(false);
      setIsCreatingReport(false);
    } catch (err) {
      console.error("Error generating PDF:", err);
      setDialogConfig({
        isOpen: true,
        title: "Error",
        message: "Error al generar el PDF. Revisa la consola.",
        type: "alert"
      });
    } finally {
      setIsGeneratingPdf(false);
    }
  };

  const handleDeleteReport = async (report: GeneratedReport) => {
    setDialogConfig({
      isOpen: true,
      title: "Eliminar informe",
      message: `¿Estás seguro de que deseas eliminar el informe "${report.name}"? Esta acción no se puede deshacer.`,
      type: "confirm",
      onConfirm: async () => {
        closeDialog();
        setDeletingId(report.id);
        try {
          if (report.downloadUrl) {
            await deleteReportPDF(report.downloadUrl);
          }
          await deleteGeneratedReport("default", report.id);
          setPastReports(prev => prev.filter(r => r.id !== report.id));
        } catch (err) {
          console.error("Error deleting report:", err);
          setDialogConfig({
            isOpen: true,
            title: "Error",
            message: "Error al eliminar el informe. Si no ha sido generado correctamente puede que siga existiendo.",
            type: "alert"
          });
        } finally {
          setDeletingId(null);
        }
      }
    });
  };

  const toggleEmail = (email: string) => {
    setSelectedEmails(prev => {
      const next = new Set(prev);
      if (next.has(email)) next.delete(email);
      else next.add(email);
      return next;
    });
  };

  const toggleAll = () => {
    if (selectedEmails.size === report.length) setSelectedEmails(new Set());
    else setSelectedEmails(new Set(report.map(r => r.email)));
  };

  if (loading || !user || role !== "manager") {
    return (
      <main className="flex min-h-dvh items-center justify-center pb-20">
        <p className="text-muted">Cargando...</p>
      </main>
    );
  }

  return (
    <main className="flex flex-col flex-1 w-full relative">
      <style dangerouslySetInnerHTML={{
        __html: `
        @media print {
          body { background: white !important; color: black !important; }
          .no-print, nav { display: none !important; }
          .print-only { display: block !important; }
          .print-container { padding: 0 !important; margin: 0 !important; }
          * { border-color: black !important; }
        }
      `}} />

      {/* Dark Header Area */}
      <div className="flex h-[130px] items-start pt-6 px-4 relative justify-between text-white shrink-0 no-print">
        <button
          onClick={() => router.back()}
          className="w-[42px] h-[42px] bg-white text-primary rounded-[14px] flex items-center justify-center shadow-sm"
        >
          <ChevronLeft className="w-5 h-5" />
        </button>
        <div className="flex flex-col items-center mt-1">
          <h1 className="text-lg font-medium leading-[1.2] text-center tracking-wide">Informes<br />y exportación</h1>
        </div>
        <button
          onClick={() => setShowInspectorModal(true)}
          className="w-[42px] h-[42px] bg-white text-secondary rounded-[14px] flex items-center justify-center shadow-sm"
          title="Portal del Inspector"
        >
          <ShieldCheck className="w-5 h-5" />
        </button>
      </div>

      {/* Main White Card Context */}
      <div className="flex-1 bg-surface rounded-t-[36px] px-5 py-6 shadow-[0_-10px_30px_-15px_rgba(0,0,0,0.3)] w-full flex flex-col relative mt-[-20px] min-h-[calc(100vh-110px)] print-container">

        {!isCreatingReport ? (
          <>
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6 no-print">
              <h2 className="text-xl font-bold text-primary">Informes Generados</h2>
              <button
                onClick={startCreating}
                className="bg-primary hover:bg-primary-dark text-white rounded-xl px-4 py-2.5 text-sm font-medium flex items-center justify-center gap-2 transition-colors shadow-sm w-full sm:w-auto"
              >
                <Plus className="w-4 h-4" />
                <span>Nuevo Informe</span>
              </button>
            </div>

            <div className="flex flex-col sm:flex-row gap-3 mb-6 bg-surface p-3 rounded-2xl border border-border no-print">
              <div className="flex-1 relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted" />
                <input
                  type="text"
                  placeholder="Buscar por nombre..."
                  value={searchTerm}
                  onChange={e => setSearchTerm(e.target.value)}
                  className="w-full bg-white border border-border rounded-xl pl-9 pr-4 py-2 text-sm focus:outline-none focus:border-primary transition-colors"
                />
              </div>
              <div className="sm:w-48 relative">
                <Filter className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted" />
                <input
                  type="date"
                  value={filterDate}
                  onChange={e => setFilterDate(e.target.value)}
                  className="w-full bg-white border border-border rounded-xl pl-9 pr-4 py-2 text-sm focus:outline-none focus:border-primary transition-colors text-foreground"
                />
              </div>
            </div>

            {loadingPast ? (
              <div className="flex-1 flex items-center justify-center py-12">
                <Loader2 className="w-8 h-8 text-primary animate-spin" />
              </div>
            ) : (() => {
              const filteredReports = pastReports.filter(r => {
                const matchesName = r.name.toLowerCase().includes(searchTerm.toLowerCase());
                const dateStr = new Date(r.generatedAt).toISOString().split('T')[0];
                const matchesDate = filterDate ? dateStr === filterDate : true;
                return matchesName && matchesDate;
              });

              if (filteredReports.length === 0) {
                return (
                  <div className="flex-1 flex flex-col items-center justify-center text-center p-8 bg-slate-50 rounded-3xl border border-dashed border-border mt-4 no-print">
                    <div className="w-16 h-16 bg-primary/10 text-primary rounded-full flex items-center justify-center mx-auto mb-4">
                      <FileText className="w-8 h-8" />
                    </div>
                    <h3 className="text-lg font-bold text-primary mb-2">
                      {pastReports.length === 0 ? "No tienes informes" : "No hay resultados"}
                    </h3>
                    <p className="text-muted text-sm max-w-[250px]">
                      {pastReports.length === 0 ? "Genera tu primer informe de fichajes en formato PDF para visualizarlo aquí." : "No se encontraron informes que coincidan con los filtros."}
                    </p>
                    {pastReports.length > 0 && (
                      <button onClick={() => { setSearchTerm(""); setFilterDate(""); }} className="mt-4 text-primary text-sm font-medium hover:underline">
                        Limpiar filtros
                      </button>
                    )}
                  </div>
                );
              }

              return (
                <div className="space-y-4 no-print">
                  {filteredReports.map(report => (
                    <div key={report.id} className="bg-white rounded-2xl border border-[#edf1f7] p-4 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4 transition-all hover:border-primary/30">
                      <div className="flex items-start sm:items-center gap-4">
                        <div className="w-12 h-12 bg-[#fcfdfe] rounded-xl border border-border flex items-center justify-center text-primary shrink-0">
                          <FileText className="w-6 h-6 outline-none" />
                        </div>
                        <div className="flex flex-col">
                          <span className="font-bold text-[#222b45]">{report.name}</span>
                          <div className="flex flex-wrap items-center gap-3 text-xs text-[#8f9bb3] mt-1">
                            <span className="flex items-center gap-1 bg-surface px-2 py-0.5 rounded-md border border-border/50"><Calendar className="w-3.5 h-3.5" /> {new Date(report.generatedAt).toLocaleDateString()}</span>
                            <span className="flex items-center gap-1 bg-surface px-2 py-0.5 rounded-md border border-border/50"><Clock className="w-3.5 h-3.5" /> {new Date(report.generatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 self-end sm:self-auto">
                        <button
                          onClick={() => handleDeleteReport(report)}
                          disabled={deletingId === report.id}
                          className="w-10 h-10 bg-red-50 hover:bg-red-100 text-red-500 rounded-xl flex items-center justify-center transition-colors disabled:opacity-50"
                          title="Eliminar informe"
                        >
                          {deletingId === report.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                        </button>
                        <a
                          href={report.downloadUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="w-10 h-10 bg-primary/10 hover:bg-primary/20 text-primary rounded-xl flex items-center justify-center transition-colors"
                          title="Descargar PDF"
                        >
                          <Download className="w-5 h-5" />
                        </a>
                      </div>
                    </div>
                  ))}
                </div>
              );
            })()}
            </>
    
      ) : (
      <div className="mt-8 flex flex-col">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-xl font-bold text-primary">Crear Informe</h2>
          <button
            onClick={() => setIsCreatingReport(false)}
            className="text-muted hover:text-primary text-sm font-medium transition-colors"
          >
            Cancelar
          </button>
        </div>

        {/* Date Range Filter */}
        <div className="bg-white rounded-2xl border border-border p-5 shadow-sm space-y-5">
          <div className="flex gap-2 bg-surface p-1 rounded-lg border border-border">
            <button
              onClick={() => { setRangeMode("day"); setDateRange(getDayRange()); }}
              className={`flex-1 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${rangeMode === "day" ? "bg-primary text-white shadow" : "text-muted hover:bg-muted/10 hover:text-foreground"}`}
            >
              Hoy
            </button>
            <button
              onClick={() => { setRangeMode("week"); setDateRange(getWeekRange()); }}
              className={`flex-1 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${rangeMode === "week" ? "bg-primary text-white shadow" : "text-muted hover:bg-muted/10 hover:text-foreground"}`}
            >
              Semana
            </button>
            <button
              onClick={() => { setRangeMode("month"); setDateRange(getMonthRange()); }}
              className={`flex-1 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${rangeMode === "month" ? "bg-primary text-white shadow" : "text-muted hover:bg-muted/10 hover:text-foreground"}`}
            >
              Mes
            </button>
            <button
              onClick={() => setRangeMode("custom")}
              className={`flex-1 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${rangeMode === "custom" ? "bg-primary text-white shadow" : "text-muted hover:bg-muted/10 hover:text-foreground"}`}
            >
              Personalizado
            </button>
          </div>

          {rangeMode === "custom" && (
            <div className="flex gap-3">
              <div className="flex-1">
                <label htmlFor="dateFrom" className="mb-1 block text-xs font-medium text-muted">Desde</label>
                <input
                  id="dateFrom"
                  type="date"
                  value={dateRange.from}
                  onChange={(e) => setDateRange((prev) => ({ ...prev, from: e.target.value }))}
                  className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/30"
                />
              </div>
              <div className="flex-1">
                <label htmlFor="dateTo" className="mb-1 block text-xs font-medium text-muted">Hasta</label>
                <input
                  id="dateTo"
                  type="date"
                  value={dateRange.to}
                  onChange={(e) => setDateRange((prev) => ({ ...prev, to: e.target.value }))}
                  className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/30"
                />
              </div>
            </div>
          )}

          <button
            onClick={loadReport}
            disabled={loadingReport}
            className="w-full flex items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3 text-sm font-bold text-white transition-all shadow-sm hover:shadow-md disabled:opacity-50"
          >
            {loadingReport ? (
              <><Loader2 className="w-5 h-5 animate-spin" /> Recopilando fichajes...</>
            ) : (
              <>Continuar</>
            )}
          </button>
        </div>

        {/* Employee Selection Modal */}
        {showModal && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 px-4 backdrop-blur-sm">
            <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl border border-border text-foreground">
              {report.length === 0 ? (
                <div className="text-center py-6">
                  <div className="w-16 h-16 bg-[#edf1f7] text-[#8f9bb3] rounded-full flex items-center justify-center mx-auto mb-4">
                    <FileText className="w-8 h-8" />
                  </div>
                  <h3 className="text-lg font-bold text-[#222b45] mb-2">No hay fichajes</h3>
                  <p className="text-sm text-muted mb-6">No se encontraron registros activos en las fechas seleccionadas.</p>
                  <button
                    onClick={() => setShowModal(false)}
                    className="w-full rounded-xl bg-surface border border-border py-2.5 font-medium hover:bg-muted/10 transition-colors"
                  >
                    Volver a intentar
                  </button>
                </div>
              ) : (
                <>
                  <div className="mb-4 flex items-center justify-between">
                    <h2 className="text-lg font-bold text-[#222b45]">Seleccionar empleados</h2>
                    <button
                      onClick={toggleAll}
                      className="text-xs font-bold text-primary hover:underline bg-primary/10 px-2 py-1 rounded"
                    >
                      {selectedEmails.size === report.length ? "Desmarcar" : "Marcar todos"}
                    </button>
                  </div>

                  <div className="max-h-[50vh] overflow-y-auto space-y-2 mb-6 pr-2 custom-scrollbar">
                    {report.map(emp => (
                      <label key={emp.email} className={`flex items-center gap-3 rounded-xl border p-3 cursor-pointer transition-colors ${selectedEmails.has(emp.email) ? 'border-primary bg-primary/5' : 'border-border hover:bg-muted/5'}`}>
                        <input
                          type="checkbox"
                          checked={selectedEmails.has(emp.email)}
                          onChange={() => toggleEmail(emp.email)}
                          className="w-4 h-4 rounded border-border text-primary accent-primary"
                        />
                        <div className="flex flex-col">
                          <span className="text-sm font-bold text-[#222b45] leading-tight">{emp.displayName}</span>
                          <span className="text-xs text-muted font-medium mt-0.5">{dur(emp.totalWorkMs)} de efvo.</span>
                        </div>
                      </label>
                    ))}
                  </div>

                  <div className="flex gap-3">
                    <button
                      onClick={() => setShowModal(false)}
                      className="flex-1 rounded-xl border border-border bg-surface py-2.5 text-sm font-medium transition-colors hover:bg-muted/10 text-secondary"
                    >
                      Atrás
                    </button>
                    <button
                      onClick={handleGeneratePDF}
                      disabled={selectedEmails.size === 0 || isGeneratingPdf}
                      className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-primary py-2.5 text-sm font-bold text-white transition-all shadow-sm hover:shadow-md hover:bg-primary-dark disabled:opacity-50"
                    >
                      {isGeneratingPdf ? <Loader2 className="w-5 h-5 animate-spin" /> : <Download className="w-4 h-4" />}
                      Generar PDF
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        )}
      </div>
        )}
    </div>

      {/* Inspector Modal */ }
  {
    showInspectorModal && (
      <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4">
        <div className="w-full max-w-md rounded-2xl bg-surface p-6 shadow-xl text-center border border-border">
          <h2 className="text-xl font-bold mb-2">Acceso Remoto Inspección</h2>
          <p className="text-sm text-muted mb-6">Genera un código oficial Permanente para que la Inspección de Trabajo acceda a los registros desde <span className="font-mono font-medium text-black">/inspector</span>. Limitado a <span className="font-bold text-black">2 consultas</span> por seguridad.</p>

          {inspectorCode ? (
            <div className="bg-primary/5 border border-primary/20 rounded-xl p-6 mb-6">
              <p className="text-sm font-medium mb-2 text-primary">Código Oficial (2 usos directos):</p>
              <p className="text-4xl font-mono tracking-widest font-bold text-primary">{inspectorCode}</p>
            </div>
          ) : (
            <button
              onClick={generateInspectorCode}
              disabled={inspectorLoading}
              className="w-full py-3 bg-primary text-white rounded-xl font-bold hover:bg-primary-dark transition-all disabled:opacity-50 mb-6"
            >
              {inspectorLoading ? "Generando..." : "Generar Código Temporal"}
            </button>
          )}

          {inspectorError && <p className="text-sm text-danger mb-4">{inspectorError}</p>}

          <button
            onClick={() => { setShowInspectorModal(false); setInspectorCode(""); }}
            className="px-6 py-2 border border-border rounded-lg text-sm font-medium hover:bg-muted/10"
          >
            Cerrar
          </button>
        </div>
      </div>
    )
  }

  {/* Global Dialog Modal */ }
  {
    dialogConfig.isOpen && (
      <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/50 px-4 backdrop-blur-sm">
        <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl border border-border text-center">
          <h3 className="text-xl font-bold text-[#222b45] mb-2">{dialogConfig.title}</h3>
          <p className="text-sm text-muted mb-6 whitespace-pre-line">{dialogConfig.message}</p>
          <div className="flex gap-3 justify-center">
            {dialogConfig.type === "confirm" && (
              <button
                onClick={closeDialog}
                className="flex-1 rounded-xl border border-border bg-surface py-2.5 text-sm font-medium transition-colors hover:bg-muted/10 text-secondary"
              >
                Cancelar
              </button>
            )}
            <button
              onClick={() => {
                if (dialogConfig.type === "confirm" && dialogConfig.onConfirm) {
                  dialogConfig.onConfirm();
                } else {
                  closeDialog();
                }
              }}
              className={`flex-1 rounded-xl py-2.5 text-sm font-bold text-white transition-all shadow-sm hover:shadow-md ${dialogConfig.type === "confirm" ? "bg-red-500 hover:bg-red-600" : "bg-primary hover:bg-primary-dark"
                }`}
            >
              {dialogConfig.type === "confirm" ? "Eliminar" : "Entendido"}
            </button>
          </div>
        </div>
      </div>
    )
  }
    </main >
  );
}
