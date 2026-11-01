"use client";

import type { ReactNode } from "react";
import { useApp } from "@/lib/store";
import { Logo } from "./logo";
import { TopBar, BottomNav } from "./navigation";

export function AppShell({ children }: { children: ReactNode }) {
  const { ready } = useApp();

  if (!ready) {
    return (
      <div className="grid min-h-[100dvh] place-items-center px-6">
        <div
          role="status"
          aria-live="polite"
          className="flex flex-col items-center gap-3"
        >
          <Logo />
          <p className="text-xs font-medium text-muted">Abrindo seu caixa…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-[100dvh] flex-col">
      <TopBar />
      <main className="flex-1 pb-24 lg:pb-8">{children}</main>
      <BottomNav />
    </div>
  );
}
