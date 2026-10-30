"use client";

import { useMemo } from "react";
import { Package, PackagePlus, Pencil, Plus } from "lucide-react";
import { useApp } from "@/lib/store";
import { useActions } from "./action-provider";
import { formatBRL } from "@/lib/format";
import { cn } from "@/lib/cn";

export function StockView() {
  const { products, lowStockProducts, segment } = useApp();
  const { openStock, openEditProduct } = useActions();

  const tracked = useMemo(
    () => products.filter((product) => product.trackStock),
    [products],
  );

  const sorted = useMemo(() => {
    const lowIds = new Set(lowStockProducts.map((product) => product.id));
    return [...tracked].sort((a, b) => {
      const aLow = lowIds.has(a.id);
      const bLow = lowIds.has(b.id);
      if (aLow !== bLow) return aLow ? -1 : 1;
      if (aLow && bLow && a.stock !== b.stock) return a.stock - b.stock;
      return a.name.localeCompare(b.name, "pt-BR");
    });
  }, [tracked, lowStockProducts]);

  return (
    <div className="mx-auto w-full max-w-[1120px] px-4 pb-10 pt-6 sm:px-6 lg:px-8 lg:pt-9">
      <header className="animate-rise flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="display text-[2rem] leading-[1.05] text-ink sm:text-[2.5rem]">
            {segment.stockTitle}
          </h1>
          <p className="mt-1.5 text-[0.8125rem] text-muted sm:text-sm">
            {tracked.length} {tracked.length === 1 ? "item" : "itens"} ·{" "}
            {lowStockProducts.length}{" "}
            {lowStockProducts.length === 1 ? "para repor" : "para repor"}
          </p>
        </div>
        <button
          type="button"
          onClick={() => openStock()}
          className="btn btn-primary h-11 w-full sm:w-auto"
        >
          <PackagePlus className="size-[1.1rem]" strokeWidth={2.2} />
          Adicionar
        </button>
      </header>

      <section aria-labelledby="products-title" className="mt-6">
        <h2 id="products-title" className="sr-only">
          {segment.stockTitle}
        </h2>

        {sorted.length === 0 ? (
          <div className="rounded-[4px] border border-dashed border-sand-dark bg-paper px-5 py-10 text-center">
            <span className="mx-auto grid size-11 place-items-center rounded-[4px] bg-sand text-ink">
              <Package className="size-5" strokeWidth={1.8} />
            </span>
            <h3 className="display mt-3 text-xl text-ink">Nada aqui ainda</h3>
            <p className="mx-auto mt-1 max-w-[20rem] text-xs leading-relaxed text-muted">
              Adicione o que você vende para acompanhar o estoque.
            </p>
            <button
              type="button"
              onClick={() => openStock()}
              className="btn btn-primary mt-4"
            >
              <Plus className="size-4" strokeWidth={2.4} />
              Adicionar item
            </button>
          </div>
        ) : (
          <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
            {sorted.map((product) => {
              const isEmpty = product.stock === 0;
              const isLow = product.stock <= product.minStock;

              return (
                <article
                  key={product.id}
                  className={cn(
                    "flex items-center gap-3 rounded-[4px] border bg-paper p-3 transition-colors hover:border-sand-dark",
                    isLow
                      ? "border-mustard/45 border-l-[3px] border-l-mustard"
                      : "border-line",
                  )}
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <h3 className="truncate text-[0.875rem] font-bold leading-tight text-ink">
                        {product.name}
                      </h3>
                      {isLow ? (
                        <span
                          className={cn(
                            "badge flex-none",
                            isEmpty
                              ? "bg-terracotta-soft text-terracotta-dark"
                              : "bg-mustard-soft text-mustard-dark",
                          )}
                        >
                          {isEmpty ? "Acabou" : "Acabando"}
                        </span>
                      ) : null}
                    </div>
                    <p className="mt-1 text-[0.6875rem] text-muted">
                      {formatBRL(product.priceCents)}
                    </p>
                  </div>

                  <div className="text-right">
                    <p
                      className={cn(
                        "text-xl font-extrabold leading-none tracking-tight tabular",
                        isLow ? "text-mustard-dark" : "text-ink",
                      )}
                    >
                      {product.stock}
                    </p>
                    <p className="mt-0.5 text-[0.625rem] text-muted">
                      {product.stock === 1 ? product.unit : product.unitPlural}
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={() => openStock(product.id)}
                    className={cn(
                      "btn h-9 flex-none px-2.5 text-[0.6875rem]",
                      isLow ? "btn-primary" : "btn-secondary",
                    )}
                  >
                    <Plus className="size-3.5" strokeWidth={2.5} />
                    Repor
                  </button>

                  <button
                    type="button"
                    onClick={() => openEditProduct(product.id)}
                    className="icon-button size-8 flex-none border-transparent bg-transparent text-muted hover:border-line"
                    aria-label={`Ajustar ${product.name}`}
                  >
                    <Pencil className="size-3.5" strokeWidth={1.9} />
                  </button>
                </article>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
