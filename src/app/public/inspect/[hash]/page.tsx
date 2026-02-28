import type { Metadata } from "next";
import { getCompanyByHash, getInspectionReport } from "@/lib/inspection";
import { InspectionReport } from "./InspectionReport";

interface PageProps {
  params: Promise<{ hash: string }>;
}

export const metadata: Metadata = {
  title: "Registro de Jornada — Inspección Laboral",
  description: "Reporte de registro de jornada para inspección laboral",
};

export default async function InspectionPage({ params }: PageProps) {
  const { hash } = await params;

  const company = await getCompanyByHash(hash);

  if (!company) {
    return (
      <div className="flex min-h-dvh items-center justify-center p-6">
        <div className="text-center">
          <h1 className="mb-2 text-2xl font-bold text-danger">
            Enlace no válido
          </h1>
          <p className="text-muted">
            El enlace de inspección proporcionado no es válido o ha sido
            revocado.
          </p>
        </div>
      </div>
    );
  }

  const report = await getInspectionReport(
    company.companyId,
    company.companyName
  );

  return <InspectionReport report={report} />;
}
