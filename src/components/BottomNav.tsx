"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/components/AuthProvider";
import { Clock, Calendar, User, Users, FileText } from "lucide-react";

export function BottomNav() {
  const pathname = usePathname();
  const { user, role } = useAuth();

  if (!user || pathname === "/login") return null;

  const isManager = role === "manager";

  const leftTabs = [
    { href: "/fichajes", label: "Fichajes", icon: Calendar },
    ...(isManager
      ? [{ href: "/usuarios", label: "Usuarios", icon: Users }]
      : []),
  ];

  const rightTabs = [
    ...(isManager
      ? [
          { href: "/informes", label: "Informes", icon: FileText },
          { href: "/perfil", label: "Perfil", icon: User },
        ]
      : [
          { href: "/perfil", label: "Perfil", icon: User },
        ]),
  ];

  const isHomeActive = pathname === "/";

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 bg-surface rounded-t-[32px] shadow-[0_-10px_40px_-15px_rgba(0,0,0,0.15)] pb-safe">
      <div className="mx-auto flex max-w-lg items-center justify-around relative px-2">
        {/* Left tabs */}
        {leftTabs.map((tab) => {
          const isActive = pathname === tab.href;
          const Icon = tab.icon;
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={`flex flex-1 flex-col items-center gap-0.5 py-2 text-xs font-medium transition-colors ${
                isActive ? "text-primary" : "text-muted hover:text-foreground"
              }`}
            >
              <Icon className={`h-5 w-5 ${isActive ? "scale-110" : ""}`} />
              {tab.label}
            </Link>
          );
        })}

        {/* Center - Fichar FAB */}
        <div className="flex flex-1 items-center justify-center">
          <Link
            href="/"
            className={`-mt-8 flex h-[60px] w-[60px] items-center justify-center rounded-2xl shadow-lg transition-all ${
              isHomeActive
                ? "bg-primary text-white shadow-primary/30 scale-105"
                : "bg-surface text-primary border-2 border-primary/10 shadow-sm hover:border-primary/30 hover:scale-105"
            }`}
          >
            <Clock className="h-7 w-7" strokeWidth={isHomeActive ? 2 : 1.5} />
          </Link>
        </div>

        {/* Right tabs */}
        {rightTabs.length > 0 ? (
          rightTabs.map((tab) => {
            const isActive = pathname === tab.href;
            const Icon = tab.icon;
            return (
              <Link
                key={tab.href}
                href={tab.href}
                className={`flex flex-1 flex-col items-center gap-0.5 py-2 text-xs font-medium transition-colors ${
                  isActive ? "text-primary" : "text-muted hover:text-foreground"
                }`}
              >
                <Icon className={`h-5 w-5 ${isActive ? "scale-110" : ""}`} />
                {tab.label}
              </Link>
            );
          })
        ) : (
          /* Non-manager: add an empty spacer on the right to balance */
          <div className="flex-1" />
        )}
      </div>
    </nav>
  );
}
