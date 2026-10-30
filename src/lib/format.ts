const brl = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});

const brlNoCurrency = new Intl.NumberFormat("pt-BR", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export function formatBRL(cents: number): string {
  return brl.format((cents || 0) / 100);
}

export function formatBRLInput(cents: number): string {
  return brlNoCurrency.format((cents || 0) / 100);
}

/** Accepts "50", "50,90", "1.234,56" or "50.90". */
export function parseMoneyInput(raw: string): number {
  let value = raw.replace(/[^\d.,]/g, "").trim();
  if (!value) return 0;

  if (value.includes(",")) {
    value = value.replace(/\./g, "").replace(",", ".");
  } else {
    const parts = value.split(".");
    if (parts.length > 2) {
      value = `${parts.slice(0, -1).join("")}.${parts[parts.length - 1]}`;
    }
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.round(parsed * 100) : 0;
}

export function formatTime(iso: string): string {
  return new Intl.DateTimeFormat("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
}

export function formatLongDate(date = new Date()): string {
  const formatted = new Intl.DateTimeFormat("pt-BR", {
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(date);
  return formatted.charAt(0).toUpperCase() + formatted.slice(1);
}

export function formatShortDate(iso: string): string {
  const formatted = new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "short",
  })
    .format(new Date(iso))
    .replace(".", "");
  return formatted.charAt(0).toUpperCase() + formatted.slice(1);
}

export function getGreeting(date = new Date()): string {
  const hour = date.getHours();
  if (hour < 12) return "Bom dia";
  if (hour < 18) return "Boa tarde";
  return "Boa noite";
}

export function startOfDay(date: Date): Date {
  const copy = new Date(date);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

export function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

export function isToday(iso: string): boolean {
  return isSameDay(new Date(iso), new Date());
}

export function dayKey(iso: string): string {
  const date = new Date(iso);
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
}

export function dayLabel(iso: string): string {
  const date = new Date(iso);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);

  if (isSameDay(date, today)) return "Hoje";
  if (isSameDay(date, yesterday)) return "Ontem";
  return formatShortDate(iso);
}

export function quantityLabel(
  quantity: number,
  unit: string,
  unitPlural: string,
): string {
  return `${quantity} ${quantity === 1 ? unit : unitPlural}`;
}

export function initials(name: string): string {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
}
