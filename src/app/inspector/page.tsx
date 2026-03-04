"use client";

import { useState, useEffect, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { Search, Download, FileText, ShieldCheck, Coffee, Calendar as CalendarIcon, LogOut, Clock, Building2 } from "lucide-react";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

interface Interval { type: "WORK" | "BREAK"; date: string; start: number; end: number | null; ms: number; }
interface DailySummary { work: Interval[]; breaks: Interval[]; workMs: number; breakMs: number; }
interface EmployeeReport { email: string; displayName: string; totalWorkMs: number; totalBreakMs: number; days: Record<string, DailySummary>; }

function dateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function dur(ms: number): string {
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

function fmt(ts: number): string {
  return new Date(ts).toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" });
}

function InspectorContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  
  const [code, setCode] = useState(searchParams.get("token") || "");
  const [fromDate, setFromDate] = useState(() => {
    return searchParams.get("from") || (() => { const d = new Date(); d.setMonth(d.getMonth() - 1); return dateStr(d); })();
  });
  const [toDate, setToDate] = useState(() => searchParams.get("to") || dateStr(new Date()));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [report, setReport] = useState<EmployeeReport[] | null>(null);

  useEffect(() => {
    if (searchParams.get("token") && searchParams.get("from") && searchParams.get("to") && !report && !loading && !error) {
       // Autoload if URL has all params
       handleVerify(null);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleVerify(e: React.FormEvent | null) {
    if (e) e.preventDefault();
    if (!code || !fromDate || !toDate) {
      setError("Rellena todos los campos.");
      return;
    }

    setLoading(true);
    setError("");
    setReport(null);

    try {
      const res = await fetch("/api/inspector/data", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: code.toUpperCase(), fromDate, toDate }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Error al verificar código");

      setReport(data.report);
      // Persist to URL so F5 works
      router.push(`/inspector?token=${code.toUpperCase()}&from=${fromDate}&to=${toDate}`, { scroll: false });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error desconocido");
    } finally {
      setLoading(false);
    }
  }

  function handleDownloadPDF() {
    if (!report || report.length === 0) return;

    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.width;
    const pageHeight = doc.internal.pageSize.height;
    
    report.forEach((emp, index) => {
      if (index > 0) doc.addPage();

      // --- HEADER ---
      doc.setFont("helvetica", "bold");
      doc.setFontSize(16);
      doc.text("REGISTRO OFICIAL DE JORNADA LABORAL", pageWidth / 2, 20, { align: "center" });
      
      doc.setFontSize(10);
      doc.setFont("helvetica", "normal");
      doc.text("(Artículo 34.9 del Estatuto de los Trabajadores)", pageWidth / 2, 25, { align: "center" });

      // --- COMPANY INFO ---
      doc.setDrawColor(200);
      doc.setFillColor(248, 250, 252);
      doc.roundedRect(14, 32, pageWidth - 28, 20, 2, 2, "FD");
      
      doc.setFontSize(9);
      doc.setFont("helvetica", "bold");
      doc.text("DATOS DE LA EMPRESA", 18, 38);
      doc.setFont("helvetica", "normal");
      doc.text("Razón Social: SUMA BELLEZA C.B.", 18, 44);
      doc.text("CIF: E88553383", 18, 49);

      // --- EMPLOYEE INFO ---
      doc.setFillColor(248, 250, 252);
      doc.roundedRect(14, 56, pageWidth - 28, 20, 2, 2, "FD");
      doc.setFont("helvetica", "bold");
      doc.text("DATOS DEL TRABAJADOR", 18, 62);
      doc.setFont("helvetica", "normal");
      doc.text(`Nombre: ${emp.displayName.toUpperCase()}`, 18, 68);
      doc.text(`Identificación / Email: ${emp.email}`, 18, 73);

      // --- PERIOD ---
      doc.setFont("helvetica", "bold");
      doc.text(`Período Auditado: ${new Date(fromDate).toLocaleDateString("es-ES")} al ${new Date(toDate).toLocaleDateString("es-ES")}`, 14, 85);

      let startY = 90;

      const includeSignatures = report.length === 1;

      // --- TABLE DATA ---
      const tableData = Object.entries(emp.days)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([date, summary]) => {
          const workIntervals = summary.work.map(s => `${fmt(s.start)} - ${s.end ? fmt(s.end) : "En curso"}`).join("\n");
          const breakIntervals = summary.breaks.map(s => `${fmt(s.start)} - ${s.end ? fmt(s.end) : "En curso"}`).join("\n");
          
          const row = [
            new Date(date + "T00:00:00").toLocaleDateString("es-ES", { day: '2-digit', month: '2-digit', year: 'numeric' }),
            workIntervals || "Sin fichar",
            breakIntervals || "-",
            dur(summary.workMs),
            summary.breakMs > 0 ? dur(summary.breakMs) : "-"
          ];
          if (includeSignatures) row.push("");
          return row;
        });

      // Add a final row for Totals
      const totalRow = [
        "TOTAL PERÍODO",
        "",
        "",
        dur(emp.totalWorkMs),
        dur(emp.totalBreakMs)
      ];
      if (includeSignatures) totalRow.push("");
      tableData.push(totalRow);

      const headRow = includeSignatures 
        ? [["Fecha", "Jornadas (Entrada - Salida)", "Pausas", "T. Efectivo", "T. Pausa", "Firma Trabajador"]]
        : [["Fecha", "Jornadas (Entrada - Salida)", "Pausas", "T. Efectivo", "T. Pausa"]];

      const columnStyles = includeSignatures 
        ? {
            0: { cellWidth: 22, halign: "center" },
            1: { cellWidth: 42 },
            2: { cellWidth: 32 },
            3: { cellWidth: 20, halign: 'right', fontStyle: "bold" },
            4: { cellWidth: 20, halign: 'right' },
            5: { cellWidth: 42 } // Blank column
          }
        : {
            0: { cellWidth: 25, halign: "center" },
            1: { cellWidth: 55 },
            2: { cellWidth: 45 },
            3: { cellWidth: 25, halign: 'right', fontStyle: "bold" },
            4: { cellWidth: 28, halign: 'right' }
          };

      autoTable(doc, {
        startY: startY,
        head: headRow,
        body: tableData,
        theme: "grid",
        headStyles: { fillColor: [30, 41, 59], textColor: 255, fontStyle: "bold", halign: "center" },
        styles: { fontSize: 8, cellPadding: 3, valign: 'middle' },
        columnStyles: columnStyles as any,
        didParseCell: function(data) {
          if (data.row.index === tableData.length - 1 && data.section === 'body') {
            data.cell.styles.fontStyle = 'bold';
            data.cell.styles.fillColor = [241, 245, 249];
          }
        }
      });

      let finalY = (doc as any).lastAutoTable.finalY + 15;

      // --- SIGNATURE BLOCK ---
      // If there is not enough space for the signature block
      if (includeSignatures) {
        if (finalY + 90 > pageHeight) { // Add space allowance for potential signature images
          doc.addPage();
          finalY = 20;
        }

        doc.setFontSize(8);
        doc.setFont("helvetica", "italic");
        doc.setTextColor(100);
        const declarationText = "Declaro que los datos aquí reflejados son ciertos y corresponden a las horas de trabajo efectivas realizadas en el periodo indicado, sirviendo como registro oficial según establece el Art. 34.9 de la Ley del Estatuto de los Trabajadores.";
        const splittedText = doc.splitTextToSize(declarationText, pageWidth - 28);
        doc.text(splittedText, 14, finalY);

        finalY += (splittedText.length * 4) + 12;

        doc.setFontSize(9);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(0);

        const signY = finalY + 15;
        
        // Emp box
        doc.text("Por la EMPRESA", 45, finalY, { align: "center" });
        doc.line(20, signY, 70, signY); 
        doc.setFontSize(7);
        doc.setFont("helvetica", "normal");
        doc.text("Firma y sello", 45, signY + 4, { align: "center" });

        // Worker box
        doc.setFontSize(9);
        doc.setFont("helvetica", "bold");
        doc.text("EL TRABAJADOR", pageWidth - 45, finalY, { align: "center" });
        doc.line(pageWidth - 70, signY, pageWidth - 20, signY);
        doc.setFontSize(7);
        doc.setFont("helvetica", "normal");
        doc.text("Firma o conformidad electrónica", pageWidth - 45, signY + 4, { align: "center" });
      }

      // --- AUDIT METADATA FOOTER ---
      const pageFooterY = pageHeight - 10;
      doc.setFontSize(7);
      doc.setTextColor(150);
      const timestamp = new Date().toLocaleString("es-ES");
      doc.text(`Documento generado digitalmente. Expediente auditoría: ${code.toUpperCase()} | Fecha emisión: ${timestamp}`, 14, pageFooterY);
      doc.setTextColor(0); // Reset
    });

    doc.save(`Registro_Jornada_${code}_${fromDate}_${toDate}.pdf`);
  }

  return (
    <main className="min-h-dvh flex flex-col bg-slate-50 text-slate-800 font-sans selection:bg-blue-500/20">
      {/* HEADER */}
      <header className="bg-slate-900 text-white px-4 py-4 md:px-8 md:py-6 shadow-md flex items-center justify-between sticky top-0 z-20">
        <div className="flex items-center gap-3">
          <ShieldCheck className="w-7 h-7 md:w-8 md:h-8 text-blue-400" />
          <div className="flex flex-col">
            <h1 className="text-lg md:text-xl font-bold leading-tight tracking-tight">Sede Electrónica</h1>
            <p className="hidden md:block text-blue-200/80 text-xs font-medium uppercase tracking-wider mt-0.5">Inspección Laboral</p>
          </div>
        </div>
        <div className="max-w-[150px] md:max-w-none">
          <div className="flex items-center gap-1.5 md:gap-2 text-xs md:text-sm font-medium bg-white/10 px-3 py-1.5 rounded-full border border-white/10 truncate">
            <Building2 className="w-3.5 h-3.5 md:w-4 md:h-4 shrink-0" />
            <span className="truncate">Suma Belleza C.B.</span>
          </div>
        </div>
      </header>

      <div className="flex-1 w-full max-w-5xl mx-auto p-4 md:p-8 flex flex-col items-center">
        {!report ? (
          // ACCESO PORTAL
          <div className="w-full max-w-lg mx-auto mt-4 md:mt-12 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="bg-white p-6 md:p-8 rounded-2xl shadow-sm border border-slate-200">
              <form onSubmit={handleVerify} className="space-y-6 md:space-y-8">
                <div className="text-center space-y-1.5 pb-4 border-b border-slate-100">
                  <h2 className="text-xl md:text-2xl font-bold text-slate-800">Acceso a Registros Oficiales</h2>
                  <p className="text-xs md:text-sm text-slate-500 px-2">Introduzca el PIN temporal facilitado por la empresa.</p>
                </div>
                
                <div className="space-y-5">
                  <div className="space-y-1.5">
                    <label className="block text-xs uppercase font-bold text-slate-500 tracking-wider">Código de Autorización</label>
                    <input
                      type="text"
                      value={code}
                      onChange={e => setCode(e.target.value.toUpperCase())}
                      placeholder="Ej. AB49F2"
                      className="w-full text-center text-3xl font-mono tracking-[0.4em] md:tracking-[0.5em] p-4 rounded-xl border border-slate-300 bg-slate-50 focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 transition-all uppercase placeholder:text-slate-300"
                      maxLength={6}
                      required
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3 md:gap-5">
                    <div className="space-y-1.5">
                      <label className="block text-xs uppercase font-bold text-slate-500 tracking-wider">Inicio</label>
                      <div className="relative">
                        <input
                          type="date"
                          value={fromDate}
                          onChange={e => setFromDate(e.target.value)}
                          className="w-full pl-3 pr-2 py-2.5 rounded-xl border border-slate-300 focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 transition-all bg-white text-sm"
                          required
                        />
                      </div>
                    </div>
                    <div className="space-y-1.5">
                      <label className="block text-xs uppercase font-bold text-slate-500 tracking-wider">Fin</label>
                      <div className="relative">
                        <input
                          type="date"
                          value={toDate}
                          onChange={e => setToDate(e.target.value)}
                          className="w-full pl-3 pr-2 py-2.5 rounded-xl border border-slate-300 focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 transition-all bg-white text-sm"
                          required
                        />
                      </div>
                    </div>
                  </div>
                </div>

                {error && (
                  <div className="text-red-700 text-sm font-medium bg-red-50 p-3 rounded-lg border border-red-100 flex items-center justify-center gap-1.5">
                    <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/></svg>
                    {error}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={loading || code.length < 6}
                  className="w-full py-3.5 mt-2 rounded-xl font-bold text-white bg-blue-600 hover:bg-blue-700 transition-all disabled:opacity-50 shadow-md shadow-blue-500/20 flex justify-center items-center gap-2"
                >
                  {loading ? (
                    <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  ) : <Search className="w-5 h-5 opacity-80" />}
                  {loading ? "Verificando..." : "Acceder al Registro Digital"}
                </button>
              </form>
            </div>
          </div>
        ) : (
          // RESULTADOS PORTAL
          <div className="w-full animate-in fade-in flex flex-col gap-4 md:gap-6">
            
            {/* Cabecera Informe */}
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 md:p-6 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
              <div className="space-y-1">
                <h2 className="text-lg md:text-xl font-bold flex items-center gap-2 text-slate-800">
                  <FileText className="w-5 h-5 text-blue-500" /> 
                  Informe Oficial de Jornada
                </h2>
                <div className="text-xs md:text-sm text-slate-500 flex flex-wrap items-center gap-x-3 gap-y-1 font-medium">
                  <span className="flex items-center gap-1.5 bg-slate-100 px-2 py-0.5 rounded-md text-slate-700"><CalendarIcon className="w-3.5 h-3.5"/> {new Date(fromDate).toLocaleDateString("es-ES")} a {new Date(toDate).toLocaleDateString("es-ES")}</span>
                  <span className="flex items-center gap-1.5">Expediente: <span className="font-mono bg-slate-100 px-1.5 py-0.5 rounded border border-slate-200 text-slate-800">{code}</span></span>
                </div>
              </div>
              <div className="flex w-full sm:w-auto gap-2">
                <button
                  onClick={handleDownloadPDF}
                  className="flex-1 sm:flex-none flex items-center justify-center gap-2 bg-blue-600 text-white px-4 py-2.5 rounded-lg text-sm font-bold hover:bg-blue-700 transition active:scale-95 shadow-sm"
                >
                  <Download className="w-4 h-4" /> PDF
                </button>
                <button
                  onClick={() => { setReport(null); setCode(""); router.push("/inspector", { scroll: false }); }}
                  className="flex-1 sm:flex-none flex items-center justify-center gap-2 bg-white border border-slate-300 text-slate-700 px-4 py-2.5 rounded-lg text-sm font-bold hover:bg-slate-50 transition active:scale-95 shadow-sm"
                >
                  <LogOut className="w-4 h-4" /> Salir
                </button>
              </div>
            </div>

            {/* Listado de Empleados */}
            <div className="space-y-4 md:space-y-6">
              {report.map(emp => (
                <div key={emp.email} className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden flex flex-col">
                  {/* Etiqueta Trabajador */}
                  <div className="bg-slate-50 p-4 border-b border-slate-200 flex flex-col sm:flex-row justify-between sm:items-center gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-10 h-10 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center font-bold text-sm shrink-0 shadow-inner border border-blue-200 uppercase">
                        {emp.displayName.substring(0,2)}
                      </div>
                      <div className="min-w-0">
                        <h3 className="font-bold text-slate-900 truncate uppercase tracking-tight leading-tight">{emp.displayName}</h3>
                        <p className="text-xs font-medium text-slate-500 truncate">{emp.email}</p>
                      </div>
                    </div>
                    {/* Contadores Totales */}
                    <div className="flex items-center gap-2 overflow-x-auto pb-1 sm:pb-0 shrink-0">
                      <div className="flex items-center gap-1.5 bg-green-50 text-green-700 border border-green-200 px-2.5 py-1 rounded-md text-xs font-semibold whitespace-nowrap shadow-sm">
                        <Clock className="w-3.5 h-3.5" /> Efectivo: {dur(emp.totalWorkMs)}
                      </div>
                      {emp.totalBreakMs > 0 && (
                        <div className="flex items-center gap-1.5 bg-orange-50 text-orange-700 border border-orange-200 px-2.5 py-1 rounded-md text-xs font-semibold whitespace-nowrap shadow-sm">
                          <Coffee className="w-3.5 h-3.5" /> Pausas: {dur(emp.totalBreakMs)}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Tabla / Grid Días */}
                  <div className="p-0 overflow-x-auto">
                     {Object.keys(emp.days).length > 0 ? (
                      <table className="w-full text-sm text-left whitespace-nowrap text-slate-600 min-w-[600px]">
                        <thead className="bg-white text-slate-400 text-[10px] md:text-xs uppercase border-b border-slate-100 font-bold tracking-wider">
                          <tr>
                            <th className="px-4 py-3">Fecha de Fichaje</th>
                            <th className="px-4 py-3">Jornada Módulo (EN - SA)</th>
                            <th className="px-4 py-3">Descansos</th>
                            <th className="px-4 py-3 text-right">Efectivo</th>
                            <th className="px-4 py-3 text-right">Pausa</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {Object.entries(emp.days).sort(([a], [b]) => a.localeCompare(b)).map(([date, summary]) => (
                            <tr key={date} className="hover:bg-slate-50 transition-colors">
                              <td className="px-4 py-3 font-semibold text-slate-800">
                                {new Date(date + "T00:00:00").toLocaleDateString("es-ES", { weekday: "short", day: "2-digit", month: "short" })}
                              </td>
                              <td className="px-4 py-3">
                                <div className="flex flex-col gap-1 text-xs">
                                  {summary.work.map((s, i) => (
                                    <span key={`w-${i}`} className="inline-flex items-center gap-1.5 bg-slate-100 border border-slate-200 px-2 py-0.5 rounded text-slate-700 font-medium w-max">
                                      <span className="w-1.5 h-1.5 rounded-full bg-blue-500"></span>
                                      {fmt(s.start)} <span className="opacity-50">→</span> {s.end ? fmt(s.end) : <span className="text-blue-600 italic">Cursando</span>}
                                    </span>
                                  ))}
                                  {summary.work.length === 0 && <span className="text-slate-400 italic">No activity</span>}
                                </div>
                              </td>
                              <td className="px-4 py-3">
                                <div className="flex flex-col gap-1 text-xs">
                                   {summary.breaks.map((s, i) => (
                                    <span key={`b-${i}`} className="inline-flex items-center gap-1.5 bg-orange-50 border border-orange-100 px-2 py-0.5 rounded text-orange-800 font-medium w-max">
                                      <Coffee className="w-3 h-3 text-orange-500" />
                                      {fmt(s.start)} <span className="opacity-50">→</span> {s.end ? fmt(s.end) : <span className="text-orange-600 italic">Descansando</span>}
                                    </span>
                                  ))}
                                  {summary.breaks.length === 0 && <span className="text-slate-300">-</span>}
                                </div>
                              </td>
                              <td className="px-4 py-3 text-right font-bold text-slate-800">
                                {dur(summary.workMs)}
                              </td>
                              <td className="px-4 py-3 text-right font-medium text-slate-500">
                                {summary.breakMs > 0 ? <span className="text-orange-600 bg-orange-50 border border-orange-100 px-1.5 py-0.5 rounded">{dur(summary.breakMs)}</span> : "-"}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                     ) : (
                       <div className="p-8 text-center text-slate-400 text-sm italic bg-slate-50/50">
                         Sin registros para este trabajador.
                       </div>
                     )}
                  </div>
                </div>
              ))}
            </div>

          </div>
        )}
      </div>
    </main>
  );
}

export default function InspectorPage() {
  return (
    <Suspense fallback={<div className="min-h-dvh flex items-center justify-center bg-slate-50">Cargando...</div>}>
      <InspectorContent />
    </Suspense>
  );
}
