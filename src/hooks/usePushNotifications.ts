"use client";

import { useCallback, useEffect, useState } from "react";

const REMINDER_STORAGE_KEY = "fichaje-reminder-config";

export interface ReminderConfig {
  enabled: boolean;
  hour: number;
  minute: number;
}

const DEFAULT_CONFIG: ReminderConfig = {
  enabled: false,
  hour: 9,
  minute: 0,
};

function getStoredConfig(): ReminderConfig {
  if (typeof window === "undefined") return DEFAULT_CONFIG;
  try {
    const stored = localStorage.getItem(REMINDER_STORAGE_KEY);
    if (!stored) return DEFAULT_CONFIG;
    return JSON.parse(stored) as ReminderConfig;
  } catch {
    return DEFAULT_CONFIG;
  }
}

function storeConfig(config: ReminderConfig) {
  localStorage.setItem(REMINDER_STORAGE_KEY, JSON.stringify(config));
}

export function usePushNotifications(
  swRegistration: ServiceWorkerRegistration | null
) {
  const [permission, setPermission] =
    useState<NotificationPermission>("default");
  const [config, setConfig] = useState<ReminderConfig>(DEFAULT_CONFIG);
  const [timerId, setTimerId] = useState<ReturnType<typeof setTimeout> | null>(
    null
  );

  useEffect(() => {
    if (typeof window !== "undefined" && "Notification" in window) {
      setPermission(Notification.permission);
    }
    setConfig(getStoredConfig());
  }, []);

  const requestPermission = useCallback(async () => {
    if (!("Notification" in window)) return "denied" as const;
    const result = await Notification.requestPermission();
    setPermission(result);
    return result;
  }, []);

  const scheduleReminder = useCallback(
    (reminderConfig: ReminderConfig) => {
      if (timerId) clearTimeout(timerId);

      if (!reminderConfig.enabled) {
        setTimerId(null);
        return;
      }

      const now = new Date();
      const target = new Date();
      target.setHours(reminderConfig.hour, reminderConfig.minute, 0, 0);

      if (target <= now) {
        target.setDate(target.getDate() + 1);
      }

      const delay = target.getTime() - now.getTime();

      const id = setTimeout(() => {
        if (permission === "granted" && swRegistration) {
          swRegistration.showNotification("Stylo Fichajes", {
            body: `Son las ${String(reminderConfig.hour).padStart(2, "0")}:${String(reminderConfig.minute).padStart(2, "0")} — ¿Has fichado tu entrada?`,
            icon: "/icons/icon-192x192.svg",
            badge: "/icons/icon-96x96.svg",
            tag: "fichaje-reminder",
          });
        }
        // Reschedule for the next day
        scheduleReminder(reminderConfig);
      }, delay);

      setTimerId(id);
    },
    [permission, swRegistration, timerId]
  );

  const updateConfig = useCallback(
    async (newConfig: ReminderConfig) => {
      if (newConfig.enabled && permission !== "granted") {
        const result = await requestPermission();
        if (result !== "granted") {
          return false;
        }
      }
      setConfig(newConfig);
      storeConfig(newConfig);
      scheduleReminder(newConfig);
      return true;
    },
    [permission, requestPermission, scheduleReminder]
  );

  useEffect(() => {
    if (config.enabled && permission === "granted") {
      scheduleReminder(config);
    }
    return () => {
      if (timerId) clearTimeout(timerId);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return {
    permission,
    config,
    updateConfig,
    requestPermission,
  };
}
