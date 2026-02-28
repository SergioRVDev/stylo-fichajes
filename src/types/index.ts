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
