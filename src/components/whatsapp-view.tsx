"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  Boxes,
  Clock3,
  MessageCircle,
  Mic,
  RefreshCw,
  Search,
  Tag,
  Wallet,
} from "lucide-react";
import { useApp } from "@/lib/store";
import { useActions } from "./action-provider";
import { dayLabel, formatBRL, formatTime } from "@/lib/format";
import { cn } from "@/lib/cn";
import type {
  DadosWhatsapp,
  OfertaFornecedor,
} from "@/lib/supabase/workspace";

interface ProdutoOfertado {
  produto: string;
  melhor: OfertaFornecedor;
  maiorPrecoCents: number;
  totalOfertas: number;
}

function agruparPorProduto(ofertas: OfertaFornecedor[]): ProdutoOfertado[] {
  const produtos = new Map<string, ProdutoOfertado>();

  for (const oferta of ofertas) {
    const chave = oferta.produto.toLowerCase();
    const atual = produtos.get(chave);
    if (!atual) {
      produtos.set(chave, {
        produto: oferta.produto,
        melhor: oferta,
        maiorPrecoCents: oferta.precoCents,
        totalOfertas: 1,
      });
      continue;
    }

    atual.totalOfertas += 1;
    atual.maiorPrecoCents = Math.max(atual.maiorPrecoCents, oferta.precoCents);
    if (oferta.precoCents < atual.melhor.precoCents) atual.melhor = oferta;
  }

  return [...produtos.values()].sort((a, b) =>
    a.produto.localeCompare(b.produto, "pt-BR"),
  );
}

function quantidade(valor: number): string {
  return valor.toLocaleString("pt-BR");
}

export function WhatsappView() {
  const {
    ready,
    naLojaWhatsapp,
    sincronizarWhatsapp,
    carregarWhatsapp,
    cashCents,
    openBills,
    products,
  } = useApp();
  const { openMore } = useActions();
  const [dados, setDados] = useState<DadosWhatsapp | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [busca, setBusca] = useState("");
  const [syncing, setSyncing] = useState(false);
  const [lastSync, setLastSync] = useState<Date | null>(null);
  const busyRef = useRef(false);

  const refresh = useCallback(
    async (manual: boolean) => {
      if (!ready || !naLojaWhatsapp || busyRef.current) return;
      busyRef.current = true;
      if (manual) setSyncing(true);
      setErro(null);

      try {
        const resultado = await sincronizarWhatsapp();
        setDados(resultado);
        setLastSync(new Date());
      } catch (motivo) {
        try {
          const fallback = await carregarWhatsapp();
          setDados(fallback);
          setLastSync(new Date());
        } catch {
          // Mantém os dados anteriores se a leitura também falhar.
        }
        setErro(
          motivo instanceof Error
            ? motivo.message
            : "Não conseguimos atualizar a demo do WhatsApp.",
        );
      } finally {
        busyRef.current = false;
        setSyncing(false);
      }
    },
    [ready, naLojaWhatsapp, sincronizarWhatsapp, carregarWhatsapp],
  );

  useEffect(() => {
    if (!ready || !naLojaWhatsapp) return;
    let active = true;

    // Mostra as mensagens do n8n imediatamente; a sincronização completa
    // (caixa/estoque/contas) roda em seguida.
    carregarWhatsapp()
      .then((resultado) => {
        if (active) setDados((atual) => atual ?? resultado);
      })
      .catch(() => undefined);

    void refresh(false);

    const interval = window.setInterval(() => {
      if (document.visibilityState === "visible") void refresh(false);
    }, 15_000);

    const onVisibility = () => {
      if (document.visibilityState === "visible") void refresh(false);
    };
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      active = false;
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [ready, naLojaWhatsapp, refresh, carregarWhatsapp]);

  const ofertas = useMemo(() => dados?.ofertas ?? [], [dados]);
  const movimentos = useMemo(() => dados?.movimentos ?? [], [dados]);
  const produtos = useMemo(() => agruparPorProduto(ofertas), [ofertas]);
  const totalVendas = movimentos
    .filter((item) => item.tipo === "venda")
    .reduce((total, item) => total + item.totalCents, 0);
  const totalCompras = movimentos
    .filter((item) => item.tipo === "compra")
    .reduce((total, item) => total + item.totalCents, 0);
  const vendasCount = movimentos.filter((item) => item.tipo === "venda").length;
  const comprasCount = movimentos.filter(
    (item) => item.tipo === "compra",
  ).length;
  const fornecedores = new Set(ofertas.map((item) => item.fornecedor)).size;
  const totalContas = openBills.reduce(
    (total, bill) => total + bill.amountCents,
    0,
  );
  const lastSyncLabel = lastSync
    ? lastSync.toLocaleTimeString("pt-BR", {
        hour: "2-digit",
        minute: "2-digit",
      })
    : null;

  const produtosFiltrados = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    if (!termo) return produtos;
    return produtos.filter(
      (item) =>
        item.produto.toLowerCase().includes(termo) ||
        item.melhor.fornecedor.toLowerCase().includes(termo),
    );
  }, [produtos, busca]);

  if (!naLojaWhatsapp) {
    return (
      <div className="mx-auto w-full max-w-[1120px] px-4 pb-10 pt-6 sm:px-6 lg:px-8 lg:pt-9">
        <div className="animate-rise rounded-[4px] border border-dashed border-sand-dark bg-paper px-5 py-10 text-center">
          <span className="mx-auto grid size-12 place-items-center rounded-[4px] bg-sage-soft text-sage-dark">
            <MessageCircle className="size-5" strokeWidth={1.8} />
          </span>
          <h1 className="display mt-3 text-xl text-ink">
            Abra a loja de demonstração
          </h1>
          <p className="mx-auto mt-1 max-w-[22rem] text-xs leading-relaxed text-muted">
            O que chega pelo WhatsApp fica na Loja de roupas de demonstração.
            Abra ela no menu da sua loja para ver vendas, compras e ofertas.
          </p>
          <button
            type="button"
            onClick={openMore}
            className="btn btn-primary mt-4"
          >
            Abrir menu da loja
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-[1120px] px-4 pb-10 pt-6 sm:px-6 lg:px-8 lg:pt-9">
      <header className="animate-rise">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="eyebrow">Pelo WhatsApp</p>
            <h1 className="display mt-1.5 text-[2rem] leading-[1.05] text-ink sm:text-[2.5rem]">
              WhatsApp
            </h1>
            <p className="mt-2 max-w-[34rem] text-sm leading-relaxed text-muted">
              O que foi registrado no grupo da loja e as ofertas que os
              fornecedores mandaram, com o melhor preço de cada item.
            </p>
          </div>
          <div className="flex flex-col items-end gap-1">
            <button
              type="button"
              onClick={() => void refresh(true)}
              disabled={syncing}
              className="btn btn-secondary h-10 px-3 text-xs"
            >
              <RefreshCw
                className={cn("size-3.5", syncing && "animate-spin")}
                strokeWidth={2.2}
              />
              {syncing ? "Atualizando…" : "Atualizar agora"}
            </button>
            <p
              className="flex items-center gap-1 text-[0.625rem] text-muted"
              aria-live="polite"
            >
              <Clock3 className="size-3" strokeWidth={2} />
              {lastSyncLabel
                ? `Atualizado às ${lastSyncLabel}`
                : "Sincronizando…"}{" "}
              · automático a cada 15s
            </p>
          </div>
        </div>
      </header>

      <div className="animate-rise mt-6 grid gap-2.5 sm:grid-cols-3">
        <div className="rounded-[4px] border border-line bg-paper p-3.5">
          <p className="text-[0.625rem] font-bold uppercase tracking-[0.1em] text-muted">
            Vendido pelo WhatsApp
          </p>
          <p className="mt-1 text-2xl font-extrabold tracking-tight text-sage-dark tabular">
            {formatBRL(totalVendas)}
          </p>
          <p className="mt-0.5 text-[0.6875rem] text-muted">
            {vendasCount} {vendasCount === 1 ? "venda" : "vendas"}
          </p>
        </div>
        <div className="rounded-[4px] border border-line bg-paper p-3.5">
          <p className="text-[0.625rem] font-bold uppercase tracking-[0.1em] text-muted">
            Comprado pelo WhatsApp
          </p>
          <p className="mt-1 text-2xl font-extrabold tracking-tight text-terracotta-dark tabular">
            {formatBRL(totalCompras)}
          </p>
          <p className="mt-0.5 text-[0.6875rem] text-muted">
            {comprasCount} {comprasCount === 1 ? "compra" : "compras"}
          </p>
        </div>
        <div className="rounded-[4px] border border-line bg-paper p-3.5">
          <p className="text-[0.625rem] font-bold uppercase tracking-[0.1em] text-muted">
            Ofertas recebidas
          </p>
          <p className="mt-1 text-2xl font-extrabold tracking-tight text-ink tabular">
            {ofertas.length}{" "}
            <span className="text-xs font-semibold text-muted">
              de {fornecedores}{" "}
              {fornecedores === 1 ? "fornecedor" : "fornecedores"}
            </span>
          </p>
        </div>
      </div>

      <div className="animate-rise mt-2 grid gap-2 sm:grid-cols-3">
        <Link
          href="/"
          className="flex items-center justify-between gap-3 rounded-[4px] border border-line bg-cream px-3.5 py-2.5 transition-colors hover:bg-sand"
        >
          <span className="flex items-center gap-2 text-[0.6875rem] font-semibold text-muted">
            <Wallet className="size-3.5" strokeWidth={2} />
            Caixa da loja
          </span>
          <strong className="text-sm text-ink tabular">
            {formatBRL(cashCents)}
          </strong>
        </Link>
        <Link
          href="/contas"
          className="flex items-center justify-between gap-3 rounded-[4px] border border-line bg-cream px-3.5 py-2.5 transition-colors hover:bg-sand"
        >
          <span className="flex items-center gap-2 text-[0.6875rem] font-semibold text-muted">
            <MessageCircle className="size-3.5" strokeWidth={2} />
            Contas em aberto
          </span>
          <strong className="text-sm text-ink tabular">
            {formatBRL(totalContas)}
          </strong>
        </Link>
        <Link
          href="/estoque"
          className="flex items-center justify-between gap-3 rounded-[4px] border border-line bg-cream px-3.5 py-2.5 transition-colors hover:bg-sand"
        >
          <span className="flex items-center gap-2 text-[0.6875rem] font-semibold text-muted">
            <Boxes className="size-3.5" strokeWidth={2} />
            Itens no estoque
          </span>
          <strong className="text-sm text-ink tabular">{products.length}</strong>
        </Link>
      </div>

      {erro ? (
        <div className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-[4px] border border-terracotta/30 bg-terracotta-soft p-4 text-xs text-ink">
          <span>{erro}</span>
          <button
            type="button"
            onClick={() => void refresh(true)}
            className="font-bold text-terracotta-dark underline underline-offset-2"
          >
            Tentar de novo
          </button>
        </div>
      ) : null}

      {!dados && !erro ? (
        <p className="mt-6 text-sm text-muted">
          Sincronizando as mensagens do WhatsApp…
        </p>
      ) : null}

      {dados ? (
        <>
          <section className="mt-8">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <p className="eyebrow">Grupo de fornecedores</p>
                <h2 className="display mt-1 text-xl text-ink">
                  Melhor preço de cada item
                </h2>
              </div>
            </div>

            {produtos.length > 2 ? (
              <div className="relative mt-4">
                <Search
                  className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted"
                  strokeWidth={1.9}
                />
                <input
                  value={busca}
                  onChange={(event) => setBusca(event.target.value)}
                  placeholder="Buscar por item ou fornecedor"
                  aria-label="Buscar oferta"
                  className="text-input pl-10"
                />
              </div>
            ) : null}

            <div className="mt-4 grid gap-2.5 md:grid-cols-2">
              {produtosFiltrados.map((item) => (
                <div
                  key={item.produto.toLowerCase()}
                  className="animate-rise flex items-start gap-3 rounded-[4px] border border-line bg-paper p-3.5"
                >
                  <span className="grid size-11 flex-none place-items-center rounded-[4px] bg-sand text-ink">
                    <Tag className="size-5" strokeWidth={1.8} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-bold leading-tight text-ink">
                          {item.produto}
                        </p>
                        <p className="mt-0.5 truncate text-[0.6875rem] text-muted">
                          {item.melhor.fornecedor}
                        </p>
                      </div>
                      <span className="flex-none text-right">
                        <span className="block text-[0.625rem] font-bold uppercase tracking-[0.08em] text-sage-dark">
                          Melhor preço
                        </span>
                        <span className="mt-0.5 block text-sm font-bold text-sage-dark tabular">
                          {formatBRL(item.melhor.precoCents)}
                          {item.melhor.unidade ? (
                            <span className="text-[0.6875rem] font-semibold text-muted">
                              {" "}
                              /{item.melhor.unidade}
                            </span>
                          ) : null}
                        </span>
                      </span>
                    </div>

                    <div className="mt-2 flex flex-wrap items-center gap-1.5">
                      {item.melhor.promocao ? (
                        <span className="badge bg-mustard-soft text-mustard-dark">
                          Promoção
                        </span>
                      ) : null}
                      {item.melhor.validade ? (
                        <span className="badge bg-sand text-ink">
                          Até {dayLabel(item.melhor.validade).toLowerCase()}
                        </span>
                      ) : null}
                    </div>

                    <p className="mt-1 text-[0.625rem] text-muted">
                      {item.totalOfertas}{" "}
                      {item.totalOfertas === 1 ? "oferta" : "ofertas"}
                      {item.totalOfertas > 1
                        ? ` · até ${formatBRL(item.maiorPrecoCents)}`
                        : ""}
                      {` · ${dayLabel(item.melhor.criadoEm).toLowerCase()}`}
                    </p>
                  </div>
                </div>
              ))}
            </div>

            {produtos.length === 0 ? (
              <div className="animate-rise mt-4 rounded-[4px] border border-dashed border-sand-dark bg-paper px-5 py-8 text-center text-xs text-muted">
                Nenhuma oferta ainda. Quando um fornecedor mandar preço no
                grupo, ela aparece aqui.
              </div>
            ) : null}

            {produtos.length > 0 && produtosFiltrados.length === 0 ? (
              <div className="mt-4 rounded-[4px] border border-line bg-cream p-4 text-center text-xs text-muted">
                Nenhuma oferta encontrada para “{busca}”.
              </div>
            ) : null}
          </section>

          {ofertas.length > 0 ? (
            <section className="mt-8">
              <p className="eyebrow">Tudo o que chegou</p>
              <h2 className="display mt-1 text-xl text-ink">
                Ofertas recebidas
              </h2>
              <div className="mt-4 divide-y divide-line rounded-[4px] border border-line bg-paper">
                {ofertas.map((oferta) => (
                  <div
                    key={oferta.id}
                    className="flex items-center justify-between gap-3 px-3.5 py-3"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-ink">
                        {oferta.produto}
                      </p>
                      <p className="mt-0.5 truncate text-[0.6875rem] text-muted">
                        {oferta.fornecedor} · {dayLabel(oferta.criadoEm).toLowerCase()}{" "}
                        às {formatTime(oferta.criadoEm)}
                      </p>
                    </div>
                    <div className="flex flex-none items-center gap-2">
                      {oferta.promocao ? (
                        <span className="badge bg-mustard-soft text-mustard-dark">
                          Promoção
                        </span>
                      ) : null}
                      <span className="text-sm font-bold text-ink tabular">
                        {formatBRL(oferta.precoCents)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          ) : null}

          <section className="mt-8">
            <p className="eyebrow">Grupo da loja</p>
            <h2 className="display mt-1 text-xl text-ink">
              Vendas e compras pelo WhatsApp
            </h2>
            <p className="mt-1 text-[0.6875rem] text-muted">
              {movimentos.length}{" "}
              {movimentos.length === 1 ? "mensagem" : "mensagens"} ·{" "}
              {vendasCount} {vendasCount === 1 ? "venda" : "vendas"} ·{" "}
              {comprasCount} {comprasCount === 1 ? "compra" : "compras"}
            </p>

            {movimentos.length > 0 ? (
              <div className="mt-4 divide-y divide-line rounded-[4px] border border-line bg-paper">
                {movimentos.map((movimento) => (
                  <div
                    key={`${movimento.tipo}-${movimento.id}`}
                    className="flex items-center justify-between gap-3 px-3.5 py-3"
                  >
                    <div className="flex min-w-0 items-center gap-3">
                      <span
                        className={cn(
                          "badge flex-none",
                          movimento.tipo === "venda"
                            ? "bg-sage-soft text-sage-dark"
                            : "bg-terracotta-soft text-terracotta-dark",
                        )}
                      >
                        {movimento.tipo === "venda" ? "Venda" : "Compra"}
                      </span>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-ink">
                          {quantidade(movimento.quantidade)}x {movimento.produto}
                        </p>
                        <p className="mt-0.5 flex items-center gap-1 truncate text-[0.6875rem] text-muted">
                          {movimento.porAudio ? (
                            <Mic className="size-3 flex-none" strokeWidth={2} />
                          ) : null}
                          {dayLabel(movimento.criadoEm)} às{" "}
                          {formatTime(movimento.criadoEm)}
                          {movimento.fornecedor
                            ? ` · ${movimento.fornecedor}`
                            : ""}
                        </p>
                      </div>
                    </div>
                    <span
                      className={cn(
                        "flex-none text-sm font-bold tabular",
                        movimento.tipo === "venda"
                          ? "text-sage-dark"
                          : "text-terracotta-dark",
                      )}
                    >
                      {formatBRL(movimento.totalCents)}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="animate-rise mt-4 rounded-[4px] border border-dashed border-sand-dark bg-paper px-5 py-8 text-center text-xs text-muted">
                Nada registrado pelo WhatsApp ainda. Quando uma mensagem chegar,
                use <strong>Atualizar agora</strong> ou aguarde a atualização
                automática.
              </div>
            )}
          </section>
        </>
      ) : null}
    </div>
  );
}
