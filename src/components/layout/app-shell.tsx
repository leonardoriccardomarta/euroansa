"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Building2,
  FolderKanban,
  LogOut,
  Settings,
  Users,
} from "lucide-react";
import { logoutAction } from "@/actions/auth";
import { cn } from "@/lib/utils";

type NavItem = {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
};

export function AppShell({
  children,
  userName,
  isAdmin,
}: {
  children: React.ReactNode;
  userName: string;
  isAdmin: boolean;
}) {
  const pathname = usePathname();

  const nav: NavItem[] = [
    { href: "/dashboard", label: "Pratiche", icon: FolderKanban },
    { href: "/dashboard/settings", label: "Impostazioni", icon: Settings },
    ...(isAdmin
      ? [{ href: "/dashboard/users", label: "Utenti", icon: Users }]
      : []),
  ];

  function isActive(href: string) {
    if (href === "/dashboard") {
      return pathname === "/dashboard" || pathname.startsWith("/dashboard/applications");
    }
    return pathname === href || pathname.startsWith(`${href}/`);
  }

  return (
    <div className="min-h-screen bg-slate-50 pb-20 md:pb-0">
      <header className="sticky top-0 z-40 border-b border-slate-200/80 bg-white/90 backdrop-blur-md">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-3 md:px-8">
          <Link
            href="/dashboard"
            className="flex items-center gap-2 font-bold text-slate-900"
          >
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary-600 text-white shadow-sm">
              <Building2 className="h-5 w-5" />
            </span>
            <span className="hidden sm:inline">Euroansa</span>
          </Link>

          <nav className="hidden items-center gap-1 md:flex">
            {nav.map((item) => {
              const active = isActive(item.href);
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                    active
                      ? "bg-primary-50 text-primary-700"
                      : "text-slate-600 hover:bg-slate-100 hover:text-slate-900",
                  )}
                >
                  <Icon className="h-4 w-4" />
                  {item.label}
                </Link>
              );
            })}
          </nav>

          <div className="flex items-center gap-2">
            <span className="hidden max-w-[140px] truncate text-xs text-slate-500 lg:inline">
              {userName}
            </span>
            <form action={logoutAction}>
              <button
                type="submit"
                className="inline-flex h-8 items-center gap-1.5 rounded-lg px-3 text-sm font-medium text-slate-700 transition hover:bg-slate-100"
                aria-label="Esci"
              >
                <LogOut className="h-4 w-4" />
                <span className="hidden sm:inline">Esci</span>
              </button>
            </form>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-6 md:px-8 md:py-8 animate-in fade-in duration-300">
        {children}
      </main>

      <nav className="fixed bottom-0 left-0 right-0 z-40 flex border-t border-slate-200 bg-white/95 backdrop-blur md:hidden">
        {nav.map((item) => {
          const active = isActive(item.href);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex flex-1 flex-col items-center gap-1 py-2.5 text-[11px] font-medium",
                active ? "text-primary-700" : "text-slate-500",
              )}
            >
              <Icon className="h-5 w-5" />
              {item.label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
