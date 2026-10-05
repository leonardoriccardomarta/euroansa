"use client";

import Image from "next/image";
import { Suspense } from "react";
import { usePathname } from "next/navigation";
import {
  Building2,
  CalendarDays,
  CircleDollarSign,
  FolderKanban,
  HardDrive,
  LineChart,
  LogOut,
  Phone,
  Settings,
  Users,
} from "lucide-react";
import { logoutAction } from "@/actions/auth";
import { NavLink } from "@/components/layout/nav-link";
import { AppTour } from "@/components/onboarding/app-tour";
import { APP_NAME } from "@/lib/brand";
import { cn } from "@/lib/utils";

type NavItem = {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  tourId?: string;
};

export function AppShell({
  children,
  userName,
  isAdmin,
  tutorialDone,
}: {
  children: React.ReactNode;
  userName: string;
  isAdmin: boolean;
  tutorialDone: boolean;
}) {
  const pathname = usePathname();

  const nav: NavItem[] = [
    {
      href: "/dashboard",
      label: "Pratiche",
      icon: FolderKanban,
      tourId: "nav-pratiche",
    },
    {
      href: "/dashboard/rogitate",
      label: "Rogitate",
      icon: CircleDollarSign,
      tourId: "nav-rogitate",
    },
    {
      href: "/dashboard/appointments",
      label: "Appuntamenti",
      icon: CalendarDays,
    },
    {
      href: "/dashboard/leads",
      label: "Leads",
      icon: Phone,
    },
    {
      href: "/dashboard/budget",
      label: "Budget",
      icon: LineChart,
    },
    {
      href: "/dashboard/sviluppo",
      label: "Sviluppo",
      icon: Building2,
    },
    {
      href: "/dashboard/files",
      label: "File",
      icon: HardDrive,
      tourId: "nav-files",
    },
    ...(isAdmin
      ? [
          {
            href: "/dashboard/settings",
            label: "Impostazioni",
            icon: Settings,
            tourId: "nav-settings",
          },
          {
            href: "/dashboard/users",
            label: "Utenti",
            icon: Users,
            tourId: "nav-users",
          },
        ]
      : []),
  ];

  function isActive(href: string) {
    if (href === "/dashboard") {
      return (
        pathname === "/dashboard" ||
        pathname.startsWith("/dashboard/applications")
      );
    }
    return pathname === href || pathname.startsWith(`${href}/`);
  }

  return (
    <div className="min-h-screen bg-slate-50 pb-24 md:pb-0">
      <header className="sticky top-0 z-40 border-b border-slate-200/80 bg-white/95 backdrop-blur-md">
        <div className="mx-auto max-w-7xl px-4 md:px-8">
          <div className="flex items-center justify-between gap-3 py-2.5">
            <NavLink
              href="/dashboard"
              className="flex shrink-0 items-center gap-2.5 font-bold text-slate-900 active:scale-95"
            >
              <Image
                src="/icon-192.png"
                alt=""
                width={36}
                height={36}
                className="h-9 w-9 rounded-xl shadow-sm"
                priority
              />
              <span className="hidden sm:inline">{APP_NAME}</span>
            </NavLink>

            <div className="flex shrink-0 items-center gap-3">
              <span className="hidden max-w-[160px] truncate text-sm text-slate-500 md:inline">
                {userName}
              </span>
              <form action={logoutAction}>
                <button
                  type="submit"
                  className="inline-flex min-h-10 items-center gap-2 rounded-lg px-3 text-sm font-medium text-slate-700 transition hover:bg-slate-100 active:scale-95"
                  aria-label="Esci"
                >
                  <LogOut className="h-4 w-4" />
                  <span className="hidden sm:inline">Esci</span>
                </button>
              </form>
            </div>
          </div>

          <nav className="hidden border-t border-slate-100 py-2 md:block">
            <ul className="flex flex-wrap items-center gap-x-1 gap-y-1.5">
              {nav.map((item) => {
                const active = isActive(item.href);
                const Icon = item.icon;
                return (
                  <li key={item.href}>
                    <NavLink
                      href={item.href}
                      data-tour={item.tourId}
                      className={cn(
                        "inline-flex min-h-9 items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors active:scale-95",
                        active
                          ? "bg-primary-50 text-primary-700"
                          : "text-slate-600 hover:bg-slate-100 hover:text-slate-900",
                      )}
                    >
                      <Icon className="h-4 w-4 shrink-0 opacity-80" />
                      {item.label}
                    </NavLink>
                  </li>
                );
              })}
            </ul>
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-5 md:px-8 md:py-8">
        {children}
      </main>

      <nav className="fixed bottom-0 left-0 right-0 z-40 flex gap-1 overflow-x-auto border-t border-slate-200 bg-white/95 px-2 pb-[env(safe-area-inset-bottom)] pt-1 backdrop-blur md:hidden">
        {nav.map((item) => {
          const active = isActive(item.href);
          const Icon = item.icon;
          return (
            <NavLink
              key={item.href}
              href={item.href}
              data-tour={item.tourId}
              className={cn(
                "flex min-h-14 min-w-[4.75rem] shrink-0 flex-col items-center justify-center gap-1 rounded-lg px-2 text-[10px] font-semibold active:scale-95",
                active
                  ? "bg-primary-50 text-primary-700"
                  : "text-slate-500",
              )}
            >
              <Icon className="h-5 w-5" />
              <span className="leading-none">{item.label}</span>
            </NavLink>
          );
        })}
      </nav>

      <Suspense fallback={null}>
        <AppTour isAdmin={isAdmin} tutorialDone={tutorialDone} />
      </Suspense>
    </div>
  );
}
