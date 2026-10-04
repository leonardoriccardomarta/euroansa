"use client";

import Link from "next/link";
import { useLinkStatus } from "next/link";
import { cn } from "@/lib/utils";

function PendingHint() {
  const { pending } = useLinkStatus();
  return (
    <span
      className={cn(
        "pointer-events-none absolute right-1 top-1 h-1.5 w-1.5 rounded-full bg-primary-500 transition-opacity",
        pending ? "animate-pulse opacity-100" : "opacity-0",
      )}
      aria-hidden
    />
  );
}

export function NavLink({
  href,
  className,
  children,
}: {
  href: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      prefetch
      className={cn("relative cursor-pointer", className)}
    >
      {children}
      <PendingHint />
    </Link>
  );
}
