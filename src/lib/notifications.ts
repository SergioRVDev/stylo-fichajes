import { getServiceWorkerRegistration } from "./serviceWorker";

const REMINDER_STORAGE_KEY = "stylo-fichajes-reminder";

export interface ReminderConfig {
  enabled: boolean;
  hour: number;
  minute: number;
}

export function getDefaultReminder(): ReminderConfig {
  return { enabled: false, hour: 9, minute: 0 };
}

export function loadReminderConfig(): ReminderConfig {
  if (typeof window === "undefined") return getDefaultReminder();

  try {
    const stored = localStorage.getItem(REMINDER_STORAGE_KEY);
    if (stored) return JSON.parse(stored);
  } catch {
    // ignore parse errors
  }
  return getDefaultReminder();
}

export function saveReminderConfig(config: ReminderConfig): void {
  localStorage.setItem(REMINDER_STORAGE_KEY, JSON.stringify(config));
}

export async function requestNotificationPermission(): Promise<NotificationPermission> {
  if (!("Notification" in window)) {
    return "denied";
  }

  if (Notification.permission === "granted") {
    return "granted";
  }

  return Notification.requestPermission();
}

export async function scheduleReminder(config: ReminderConfig): Promise<void> {
  if (!config.enabled) {
    cancelReminder();
    return;
  }

  const permission = await requestNotificationPermission();
  if (permission !== "granted") return;

  saveReminderConfig(config);
  startReminderCheck(config);
}

let reminderInterval: ReturnType<typeof setInterval> | null = null;

function startReminderCheck(config: ReminderConfig): void {
  cancelReminder();

  // Check every minute if it's time to send the reminder
  reminderInterval = setInterval(() => {
    const now = new Date();
    if (now.getHours() === config.hour && now.getMinutes() === config.minute) {
      showReminderNotification();
    }
  }, 60_000);
}

function cancelReminder(): void {
  if (reminderInterval) {
    clearInterval(reminderInterval);
    reminderInterval = null;
  }
}

async function showReminderNotification(): Promise<void> {
  const registration = await getServiceWorkerRegistration();
  if (registration) {
    registration.showNotification("Stylo Fichajes", {
      body: "¿Ya has fichado hoy? Recuerda registrar tu entrada.",
      icon: "/icons/icon.svg",
      badge: "/icons/icon-maskable.svg",
      tag: "daily-reminder",
    });
  } else if ("Notification" in window && Notification.permission === "granted") {
    new Notification("Stylo Fichajes", {
      body: "¿Ya has fichado hoy? Recuerda registrar tu entrada.",
      icon: "/icons/icon.svg",
      tag: "daily-reminder",
    });
  }
}

export function initReminder(): void {
  const config = loadReminderConfig();
  if (config.enabled) {
    startReminderCheck(config);
  }
}
