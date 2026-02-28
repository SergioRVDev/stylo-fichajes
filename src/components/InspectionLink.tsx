"use client";

import { useState } from "react";

interface InspectionLinkProps {
  companyId: string;
  companyName: string;
}

export function InspectionLink({ companyId, companyName }: InspectionLinkProps) {
  const [url, setUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);

  async function generateLink() {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/company/inspection-hash", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ companyId, companyName }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      setUrl(`${window.location.origin}${data.url}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al generar enlace");
    } finally {
      setLoading(false);
    }
  }

  async function copyToClipboard() {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback: select text for manual copy
    }
  }

  return (
    <div className="w-full rounded-lg border border-border bg-surface p-4">
      <h3 className="text-sm font-semibold">Inspección laboral</h3>
      {url ? (
        <div className="mt-2">
          <p className="text-xs text-muted">URL pública de inspección:</p>
          <div className="mt-1 flex items-center gap-2">
            <p className="flex-1 break-all rounded bg-background p-2 font-mono text-xs">
              {url}
            </p>
            <button
              onClick={copyToClipboard}
              className="shrink-0 rounded bg-primary px-3 py-2 text-xs font-medium text-white hover:bg-primary-dark"
            >
              {copied ? "Copiado" : "Copiar"}
            </button>
          </div>
        </div>
      ) : (
        <div className="mt-2">
          <p className="text-xs text-muted">
            Genera un enlace público para que un inspector laboral pueda
            verificar los registros de jornada de la empresa.
          </p>
          <button
            onClick={generateLink}
            disabled={loading}
            className="mt-3 rounded-lg bg-primary px-4 py-2 text-xs font-medium text-white hover:bg-primary-dark disabled:opacity-50"
          >
            {loading ? "Generando..." : "Generar enlace de inspección"}
          </button>
          {error && <p className="mt-2 text-xs text-danger">{error}</p>}
        </div>
      )}
    </div>
  );
}
