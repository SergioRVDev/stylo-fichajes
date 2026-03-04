import { NextRequest, NextResponse } from "next/server";
import { getApps, initializeApp, cert, type App } from "firebase-admin/app";
import { getDatabase } from "firebase-admin/database";

function getAdminApp(): App {
  const existing = getApps();
  if (existing.length > 0) return existing[0]!;

  const serviceAccountJson = process.env.SERVICE_ACCOUNT_KEY || process.env.NEXT_PUBLIC_SERVICE_ACCOUNT_KEY;
  if (!serviceAccountJson) {
    throw new Error("SERVICE_ACCOUNT_KEY no está configurada");
  }

  const serviceAccount = JSON.parse(serviceAccountJson);
  const databaseURL = process.env.NEXT_PUBLIC_FIREBASE_DATABASE_URL;

  return initializeApp({
    credential: cert(serviceAccount),
    databaseURL,
  });
}

function generateCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // No 0, O, 1, I
  let result = "";
  for (let i = 0; i < 6; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

export async function POST(request: NextRequest) {
  try {
    const app = getAdminApp();
    const db = getDatabase(app);

    const code = generateCode();
    const maxUses = 2;

    await db.ref(`inspector_tokens/${code}`).set({
      maxUses,
      uses: 0,
      createdAt: Date.now()
    });

    return NextResponse.json({ code, maxUses });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Error al generar token";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
