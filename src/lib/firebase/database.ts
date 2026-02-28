import {
  ref,
  push,
  onValue,
  get,
  set,
  query,
  orderByChild,
  type Unsubscribe,
} from "firebase/database";
import { getFirebaseDatabase } from "./config";
import type { TimeLog, TimeLogType, DeviceInfo, Company } from "@/types";
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
  email: string
): Promise<void> {
  const db = getFirebaseDatabase();
  await set(ref(db, `employees/${companyId}/${uid}`), { email });
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

export async function getEmployeeEmails(
  companyId: string
): Promise<Record<string, string>> {
  const db = getFirebaseDatabase();
  const snapshot = await get(ref(db, `employees/${companyId}`));
  if (!snapshot.exists()) return {};
  const data = snapshot.val();
  const emails: Record<string, string> = {};
  for (const uid of Object.keys(data)) {
    if (data[uid]?.email) {
      emails[uid] = data[uid].email;
    }
  }
  return emails;
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
