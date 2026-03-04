"use client";
import { useCallback, useState } from "react";
import { getToken } from "firebase/messaging";
import { getFirebaseMessaging } from "@/lib/firebase/config";
import { savePushToken } from "@/lib/firebase/database";

const VAPID_KEY = process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY;
const COMPANY_ID = "default";

export function usePushNotifications(uid: string | undefined | null) {
  const [status, setStatus] = useState<"idle" | "requesting" | "granted" | "denied" | "error">("idle");

  const requestPermission = useCallback(async () => {
    if (!uid) return;
    setStatus("requesting");
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setStatus("denied");
        return;
      }

      // Register firebase-messaging-sw.js
      const registration = await navigator.serviceWorker.register("/firebase-messaging-sw.js");

      // Send Firebase config to the SW so it can init Firebase inside
      const firebaseConfig = {
        apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
        authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
        databaseURL: process.env.NEXT_PUBLIC_FIREBASE_DATABASE_URL,
        projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
        storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
        messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
        appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
      };
      if (registration.active) {
        registration.active.postMessage({ type: "FIREBASE_CONFIG", config: firebaseConfig });
      } else if (registration.installing || registration.waiting) {
        const sw = registration.installing ?? registration.waiting!;
        sw.addEventListener("statechange", () => {
          if (sw.state === "activated") {
            registration.active?.postMessage({ type: "FIREBASE_CONFIG", config: firebaseConfig });
          }
        });
      }

      const messaging = getFirebaseMessaging();
      if (!messaging) throw new Error("Messaging no disponible");

      const token = await getToken(messaging, {
        vapidKey: VAPID_KEY,
        serviceWorkerRegistration: registration,
      });

      await savePushToken(COMPANY_ID, uid, token);
      setStatus("granted");
    } catch (err) {
      console.error("Error al solicitar permiso de notificaciones:", err);
      setStatus("error");
    }
  }, [uid]);

  return { status, requestPermission };
}
