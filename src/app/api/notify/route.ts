import { NextRequest, NextResponse } from "next/server";
import { getAdminApp } from "@/lib/firebase/admin";
import { getDatabase } from "firebase-admin/database";
import { getMessaging } from "firebase-admin/messaging";

export async function POST(request: NextRequest) {
  try {
    const { title, body, url, companyId } = await request.json();

    if (!companyId) {
      return NextResponse.json({ error: "Falta companyId" }, { status: 400 });
    }

    const app = getAdminApp();
    const db = getDatabase(app);

    // Get manager push tokens
    const [empSnap, tokenSnap] = await Promise.all([
      db.ref(`employees/${companyId}`).get(),
      db.ref(`push_tokens/${companyId}`).get(),
    ]);

    if (!tokenSnap.exists()) {
      return NextResponse.json({ sent: 0, message: "No hay tokens registrados" });
    }

    const employees = empSnap.exists() ? empSnap.val() : {};
    const tokenMap = tokenSnap.val();
    const tokens: string[] = [];
    for (const uid of Object.keys(tokenMap)) {
      if (employees[uid]?.role === "manager") {
        tokens.push(tokenMap[uid]);
      }
    }

    if (tokens.length === 0) {
      return NextResponse.json({ sent: 0, message: "No hay managers con push token" });
    }

    const messaging = getMessaging(app);
    let sent = 0;

    // Send to each token individually (multicast deprecated in newer SDK)
    for (const token of tokens) {
      try {
        await messaging.send({
          token,
          notification: {
            title: title || "Nueva Solicitud de Corrección",
            body: body || "Un empleado ha solicitado una modificación de fichaje.",
          },
          data: {
            url: url || "/usuarios?tab=solicitudes",
          },
          webpush: {
            fcmOptions: {
              link: url || "/usuarios?tab=solicitudes",
            },
            notification: {
              title: title || "Nueva Solicitud de Corrección",
              body: body || "Un empleado ha solicitado una modificación de fichaje.",
              icon: "/icon-192.png",
              badge: "/icon-192.png",
            },
          },
        });
        sent++;
      } catch (e) {
        console.error(`Error sending to token ${token}:`, e);
      }
    }

    return NextResponse.json({ sent, tokens: tokens.length });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Error al enviar notificación";
    console.error("Notify API Error:", error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
