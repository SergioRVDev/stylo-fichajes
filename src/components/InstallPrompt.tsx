"use client";

import { useState, useEffect } from "react";

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

const DISMISSED_KEY = "stylo-install-dismissed";

export function InstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] =
    useState<BeforeInstallPromptEvent | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    // Don't show if previously dismissed
    const dismissed = localStorage.getItem(DISMISSED_KEY);
    if (dismissed) return;

    function handleBeforeInstall(e: Event) {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
      setVisible(true);
    }

    window.addEventListener("beforeinstallprompt", handleBeforeInstall);

    return () => {
      window.removeEventListener("beforeinstallprompt", handleBeforeInstall);
    };
  }, []);

  async function handleInstall() {
    if (!deferredPrompt) return;

    await deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;

    if (outcome === "accepted") {
      setVisible(false);
    }
    setDeferredPrompt(null);
  }

  function handleDismiss() {
    setVisible(false);
    setDeferredPrompt(null);
    localStorage.setItem(DISMISSED_KEY, "true");
  }

  if (!visible) return null;

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 p-4">
      <div className="mx-auto max-w-lg rounded-xl border border-border bg-surface p-4 shadow-lg">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary text-white">
            <svg
              className="h-5 w-5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M12 18v-6m0 0V6m0 6h6m-6 0H6"
              />
            </svg>
          </div>
          <div className="flex-1">
            <p className="text-sm font-semibold text-foreground">
              Instalar Stylo Fichajes
            </p>
            <p className="mt-0.5 text-xs text-muted">
              Añade la app a tu pantalla de inicio para acceso rápido
            </p>
          </div>
        </div>
        <div className="mt-3 flex gap-2">
          <button
            onClick={handleDismiss}
            className="flex-1 rounded-lg border border-border px-3 py-2 text-sm text-muted transition-colors hover:bg-background"
          >
            Ahora no
          </button>
          <button
            onClick={handleInstall}
            className="flex-1 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-primary-dark"
          >
            Instalar
          </button>
        </div>
      </div>
    </div>
  );
}
