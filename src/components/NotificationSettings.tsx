"use client";

import { useState, useEffect } from "react";
import {
  loadReminderConfig,
  scheduleReminder,
  requestNotificationPermission,
  type ReminderConfig,
} from "@/lib/notifications";

export function NotificationSettings() {
  const [config, setConfig] = useState<ReminderConfig>({
    enabled: false,
    hour: 9,
    minute: 0,
  });
  const [permission, setPermission] = useState<NotificationPermission>("default");
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setConfig(loadReminderConfig());
    if ("Notification" in window) {
      setPermission(Notification.permission);
    }
  }, []);

  async function handleToggle() {
    const newEnabled = !config.enabled;

    if (newEnabled && permission !== "granted") {
      const result = await requestNotificationPermission();
      setPermission(result);
      if (result !== "granted") return;
    }

    const updated = { ...config, enabled: newEnabled };
    setConfig(updated);
    await scheduleReminder(updated);
    showSaved();
  }

  async function handleTimeChange(e: React.ChangeEvent<HTMLInputElement>) {
    const parts = e.target.value.split(":").map(Number);
    const hour = parts[0] ?? config.hour;
    const minute = parts[1] ?? config.minute;
    const updated: ReminderConfig = { ...config, hour, minute };
    setConfig(updated);
    if (updated.enabled) {
      await scheduleReminder(updated);
    }
    showSaved();
  }

  function showSaved() {
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  const timeValue = `${String(config.hour).padStart(2, "0")}:${String(config.minute).padStart(2, "0")}`;

  return (
    <div className="rounded-xl border border-border bg-surface p-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-warning/10">
            <svg
              className="h-5 w-5 text-warning"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"
              />
            </svg>
          </div>
          <div>
            <p className="text-sm font-medium text-foreground">
              Recordatorio diario
            </p>
            <p className="text-xs text-muted">
              {config.enabled
                ? `Activo a las ${timeValue}`
                : "Recibe un aviso si no has fichado"}
            </p>
          </div>
        </div>
        <button
          onClick={handleToggle}
          className={`relative h-6 w-11 rounded-full transition-colors ${
            config.enabled ? "bg-primary" : "bg-border"
          }`}
          aria-label={
            config.enabled
              ? "Desactivar recordatorio"
              : "Activar recordatorio"
          }
        >
          <span
            className={`absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${
              config.enabled ? "translate-x-5" : "translate-x-0"
            }`}
          />
        </button>
      </div>

      {config.enabled && (
        <div className="mt-3 flex items-center gap-2 border-t border-border pt-3">
          <label
            htmlFor="reminder-time"
            className="text-sm text-muted"
          >
            Hora del recordatorio:
          </label>
          <input
            id="reminder-time"
            type="time"
            value={timeValue}
            onChange={handleTimeChange}
            className="rounded-lg border border-border bg-background px-2 py-1 text-sm text-foreground"
          />
        </div>
      )}

      {saved && (
        <p className="mt-2 text-xs text-success">Configuración guardada</p>
      )}

      {permission === "denied" && (
        <p className="mt-2 text-xs text-danger">
          Las notificaciones están bloqueadas. Actívalas en la configuración del
          navegador.
        </p>
      )}
    </div>
  );
}
