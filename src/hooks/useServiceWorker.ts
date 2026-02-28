"use client";

import { useEffect, useState } from "react";

export function useServiceWorker() {
  const [registration, setRegistration] =
    useState<ServiceWorkerRegistration | null>(null);

  useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) {
      return;
    }

    navigator.serviceWorker
      .register("/sw.js")
      .then((reg) => {
        setRegistration(reg);
      })
      .catch((error) => {
        console.error("SW registration failed:", error);
      });
  }, []);

  return registration;
}
