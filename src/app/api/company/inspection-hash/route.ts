import { NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { saveInspectionHash, getCompanyInfo } from "@/lib/firebase/database";

export async function POST(request: Request) {
  try {
    const { companyId, companyName } = await request.json();

    if (!companyId || !companyName) {
      return NextResponse.json(
        { error: "companyId y companyName son requeridos" },
        { status: 400 }
      );
    }

    const existing = await getCompanyInfo(companyId);
    if (existing?.inspectionHash) {
      return NextResponse.json({
        hash: existing.inspectionHash,
        url: `/public/inspect/${existing.inspectionHash}`,
      });
    }

    const hash = randomBytes(16).toString("hex");
    await saveInspectionHash(companyId, companyName, hash);

    return NextResponse.json({
      hash,
      url: `/public/inspect/${hash}`,
    });
  } catch (error) {
    console.error("Error creating inspection hash:", error);
    return NextResponse.json(
      { error: "Error al crear el hash de inspección" },
      { status: 500 }
    );
  }
}
