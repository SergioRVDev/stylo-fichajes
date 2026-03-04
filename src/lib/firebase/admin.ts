import { getApps, initializeApp, cert, type App } from "firebase-admin/app";
import { getDatabase } from "firebase-admin/database";
import type { TimeLog, Employee } from "@/types";

export function getAdminApp(): App {
  const existing = getApps();
  if (existing.length > 0) return existing[0]!;

  const serviceAccountJson = process.env.SERVICE_ACCOUNT_KEY || process.env.NEXT_PUBLIC_SERVICE_ACCOUNT_KEY;
  if (!serviceAccountJson) {
    throw new Error("SERVICE_ACCOUNT_KEY no está configurada");
  }

  const serviceAccount = JSON.parse(serviceAccountJson);
  const databaseURL = process.env.NEXT_PUBLIC_FIREBASE_DATABASE_URL;

  return initializeApp({
    credential: cert(serviceAccount),
    databaseURL,
  });
}

export async function getAdminAllCompanyLogs(companyId: string, fromDate: string, toDate: string): Promise<Record<string, Record<string, TimeLog[]>>> {
  const app = getAdminApp();
  const db = getDatabase(app);
  
  // The structure is `logs/${companyId}/${uid}/${date}/${logId}`
  // To get a date range optimally, we'd query each user's logs, or if company is small enough, fetch all.
  const snapshot = await db.ref(`logs/${companyId}`).get();
  if (!snapshot.exists()) return {};

  const result: Record<string, Record<string, TimeLog[]>> = {};
  snapshot.forEach((userSnap) => {
    const uid = userSnap.key;
    if (!uid) return;
    
    result[uid] = {};
    userSnap.forEach((dateSnap) => {
      const dateStr = dateSnap.key;
      if (!dateStr || dateStr < fromDate || dateStr > toDate) return;

      const logsObj = dateSnap.val();
      const arr = Object.keys(logsObj).map(id => ({ ...logsObj[id], id }));
      result[uid]![dateStr] = arr;
    });
  });

  return result;
}

export async function getAdminAllEmployeesRecord(companyId: string): Promise<Record<string, Employee>> {
  const app = getAdminApp();
  const db = getDatabase(app);
  const snapshot = await db.ref(`employees/${companyId}`).get();
  if (!snapshot.exists()) return {};
  return snapshot.val();
}
