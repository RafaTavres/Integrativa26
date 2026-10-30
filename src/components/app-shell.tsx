import type { ReactNode } from "react";
import { TopBar, BottomNav } from "./navigation";

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-[100dvh] flex-col">
      <TopBar />
      <main className="flex-1 pb-24 lg:pb-8">{children}</main>
      <BottomNav />
    </div>
  );
}
