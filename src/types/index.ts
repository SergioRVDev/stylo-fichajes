export type TimeLogType = "IN" | "OUT" | "BREAK_START" | "BREAK_END";

export type UserRole = "manager" | "employee";

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

export interface Employee {
  email: string;
  role: UserRole;
  status?: "active" | "archived";
  displayName?: string;
  lastName?: string;
  dni?: string;
  birthDate?: string;
  createdAt?: number;
  schedule?: WorkSchedule;
}

export type WeekDay = "lunes" | "martes" | "miercoles" | "jueves" | "viernes" | "sabado" | "domingo";

export interface DaySchedule {
  enabled: boolean;
  entry1: string; // "09:00"
  exit1: string;  // "14:00"
  splitShift: boolean;
  entry2?: string; // "16:00"
  exit2?: string;  // "20:00"
}

export type WorkSchedule = Record<WeekDay, DaySchedule>;

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

export interface AuditLog {
  id: string; // Auto-generated ID (can use push key)
  editedByUid: string;
  editedByEmail: string;
  targetUid: string;
  targetEmail: string;
  action: "ADD_LOG";
  timestamp: number;
  reason: string;
  details: {
    date: string; // Format: YYYY-MM-DD
    logTimestamp: number;
    logType: TimeLogType;
  };
}

export interface CorrectionRequest {
  id: string;
  employeeUid: string;
  employeeEmail: string;
  employeeName: string;
  date: string;         // "YYYY-MM-DD"
  logType: TimeLogType;
  proposedTime: string; // "HH:mm"
  reason: string;
  status: "pending" | "approved" | "rejected";
  createdAt: number;
}

export interface GeneratedReport {
  id: string;
  name: string;
  dateRange: { from: string; to: string };
  generatedAt: number;
  generatedByUid: string;
  downloadUrl: string;
}
