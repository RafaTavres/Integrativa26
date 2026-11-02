/**
 * Preferências da futura integração com o WhatsApp.
 *
 * Importante: nada aqui conecta o app ao WhatsApp. A conexão real depende de
 * um conector no servidor (API oficial do WhatsApp Business). Até lá, o que o
 * usuário prepara fica salvo só neste navegador e a interface mostra o estado
 * "não conectado" com todas as letras.
 */

export interface WhatsAppPreferences {
  phone: string;
  receiveSales: boolean;
  receiveExpenses: boolean;
  receivePurchases: boolean;
  confirmBeforeSaving: boolean;
  updatedAt?: string;
}

export const WHATSAPP_PREFERENCES_KEY = "estokar:whatsapp:v1";
const LEGACY_WHATSAPP_PREFERENCES_KEY = "meu-caixa:whatsapp:v1";

export const WHATSAPP_STATUS = {
  state: "not_connected" as const,
  label: "Não conectado",
  detail:
    "A preparação fica salva neste navegador. Nenhuma mensagem é recebida ou respondida até o conector do WhatsApp ser ativado.",
};

export const WHATSAPP_DEFAULT_PREFERENCES: WhatsAppPreferences = {
  phone: "",
  receiveSales: true,
  receiveExpenses: true,
  receivePurchases: true,
  confirmBeforeSaving: true,
};

export const WHATSAPP_EXAMPLES = [
  {
    label: "Venda",
    message: "Vendi 2 bolos de cenoura por R$ 100 no pix.",
  },
  {
    label: "Gasto",
    message: "Paguei R$ 35 de farinha e ovos no mercado.",
  },
  {
    label: "Compra",
    message: "Comprei 10 kg de farinha do Seu José por R$ 80. Ficou pra pagar dia 20.",
  },
  {
    label: "Conta",
    message: "Chegou a conta de luz de R$ 142, vence dia 12.",
  },
] as const;

export function phoneDigits(value: string): string {
  return value.replace(/\D/g, "").slice(0, 11);
}

/** Formata no padrão brasileiro enquanto a pessoa digita. */
export function formatPhoneInput(value: string): string {
  const digits = phoneDigits(value);
  if (digits.length === 0) return "";
  if (digits.length <= 2) return `(${digits}`;
  if (digits.length <= 6) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
  }
  if (digits.length <= 10) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
  }
  return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
}

export function isValidPhone(value: string): boolean {
  const digits = phoneDigits(value);
  return digits.length === 10 || digits.length === 11;
}

export function loadWhatsAppPreferences(): WhatsAppPreferences {
  if (typeof window === "undefined") return WHATSAPP_DEFAULT_PREFERENCES;

  try {
    const current = window.localStorage.getItem(WHATSAPP_PREFERENCES_KEY);
    const legacy = current
      ? null
      : window.localStorage.getItem(LEGACY_WHATSAPP_PREFERENCES_KEY);
    const raw = current ?? legacy;
    if (!raw) return WHATSAPP_DEFAULT_PREFERENCES;
    const parsed = JSON.parse(raw) as Partial<WhatsAppPreferences> | null;
    if (!parsed || typeof parsed !== "object") {
      return WHATSAPP_DEFAULT_PREFERENCES;
    }
    const preferences: WhatsAppPreferences = {
      phone:
        typeof parsed.phone === "string"
          ? formatPhoneInput(parsed.phone)
          : "",
      // Só um "false" explícito desliga a opção; o padrão é receber tudo.
      receiveSales: parsed.receiveSales !== false,
      receiveExpenses: parsed.receiveExpenses !== false,
      receivePurchases: parsed.receivePurchases !== false,
      confirmBeforeSaving: parsed.confirmBeforeSaving !== false,
      updatedAt:
        typeof parsed.updatedAt === "string" ? parsed.updatedAt : undefined,
    };

    if (!current && legacy) {
      window.localStorage.setItem(
        WHATSAPP_PREFERENCES_KEY,
        JSON.stringify(preferences),
      );
      window.localStorage.removeItem(LEGACY_WHATSAPP_PREFERENCES_KEY);
    }

    return preferences;
  } catch {
    return WHATSAPP_DEFAULT_PREFERENCES;
  }
}

export function saveWhatsAppPreferences(
  preferences: WhatsAppPreferences,
): WhatsAppPreferences {
  const next: WhatsAppPreferences = {
    ...preferences,
    phone: formatPhoneInput(preferences.phone),
    updatedAt: new Date().toISOString(),
  };

  try {
    window.localStorage.setItem(
      WHATSAPP_PREFERENCES_KEY,
      JSON.stringify(next),
    );
  } catch {
    // Modo privado ou storage cheio: a preparação vale só nesta sessão.
  }

  return next;
}
