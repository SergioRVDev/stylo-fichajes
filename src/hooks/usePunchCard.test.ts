import { describe, it, expect } from "vitest";
import { computeStatus, formatDuration } from "./usePunchCard";
import type { TimeLog } from "@/types";

function makeLog(
  type: TimeLog["type"],
  timestamp: number,
  id = "log-" + timestamp
): TimeLog & { id: string } {
  return {
    id,
    uid: "uid1",
    timestamp,
    type,
    deviceInfo: { userAgent: "", platform: "" },
  };
}

describe("computeStatus", () => {
  it("should return not clocked in with no logs", () => {
    const result = computeStatus([], "1970-01-01");

    expect(result.isClockedIn).toBe(false);
    expect(result.isPaused).toBe(false);
    expect(result.activeWorkStart).toBeNull();
    expect(result.activeBreakStart).toBeNull();
    expect(result.totalWorkedMs).toBe(0);
    expect(result.totalBreakMs).toBe(0);
  });

  it("should return clocked in after a single IN log", () => {
    const result = computeStatus([makeLog("IN", 1000)], "1970-01-01");

    expect(result.isClockedIn).toBe(true);
    expect(result.isPaused).toBe(false);
    expect(result.activeWorkStart).toBe(1000);
    expect(result.activeBreakStart).toBeNull();
    expect(result.totalWorkedMs).toBe(0);
    expect(result.totalBreakMs).toBe(0);
  });

  it("should return not clocked in after IN then OUT", () => {
    const result = computeStatus([
      makeLog("IN", 1000),
      makeLog("OUT", 5000),
    ], "1970-01-01");

    expect(result.isClockedIn).toBe(false);
    expect(result.isPaused).toBe(false);
    expect(result.activeWorkStart).toBeNull();
    expect(result.activeBreakStart).toBeNull();
    expect(result.totalWorkedMs).toBe(4000);
    expect(result.totalBreakMs).toBe(0);
  });

  it("should calculate total worked time for multiple intervals", () => {
    const result = computeStatus([
      makeLog("IN", 1000),
      makeLog("OUT", 3000),
      makeLog("IN", 5000),
      makeLog("OUT", 8000),
    ], "1970-01-01");

    expect(result.isClockedIn).toBe(false);
    expect(result.isPaused).toBe(false);
    expect(result.totalWorkedMs).toBe(5000);
    expect(result.totalBreakMs).toBe(0);
  });

  it("should handle clocked in during second interval", () => {
    const result = computeStatus([
      makeLog("IN", 1000),
      makeLog("OUT", 3000),
      makeLog("IN", 5000),
    ], "1970-01-01");

    expect(result.isClockedIn).toBe(true);
    expect(result.isPaused).toBe(false);
    expect(result.activeWorkStart).toBe(5000);
    expect(result.activeBreakStart).toBeNull();
    expect(result.totalWorkedMs).toBe(2000);
    expect(result.totalBreakMs).toBe(0);
  });

  it("should ignore OUT without a preceding IN", () => {
    const result = computeStatus([makeLog("OUT", 1000)], "1970-01-01");

    expect(result.isClockedIn).toBe(false);
    expect(result.totalWorkedMs).toBe(0);
    expect(result.totalBreakMs).toBe(0);
  });

  it("should correctly handle BREAK_START and BREAK_END types", () => {
    const result = computeStatus([
      makeLog("IN", 1000),
      makeLog("BREAK_START", 2000),
      makeLog("BREAK_END", 4000),
      makeLog("OUT", 5000),
    ], "1970-01-01");

    expect(result.isClockedIn).toBe(false);
    expect(result.isPaused).toBe(false);
    expect(result.totalWorkedMs).toBe(2000); // 1K->2K (1000) + 4K->5K (1000)
    expect(result.totalBreakMs).toBe(2000); // 2K->4K (2000)
  });
  
  it("should return paused if currently on break", () => {
    const result = computeStatus([
      makeLog("IN", 1000),
      makeLog("BREAK_START", 2000),
    ], "1970-01-01");

    expect(result.isClockedIn).toBe(true);
    expect(result.isPaused).toBe(true);
    expect(result.activeWorkStart).toBeNull();
    expect(result.activeBreakStart).toBe(2000);
    expect(result.totalWorkedMs).toBe(1000);
    expect(result.totalBreakMs).toBe(0);
  });
});

describe("formatDuration", () => {
  it("should format zero milliseconds", () => {
    expect(formatDuration(0)).toBe("00:00:00");
  });

  it("should format seconds only", () => {
    expect(formatDuration(5000)).toBe("00:00:05");
  });

  it("should format minutes and seconds", () => {
    expect(formatDuration(125000)).toBe("00:02:05");
  });

  it("should format hours, minutes, and seconds", () => {
    expect(formatDuration(3661000)).toBe("01:01:01");
  });

  it("should handle large durations", () => {
    expect(formatDuration(36000000)).toBe("10:00:00");
  });

  it("should pad single digits with zeros", () => {
    expect(formatDuration(1000)).toBe("00:00:01");
    expect(formatDuration(60000)).toBe("00:01:00");
    expect(formatDuration(3600000)).toBe("01:00:00");
  });
});
