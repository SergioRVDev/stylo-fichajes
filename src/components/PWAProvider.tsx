"use client";

import { useEffect } from "react";
import { registerServiceWorker } from "@/lib/serviceWorker";
import { initReminder } from "@/lib/notifications";
import { InstallPrompt } from "./InstallPrompt";

export function PWAProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    registerServiceWorker();
    initReminder();
  }, []);

  return (
    <>
      {children}
      <InstallPrompt />
    </>
  );
}
