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

export interface Company {
  name: string;
  inspectionHash: string;
  createdAt: number;
}

export interface InspectionDayRecord {
  date: string;
  entries: { type: TimeLogType; timestamp: number }[];
  totalMinutes: number;
}

export interface InspectionEmployee {
  uid: string;
  email?: string;
  records: InspectionDayRecord[];
  totalMinutes: number;
}

export interface InspectionReport {
  company: { id: string; name: string };
  period: { from: string; to: string };
  employees: InspectionEmployee[];
  generatedAt: string;
}
