import { NextRequest, NextResponse } from "next/server";
import { getAdminAuth } from "@/lib/firebase/admin";
import { generateInspectionHash } from "@/lib/inspection";

export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get("authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return NextResponse.json(
        { error: "Token de autenticación requerido" },
        { status: 401 }
      );
    }

    const token = authHeader.split("Bearer ")[1]!;
    const auth = getAdminAuth();
    await auth.verifyIdToken(token);

    const body = await request.json();
    const { companyId, companyName } = body;

    if (!companyId || !companyName) {
      return NextResponse.json(
        { error: "companyId y companyName son obligatorios" },
        { status: 400 }
      );
    }

    const hash = await generateInspectionHash(companyId, companyName);

    return NextResponse.json({ hash, companyId, companyName });
  } catch (error) {
    console.error("Error generating inspection hash:", error);
    return NextResponse.json(
      { error: "Error interno del servidor" },
      { status: 500 }
    );
  }
}
