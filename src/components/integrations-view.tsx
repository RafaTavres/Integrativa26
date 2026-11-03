"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  Camera,
  Check,
  FileSpreadsheet,
  Mail,
  MessageCircle,
  QrCode,
  ShieldCheck,
  Unplug,
  type LucideIcon,
} from "lucide-react";
import { WhatsAppConnectSheet } from "./whatsapp-connect-sheet";
import { useApp } from "@/lib/store";
import { useToast } from "./toast";
import { cn } from "@/lib/cn";
import { formatBRL } from "@/lib/format";
import type { PendingEmailImport } from "@/lib/ingestion";
import {
  WHATSAPP_DEFAULT_PREFERENCES,
  WHATSAPP_EXAMPLES,
  WHATSAPP_STATUS,
  isValidPhone,
  loadWhatsAppPreferences,
  type WhatsAppPreferences,
} from "@/lib/integrations";

type BadgeTone = "sage" | "mustard" | "muted";

const BADGE_TONES: Record<BadgeTone, string> = {
  sage: "bg-sage-soft text-sage-dark",
  mustard: "bg-mustard-soft text-mustard-dark",
  muted: "bg-cream text-muted",
};

function StatusBadge({
  tone,
  children,
}: {
  tone: BadgeTone;
  children: React.ReactNode;
}) {
  return <span className={cn("badge", BADGE_TONES[tone])}>{children}</span>;
}

interface ChannelRowProps {
  icon: LucideIcon;
  title: string;
  detail: string;
  status: string;
  tone: BadgeTone;
  href?: string;
}

function ChannelRow({
  icon: Icon,
  title,
  detail,
  status,
  tone,
  href,
}: ChannelRowProps) {
  const content = (
    <>
      <span className="grid size-9 flex-none place-items-center rounded-[4px] bg-cream text-ink">
        <Icon className="size-4" strokeWidth={1.9} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[0.8125rem] font-bold text-ink">
          {title}
        </span>
        <span className="mt-0.5 block text-[0.6875rem] leading-snug text-muted">
          {detail}
        </span>
      </span>
      <span className="flex flex-none items-center gap-2">
        <StatusBadge tone={tone}>{status}</StatusBadge>
        {href ? (
          <ArrowRight className="size-3.5 text-muted" strokeWidth={2.2} />
        ) : null}
      </span>
    </>
  );

  if (href) {
    return (
      <Link
        href={href}
        className="flex items-center gap-3 py-2.5 transition-colors first:pt-0 last:pb-0 hover:opacity-80"
      >
        {content}
      </Link>
    );
  }

  return <div className="flex items-center gap-3 py-2.5 first:pt-0 last:pb-0">{content}</div>;
}

const STEPS = [
  {
    title: "Você manda a mensagem",
    detail: "O número preparado recebe texto, foto ou áudio pelo conector.",
  },
  {
    title: "O Estokar organiza",
    detail: "A mensagem vira um evento com valor, item, fornecedor e data.",
  },
  {
    title: "Você confere e confirma",
    detail: "O rascunho aparece na tela inicial com valor, item e data para revisão.",
  },
];

export function IntegrationsView() {
  const [preferences, setPreferences] = useState<WhatsAppPreferences>(
    WHATSAPP_DEFAULT_PREFERENCES,
  );
  const [connectOpen, setConnectOpen] = useState(false);
  const [pendingEmails, setPendingEmails] = useState<PendingEmailImport[]>([]);
  const [emailInbox, setEmailInbox] = useState<{
    configured: boolean;
    user?: string;
    mailbox?: string;
    storage?: boolean;
  } | null>(null);
  const [emailBusy, setEmailBusy] = useState<string | null>(null);
  const { loadPendingEmails, markEmailProcessed, importRows } = useApp();
  const { toast } = useToast();

  useEffect(() => {
    setPreferences(loadWhatsAppPreferences());
  }, []);

  useEffect(() => {
    let active = true;
    void loadPendingEmails()
      .then((events) => {
        if (active) setPendingEmails(events);
      })
      .catch(() => undefined);
    void fetch("/api/inbound/imap", { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : null))
      .then((data) => {
        if (active) setEmailInbox(data);
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [loadPendingEmails]);

  async function importEmail(event: PendingEmailImport) {
    if (emailBusy) return;
    setEmailBusy(event.id);
    try {
      const summary = await importRows(event.rows);
      await markEmailProcessed(event.id);
      setPendingEmails((current) =>
        current.filter((item) => item.id !== event.id),
      );
      toast(
        summary.imported > 0
          ? `${summary.imported} ${
              summary.imported === 1 ? "item importado" : "itens importados"
            } do e-mail.`
          : "O e-mail não tinha itens válidos.",
      );
    } catch (error) {
      toast(
        error instanceof Error
          ? error.message
          : "Não conseguimos importar este e-mail.",
        "info",
      );
    } finally {
      setEmailBusy(null);
    }
  }

  const prepared = isValidPhone(preferences.phone);

  return (
    <div className="mx-auto w-full max-w-[1120px] px-4 pb-10 pt-6 sm:px-6 lg:px-8 lg:pt-9">
      <header className="animate-rise flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="eyebrow">Entrada sem digitação</p>
          <h1 className="display mt-1.5 text-[2rem] leading-[1.05] text-ink sm:text-[2.5rem]">
            Integrações
          </h1>
          <p className="mt-2 max-w-[36rem] text-sm leading-relaxed text-muted">
            Prepare o WhatsApp e veja o que já entra por foto, áudio, planilha e
            nota fiscal — com o estado real de cada canal.
          </p>
        </div>
        <Link href="/" className="btn btn-secondary h-11 px-4 text-sm">
          Voltar ao caixa
        </Link>
      </header>

      <div className="mt-6 grid gap-4 lg:grid-cols-[1.12fr_0.88fr]">
        <div className="space-y-4">
          <section className="animate-rise overflow-hidden rounded-[4px] border border-line bg-paper">
            <div className="border-b border-line bg-cream p-4 sm:p-5">
              <div className="flex items-start gap-3">
                <span className="grid size-12 flex-none place-items-center rounded-[4px] bg-sage-soft text-sage-dark">
                  <MessageCircle className="size-6" strokeWidth={1.8} />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="display text-[1.45rem] leading-none text-ink">
                      WhatsApp
                    </h2>
                    <StatusBadge tone="mustard">
                      <Unplug className="size-3" strokeWidth={2.4} />
                      {WHATSAPP_STATUS.label}
                    </StatusBadge>
                    {prepared ? (
                      <StatusBadge tone="sage">Preparação salva</StatusBadge>
                    ) : null}
                  </div>
                  <p className="mt-2 max-w-[34rem] text-[0.8125rem] leading-relaxed text-muted">
                    Receba vendas, gastos e compras por mensagem. A interface
                    está pronta; a conexão real com o WhatsApp Business ainda
                    não foi ativada.
                  </p>
                </div>
              </div>
            </div>

            <div className="p-4 sm:p-5">
              {prepared ? (
                <div className="rounded-[4px] border border-line bg-cream p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-[0.625rem] font-bold uppercase tracking-[0.1em] text-muted">
                        Número preparado
                      </p>
                      <p className="mt-1 text-sm font-bold text-ink tabular">
                        {preferences.phone}
                      </p>
                    </div>
                    <StatusBadge tone="muted">Ainda não verificado</StatusBadge>
                  </div>
                  <p className="mt-2 text-[0.6875rem] leading-relaxed text-muted">
                    {preferences.receiveSales ? "Vendas" : null}
                    {preferences.receiveSales &&
                    (preferences.receiveExpenses ||
                      preferences.receivePurchases)
                      ? " · "
                      : null}
                    {preferences.receiveExpenses ? "Gastos" : null}
                    {preferences.receiveExpenses &&
                    preferences.receivePurchases
                      ? " · "
                      : null}
                    {preferences.receivePurchases ? "Compras" : null}
                    {preferences.confirmBeforeSaving
                      ? " · confirmação antes de salvar"
                      : " · sem confirmação antes de salvar"}
                  </p>
                </div>
              ) : (
                <div className="rounded-[4px] border border-dashed border-sand-dark bg-cream p-3">
                  <p className="text-[0.8125rem] font-bold text-ink">
                    Ainda não configurado
                  </p>
                  <p className="mt-1 text-[0.6875rem] leading-relaxed text-muted">
                    Salve o número e escolha o que pode entrar. Isso não conecta
                    o WhatsApp: apenas deixa a preparação pronta para quando o
                    conector for ativado.
                  </p>
                </div>
              )}

              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                <button
                  type="button"
                  onClick={() => setConnectOpen(true)}
                  className="btn btn-primary h-11 text-sm"
                >
                  <MessageCircle className="size-4" strokeWidth={2.1} />
                  {prepared ? "Revisar preparação" : "Preparar conexão"}
                </button>
                <div className="flex items-center justify-center gap-1.5 rounded-[4px] border border-line bg-paper px-3 text-center text-[0.6875rem] font-medium text-muted">
                  <Unplug className="size-3.5 flex-none" strokeWidth={2.2} />
                  Aguardando o conector
                </div>
              </div>

              <p className="mt-3 flex items-start gap-1.5 text-[0.6875rem] leading-relaxed text-muted">
                <ShieldCheck
                  className="mt-0.5 size-3.5 flex-none text-sage-dark"
                  strokeWidth={2}
                />
                Nada é simulado: esta tela não finge uma conexão bem-sucedida.
                {prepared
                  ? " O número fica salvo só neste navegador."
                  : " O número ficará salvo só neste navegador."}
              </p>

              <div className="mt-4 rounded-[4px] border border-line bg-cream p-3">
                <p className="text-[0.625rem] font-bold uppercase tracking-[0.1em] text-muted">
                  Grupos planejados
                </p>
                <ul className="mt-2 space-y-2 text-[0.6875rem] leading-relaxed text-ink/80">
                  <li>
                    <strong>Grupo de fornecedores</strong> — ofertas de preço.
                    A loja de demonstração já lê o que o n8n grava.
                  </li>
                  <li>
                    <strong>Grupo da loja</strong> — compras e vendas por texto
                    ou áudio. A demo lê as transações gravadas pelo n8n.
                  </li>
                  <li>
                    <strong>Conversa individual</strong> — registro de compra
                    por conversa; o contrato está pronto, falta o conector.
                  </li>
                </ul>
                <Link
                  href="/whatsapp"
                  className="mt-2 inline-flex items-center gap-1 text-[0.6875rem] font-bold text-terracotta-dark underline underline-offset-2"
                >
                  Ver a loja conectada
                  <ArrowRight className="size-3" strokeWidth={2.4} />
                </Link>
              </div>
            </div>
          </section>

          <section className="animate-rise rounded-[4px] border border-line bg-paper p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="flex min-w-0 items-center gap-2.5">
                <span className="grid size-9 flex-none place-items-center rounded-[4px] bg-sage-soft text-sage-dark">
                  <Mail className="size-4" strokeWidth={2} />
                </span>
                <div className="min-w-0">
                  <h2 className="text-[0.8125rem] font-bold text-ink">
                    E-mails de fornecedor
                  </h2>
                  <p className="mt-0.5 text-[0.6875rem] text-muted">
                    XML de NF-e/NFC-e que chega na caixa.
                  </p>
                </div>
              </div>
              <StatusBadge tone={emailInbox?.configured ? "sage" : "mustard"}>
                {emailInbox?.configured ? "Caixa configurada" : "Não configurada"}
              </StatusBadge>
            </div>

            <div className="mt-3 space-y-2">
              {pendingEmails.length === 0 ? (
                <div className="rounded-[4px] border border-dashed border-sand-dark bg-cream p-3 text-[0.6875rem] leading-relaxed text-muted">
                  Nenhum XML pendente.{" "}
                  {emailInbox?.configured
                    ? "Quando um fornecedor enviar a nota, ela aparece aqui para importar."
                    : "Configure a caixa IMAP no servidor ou envie o XML manualmente."}
                </div>
              ) : (
                pendingEmails.map((event) => (
                  <div
                    key={event.id}
                    className="flex items-center gap-3 rounded-[4px] border border-line bg-cream p-3"
                  >
                    <span className="grid size-8 flex-none place-items-center rounded-[3px] bg-paper text-ink">
                      <Mail className="size-3.5" strokeWidth={2} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[0.75rem] font-bold text-ink">
                        {event.supplierName ?? "Fornecedor"}
                      </p>
                      <p className="mt-0.5 truncate text-[0.625rem] text-muted">
                        {event.itemCount}{" "}
                        {event.itemCount === 1 ? "item" : "itens"}
                        {event.totalCents
                          ? ` · ${formatBRL(event.totalCents)}`
                          : ""}
                        {event.from ? ` · ${event.from}` : ""}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => void importEmail(event)}
                      disabled={emailBusy !== null}
                      className="btn btn-primary h-9 flex-none px-3 text-[0.6875rem]"
                    >
                      {emailBusy === event.id ? "Importando…" : "Importar"}
                    </button>
                  </div>
                ))
              )}

              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[0.625rem] text-muted">
                <span>
                  {emailInbox?.configured
                    ? `Caixa ${emailInbox.mailbox ?? "INBOX"}${
                        emailInbox.user ? ` · ${emailInbox.user}` : ""
                      }`
                    : "Caixa IMAP não configurada no servidor."}
                </span>
                <Link
                  href="/importar"
                  className="font-bold text-terracotta-dark underline underline-offset-2"
                >
                  Importar XML manualmente
                </Link>
              </div>
            </div>
          </section>

          <section className="animate-rise rounded-[4px] border border-line bg-paper p-4">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-[0.8125rem] font-bold text-ink">
                Outros canais
              </h2>
              <span className="text-[0.625rem] font-semibold uppercase tracking-[0.08em] text-muted">
                4 disponíveis
              </span>
            </div>
            <div className="mt-2 divide-y divide-line">
              <ChannelRow
                icon={FileSpreadsheet}
                title="Planilha"
                detail="CSV, TSV ou XLSX com prévia e validação por linha."
                status="Disponível"
                tone="sage"
                href="/importar"
              />
              <ChannelRow
                icon={Camera}
                title="Foto e áudio"
                detail="OCR de foto e transcrição de áudio no próprio aparelho."
                status="Disponível"
                tone="sage"
                href="/"
              />
              <ChannelRow
                icon={Mail}
                title="XML de fornecedor"
                detail="Envie o XML da NF-e/NFC-e em Importar; os itens entram como compra."
                status="Disponível"
                tone="sage"
                href="/importar"
              />
              <ChannelRow
                icon={QrCode}
                title="QR Code da nota"
                detail="Lê o QR, consulta a SEFAZ e usa o OCR como reserva."
                status="Disponível"
                tone="sage"
                href="/"
              />
            </div>
          </section>
        </div>

        <div className="space-y-4">
          <section className="animate-rise rounded-[4px] border border-line bg-paper p-4">
            <h2 className="text-[0.8125rem] font-bold text-ink">
              Como vai funcionar
            </h2>
            <ol className="mt-3 space-y-3">
              {STEPS.map((step, index) => (
                <li key={step.title} className="flex gap-2.5">
                  <span className="display grid size-6 flex-none place-items-center rounded-[3px] bg-sand text-[0.6875rem] font-bold text-ink">
                    {index + 1}
                  </span>
                  <div>
                    <p className="text-[0.75rem] font-bold text-ink">
                      {step.title}
                    </p>
                    <p className="mt-0.5 text-[0.6875rem] leading-relaxed text-muted">
                      {step.detail}
                    </p>
                  </div>
                </li>
              ))}
            </ol>
          </section>

          <section className="animate-rise rounded-[4px] border border-line bg-paper p-4">
            <div className="flex items-center gap-2">
              <MessageCircle
                className="size-4 text-sage-dark"
                strokeWidth={2}
              />
              <h2 className="text-[0.8125rem] font-bold text-ink">
                Exemplos de mensagem
              </h2>
            </div>
            <div className="mt-3 space-y-2">
              {WHATSAPP_EXAMPLES.map((example) => (
                <div key={example.label}>
                  <p className="mb-1 text-[0.5625rem] font-bold uppercase tracking-[0.1em] text-muted">
                    {example.label}
                  </p>
                  <p className="w-fit max-w-full rounded-[4px] rounded-bl-none bg-cream px-2.5 py-1.5 text-[0.6875rem] leading-snug text-ink">
                    {example.message}
                  </p>
                </div>
              ))}
            </div>
          </section>

          <details className="animate-rise rounded-[4px] border border-line bg-paper p-4">
            <summary className="cursor-pointer list-none text-[0.8125rem] font-bold text-ink">
              Para quem vai conectar
              <span className="mt-0.5 block text-[0.6875rem] font-normal text-muted">
                Contrato, tabela e regra de idempotência
              </span>
            </summary>
            <div className="mt-3 space-y-2 text-[0.6875rem] leading-relaxed text-muted">
              <p>
                O conector grava em <code>ingestion_events</code> e o webapp
                transforma o evento em rascunho revisável.
              </p>
              <p>
                O contrato público está em{" "}
                <code>GET /api/integrations</code>, com canais,{" "}
                <code>source_type</code> e campos obrigatórios.
              </p>
              <p>
                <code>external_id</code> + canal evitam duplicar a mesma
                mensagem. Nenhuma chave <code>service_role</code> vai para o
                navegador.
              </p>
              <p className="flex items-center gap-1.5 pt-1 font-semibold text-sage-dark">
                <Check className="size-3.5" strokeWidth={2.6} />
                Contrato e tabela já aplicados no Supabase
              </p>
            </div>
          </details>

          <section className="animate-rise rounded-[4px] border border-mustard/40 bg-mustard-soft p-4">
            <p className="text-[0.6875rem] font-bold uppercase tracking-[0.1em] text-mustard-dark">
              O que falta
            </p>
            <ul className="mt-2 space-y-1.5 text-[0.6875rem] leading-relaxed text-ink/75">
              <li>Verificar o número no WhatsApp Business.</li>
              <li>Ativar o webhook do conector no servidor.</li>
              <li>Testar o recebimento e a fila de rascunhos.</li>
            </ul>
            <p className="mt-2 text-[0.625rem] leading-relaxed text-muted">
              Até lá, o canal continua “não conectado” — sem botão de mentira e
              sem mensagem simulada.
            </p>
          </section>
        </div>
      </div>

      {connectOpen ? (
        <WhatsAppConnectSheet
          initialPreferences={preferences}
          onSaved={setPreferences}
          onClose={() => setConnectOpen(false)}
        />
      ) : null}
    </div>
  );
}
