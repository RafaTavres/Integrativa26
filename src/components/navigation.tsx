"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Boxes, ChevronDown, Home, Plus } from "lucide-react";
import { Logo } from "./logo";
import { useActions } from "./action-provider";
import { useApp } from "@/lib/store";
import { initials } from "@/lib/format";
import { cn } from "@/lib/cn";

export function TopBar() {
  const pathname = usePathname();
  const { business, segment } = useApp();
  const { openMore, openSale } = useActions();

  const navItems = [
    { href: "/", label: "Início", icon: Home },
    { href: "/estoque", label: segment.stockLabel, icon: Boxes },
  ];

  return (
    <header className="sticky top-0 z-40 border-b border-line bg-cream/95 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-[1120px] items-center justify-between gap-4 px-4 sm:px-6 lg:h-[4.5rem] lg:px-8">
        <div className="flex min-w-0 items-center gap-6 xl:gap-9">
          <Logo />
          <nav className="hidden items-center gap-1 lg:flex" aria-label="Principal">
            {navItems.map((item) => {
              const active =
                item.href === "/"
                  ? pathname === "/"
                  : pathname.startsWith(item.href);
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "flex h-9 items-center gap-2 rounded-[4px] px-3 text-[0.8125rem] font-semibold transition-colors",
                    active
                      ? "bg-sand text-ink"
                      : "text-muted hover:bg-sand/60 hover:text-ink",
                  )}
                >
                  <Icon className="size-4" strokeWidth={1.9} />
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </div>

        <div className="flex flex-none items-center gap-2">
          <button
            type="button"
            onClick={openSale}
            className="btn btn-primary hidden h-9 px-3.5 text-[0.8125rem] lg:inline-flex"
          >
            <Plus className="size-4" strokeWidth={2.4} />
            {segment.saleAction}
          </button>
          <button
            type="button"
            onClick={openMore}
            className="flex h-10 items-center gap-2 rounded-[4px] border border-line bg-paper pl-1 pr-1 text-left transition-colors hover:border-sand-dark hover:bg-sand/60 sm:pr-2.5"
          >
            <span className="sr-only">Abrir menu de </span>
            <span
              aria-hidden="true"
              className="display grid size-8 place-items-center rounded-[3px] bg-ink text-sm text-cream"
            >
              {initials(business.name)}
            </span>
            <span className="hidden max-w-[9rem] truncate text-[0.75rem] font-bold text-ink sm:block">
              {business.name}
            </span>
            <ChevronDown
              className="hidden size-3.5 text-muted sm:block"
              strokeWidth={2}
            />
          </button>
        </div>
      </div>
    </header>
  );
}

export function BottomNav() {
  const pathname = usePathname();
  const { segment } = useApp();
  const { openSale } = useActions();

  const navItems = [
    { href: "/", label: "Início", icon: Home },
    { href: "/estoque", label: segment.stockLabel, icon: Boxes },
  ];

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-cream/95 backdrop-blur-md lg:hidden"
      aria-label="Navegação rápida"
    >
      <div className="mx-auto grid h-[4.5rem] max-w-[27rem] grid-cols-3 items-center px-4 pb-[env(safe-area-inset-bottom)]">
        {navItems.slice(0, 1).map((item) => {
          const Icon = item.icon;
          const active = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex flex-col items-center gap-1 rounded-[4px] py-1 text-[0.625rem] font-semibold transition-colors",
                active ? "text-ink" : "text-muted",
              )}
            >
              <span
                className={cn(
                  "grid h-7 w-10 place-items-center rounded-[3px]",
                  active ? "bg-sand" : "bg-transparent",
                )}
              >
                <Icon className="size-[1.15rem]" strokeWidth={2} />
              </span>
              {item.label}
            </Link>
          );
        })}

        <button
          type="button"
          onClick={openSale}
          className="mx-auto flex flex-col items-center gap-1 rounded-[4px] text-[0.625rem] font-bold text-ink"
        >
          <span className="grid h-9 w-16 place-items-center rounded-[4px] border-b-[3px] border-terracotta-dark bg-terracotta text-cream">
            <Plus className="size-5" strokeWidth={2.6} />
          </span>
          {segment.saleAction}
        </button>

        {navItems.slice(1).map((item) => {
          const Icon = item.icon;
          const active = pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex flex-col items-center gap-1 rounded-[4px] py-1 text-[0.625rem] font-semibold transition-colors",
                active ? "text-ink" : "text-muted",
              )}
            >
              <span
                className={cn(
                  "grid h-7 w-10 place-items-center rounded-[3px]",
                  active ? "bg-sand" : "bg-transparent",
                )}
              >
                <Icon className="size-[1.15rem]" strokeWidth={2} />
              </span>
              {item.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
