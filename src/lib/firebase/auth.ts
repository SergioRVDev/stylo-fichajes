import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut as firebaseSignOut,
} from "firebase/auth";
import { getFirebaseAuth } from "./config";

export async function signIn(email: string, password: string) {
  return createUserWithEmailAndPassword(getFirebaseAuth(), email, password);
}

export async function logIn(email: string, password: string) {
  return signInWithEmailAndPassword(getFirebaseAuth(), email, password);
}

export async function signOut() {
  return firebaseSignOut(getFirebaseAuth());
}

const ERROR_MESSAGES: Record<string, string> = {
  "auth/email-already-in-use": "Este email ya está registrado.",
  "auth/invalid-email": "El email introducido no es válido.",
  "auth/weak-password": "La contraseña debe tener al menos 6 caracteres.",
  "auth/user-not-found": "No existe una cuenta con este email.",
  "auth/wrong-password": "La contraseña es incorrecta.",
  "auth/invalid-credential": "Email o contraseña incorrectos.",
  "auth/too-many-requests": "Demasiados intentos. Inténtalo de nuevo más tarde.",
  "auth/network-request-failed": "Error de conexión. Comprueba tu conexión a internet.",
};

export function getAuthErrorMessage(errorCode: string): string {
  return ERROR_MESSAGES[errorCode] ?? "Ha ocurrido un error. Inténtalo de nuevo.";
}
