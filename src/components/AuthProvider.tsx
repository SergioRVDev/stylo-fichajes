"use client";

import { createContext, useContext, useEffect, useState } from "react";
import type { User } from "firebase/auth";
import { onAuthStateChanged } from "firebase/auth";
import { getFirebaseAuth } from "@/lib/firebase/config";
import type { UserRole, WorkSchedule } from "@/types";
import { get, ref } from "firebase/database";
import { getFirebaseDatabase } from "@/lib/firebase/config";

interface AuthContextValue {
  user: User | null;
  role: UserRole | null;
  displayName: string;
  lastName: string;
  schedule: WorkSchedule | null;
  loading: boolean;
}

const AuthContext = createContext<AuthContextValue>({
  user: null,
  role: null,
  displayName: "",
  lastName: "",
  schedule: null,
  loading: true,
});

export function useAuth() {
  return useContext(AuthContext);
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [role, setRole] = useState<UserRole | null>(null);
  const [displayName, setDisplayName] = useState("");
  const [lastName, setLastName] = useState("");
  const [schedule, setSchedule] = useState<WorkSchedule | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(getFirebaseAuth(), async (firebaseUser) => {
      setUser(firebaseUser);
      if (firebaseUser) {
        try {
          const db = getFirebaseDatabase();
          const snapshot = await get(ref(db, `employees/default/${firebaseUser.uid}`));
          if (snapshot.exists()) {
            const data = snapshot.val();
            setRole(data.role ?? "employee");
            setDisplayName(data.displayName ?? "");
            setLastName(data.lastName ?? "");
            setSchedule(data.schedule ?? null);
          } else {
            setRole("employee");
          }
        } catch {
          setRole("employee");
        }
      } else {
        setRole(null);
        setDisplayName("");
        setLastName("");
        setSchedule(null);
      }
      setLoading(false);
    });

    return unsubscribe;
  }, []);

  return (
    <AuthContext.Provider value={{ user, role, displayName, lastName, schedule, loading }}>
      {children}
    </AuthContext.Provider>
  );
}
