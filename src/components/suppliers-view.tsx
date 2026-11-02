"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Plus, Search, Truck } from "lucide-react";
import { useApp } from "@/lib/store";
import { useActions } from "./action-provider";
import { buildSupplierOverview } from "@/lib/analytics";
import { dayLabel, formatBRL } from "@/lib/format";

export function SuppliersView() {
  const { suppliers, bills, purchases } = useApp();
  const { openSupplierForm, openSupplier } = useActions();
  const [query, setQuery] = useState("");

  const overview = useMemo(
    () => buildSupplierOverview(suppliers, bills, purchases),
    [suppliers, bills, purchases],
  );

  const filtered = useMemo(() => {
    const clean = query.trim().toLowerCase();
    if (!clean) return overview;
    return overview.filter(
      (supplier) =>
        supplier.name.toLowerCase().includes(clean) ||
        supplier.productNames.some((name) =>
          name.toLowerCase().includes(clean),
        ),
    );
  }, [overview, query]);

  const totalOpen = overview.reduce(
    (total, supplier) => total + supplier.openTotalCents,
    0,
  );

  return (
    <div className="mx-auto w-full max-w-[1120px] px-4 pb-10 pt-6 sm:px-6 lg:px-8 lg:pt-9">
      <header className="animate-rise flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="eyebrow">Quem te vende</p>
          <h1 className="display mt-1.5 text-[2rem] leading-[1.05] text-ink sm:text-[2.5rem]">
            Fornecedores
          </h1>
          <p className="mt-2 max-w-[34rem] text-sm leading-relaxed text-muted">
            Guarde contato, histórico de preço e o que falta pagar para cada um.
          </p>
        </div>
        <button
          type="button"
          onClick={() => openSupplierForm()}
          className="btn btn-primary h-11 px-4 text-sm"
        >
          <Plus className="size-4" strokeWidth={2.4} />
          Novo fornecedor
        </button>
      </header>

      <div className="animate-rise mt-6 grid gap-2.5 sm:grid-cols-3">
        <div className="rounded-[4px] border border-line bg-paper p-3.5">
          <p className="text-[0.625rem] font-bold uppercase tracking-[0.1em] text-muted">
            Fornecedores
          </p>
          <p className="mt-1 text-2xl font-extrabold tracking-tight text-ink tabular">
            {suppliers.length}
          </p>
        </div>
        <div className="rounded-[4px] border border-line bg-paper p-3.5">
          <p className="text-[0.625rem] font-bold uppercase tracking-[0.1em] text-muted">
            Falta pagar
          </p>
          <p className="mt-1 text-2xl font-extrabold tracking-tight text-terracotta-dark tabular">
            {formatBRL(totalOpen)}
          </p>
        </div>
        <div className="rounded-[4px] border border-line bg-paper p-3.5">
          <p className="text-[0.625rem] font-bold uppercase tracking-[0.1em] text-muted">
            Compras registradas
          </p>
          <p className="mt-1 text-2xl font-extrabold tracking-tight text-ink tabular">
            {purchases.length}
          </p>
        </div>
      </div>

      {overview.length > 2 ? (
        <div className="relative mt-5">
          <Search
            className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted"
            strokeWidth={1.9}
          />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Buscar por fornecedor ou item"
            aria-label="Buscar fornecedor"
            className="text-input pl-10"
          />
        </div>
      ) : null}

      <div className="mt-5 grid gap-2.5 md:grid-cols-2">
        {filtered.map((supplier) => (
          <button
            key={supplier.id}
            type="button"
            onClick={() => openSupplier(supplier.id)}
            className="animate-rise flex items-start gap-3 rounded-[4px] border border-line bg-paper p-3.5 text-left transition-colors hover:border-sand-dark hover:bg-[#fffaf3]"
          >
            <span className="display grid size-11 flex-none place-items-center rounded-[4px] bg-sand text-sm font-bold text-ink">
              {supplier.name
                .split(" ")
                .filter(Boolean)
                .slice(0, 2)
                .map((word) => word[0]?.toUpperCase())
                .join("")}
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-bold leading-tight text-ink">
                    {supplier.name}
                  </p>
                  <p className="mt-0.5 truncate text-[0.6875rem] text-muted">
                    {supplier.phone ?? supplier.email ?? "Sem contato salvo"}
                  </p>
                </div>
                {supplier.openTotalCents > 0 ? (
                  <span className="flex-none text-right">
                    <span className="block text-[0.625rem] font-bold uppercase tracking-[0.08em] text-terracotta-dark">
                      Falta pagar
                    </span>
                    <span className="mt-0.5 block text-sm font-bold text-terracotta-dark tabular">
                      {formatBRL(supplier.openTotalCents)}
                    </span>
                  </span>
                ) : (
                  <span className="badge flex-none bg-sage-soft text-sage-dark">
                    Em dia
                  </span>
                )}
              </div>

              {supplier.productNames.length > 0 ? (
                <p className="mt-2 line-clamp-1 text-[0.6875rem] text-muted">
                  {supplier.productNames.slice(0, 3).join(" · ")}
                  {supplier.productNames.length > 3
                    ? ` +${supplier.productNames.length - 3}`
                    : ""}
                </p>
              ) : null}

              <p className="mt-1 text-[0.625rem] text-muted">
                {supplier.purchaseCount}{" "}
                {supplier.purchaseCount === 1 ? "compra" : "compras"}
                {supplier.lastPurchaseAt
                  ? ` · última ${dayLabel(supplier.lastPurchaseAt).toLowerCase()}`
                  : ""}
              </p>
            </div>
          </button>
        ))}
      </div>

      {overview.length === 0 ? (
        <div className="animate-rise mt-6 rounded-[4px] border border-dashed border-sand-dark bg-paper px-5 py-10 text-center">
          <span className="mx-auto grid size-12 place-items-center rounded-[4px] bg-sand text-ink">
            <Truck className="size-5" strokeWidth={1.8} />
          </span>
          <h2 className="display mt-3 text-xl text-ink">Nenhum fornecedor</h2>
          <p className="mx-auto mt-1 max-w-[20rem] text-xs leading-relaxed text-muted">
            Salve quem te vende para comparar preços e lembrar do que falta
            pagar.
          </p>
          <button
            type="button"
            onClick={() => openSupplierForm()}
            className="btn btn-primary mt-4"
          >
            <Plus className="size-4" strokeWidth={2.4} />
            Salvar fornecedor
          </button>
        </div>
      ) : null}

      {overview.length > 0 && filtered.length === 0 ? (
        <div className="mt-6 rounded-[4px] border border-line bg-cream p-4 text-center text-xs text-muted">
          Nenhum fornecedor encontrado para “{query}”.{" "}
          <Link href="/analises" className="font-bold text-terracotta-dark underline">
            Ver análises
          </Link>
        </div>
      ) : null}
    </div>
  );
}
