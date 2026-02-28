"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/AuthProvider";
import { signOut } from "@/lib/firebase/auth";

export default function Home() {
  const router = useRouter();
  const { user, loading } = useAuth();

  useEffect(() => {
    if (!loading && !user) {
      router.replace("/login");
    }
  }, [user, loading, router]);

  if (loading || !user) {
    return (
      <main className="flex min-h-dvh items-center justify-center">
        <p className="text-muted">Cargando...</p>
      </main>
    );
  }

  async function handleSignOut() {
    await signOut();
    router.replace("/login");
  }

  return (
    <main className="flex min-h-dvh flex-col px-4 py-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Stylo Fichajes</h1>
        <button
          onClick={handleSignOut}
          className="rounded-lg px-3 py-1.5 text-sm text-muted transition-colors hover:bg-background"
        >
          Cerrar sesión
        </button>
      </div>
      <p className="mt-1 text-sm text-muted">{user.email}</p>
      <p className="mt-8 text-center text-muted">Control horario</p>
    </main>
  );
}
