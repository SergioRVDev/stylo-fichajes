"use client";

import { useState } from "react";
import type { ReminderConfig } from "@/hooks/usePushNotifications";

interface NotificationSettingsProps {
  config: ReminderConfig;
  permission: NotificationPermission;
  onUpdate: (config: ReminderConfig) => Promise<boolean>;
}

export function NotificationSettings({
  config,
  permission,
  onUpdate,
}: NotificationSettingsProps) {
  const [open, setOpen] = useState(false);
  const [hour, setHour] = useState(config.hour);
  const [minute, setMinute] = useState(config.minute);
  const [saving, setSaving] = useState(false);

  const handleToggle = async () => {
    setSaving(true);
    await onUpdate({ enabled: !config.enabled, hour, minute });
    setSaving(false);
  };

  const handleTimeChange = async () => {
    if (!config.enabled) return;
    setSaving(true);
    await onUpdate({ enabled: true, hour, minute });
    setSaving(false);
  };

  if (!("Notification" in globalThis)) return null;

  return (
    <div className="rounded-xl border border-border bg-surface p-4">
      <button
        onClick={() => setOpen(!open)}
        className="flex w-full items-center justify-between text-left"
      >
        <div className="flex items-center gap-2">
          <BellIcon />
          <span className="text-sm font-medium text-foreground">
            Recordatorio de fichaje
          </span>
        </div>
        <ChevronIcon open={open} />
      </button>

      {open && (
        <div className="mt-3 space-y-3 border-t border-border pt-3">
          {permission === "denied" && (
            <p className="text-xs text-danger">
              Las notificaciones están bloqueadas. Habilítalas en los ajustes
              del navegador.
            </p>
          )}

          <div className="flex items-center justify-between">
            <span className="text-sm text-muted">Activar recordatorio</span>
            <button
              onClick={handleToggle}
              disabled={saving || permission === "denied"}
              className={`relative inline-flex h-6 w-11 shrink-0 rounded-full transition-colors ${
                config.enabled ? "bg-primary" : "bg-border"
              } ${permission === "denied" ? "opacity-50" : ""}`}
            >
              <span
                className={`inline-block h-5 w-5 translate-y-0.5 rounded-full bg-white shadow transition-transform ${
                  config.enabled ? "translate-x-5.5" : "translate-x-0.5"
                }`}
              />
            </button>
          </div>

          <div className="flex items-center justify-between">
            <span className="text-sm text-muted">Hora del recordatorio</span>
            <div className="flex items-center gap-1">
              <input
                type="number"
                min={0}
                max={23}
                value={hour}
                onChange={(e) => setHour(Number(e.target.value))}
                onBlur={handleTimeChange}
                className="w-12 rounded border border-border bg-background px-2 py-1 text-center text-sm text-foreground"
                disabled={!config.enabled}
              />
              <span className="text-muted">:</span>
              <input
                type="number"
                min={0}
                max={59}
                step={5}
                value={minute}
                onChange={(e) => setMinute(Number(e.target.value))}
                onBlur={handleTimeChange}
                className="w-12 rounded border border-border bg-background px-2 py-1 text-center text-sm text-foreground"
                disabled={!config.enabled}
              />
            </div>
          </div>

          {config.enabled && (
            <p className="text-xs text-muted">
              Recibirás un recordatorio a las{" "}
              {String(hour).padStart(2, "0")}:{String(minute).padStart(2, "0")}{" "}
              si no has fichado.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function BellIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="text-muted"
    >
      <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
      <path d="M13.73 21a2 2 0 0 1-3.46 0" />
    </svg>
  );
}

function ChevronIcon({ open }: { open: boolean }) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`text-muted transition-transform ${open ? "rotate-180" : ""}`}
    >
      <polyline points="6 9 12 15 18 9" />
    </svg>
  );
}
