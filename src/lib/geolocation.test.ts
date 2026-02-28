import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { getCurrentPosition } from "./geolocation";

describe("getCurrentPosition", () => {
  const originalNavigator = globalThis.navigator;

  afterEach(() => {
    Object.defineProperty(globalThis, "navigator", {
      value: originalNavigator,
      writable: true,
      configurable: true,
    });
  });

  it("should return null when navigator is undefined", async () => {
    Object.defineProperty(globalThis, "navigator", {
      value: undefined,
      writable: true,
      configurable: true,
    });

    const result = await getCurrentPosition();
    expect(result).toBeNull();
  });

  it("should return null when geolocation is not supported", async () => {
    Object.defineProperty(globalThis, "navigator", {
      value: {},
      writable: true,
      configurable: true,
    });

    const result = await getCurrentPosition();
    expect(result).toBeNull();
  });

  it("should return coordinates on success", async () => {
    const mockPosition = {
      coords: { latitude: 40.4168, longitude: -3.7038 },
    };

    Object.defineProperty(globalThis, "navigator", {
      value: {
        geolocation: {
          getCurrentPosition: (resolve: (pos: typeof mockPosition) => void) => {
            resolve(mockPosition);
          },
        },
      },
      writable: true,
      configurable: true,
    });

    const result = await getCurrentPosition();
    expect(result).toEqual({ latitude: 40.4168, longitude: -3.7038 });
  });

  it("should return null when geolocation fails", async () => {
    Object.defineProperty(globalThis, "navigator", {
      value: {
        geolocation: {
          getCurrentPosition: (_resolve: unknown, reject: (err: Error) => void) => {
            reject(new Error("User denied Geolocation"));
          },
        },
      },
      writable: true,
      configurable: true,
    });

    const result = await getCurrentPosition();
    expect(result).toBeNull();
  });
});
