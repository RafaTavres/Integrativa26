"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Download,
  FileSpreadsheet,
  Loader2,
  RotateCcw,
  Upload,
} from "lucide-react";
import { useApp } from "@/lib/store";
import { useToast } from "./toast";
import {
  IMPORT_TEMPLATE_CSV,
  IMPORT_TEMPLATE_EXAMPLES,
  parseSpreadsheetFile,
  type ImportKind,
  type ImportRow,
  type ImportSummary,
  type ParsedSpreadsheet,
} from "@/lib/import";
import { formatBRL } from "@/lib/format";

const KIND_LABELS: Record<ImportKind, string> = {
  sale: "Venda",
  expense: "Gasto",
  withdrawal: "Retirada",
  purchase: "Compra",
  bill: "Conta",
};

function rowDate(iso: string): string {
  return new Date(iso).toLocaleDateString("pt-BR");
}

function downloadTemplate() {
  const blob = new Blob([`\uFEFF${IMPORT_TEMPLATE_CSV}`], {
    type: "text/csv;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = "estokar-modelo.csv";
  anchor.click();
  URL.revokeObjectURL(url);
}

function RowPreview({ row }: { row: ImportRow }) {
  return (
    <div className="flex items-center gap-2.5 border-b border-line/70 px-3 py-2 text-[0.6875rem] last:border-0">
      <span className="w-[4.5rem] flex-none text-muted">{rowDate(row.occurredAt)}</span>
      <span className="w-[4.5rem] flex-none font-semibold text-ink">
        {KIND_LABELS[row.kind]}
      </span>
      <span className="min-w-0 flex-1 truncate text-ink">{row.description}</span>
      {row.supplierName ? (
        <span className="hidden w-[7rem] flex-none truncate text-muted sm:block">
          {row.supplierName}
        </span>
      ) : null}
      <span className="w-[5.5rem] flex-none text-right font-bold text-ink tabular">
        {formatBRL(row.amountCents)}
      </span>
    </div>
  );
}

export function ImportView() {
  const { importRows } = useApp();
  const { toast } = useToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const [parsed, setParsed] = useState<ParsedSpreadsheet | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  const [parsing, setParsing] = useState(false);
  const [importing, setImporting] = useState(false);
  const [summary, setSummary] = useState<ImportSummary | null>(null);
  const [dragging, setDragging] = useState(false);

  async function handleFile(file: File | undefined) {
    if (!file) return;
    setParsing(true);
    setParseError(null);
    setSummary(null);
    try {
      const result = await parseSpreadsheetFile(file);
      setParsed(result);
      if (result.rows.length === 0) {
        setParseError(
          result.invalid.length > 0
            ? "Nenhuma linha válida. Confira os erros abaixo."
            : "A planilha não tem linhas para importar.",
        );
      }
    } catch (error) {
      setParsed(null);
      setParseError(
        error instanceof Error
          ? error.message
          : "Não conseguimos ler a planilha.",
      );
    } finally {
      setParsing(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  async function handleImport() {
    if (!parsed || parsed.rows.length === 0 || importing) return;
    setImporting(true);
    try {
      const result = await importRows(parsed.rows);
      setSummary(result);
      setParsed(null);
      toast(
        result.imported > 0
          ? `${result.imported} ${result.imported === 1 ? "linha importada" : "linhas importadas"}.`
          : "Nenhuma linha importada.",
        result.imported > 0 ? "success" : "info",
      );
    } catch (error) {
      setParseError(
        error instanceof Error
          ? error.message
          : "Não conseguimos importar agora.",
      );
    } finally {
      setImporting(false);
    }
  }

  function reset() {
    setParsed(null);
    setSummary(null);
    setParseError(null);
  }

  return (
    <div className="mx-auto w-full max-w-[1120px] px-4 pb-10 pt-6 sm:px-6 lg:px-8 lg:pt-9">
      <header className="animate-rise">
        <p className="eyebrow">Trazer de uma vez</p>
        <h1 className="display mt-1.5 text-[2rem] leading-[1.05] text-ink sm:text-[2.5rem]">
          Importar planilha
        </h1>
        <p className="mt-2 max-w-[40rem] text-sm leading-relaxed text-muted">
          Vendas, gastos, compras, contas e retiradas de um CSV, TSV ou XLSX. O
          histórico de compras alimenta os preços por fornecedor.
        </p>
      </header>

      <div className="mt-6 grid items-start gap-4 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)]">
        <section className="animate-rise rounded-[4px] border border-line bg-paper p-4">
          <div
            onDragOver={(event) => {
              event.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(event) => {
              event.preventDefault();
              setDragging(false);
              void handleFile(event.dataTransfer.files?.[0]);
            }}
            className={
              dragging
                ? "rounded-[4px] border-2 border-dashed border-terracotta bg-terracotta-soft px-4 py-8 text-center"
                : "rounded-[4px] border-2 border-dashed border-line bg-cream px-4 py-8 text-center"
            }
          >
            <span className="mx-auto grid size-12 place-items-center rounded-[4px] bg-paper text-ink">
              {parsing ? (
                <Loader2 className="size-5 animate-spin" strokeWidth={2} />
              ) : (
                <Upload className="size-5" strokeWidth={2} />
              )}
            </span>
            <p className="mt-3 text-sm font-bold text-ink">
              {parsing ? "Lendo planilha…" : "Arraste o arquivo aqui"}
            </p>
            <p className="mt-1 text-[0.6875rem] text-muted">
              CSV, TSV, TXT ou XLSX · até algumas milhares de linhas
            </p>
            <label className="btn btn-secondary mx-auto mt-3 h-10 cursor-pointer px-4 text-xs">
              <FileSpreadsheet className="size-4" strokeWidth={2} />
              Escolher arquivo
              <input
                ref={inputRef}
                type="file"
                accept=".csv,.tsv,.txt,.xlsx,text/csv,text/tab-separated-values,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                className="sr-only"
                onChange={(event) => void handleFile(event.target.files?.[0])}
              />
            </label>
          </div>

          {parseError ? (
            <p
              role="alert"
              className="mt-3 flex items-start gap-2 rounded-[4px] border border-terracotta/30 bg-terracotta-soft p-3 text-xs font-medium text-terracotta-dark"
            >
              <AlertTriangle className="mt-0.5 size-4 flex-none" strokeWidth={2} />
              {parseError}
            </p>
          ) : null}

          {summary ? (
            <div className="animate-pop mt-4 rounded-[4px] border border-sage/35 bg-sage-soft p-4">
              <p className="flex items-center gap-2 text-sm font-bold text-sage-dark">
                <CheckCircle2 className="size-4" strokeWidth={2.4} />
                {summary.imported}{" "}
                {summary.imported === 1 ? "linha importada" : "linhas importadas"}
              </p>
              {summary.skipped > 0 ? (
                <p className="mt-1 text-[0.6875rem] text-ink/75">
                  {summary.skipped} não entraram. Confira os avisos abaixo.
                </p>
              ) : null}
              {summary.errors.length > 0 ? (
                <ul className="mt-2 space-y-1 text-[0.6875rem] text-terracotta-dark">
                  {summary.errors.slice(0, 8).map((error, index) => (
                    <li key={index}>• {error}</li>
                  ))}
                </ul>
              ) : null}
              <div className="mt-3 flex gap-2">
                <button
                  type="button"
                  onClick={reset}
                  className="btn btn-secondary h-9 flex-1 text-xs"
                >
                  <RotateCcw className="size-3.5" strokeWidth={2} />
                  Importar outra
                </button>
                <Link
                  href="/"
                  className="btn btn-primary h-9 flex-1 text-xs"
                >
                  Voltar ao caixa
                  <ArrowRight className="size-3.5" strokeWidth={2.2} />
                </Link>
              </div>
            </div>
          ) : null}

          {parsed ? (
            <div className="mt-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="truncate text-sm font-bold text-ink">
                    {parsed.fileName}
                  </p>
                  <p className="mt-0.5 text-[0.6875rem] text-muted">
                    {parsed.rows.length} válidas · {parsed.invalid.length} com
                    problema · {parsed.totalRows} linhas lidas
                  </p>
                </div>
                <button
                  type="button"
                  onClick={reset}
                  className="btn btn-ghost h-8 px-2 text-[0.6875rem]"
                >
                  Trocar arquivo
                </button>
              </div>

              {parsed.rows.length > 0 ? (
                <div className="mt-2 overflow-hidden rounded-[4px] border border-line">
                  <div className="flex items-center gap-2.5 border-b border-line bg-cream px-3 py-2 text-[0.5625rem] font-bold uppercase tracking-[0.08em] text-muted">
                    <span className="w-[4.5rem] flex-none">Data</span>
                    <span className="w-[4.5rem] flex-none">Tipo</span>
                    <span className="min-w-0 flex-1">Descrição</span>
                    <span className="hidden w-[7rem] flex-none sm:block">
                      Fornecedor
                    </span>
                    <span className="w-[5.5rem] flex-none text-right">
                      Valor
                    </span>
                  </div>
                  <div className="max-h-[18rem] overflow-y-auto">
                    {parsed.rows.slice(0, 50).map((row) => (
                      <RowPreview key={row.line} row={row} />
                    ))}
                  </div>
                  {parsed.rows.length > 50 ? (
                    <p className="border-t border-line bg-cream px-3 py-2 text-center text-[0.625rem] text-muted">
                      Mostrando 50 de {parsed.rows.length}. Todas serão
                      importadas.
                    </p>
                  ) : null}
                </div>
              ) : null}

              {parsed.invalid.length > 0 ? (
                <div className="mt-3 rounded-[4px] border border-mustard/40 bg-mustard-soft/60 p-3">
                  <p className="flex items-center gap-2 text-xs font-bold text-mustard-dark">
                    <AlertTriangle className="size-3.5" strokeWidth={2.2} />
                    {parsed.invalid.length}{" "}
                    {parsed.invalid.length === 1
                      ? "linha ficou de fora"
                      : "linhas ficaram de fora"}
                  </p>
                  <ul className="mt-2 max-h-[9rem] space-y-1.5 overflow-y-auto text-[0.6875rem] leading-snug text-ink/80">
                    {parsed.invalid.slice(0, 12).map((row) => (
                      <li key={row.line}>
                        <strong>Linha {row.line}:</strong> {row.errors.join(" ")}
                      </li>
                    ))}
                  </ul>
                  {parsed.invalid.length > 12 ? (
                    <p className="mt-1 text-[0.625rem] text-muted">
                      +{parsed.invalid.length - 12} linhas com problema.
                    </p>
                  ) : null}
                </div>
              ) : null}

              <button
                type="button"
                onClick={() => void handleImport()}
                disabled={
                  importing || parsed.rows.length === 0 || summary !== null
                }
                aria-busy={importing || undefined}
                className="btn btn-primary mt-3 h-12 w-full text-sm"
              >
                {importing ? (
                  <>
                    <Loader2 className="size-4 animate-spin" strokeWidth={2.2} />
                    Importando…
                  </>
                ) : (
                  <>
                    <Upload className="size-4" strokeWidth={2.2} />
                    Importar {parsed.rows.length}{" "}
                    {parsed.rows.length === 1 ? "linha" : "linhas"}
                  </>
                )}
              </button>
              <p className="mt-2 text-center text-[0.625rem] text-muted">
                O estoque atual não muda. Compras entram como histórico de preço
                e contas a pagar.
              </p>
            </div>
          ) : null}
        </section>

        <aside className="animate-rise space-y-3">
          <div className="rounded-[4px] border border-line bg-paper p-4">
            <p className="text-sm font-bold text-ink">Modelo pronto</p>
            <p className="mt-1 text-[0.6875rem] leading-relaxed text-muted">
              Baixe o CSV com as colunas que o Estokar entende. Funciona no
              Excel, Google Sheets e Numbers.
            </p>
            <button
              type="button"
              onClick={downloadTemplate}
              className="btn btn-secondary mt-3 h-10 w-full text-xs"
            >
              <Download className="size-3.5" strokeWidth={2.2} />
              Baixar modelo CSV
            </button>
            <details className="mt-3">
              <summary className="cursor-pointer text-[0.6875rem] font-bold text-terracotta-dark">
                Ver exemplo de linhas
              </summary>
              <div className="mt-2 space-y-1 overflow-x-auto rounded-[4px] bg-ink p-2.5 text-[0.625rem] leading-relaxed text-cream/85">
                {IMPORT_TEMPLATE_EXAMPLES.map((line) => (
                  <p key={line} className="whitespace-nowrap font-mono">
                    {line}
                  </p>
                ))}
              </div>
            </details>
          </div>

          <div className="rounded-[4px] border border-line bg-cream p-4">
            <p className="text-[0.6875rem] font-bold uppercase tracking-[0.1em] text-muted">
              O que é aceito
            </p>
            <ul className="mt-2 space-y-1.5 text-[0.6875rem] leading-relaxed text-ink/80">
              <li>
                <strong>Tipo:</strong> venda, gasto, compra, retirada ou conta.
              </li>
              <li>
                <strong>Valor:</strong> em reais, com vírgula ou ponto.
              </li>
              <li>
                <strong>Data:</strong> 31/12/2026, 2026-12-31 ou data do Excel.
              </li>
              <li>
                <strong>Compra:</strong> fornecedor e quantidade são opcionais.
              </li>
              <li>
                <strong>Conta:</strong> vencimento e “pago” definem o status.
              </li>
            </ul>
          </div>

          <div className="rounded-[4px] border border-mustard/35 bg-mustard-soft/60 p-4">
            <p className="flex items-center gap-2 text-xs font-bold text-mustard-dark">
              <AlertTriangle className="size-3.5" strokeWidth={2.2} />
              Antes de importar
            </p>
            <p className="mt-1.5 text-[0.6875rem] leading-relaxed text-ink/80">
              A importação lança histórico financeiro. Ela não mexe no estoque
              atual para não duplicar o que você já tem contado.
            </p>
          </div>
        </aside>
      </div>
    </div>
  );
}
