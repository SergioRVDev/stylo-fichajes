import { NextResponse } from "next/server";
import {
  getCompanyIdByHash,
  getCompanyInfo,
  getAllCompanyLogs,
  getEmployeeEmails,
} from "@/lib/firebase/database";
import type {
  InspectionReport,
  InspectionEmployee,
  InspectionDayRecord,
  TimeLog,
} from "@/types";

function getDateMonthsAgo(months: number): string {
  const date = new Date();
  date.setMonth(date.getMonth() - months);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getTodayDate(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function calculateDayMinutes(logs: TimeLog[]): number {
  let totalMs = 0;
  let lastInTimestamp: number | null = null;

  for (const log of logs) {
    if (log.type === "IN") {
      lastInTimestamp = log.timestamp;
    } else if (log.type === "OUT" && lastInTimestamp !== null) {
      totalMs += log.timestamp - lastInTimestamp;
      lastInTimestamp = null;
    }
  }

  return Math.round(totalMs / 60000);
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ hash: string }> }
) {
  try {
    const { hash } = await params;

    const companyId = await getCompanyIdByHash(hash);
    if (!companyId) {
      return NextResponse.json(
        { error: "Empresa no encontrada" },
        { status: 404 }
      );
    }

    const company = await getCompanyInfo(companyId);
    if (!company) {
      return NextResponse.json(
        { error: "Información de empresa no disponible" },
        { status: 404 }
      );
    }

    const fromDate = getDateMonthsAgo(3);
    const toDate = getTodayDate();

    const [logs, emailMap] = await Promise.all([
      getAllCompanyLogs(companyId, fromDate, toDate),
      getEmployeeEmails(companyId),
    ]);

    const employees: InspectionEmployee[] = Object.entries(logs).map(
      ([uid, dateLogs]) => {
        const records: InspectionDayRecord[] = Object.entries(dateLogs)
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([date, dayLogs]) => ({
            date,
            entries: dayLogs.map((log) => ({
              type: log.type,
              timestamp: log.timestamp,
            })),
            totalMinutes: calculateDayMinutes(dayLogs),
          }));

        const totalMinutes = records.reduce(
          (sum, r) => sum + r.totalMinutes,
          0
        );

        return {
          uid,
          email: emailMap[uid],
          records,
          totalMinutes,
        };
      }
    );

    const report: InspectionReport = {
      company: { id: companyId, name: company.name },
      period: { from: fromDate, to: toDate },
      employees,
      generatedAt: new Date().toISOString(),
    };

    return NextResponse.json(report);
  } catch (error) {
    console.error("Error generating inspection report:", error);
    return NextResponse.json(
      { error: "Error al generar el reporte" },
      { status: 500 }
    );
  }
}
