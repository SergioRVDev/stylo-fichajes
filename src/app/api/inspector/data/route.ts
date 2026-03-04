import { NextRequest, NextResponse } from "next/server";
import { getAdminApp, getAdminAllCompanyLogs, getAdminAllEmployeesRecord } from "@/lib/firebase/admin";
import { getDatabase } from "firebase-admin/database";
import type { TimeLog, Employee } from "@/types";

interface Interval { type: "WORK" | "BREAK"; date: string; start: number; end: number | null; ms: number; }

interface DailySummary {
  work: Interval[];
  breaks: Interval[];
  workMs: number;
  breakMs: number;
}

interface EmployeeReport {
  email: string;
  displayName: string;
  totalWorkMs: number;
  totalBreakMs: number;
  days: Record<string, DailySummary>;
}

function processLogs(logs: TimeLog[]): Interval[] {
  const raw: { type: "WORK"|"BREAK", start: number, end: number | null }[] = [];
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

export async function POST(request: NextRequest) {
  try {
    const { token, fromDate, toDate } = await request.json();

    if (!token || !fromDate || !toDate) {
      return NextResponse.json({ error: "Faltan parámetros (token, fromDate, toDate)" }, { status: 400 });
    }

    const app = getAdminApp();
    const db = getDatabase(app);

    const tokenSnap = await db.ref(`inspector_tokens/${token}`).get();
    if (!tokenSnap.exists()) {
      return NextResponse.json({ error: "Código de inspección inválido" }, { status: 401 });
    }

    const tokenData = tokenSnap.val();
    
    // Support legacy time-based expiration just in case
    if (tokenData.expiresAt && Date.now() > tokenData.expiresAt) {
      return NextResponse.json({ error: "El código de inspección ha caducado" }, { status: 401 });
    }

    // New logic: 2-use limit
    if (tokenData.maxUses !== undefined) {
      if ((tokenData.uses || 0) >= tokenData.maxUses) {
        return NextResponse.json({ error: "Este código de inspección ya ha agotado sus usos permitidos" }, { status: 401 });
      }

      // Consume one use
      await db.ref(`inspector_tokens/${token}`).update({
        uses: (tokenData.uses || 0) + 1
      });
    }

    // Default company for now
    const companyId = "default";

    const [logs, employeesMap] = await Promise.all([
      getAdminAllCompanyLogs(companyId, fromDate, toDate),
      getAdminAllEmployeesRecord(companyId)
    ]);

    const reportData: EmployeeReport[] = [];

    for (const [uid, dateLogsMap] of Object.entries(logs)) {
      let entries: TimeLog[] = [];
      for (const logsArray of Object.values(dateLogsMap as Record<string, TimeLog[]>)) {
        if (Array.isArray(logsArray)) entries.push(...logsArray);
        else entries.push(...Object.values(logsArray as Record<string, TimeLog>));
      }

      entries.sort((a, b) => a.timestamp - b.timestamp);
      const allSessions = processLogs(entries);

      const days: Record<string, DailySummary> = {};
      let totalWorkMs = 0;
      let totalBreakMs = 0;

      for (const s of allSessions) {
        if (s.date >= fromDate && s.date <= toDate) {
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
        days
      });
    }

    reportData.sort((a, b) => b.totalWorkMs - a.totalWorkMs);

    return NextResponse.json({ report: reportData, generatedAt: new Date().toISOString() });

  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Error al procesar inspector data";
    console.error("Inspector API Error:", error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
