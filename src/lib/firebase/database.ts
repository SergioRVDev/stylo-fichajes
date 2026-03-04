import {
  ref,
  push,
  onValue,
  get,
  set,
  query,
  orderByChild,
  remove,
  type Unsubscribe,
} from "firebase/database";
import { getFirebaseDatabase } from "./config";
import type { TimeLog, TimeLogType, DeviceInfo, Company, UserRole, Employee, AuditLog, GeneratedReport } from "@/types";
import { getCurrentPosition } from "@/lib/geolocation";

function getDeviceInfo(): DeviceInfo {
  return {
    userAgent: typeof navigator !== "undefined" ? navigator.userAgent : "",
    platform: typeof navigator !== "undefined" ? navigator.platform : "",
  };
}

function getTodayDate(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export async function writeTimeLog(
  companyId: string,
  uid: string,
  type: TimeLogType,
  captureLocation: boolean = false
): Promise<string> {
  if (!companyId?.trim() || !uid?.trim()) {
    throw new Error("companyId and uid are required and cannot be empty");
  }

  const db = getFirebaseDatabase();
  const date = getTodayDate();
  const logsRef = ref(db, `logs/${companyId}/${uid}/${date}`);

  const coordinates = captureLocation ? await getCurrentPosition() : null;

  const timeLog: TimeLog = {
    uid,
    timestamp: Date.now(),
    type,
    deviceInfo: getDeviceInfo(),
    ...(coordinates && { coordinates }),
  };

  const result = await push(logsRef, timeLog);
  return result.key!;
}

export async function registerEmployee(
  companyId: string,
  uid: string,
  email: string,
  role: UserRole = "employee"
): Promise<void> {
  const db = getFirebaseDatabase();
  const empRef = ref(db, `employees/${companyId}/${uid}`);
  const snapshot = await get(empRef);

  if (snapshot.exists()) {
    const existing = snapshot.val();
    await set(empRef, { ...existing, email });
  } else {
    await set(empRef, { email, role, createdAt: Date.now() });
  }
}

export async function createEmployeeRecord(
  companyId: string,
  uid: string,
  data: { email: string; role: UserRole; displayName?: string; lastName?: string }
): Promise<void> {
  const db = getFirebaseDatabase();
  await set(ref(db, `employees/${companyId}/${uid}`), {
    email: data.email,
    role: data.role,
    displayName: data.displayName ?? "",
    lastName: data.lastName ?? "",
    createdAt: Date.now(),
  });
}

export async function updateEmployee(
  companyId: string,
  uid: string,
  data: { email?: string; displayName?: string; lastName?: string; role?: UserRole }
): Promise<void> {
  const db = getFirebaseDatabase();
  const empRef = ref(db, `employees/${companyId}/${uid}`);
  const snapshot = await get(empRef);
  if (snapshot.exists()) {
    const existing = snapshot.val();
    await set(empRef, { ...existing, ...data });
  }
}

export async function deleteEmployee(
  companyId: string,
  uid: string
): Promise<void> {
  const db = getFirebaseDatabase();
  await set(ref(db, `employees/${companyId}/${uid}`), null);
}

export async function getUserRole(
  companyId: string,
  uid: string
): Promise<UserRole> {
  const db = getFirebaseDatabase();
  const snapshot = await get(ref(db, `employees/${companyId}/${uid}/role`));
  if (!snapshot.exists()) return "employee";
  return snapshot.val() as UserRole;
}

export async function getAllEmployees(
  companyId: string
): Promise<Record<string, Employee>> {
  const db = getFirebaseDatabase();
  const snapshot = await get(ref(db, `employees/${companyId}`));
  if (!snapshot.exists()) return {};
  const data = snapshot.val();
  const employees: Record<string, Employee> = {};
  for (const uid of Object.keys(data)) {
    employees[uid] = {
      email: data[uid]?.email ?? "",
      role: data[uid]?.role ?? "employee",
      displayName: data[uid]?.displayName,
      lastName: data[uid]?.lastName,
      createdAt: data[uid]?.createdAt,
      schedule: data[uid]?.schedule,
    };
  }
  return employees;
}

export async function getCompanyIdByHash(
  hash: string
): Promise<string | null> {
  const db = getFirebaseDatabase();
  const snapshot = await get(ref(db, `inspectionHashes/${hash}`));
  if (!snapshot.exists()) return null;
  return snapshot.val() as string;
}

export async function getCompanyInfo(
  companyId: string
): Promise<Company | null> {
  const db = getFirebaseDatabase();
  const snapshot = await get(ref(db, `companies/${companyId}`));
  if (!snapshot.exists()) return null;
  return snapshot.val() as Company;
}

export async function getAllEmployeesRecord(
  companyId: string
): Promise<Record<string, Employee>> {
  const db = getFirebaseDatabase();
  const snapshot = await get(ref(db, `employees/${companyId}`));
  if (!snapshot.exists()) return {};
  
  const data = snapshot.val();
  const employees: Record<string, Employee> = {};
  
  for (const uid of Object.keys(data)) {
    employees[uid] = data[uid] as Employee;
  }
  
  return employees;
}

export async function getAllCompanyLogs(
  companyId: string,
  fromDate: string,
  toDate: string
): Promise<Record<string, Record<string, TimeLog[]>>> {
  const db = getFirebaseDatabase();
  const snapshot = await get(ref(db, `logs/${companyId}`));
  if (!snapshot.exists()) return {};

  const allData = snapshot.val();
  const result: Record<string, Record<string, TimeLog[]>> = {};

  for (const uid of Object.keys(allData)) {
    const userDates = allData[uid];
    for (const date of Object.keys(userDates)) {
      if (date >= fromDate && date <= toDate) {
        if (!result[uid]) result[uid] = {};
        const dayLogs = userDates[date];
        result[uid][date] = Object.values(dayLogs) as TimeLog[];
        result[uid][date].sort((a, b) => a.timestamp - b.timestamp);
      }
    }
  }

  return result;
}

export async function saveInspectionHash(
  companyId: string,
  companyName: string,
  hash: string
): Promise<void> {
  const db = getFirebaseDatabase();
  await set(ref(db, `companies/${companyId}`), {
    name: companyName,
    inspectionHash: hash,
    createdAt: Date.now(),
  });
  await set(ref(db, `inspectionHashes/${hash}`), companyId);
}

export function subscribeToDayLogs(
  companyId: string,
  uid: string,
  date: string,
  callback: (logs: (TimeLog & { id: string })[]) => void,
  onError?: (error: Error) => void
): Unsubscribe {
  const db = getFirebaseDatabase();
  const logsRef = ref(db, `logs/${companyId}/${uid}/${date}`);
  const logsQuery = query(logsRef, orderByChild("timestamp"));

  return onValue(
    logsQuery,
    (snapshot) => {
      const logs: (TimeLog & { id: string })[] = [];

      snapshot.forEach((child) => {
        logs.push({ id: child.key!, ...(child.val() as TimeLog) });
      });

      callback(logs);
    },
    (error) => {
      if (onError) {
        onError(error);
      } else {
        console.error("subscribeToDayLogs error:", error);
      }
    }
  );
}

export async function addCorrectionLog(
  companyId: string,
  adminUid: string,
  adminEmail: string,
  targetUid: string,
  targetEmail: string,
  date: string,
  logType: TimeLogType,
  logTimeStr: string, // "HH:mm"
  reason: string
): Promise<void> {
  if (!reason.trim()) throw new Error("Debe incluir un motivo de corrección");

  // Parse time
  const [hours, mins] = logTimeStr.split(":").map(Number);
  const logDate = new Date(date + "T00:00:00");
  logDate.setHours(hours!, mins!, 0, 0);
  const logTimestamp = logDate.getTime();

  const db = getFirebaseDatabase();
  
  // 1. Create the new TimeLog
  const timeLog: TimeLog = {
    uid: targetUid,
    timestamp: logTimestamp,
    type: logType,
    deviceInfo: { userAgent: "Admin Correction", platform: "System" },
  };
  const logsRef = ref(db, `logs/${companyId}/${targetUid}/${date}`);
  await push(logsRef, timeLog);

  // 2. Create Audit Log
  const auditLogsRef = ref(db, `audit_logs/${companyId}`);
  const newAuditRef = push(auditLogsRef);
  
  const auditLog: AuditLog = {
    id: newAuditRef.key!,
    editedByUid: adminUid,
    editedByEmail: adminEmail,
    targetUid,
    targetEmail,
    action: "ADD_LOG",
    timestamp: Date.now(),
    reason,
    details: {
      date,
      logTimestamp,
      logType,
    }
  };
  
  await set(newAuditRef, auditLog);
}

export async function getAuditLogs(companyId: string): Promise<AuditLog[]> {
  const db = getFirebaseDatabase();
  const snapshot = await get(ref(db, `audit_logs/${companyId}`));
  if (!snapshot.exists()) return [];
  
  const data = snapshot.val();
  const logs: AuditLog[] = Object.values(data);
  return logs.sort((a, b) => b.timestamp - a.timestamp); // descending
}

// ─── Correction Requests ───────────────────────────────────────────────────

import type { CorrectionRequest } from "@/types";

export async function submitCorrectionRequest(
  companyId: string,
  request: Omit<CorrectionRequest, "id" | "status" | "createdAt">
): Promise<string> {
  const db = getFirebaseDatabase();
  const reqRef = ref(db, `correction_requests/${companyId}`);
  const newRef = push(reqRef);
  const newRequest: CorrectionRequest = {
    ...request,
    id: newRef.key!,
    status: "pending",
    createdAt: Date.now(),
  };
  await set(newRef, newRequest);
  return newRef.key!;
}

export async function getCorrectionRequests(
  companyId: string
): Promise<CorrectionRequest[]> {
  const db = getFirebaseDatabase();
  const snapshot = await get(ref(db, `correction_requests/${companyId}`));
  if (!snapshot.exists()) return [];
  const data = snapshot.val();
  const list: CorrectionRequest[] = Object.values(data);
  return list.sort((a, b) => b.createdAt - a.createdAt);
}

export async function updateCorrectionRequestStatus(
  companyId: string,
  requestId: string,
  status: "approved" | "rejected"
): Promise<void> {
  const db = getFirebaseDatabase();
  await set(ref(db, `correction_requests/${companyId}/${requestId}/status`), status);
}

// ─── Push Token Management ─────────────────────────────────────────────────

export async function savePushToken(
  companyId: string,
  uid: string,
  token: string
): Promise<void> {
  const db = getFirebaseDatabase();
  await set(ref(db, `push_tokens/${companyId}/${uid}`), token);
}

export async function getManagerPushTokens(
  companyId: string
): Promise<string[]> {
  const db = getFirebaseDatabase();
  // Get all employees who are managers and have a push token
  const [empSnap, tokenSnap] = await Promise.all([
    get(ref(db, `employees/${companyId}`)),
    get(ref(db, `push_tokens/${companyId}`)),
  ]);
  if (!tokenSnap.exists()) return [];
  const tokens: string[] = [];
  const employees = empSnap.exists() ? empSnap.val() : {};
  const tokenMap = tokenSnap.val();
  for (const uid of Object.keys(tokenMap)) {
    if (employees[uid]?.role === "manager") {
      tokens.push(tokenMap[uid]);
    }
  }
  return tokens;
}

// ─── Generated Reports Management ──────────────────────────────────────────

export async function saveGeneratedReport(
  companyId: string,
  reportData: Omit<GeneratedReport, "id">
): Promise<GeneratedReport> {
  const db = getFirebaseDatabase();
  const newRef = push(ref(db, `generated_reports/${companyId}`));
  const newId = newRef.key!;
  
  const report: GeneratedReport = {
    ...reportData,
    id: newId,
  };
  
  await set(newRef, report);
  return report;
}

export async function getGeneratedReports(
  companyId: string
): Promise<GeneratedReport[]> {
  const db = getFirebaseDatabase();
  const snap = await get(ref(db, `generated_reports/${companyId}`));
  if (!snap.exists()) return [];
  
  const data = snap.val();
  const list: GeneratedReport[] = Object.values(data);
  // Sort by generatedAt descending
  list.sort((a, b) => b.generatedAt - a.generatedAt);
  return list;
}

export async function deleteGeneratedReport(
  companyId: string,
  reportId: string
): Promise<void> {
  const db = getFirebaseDatabase();
  await remove(ref(db, `generated_reports/${companyId}/${reportId}`));
}
