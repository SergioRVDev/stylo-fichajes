"use client";

import { useState } from "react";
import { Calendar, ChevronDown } from "lucide-react";
import type { WorkSchedule, DaySchedule, WeekDay } from "@/types";

const DAYS: { key: WeekDay; label: string }[] = [
  { key: "lunes", label: "L" },
  { key: "martes", label: "M" },
  { key: "miercoles", label: "X" },
  { key: "jueves", label: "J" },
  { key: "viernes", label: "V" },
  { key: "sabado", label: "S" },
  { key: "domingo", label: "D" },
];

const DEFAULT_DAY: DaySchedule = {
  enabled: false,
  entry1: "",
  exit1: "",
  splitShift: false,
  entry2: "",
  exit2: "",
};

export function createDefaultSchedule(): WorkSchedule {
  return {
    lunes: { ...DEFAULT_DAY, enabled: true },
    martes: { ...DEFAULT_DAY, enabled: true },
    miercoles: { ...DEFAULT_DAY, enabled: true },
    jueves: { ...DEFAULT_DAY, enabled: true },
    viernes: { ...DEFAULT_DAY, enabled: true },
    sabado: { ...DEFAULT_DAY },
    domingo: { ...DEFAULT_DAY },
  };
}

interface ScheduleFormProps {
  schedule: WorkSchedule;
  onChange: (schedule: WorkSchedule) => void;
}

export function ScheduleForm({ schedule, onChange }: ScheduleFormProps) {
  const [expanded, setExpanded] = useState(false);

  function toggleDay(day: WeekDay) {
    onChange({
      ...schedule,
      [day]: { ...schedule[day], enabled: !schedule[day].enabled },
    });
  }

  function updateDay(day: WeekDay, updates: Partial<DaySchedule>) {
    const updated = { ...schedule[day], ...updates };
    updated.splitShift = !!(updated.entry2 && updated.exit2);
    onChange({ ...schedule, [day]: updated });
  }

  const enabledDays = DAYS.filter(({ key }) => schedule[key].enabled);

  return (
    <div className="rounded-xl border border-border bg-surface">
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center justify-between p-3 text-sm font-medium"
      >
        <span className="flex items-center gap-2">
          <Calendar className="h-4 w-4 text-primary" />
          Horario laboral
        </span>
        <ChevronDown
          className={`h-4 w-4 transition-transform ${expanded ? "rotate-180" : ""}`}
        />
      </button>

      {expanded && (
        <div className="border-t border-border px-3 pb-3 pt-3 space-y-4">
          {/* Day circles */}
          <div className="flex justify-between">
            {DAYS.map(({ key, label }) => {
              const isOn = schedule[key].enabled;
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => toggleDay(key)}
                  className={`flex h-10 w-10 items-center justify-center rounded-full text-sm font-semibold transition-colors ${
                    isOn
                      ? "bg-primary text-white"
                      : "bg-muted/10 text-muted hover:bg-muted/20"
                  }`}
                >
                  {label}
                </button>
              );
            })}
          </div>

          {/* Time inputs for enabled days */}
          {enabledDays.length > 0 && (
            <div className="space-y-3">
              {enabledDays.map(({ key, label }) => {
                const day = schedule[key];
                const fullLabel = {
                  L: "Lunes", M: "Martes", X: "Miércoles",
                  J: "Jueves", V: "Viernes", S: "Sábado", D: "Domingo",
                }[label];

                return (
                  <div key={key} className="rounded-lg border border-border/50 p-3">
                    <p className="mb-2 text-xs font-semibold">{fullLabel}</p>
                    <div className="flex items-center gap-2">
                      <input
                        type="time"
                        value={day.entry1}
                        onChange={(e) => updateDay(key, { entry1: e.target.value })}
                        className="flex-1 rounded-lg border border-border bg-background px-2 py-1.5 text-sm"
                      />
                      <span className="text-xs text-muted">→</span>
                      <input
                        type="time"
                        value={day.exit1}
                        onChange={(e) => updateDay(key, { exit1: e.target.value })}
                        className="flex-1 rounded-lg border border-border bg-background px-2 py-1.5 text-sm"
                      />
                    </div>
                    <div className="mt-2 flex items-center gap-2">
                      <input
                        type="time"
                        value={day.entry2 ?? ""}
                        onChange={(e) => updateDay(key, { entry2: e.target.value })}
                        className="flex-1 rounded-lg border border-border bg-background px-2 py-1.5 text-sm"
                      />
                      <span className="text-xs text-muted">→</span>
                      <input
                        type="time"
                        value={day.exit2 ?? ""}
                        onChange={(e) => updateDay(key, { exit2: e.target.value })}
                        className="flex-1 rounded-lg border border-border bg-background px-2 py-1.5 text-sm"
                      />
                    </div>
                    <p className="mt-1 text-[10px] text-muted">
                      Rellena la 2ª fila para jornada partida
                    </p>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function getTodaySchedule(schedule?: WorkSchedule): DaySchedule | null {
  if (!schedule) return null;
  const dayNames: WeekDay[] = [
    "domingo", "lunes", "martes", "miercoles",
    "jueves", "viernes", "sabado",
  ];
  const today = dayNames[new Date().getDay()];
  if (!today) return null;
  const day = schedule[today];
  return day?.enabled ? day : null;
}

export function formatScheduleTime(day: DaySchedule): string {
  if (!day.entry1 && !day.exit1) return "Sin horario definido";
  let result = `${day.entry1 || "--:--"} - ${day.exit1 || "--:--"}`;
  if (day.splitShift && day.entry2 && day.exit2) {
    result += ` / ${day.entry2} - ${day.exit2}`;
  }
  return result;
}
