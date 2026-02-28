"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import type {
  InspectionReport,
  InspectionEmployee,
  InspectionDayRecord,
} from "@/types";

function formatTime(timestamp: number): string {
  return new Date(timestamp).toLocaleTimeString("es-ES", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Madrid",
  });
}

function formatDate(dateStr: string): string {
  const [year, month, day] = dateStr.split("-");
  return `${day}/${month}/${year}`;
}

function formatMinutes(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return `${hours}h ${String(mins).padStart(2, "0")}m`;
}

function EmployeeTable({ employee }: { employee: InspectionEmployee }) {
  return (
    <div className="mb-6">
      <div className="mb-2 flex items-baseline justify-between">
        <h2 className="text-sm font-bold">
          {employee.email || `ID: ${employee.uid.slice(0, 8)}`}
        </h2>
        <span className="text-xs text-muted">
          Total: {formatMinutes(employee.totalMinutes)}
        </span>
      </div>

      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="w-full text-left text-xs">
          <thead>
            <tr className="border-b border-border bg-background">
              <th className="px-3 py-2 font-medium">Fecha</th>
              <th className="px-3 py-2 font-medium">Entrada</th>
              <th className="px-3 py-2 font-medium">Salida</th>
              <th className="px-3 py-2 text-right font-medium">Total</th>
            </tr>
          </thead>
          <tbody>
            {employee.records.map((record: InspectionDayRecord) => {
              const ins = record.entries
                .filter((e) => e.type === "IN")
                .map((e) => formatTime(e.timestamp));
              const outs = record.entries
                .filter((e) => e.type === "OUT")
                .map((e) => formatTime(e.timestamp));

              return (
                <tr
                  key={record.date}
                  className="border-b border-border last:border-0"
                >
                  <td className="px-3 py-2 font-mono">
                    {formatDate(record.date)}
                  </td>
                  <td className="px-3 py-2 text-success">
                    {ins.join(", ") || "—"}
                  </td>
                  <td className="px-3 py-2 text-danger">
                    {outs.join(", ") || "—"}
                  </td>
                  <td className="px-3 py-2 text-right font-medium">
                    {formatMinutes(record.totalMinutes)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function InspectionPage() {
  const { hash } = useParams<{ hash: string }>();
  const [report, setReport] = useState<InspectionReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    async function fetchReport() {
      try {
        const response = await fetch(`/api/inspect/${hash}`);
        if (!response.ok) {
          const data = await response.json();
          throw new Error(data.error || "Error al cargar el reporte");
        }
        const data: InspectionReport = await response.json();
        setReport(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Error desconocido");
      } finally {
        setLoading(false);
      }
    }
    fetchReport();
  }, [hash]);

  if (loading) {
    return (
      <div className="flex min-h-dvh items-center justify-center">
        <p className="text-muted">Cargando reporte de inspección...</p>
      </div>
    );
  }

  if (error || !report) {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-4 p-6">
        <h1 className="text-xl font-bold text-danger">Error</h1>
        <p className="text-center text-sm text-muted">
          {error || "Reporte no disponible"}
        </p>
      </div>
    );
  }

  const totalEmployees = report.employees.length;
  const totalRecords = report.employees.reduce(
    (sum, emp) => sum + emp.records.length,
    0
  );

  return (
    <div className="p-4 pb-8 print:p-2">
      {/* Header */}
      <div className="mb-6 border-b border-border pb-4">
        <h1 className="text-xl font-bold">Registro de Jornada</h1>
        <p className="text-sm text-muted">Reporte de inspección laboral</p>
        <div className="mt-3 space-y-1 text-sm">
          <p>
            <span className="font-medium">Empresa:</span>{" "}
            {report.company.name}
          </p>
          <p>
            <span className="font-medium">Período:</span>{" "}
            {formatDate(report.period.from)} – {formatDate(report.period.to)}
          </p>
          <p>
            <span className="font-medium">Generado:</span>{" "}
            {new Date(report.generatedAt).toLocaleString("es-ES", {
              timeZone: "Europe/Madrid",
            })}
          </p>
        </div>
      </div>

      {/* Summary */}
      <div className="mb-6 grid grid-cols-2 gap-3">
        <div className="rounded-lg bg-primary/10 p-3 text-center">
          <p className="text-2xl font-bold text-primary">{totalEmployees}</p>
          <p className="text-xs text-muted">Empleados</p>
        </div>
        <div className="rounded-lg bg-success/10 p-3 text-center">
          <p className="text-2xl font-bold text-success">{totalRecords}</p>
          <p className="text-xs text-muted">Días registrados</p>
        </div>
      </div>

      {/* Employee Records */}
      {report.employees.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted">
          No hay registros en el período seleccionado.
        </p>
      ) : (
        report.employees.map((employee) => (
          <EmployeeTable key={employee.uid} employee={employee} />
        ))
      )}

      {/* Print Button */}
      <div className="mt-6 flex justify-center print:hidden">
        <button
          onClick={() => window.print()}
          className="rounded-lg bg-primary px-6 py-3 text-sm font-medium text-white hover:bg-primary-dark"
        >
          Descargar PDF / Imprimir
        </button>
      </div>

      {/* Footer */}
      <div className="mt-8 border-t border-border pt-4 text-center text-xs text-muted">
        <p>
          Documento generado conforme a la Ley de Registro de Jornada Digital.
        </p>
        <p>
          Este reporte es una representación fiel de los registros almacenados.
        </p>
      </div>
    </div>
  );
}
