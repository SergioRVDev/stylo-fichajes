import { NextRequest, NextResponse } from "next/server";
import { initializeApp, getApps, cert, type App } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
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

// CREATE user
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { email, password, role, displayName, lastName, dni, birthDate, schedule } = body;

    if (!email || !password) {
      return NextResponse.json(
        { error: "Email y contraseña son obligatorios" },
        { status: 400 }
      );
    }

    if (password.length < 6) {
      return NextResponse.json(
        { error: "La contraseña debe tener al menos 6 caracteres" },
        { status: 400 }
      );
    }

    const validRoles = ["manager", "employee"];
    const userRole = validRoles.includes(role) ? role : "employee";

    const app = getAdminApp();
    const auth = getAuth(app);

    const userRecord = await auth.createUser({
      email,
      password,
      displayName: displayName || undefined,
    });

    const db = getDatabase(app);
    await db.ref(`employees/default/${userRecord.uid}`).set({
      email,
      role: userRole,
      displayName: displayName || "",
      lastName: lastName || "",
      dni: dni || "",
      birthDate: birthDate || "",
      createdAt: Date.now(),
      ...(schedule && { schedule }),
    });

    return NextResponse.json({
      uid: userRecord.uid,
      email: userRecord.email,
      role: userRole,
    });
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "Error al crear usuario";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// UPDATE user
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const { uid, email, displayName, lastName, dni, birthDate, role, schedule } = body;

    if (!uid) {
      return NextResponse.json({ error: "UID es obligatorio" }, { status: 400 });
    }

    const app = getAdminApp();
    const auth = getAuth(app);
    const db = getDatabase(app);

    // Update Firebase Auth
    const updateAuth: Record<string, string> = {};
    if (email) updateAuth.email = email;
    if (displayName !== undefined) updateAuth.displayName = displayName;
    if (Object.keys(updateAuth).length > 0) {
      await auth.updateUser(uid, updateAuth);
    }

    // Update Realtime Database
    const updates: Record<string, unknown> = {};
    if (email) updates.email = email;
    if (displayName !== undefined) updates.displayName = displayName;
    if (lastName !== undefined) updates.lastName = lastName;
    if (dni !== undefined) updates.dni = dni;
    if (birthDate !== undefined) updates.birthDate = birthDate;
    if (role) updates.role = role;
    if (schedule) updates.schedule = schedule;
    if (Object.keys(updates).length > 0) {
      await db.ref(`employees/default/${uid}`).update(updates);
    }

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "Error al actualizar usuario";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// DELETE user
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const uid = searchParams.get("uid");

    if (!uid) {
      return NextResponse.json({ error: "UID es obligatorio" }, { status: 400 });
    }

    const app = getAdminApp();
    const auth = getAuth(app);
    const db = getDatabase(app);

    await auth.deleteUser(uid);
    await db.ref(`employees/default/${uid}`).update({
      status: "archived",
      deletedAt: Date.now()
    });

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "Error al eliminar usuario";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
