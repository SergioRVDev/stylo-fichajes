export type TimeLogType = "IN" | "OUT" | "BREAK_START" | "BREAK_END";

export interface Coordinates {
  latitude: number;
  longitude: number;
}

export interface DeviceInfo {
  userAgent: string;
  platform: string;
}

export interface TimeLog {
  uid: string;
  timestamp: number;
  type: TimeLogType;
  deviceInfo: DeviceInfo;
  coordinates?: Coordinates;
}

export interface InspectionHashEntry {
  companyId: string;
  companyName: string;
  createdAt: number;
}

export interface DailyRecord {
  date: string;
  entries: { time: string; type: TimeLogType }[];
  totalWorkedMs: number;
}

export interface EmployeeRecord {
  uid: string;
  email?: string;
  displayName?: string;
  days: DailyRecord[];
  totalWorkedMs: number;
}

export interface InspectionReport {
  companyId: string;
  companyName: string;
  generatedAt: string;
  periodStart: string;
  periodEnd: string;
  employees: EmployeeRecord[];
}
