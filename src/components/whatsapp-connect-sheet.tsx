"use client";

import { useState } from "react";
import {
  ArrowRight,
  Check,
  MessageCircle,
  ShieldCheck,
  Smartphone,
  Unplug,
} from "lucide-react";
import { Sheet } from "./sheet";
import { useToast } from "./toast";
import { cn } from "@/lib/cn";
import {
  formatPhoneInput,
  isValidPhone,
  saveWhatsAppPreferences,
  type WhatsAppPreferences,
} from "@/lib/integrations";

interface WhatsAppConnectSheetProps {
  onClose: () => void;
  initialPreferences: WhatsAppPreferences;
  onSaved: (preferences: WhatsAppPreferences) => void;
}

interface ToggleRowProps {
  label: string;
  hint: string;
  checked: boolean;
  onChange: () => void;
}

function ToggleRow({ label, hint, checked, onChange }: ToggleRowProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={onChange}
      className="flex w-full items-start gap-3 rounded-[4px] border border-line bg-paper p-3 text-left transition-colors hover:border-sand-dark hover:bg-cream"
    >
      <span
        className={cn(
          "mt-0.5 grid size-5 flex-none place-items-center rounded-[3px] border transition-colors",
          checked
            ? "border-sage-dark bg-sage text-cream"
            : "border-sand-dark bg-paper text-transparent",
        )}
      >
        <Check className="size-3.5" strokeWidth={3} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[0.8125rem] font-bold text-ink">
          {label}
        </span>
        <span className="mt-0.5 block text-[0.6875rem] leading-snug text-muted">
          {hint}
        </span>
      </span>
    </button>
  );
}

export function WhatsAppConnectSheet({
  onClose,
  initialPreferences,
  onSaved,
}: WhatsAppConnectSheetProps) {
  const { toast } = useToast();
  const [phone, setPhone] = useState(
    formatPhoneInput(initialPreferences.phone),
  );
  const [receiveSales, setReceiveSales] = useState(
    initialPreferences.receiveSales,
  );
  const [receiveExpenses, setReceiveExpenses] = useState(
    initialPreferences.receiveExpenses,
  );
  const [receivePurchases, setReceivePurchases] = useState(
    initialPreferences.receivePurchases,
  );
  const [confirmBeforeSaving, setConfirmBeforeSaving] = useState(
    initialPreferences.confirmBeforeSaving,
  );
  const [attempted, setAttempted] = useState(false);
  const [saved, setSaved] = useState(false);

  const phoneError =
    attempted && !isValidPhone(phone)
      ? "Informe o WhatsApp com DDD, por exemplo (11) 90000-0000."
      : null;
  const channelError =
    attempted && !receiveSales && !receiveExpenses && !receivePurchases
      ? "Escolha pelo menos um tipo de mensagem para receber."
      : null;

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setAttempted(true);
    if (
      !isValidPhone(phone) ||
      (!receiveSales && !receiveExpenses && !receivePurchases)
    ) {
      return;
    }

    const next = saveWhatsAppPreferences({
      phone,
      receiveSales,
      receiveExpenses,
      receivePurchases,
      confirmBeforeSaving,
    });
    onSaved(next);
    setSaved(true);
    toast("Preparação salva. O WhatsApp ainda não está conectado.", "info");
  }

  return (
    <Sheet
      title="WhatsApp"
      eyebrow="Integração"
      description="Prepare o número e as regras de entrada. A conexão real será ativada depois."
      onClose={onClose}
      footer={
        <div className="flex gap-2.5">
          <button
            type="button"
            onClick={onClose}
            className="btn btn-secondary flex-1"
          >
            Fechar
          </button>
          <button
            type="submit"
            form="whatsapp-form"
            className="btn btn-primary flex-1"
          >
            {saved ? "Salvar de novo" : "Salvar preparação"}
            <ArrowRight className="size-4" strokeWidth={2.2} />
          </button>
        </div>
      }
    >
      <form id="whatsapp-form" onSubmit={handleSubmit} className="space-y-5" noValidate>
        <div className="flex items-start gap-2.5 rounded-[4px] border border-mustard/40 bg-mustard-soft p-3">
          <Unplug
            className="mt-0.5 size-4 flex-none text-mustard-dark"
            strokeWidth={2}
          />
          <div>
            <p className="text-xs font-bold text-mustard-dark">
              Ainda não conectado
            </p>
            <p className="mt-1 text-[0.6875rem] leading-relaxed text-ink/75">
              Esta tela salva a preparação neste navegador. Nenhuma mensagem
              será recebida ou respondida até o conector do WhatsApp Business
              ser ativado no servidor.
            </p>
          </div>
        </div>

        {saved ? (
          <div
            role="status"
            className="flex items-start gap-2.5 rounded-[4px] border border-sage/35 bg-sage-soft p-3"
          >
            <Check
              className="mt-0.5 size-4 flex-none text-sage-dark"
              strokeWidth={2.6}
            />
            <div>
              <p className="text-xs font-bold text-sage-dark">
                Preparação salva
              </p>
              <p className="mt-1 text-[0.6875rem] leading-relaxed text-ink/75">
                O número e as preferências estão guardados. O status continua
                “não conectado” até a integração real existir.
              </p>
            </div>
          </div>
        ) : null}

        <div>
          <label htmlFor="whatsapp-phone" className="field-label">
            <span className="inline-flex items-center gap-1.5">
              <Smartphone className="size-4 text-terracotta-dark" strokeWidth={2} />
              Número do WhatsApp
            </span>
          </label>
          <input
            id="whatsapp-phone"
            value={phone}
            onChange={(event) => {
              setPhone(formatPhoneInput(event.target.value));
              setSaved(false);
            }}
            placeholder="(11) 90000-0000"
            className="text-input"
            inputMode="tel"
            autoComplete="tel"
            aria-invalid={Boolean(phoneError) || undefined}
          />
          {phoneError ? (
            <p className="mt-2 text-xs font-medium text-terracotta-dark">
              {phoneError}
            </p>
          ) : (
            <p className="field-hint">
              Use o número que vai mandar as mensagens para o caixa. Ele ainda
              não é verificado.
            </p>
          )}
        </div>

        <div>
          <span className="field-label">O que pode entrar por mensagem?</span>
          <div className="space-y-2">
            <ToggleRow
              label="Vendas"
              hint="“Vendi 2 bolos por R$ 100 no pix.”"
              checked={receiveSales}
              onChange={() => {
                setReceiveSales((value) => !value);
                setSaved(false);
              }}
            />
            <ToggleRow
              label="Gastos"
              hint="“Paguei R$ 35 de farinha no mercado.”"
              checked={receiveExpenses}
              onChange={() => {
                setReceiveExpenses((value) => !value);
                setSaved(false);
              }}
            />
            <ToggleRow
              label="Compras de fornecedor"
              hint="“Comprei 10 kg de farinha do Seu José por R$ 80.”"
              checked={receivePurchases}
              onChange={() => {
                setReceivePurchases((value) => !value);
                setSaved(false);
              }}
            />
          </div>
          {channelError ? (
            <p className="mt-2 text-xs font-medium text-terracotta-dark">
              {channelError}
            </p>
          ) : null}
        </div>

        <div>
          <span className="field-label">Antes de salvar</span>
          <ToggleRow
            label="Sempre pedir confirmação"
            hint="A mensagem vira um rascunho na tela inicial. Só entra no caixa depois que você conferir."
            checked={confirmBeforeSaving}
            onChange={() => {
              setConfirmBeforeSaving((value) => !value);
              setSaved(false);
            }}
          />
        </div>

        <div className="rounded-[4px] border border-line bg-cream p-3">
          <p className="flex items-center gap-2 text-xs font-bold text-ink">
            <ShieldCheck className="size-4 flex-none text-sage-dark" strokeWidth={2} />
            Sem atalho e sem surpresa
          </p>
          <p className="mt-1.5 text-[0.6875rem] leading-relaxed text-muted">
            O conector do WhatsApp vai gravar em <code>ingestion_events</code> e
            seguir o mesmo contrato da foto e do áudio. O webapp nunca usa chave
            secreta no navegador.
          </p>
        </div>

        <div className="rounded-[4px] border border-line bg-paper p-3">
          <p className="flex items-center gap-2 text-[0.6875rem] font-bold text-ink">
            <MessageCircle className="size-3.5 flex-none text-sage-dark" strokeWidth={2} />
            Exemplo de conversa
          </p>
          <div className="mt-2 space-y-1.5">
            <p className="ml-auto w-fit max-w-[90%] rounded-[4px] rounded-br-none bg-sage-soft px-2.5 py-1.5 text-[0.6875rem] leading-snug text-ink">
              Vendi 2 bolos de cenoura por R$ 100 no pix.
            </p>
            <p className="w-fit max-w-[90%] rounded-[4px] rounded-bl-none bg-cream px-2.5 py-1.5 text-[0.6875rem] leading-snug text-muted">
              Anotado. Confira e confirme no Estokar.
            </p>
          </div>
        </div>
      </form>
    </Sheet>
  );
}
