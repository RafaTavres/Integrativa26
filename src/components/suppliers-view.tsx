"use client";

import { useMemo, useState } from "react";
import { Plus, Search } from "lucide-react";
import { useApp } from "@/lib/store";
import { useActions } from "./action-provider";
import { buildSupplierOverview } from "@/lib/analytics";
import { formatBRL } from "@/lib/format";

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
          <h1 className="display text-[1.75rem] leading-[1.05] text-ink sm:text-[2rem]">
            Fornecedores
          </h1>
          <p className="mt-1.5 text-[0.8125rem] text-muted">
            Contato, preço e o que falta pagar.
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

      <div className="animate-rise mt-5 flex flex-wrap items-baseline gap-x-4 gap-y-1 rounded-[4px] border border-line bg-paper px-3 py-2.5 text-[0.75rem] text-muted">
        <span>
          <strong className="text-ink tabular">{suppliers.length}</strong>{" "}
          {suppliers.length === 1 ? "fornecedor" : "fornecedores"}
        </span>
        <span>
          <strong className="text-terracotta-dark tabular">
            {formatBRL(totalOpen)}
          </strong>{" "}
          a pagar
        </span>
        <span>
          <strong className="text-ink tabular">{purchases.length}</strong>{" "}
          {purchases.length === 1 ? "compra" : "compras"}
        </span>
      </div>

      {overview.length > 2 ? (
        <div className="relative mt-4">
          <Search
            className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted"
            strokeWidth={1.9}
          />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Buscar fornecedor ou item"
            aria-label="Buscar fornecedor"
            className="text-input pl-10"
          />
        </div>
      ) : null}

      {overview.length > 0 ? (
        <div className="animate-rise mt-4 divide-y divide-line rounded-[4px] border border-line bg-paper">
          {filtered.map((supplier) => (
            <button
              key={supplier.id}
              type="button"
              onClick={() => openSupplier(supplier.id)}
              className="flex w-full items-center gap-3 px-3 py-3 text-left transition-colors hover:bg-cream"
            >
              <span className="display grid size-9 flex-none place-items-center rounded-[3px] bg-sand text-[0.6875rem] font-bold text-ink">
                {supplier.name
                  .split(" ")
                  .filter(Boolean)
                  .slice(0, 2)
                  .map((word) => word[0]?.toUpperCase())
                  .join("")}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[0.8125rem] font-bold text-ink">
                  {supplier.name}
                </span>
                <span className="mt-0.5 block truncate text-[0.6875rem] text-muted">
                  {supplier.phone ?? supplier.email ?? "Sem contato salvo"}
                </span>
              </span>
              {supplier.openTotalCents > 0 ? (
                <span className="flex-none text-right">
                  <span className="block text-[0.625rem] font-semibold text-muted">
                    a pagar
                  </span>
                  <span className="block text-[0.8125rem] font-bold text-terracotta-dark tabular">
                    {formatBRL(supplier.openTotalCents)}
                  </span>
                </span>
              ) : (
                <span className="badge flex-none bg-sage-soft text-sage-dark">
                  Em dia
                </span>
              )}
            </button>
          ))}
        </div>
      ) : (
        <div className="animate-rise mt-5 rounded-[4px] border border-dashed border-sand-dark bg-paper px-5 py-6 text-center">
          <h2 className="text-sm font-bold text-ink">Nenhum fornecedor</h2>
          <p className="mt-1 text-xs text-muted">
            Salve quem te vende para comparar preços e lembrar do que falta
            pagar.
          </p>
          <button
            type="button"
            onClick={() => openSupplierForm()}
            className="btn btn-primary mt-3 h-10 px-4 text-xs"
          >
            <Plus className="size-3.5" strokeWidth={2.4} />
            Salvar fornecedor
          </button>
        </div>
      )}

      {overview.length > 0 && filtered.length === 0 ? (
        <p className="mt-4 rounded-[4px] border border-line bg-cream p-3 text-center text-xs text-muted">
          Nenhum fornecedor encontrado para “{query}”.
        </p>
      ) : null}
    </div>
  );
}
