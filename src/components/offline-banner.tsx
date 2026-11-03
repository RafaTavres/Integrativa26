"use client";

import { CloudOff, RefreshCw } from "lucide-react";
import { useApp } from "@/lib/store";

export function OfflineBanner() {
  const { cloudStatus, cloudMessage, retryCloud, readOnly } = useApp();

  if (cloudStatus !== "error" || !readOnly) return null;

  return (
    <div className="border-b border-terracotta/30 bg-terracotta-soft">
      <div className="mx-auto flex max-w-[1120px] flex-wrap items-start gap-x-3 gap-y-2 px-4 py-2.5 sm:px-6 lg:px-8">
        <span className="grid size-7 flex-none place-items-center rounded-[3px] bg-paper text-terracotta-dark">
          <CloudOff className="size-3.5" strokeWidth={2.2} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[0.6875rem] font-bold text-ink">
            Sem conexão com a nuvem — somente leitura
          </p>
          <p className="mt-0.5 text-[0.6875rem] leading-snug text-ink/75">
            {cloudMessage ??
              "Seus últimos dados salvos estão aqui. Para não perder registros, novos lançamentos ficam bloqueados até reconectar."}
          </p>
        </div>
        <button
          type="button"
          onClick={() => void retryCloud()}
          className="inline-flex flex-none items-center gap-1.5 text-[0.6875rem] font-bold text-terracotta-dark underline underline-offset-2"
        >
          <RefreshCw className="size-3" strokeWidth={2.4} />
          Tentar de novo
        </button>
      </div>
    </div>
  );
}
