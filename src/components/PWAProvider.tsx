"use client";

import { useServiceWorker } from "@/hooks/useServiceWorker";
import { InstallPrompt } from "@/components/InstallPrompt";

export function PWAProvider({ children }: { children: React.ReactNode }) {
  useServiceWorker();

  return (
    <>
      {children}
      <InstallPrompt />
    </>
  );
}
