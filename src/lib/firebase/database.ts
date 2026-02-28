import {
  ref,
  push,
  onValue,
  query,
  orderByChild,
  type Unsubscribe,
} from "firebase/database";
import { getFirebaseDatabase } from "./config";
import type { TimeLog, TimeLogType, DeviceInfo } from "@/types";
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
