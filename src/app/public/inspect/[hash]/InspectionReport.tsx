"use client";

import type {
  InspectionReport as ReportType,
  EmployeeRecord,
  DailyRecord,
} from "@/types";
import { formatDuration } from "@/lib/inspection";

const TYPE_LABELS: Record<string, string> = {
  IN: "Entrada",
  OUT: "Salida",
  BREAK_START: "Inicio pausa",
  BREAK_END: "Fin pausa",
};

function formatReportDate(dateStr: string): string {
  const [year, month, day] = dateStr.split("-");
  return `${day}/${month}/${year}`;
}

function EmployeeSection({ employee }: { employee: EmployeeRecord }) {
  const identifier =
    employee.displayName || employee.email || `Empleado ${employee.uid.slice(0, 8)}`;

  return (
    <section className="mb-8 break-inside-avoid-page">
      <h3 className="mb-3 border-b border-border pb-2 text-lg font-semibold">
        {identifier}
      </h3>

      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="bg-primary/10">
              <th className="border border-border px-3 py-2 text-left">
                Fecha
              </th>
              <th className="border border-border px-3 py-2 text-left">
                Registros
              </th>
              <th className="border border-border px-3 py-2 text-right">
                Horas trabajadas
              </th>
            </tr>
          </thead>
          <tbody>
            {employee.days.map((day: DailyRecord) => (
              <tr key={day.date} className="even:bg-surface">
                <td className="border border-border px-3 py-2 whitespace-nowrap">
                  {formatReportDate(day.date)}
                </td>
                <td className="border border-border px-3 py-2">
                  {day.entries.map((entry, i) => (
                    <span key={i} className="mr-3 inline-block whitespace-nowrap">
                      <span className="font-mono">{entry.time}</span>{" "}
                      <span className="text-muted">
                        ({TYPE_LABELS[entry.type] || entry.type})
                      </span>
                    </span>
                  ))}
                </td>
                <td className="border border-border px-3 py-2 text-right font-mono whitespace-nowrap">
                  {formatDuration(day.totalWorkedMs)}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="bg-primary/5 font-semibold">
              <td
                className="border border-border px-3 py-2"
                colSpan={2}
              >
                Total periodo
              </td>
              <td className="border border-border px-3 py-2 text-right font-mono">
                {formatDuration(employee.totalWorkedMs)}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </section>
  );
}

export function InspectionReport({ report }: { report: ReportType }) {
  return (
    <div className="inspection-report mx-auto max-w-5xl px-4 py-8 print:max-w-none print:px-0 print:py-0">
      <header className="mb-8 border-b-2 border-primary pb-6">
        <h1 className="mb-1 text-2xl font-bold">Registro de Jornada</h1>
        <h2 className="mb-4 text-lg text-muted">
          Reporte para inspección laboral
        </h2>

        <dl className="grid grid-cols-1 gap-x-8 gap-y-2 text-sm sm:grid-cols-2">
          <div>
            <dt className="font-medium text-muted">Empresa</dt>
            <dd className="font-semibold">{report.companyName}</dd>
          </div>
          <div>
            <dt className="font-medium text-muted">ID Empresa</dt>
            <dd className="font-mono text-xs">{report.companyId}</dd>
          </div>
          <div>
            <dt className="font-medium text-muted">Periodo</dt>
            <dd>
              {formatReportDate(report.periodStart)} —{" "}
              {formatReportDate(report.periodEnd)}
            </dd>
          </div>
          <div>
            <dt className="font-medium text-muted">Fecha de generación</dt>
            <dd>
              {new Date(report.generatedAt).toLocaleString("es-ES", {
                dateStyle: "long",
                timeStyle: "short",
              })}
            </dd>
          </div>
          <div>
            <dt className="font-medium text-muted">Total empleados</dt>
            <dd>{report.employees.length}</dd>
          </div>
        </dl>
      </header>

      <div className="mb-6 flex justify-end print:hidden">
        <button
          onClick={() => window.print()}
          className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary-dark"
        >
          Descargar PDF
        </button>
      </div>

      {report.employees.length === 0 ? (
        <p className="py-12 text-center text-muted">
          No se encontraron registros de jornada en el periodo seleccionado.
        </p>
      ) : (
        report.employees.map((employee) => (
          <EmployeeSection key={employee.uid} employee={employee} />
        ))
      )}

      <footer className="mt-12 border-t border-border pt-4 text-center text-xs text-muted print:mt-8">
        <p>
          Documento generado automáticamente conforme al Real Decreto-ley 8/2019
          de registro de jornada.
        </p>
        <p>
          Los datos mostrados corresponden exclusivamente a los registros
          obligatorios de jornada laboral.
        </p>
      </footer>
    </div>
  );
}
