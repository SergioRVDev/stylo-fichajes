import { randomBytes } from "crypto";
import { getAdminDatabase, getAdminAuth } from "@/lib/firebase/admin";
import type {
  InspectionHashEntry,
  InspectionReport,
  EmployeeRecord,
  DailyRecord,
  TimeLog,
  TimeLogType,
} from "@/types";

export async function generateInspectionHash(
  companyId: string,
  companyName: string
): Promise<string> {
  const db = getAdminDatabase();
  const hash = randomBytes(16).toString("hex");

  const entry: InspectionHashEntry = {
    companyId,
    companyName,
    createdAt: Date.now(),
  };

  await db.ref(`inspectionHashes/${hash}`).set(entry);
  await db
    .ref(`companies/${companyId}/inspectionHash`)
    .set(hash);

  return hash;
}

export async function getCompanyByHash(
  hash: string
): Promise<InspectionHashEntry | null> {
  const db = getAdminDatabase();
  const snapshot = await db.ref(`inspectionHashes/${hash}`).get();

  if (!snapshot.exists()) return null;
  return snapshot.val() as InspectionHashEntry;
}

function getThreeMonthsAgoDate(): string {
  const date = new Date();
  date.setMonth(date.getMonth() - 3);
  return formatDate(date);
}

function formatDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatTime(timestamp: number): string {
  const date = new Date(timestamp);
  return date.toLocaleTimeString("es-ES", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
}

function formatDuration(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  return `${hours}h ${String(minutes).padStart(2, "0")}min`;
}

function computeDailyWorked(
  entries: { timestamp: number; type: TimeLogType }[]
): number {
  let totalMs = 0;
  let lastIn: number | null = null;

  const sorted = [...entries].sort((a, b) => a.timestamp - b.timestamp);

  for (const entry of sorted) {
    if (entry.type === "IN" || entry.type === "BREAK_END") {
      lastIn = entry.timestamp;
    } else if (
      (entry.type === "OUT" || entry.type === "BREAK_START") &&
      lastIn !== null
    ) {
      totalMs += entry.timestamp - lastIn;
      lastIn = null;
    }
  }

  return totalMs;
}

async function resolveEmployeeInfo(
  uid: string
): Promise<{ email?: string; displayName?: string }> {
  try {
    const auth = getAdminAuth();
    const user = await auth.getUser(uid);
    return {
      email: user.email,
      displayName: user.displayName ?? undefined,
    };
  } catch {
    return {};
  }
}

export async function getInspectionReport(
  companyId: string,
  companyName: string
): Promise<InspectionReport> {
  const db = getAdminDatabase();
  const periodStart = getThreeMonthsAgoDate();
  const periodEnd = formatDate(new Date());

  const logsSnapshot = await db.ref(`logs/${companyId}`).get();

  const employees: EmployeeRecord[] = [];

  if (logsSnapshot.exists()) {
    const companyLogs = logsSnapshot.val() as Record<
      string,
      Record<string, Record<string, TimeLog>>
    >;

    const employeeUids = Object.keys(companyLogs);

    for (const uid of employeeUids) {
      const userInfo = await resolveEmployeeInfo(uid);
      const userDates = companyLogs[uid] ?? {};
      const days: DailyRecord[] = [];
      let employeeTotalMs = 0;

      const sortedDates = Object.keys(userDates)
        .filter((date) => date >= periodStart && date <= periodEnd)
        .sort();

      for (const date of sortedDates) {
        const dayLogs = userDates[date] ?? {};
        const rawEntries = Object.values(dayLogs);

        const totalWorkedMs = computeDailyWorked(rawEntries);
        employeeTotalMs += totalWorkedMs;

        const sortedEntries = [...rawEntries]
          .sort((a, b) => a.timestamp - b.timestamp)
          .map((entry) => ({
            time: formatTime(entry.timestamp),
            type: entry.type,
          }));

        days.push({
          date,
          entries: sortedEntries,
          totalWorkedMs,
        });
      }

      if (days.length > 0) {
        employees.push({
          uid,
          email: userInfo.email,
          displayName: userInfo.displayName,
          days,
          totalWorkedMs: employeeTotalMs,
        });
      }
    }
  }

  return {
    companyId,
    companyName,
    generatedAt: new Date().toISOString(),
    periodStart,
    periodEnd,
    employees,
  };
}

export { formatDuration };
