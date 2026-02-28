import { describe, it, expect, vi, beforeEach } from "vitest";
import { writeTimeLog, subscribeToDayLogs } from "./database";

vi.mock("firebase/database", () => ({
  ref: vi.fn(() => "mock-ref"),
  push: vi.fn(() => Promise.resolve({ key: "mock-push-key" })),
  onValue: vi.fn(),
  query: vi.fn(() => "mock-query"),
  orderByChild: vi.fn(() => "mock-constraint"),
}));

vi.mock("./config", () => ({
  getFirebaseDatabase: vi.fn(() => "mock-db"),
}));

vi.mock("@/lib/geolocation", () => ({
  getCurrentPosition: vi.fn(() => Promise.resolve(null)),
}));

import { ref, push, onValue, query } from "firebase/database";
import { getCurrentPosition } from "@/lib/geolocation";

describe("writeTimeLog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(Date, "now").mockReturnValue(1700000000000);
  });

  it("should throw if companyId is empty", async () => {
    await expect(writeTimeLog("", "uid1", "IN")).rejects.toThrow(
      "companyId and uid are required and cannot be empty"
    );
  });

  it("should throw if uid is empty", async () => {
    await expect(writeTimeLog("company1", "", "IN")).rejects.toThrow(
      "companyId and uid are required and cannot be empty"
    );
  });

  it("should throw if companyId is only whitespace", async () => {
    await expect(writeTimeLog("   ", "uid1", "IN")).rejects.toThrow(
      "companyId and uid are required and cannot be empty"
    );
  });

  it("should write a time log and return the push key", async () => {
    const key = await writeTimeLog("company1", "uid1", "IN");

    expect(ref).toHaveBeenCalledWith("mock-db", expect.stringContaining("logs/company1/uid1/"));
    expect(push).toHaveBeenCalledWith("mock-ref", expect.objectContaining({
      uid: "uid1",
      type: "IN",
      timestamp: 1700000000000,
    }));
    expect(key).toBe("mock-push-key");
  });

  it("should call getCurrentPosition when captureLocation is true", async () => {
    vi.mocked(getCurrentPosition).mockResolvedValueOnce({
      latitude: 40.0,
      longitude: -3.0,
    });

    await writeTimeLog("company1", "uid1", "IN", true);

    expect(getCurrentPosition).toHaveBeenCalled();
    expect(push).toHaveBeenCalledWith("mock-ref", expect.objectContaining({
      coordinates: { latitude: 40.0, longitude: -3.0 },
    }));
  });

  it("should not call getCurrentPosition when captureLocation is false", async () => {
    await writeTimeLog("company1", "uid1", "OUT");

    expect(getCurrentPosition).not.toHaveBeenCalled();
  });
});

describe("subscribeToDayLogs", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should subscribe to the correct path and parse logs", () => {
    const mockUnsubscribe = vi.fn();
    vi.mocked(onValue).mockImplementation((_, successCb) => {
      const mockSnapshot = {
        forEach: (cb: (child: { key: string; val: () => object }) => void) => {
          cb({ key: "log1", val: () => ({ uid: "uid1", timestamp: 1, type: "IN", deviceInfo: { userAgent: "", platform: "" } }) });
          cb({ key: "log2", val: () => ({ uid: "uid1", timestamp: 2, type: "OUT", deviceInfo: { userAgent: "", platform: "" } }) });
        },
      };
      (successCb as (snap: typeof mockSnapshot) => void)(mockSnapshot);
      return mockUnsubscribe;
    });

    const callback = vi.fn();
    const unsub = subscribeToDayLogs("company1", "uid1", "2026-02-28", callback);

    expect(query).toHaveBeenCalled();
    expect(callback).toHaveBeenCalledWith([
      expect.objectContaining({ id: "log1", type: "IN" }),
      expect.objectContaining({ id: "log2", type: "OUT" }),
    ]);
    expect(unsub).toBe(mockUnsubscribe);
  });

  it("should invoke onError callback when Firebase reports an error", () => {
    const permissionError = new Error("Permission denied");
    vi.mocked(onValue).mockImplementation((_query, _successCb, cancelCb) => {
      (cancelCb as (err: Error) => void)(permissionError);
      return vi.fn();
    });

    const callback = vi.fn();
    const onError = vi.fn();
    subscribeToDayLogs("company1", "uid1", "2026-02-28", callback, onError);

    expect(onError).toHaveBeenCalledWith(permissionError);
    expect(callback).not.toHaveBeenCalled();
  });

  it("should log to console.error when no onError callback is provided", () => {
    const permissionError = new Error("Permission denied");
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.mocked(onValue).mockImplementation((_query, _successCb, cancelCb) => {
      (cancelCb as (err: Error) => void)(permissionError);
      return vi.fn();
    });

    const callback = vi.fn();
    subscribeToDayLogs("company1", "uid1", "2026-02-28", callback);

    expect(consoleSpy).toHaveBeenCalledWith("subscribeToDayLogs error:", permissionError);
    consoleSpy.mockRestore();
  });
});
