/**
 * Configuração pública do Supabase.
 *
 * A chave usada aqui é sempre a publishable/anon. Ela pode ficar no navegador
 * porque quem protege os dados é o RLS. Chaves `service_role`/`secret` nunca
 * entram no cliente — o app recusa a configuração inteira se detectar uma.
 */

export interface SupabaseConfig {
  url: string;
  anonKey: string;
}

const PLACEHOLDER_PATTERN =
  /seu-projeto|sua-chave|your-project|your-anon-key|example\.supabase|placeholder/i;

function isPlaceholder(value: string): boolean {
  return PLACEHOLDER_PATTERN.test(value);
}

export function normalizeSupabaseUrl(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  if (!trimmed || isPlaceholder(trimmed)) return null;

  const candidate = /^https?:\/\//i.test(trimmed)
    ? trimmed
    : `https://${trimmed}`;

  try {
    const parsed = new URL(candidate);
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return null;
    if (!parsed.hostname) return null;
    // O cliente já monta /rest/v1, /auth/v1, etc. Só a origem importa.
    return parsed.origin;
  } catch {
    return null;
  }
}

function decodeJwtRole(key: string): string | null {
  if (!key.startsWith("eyJ")) return null;
  const payload = key.split(".")[1];
  if (!payload) return null;
  try {
    const normalized = payload.replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized.padEnd(
      normalized.length + ((4 - (normalized.length % 4)) % 4),
      "=",
    );
    const json = atob(padded);
    const parsed = JSON.parse(json) as { role?: unknown };
    return typeof parsed.role === "string" ? parsed.role : null;
  } catch {
    return null;
  }
}

export function isServiceRoleKey(key: string): boolean {
  if (/^sb_secret_/i.test(key)) return true;
  return decodeJwtRole(key) === "service_role";
}

export function sanitizeAnonKey(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  if (!trimmed || isPlaceholder(trimmed)) return null;
  if (isServiceRoleKey(trimmed)) return null;

  const looksLikeKey =
    trimmed.startsWith("sb_publishable_") || trimmed.startsWith("eyJ");
  return looksLikeKey ? trimmed : null;
}

export function sanitizeSupabaseConfig(input: {
  url: unknown;
  anonKey: unknown;
}): SupabaseConfig | null {
  const url = normalizeSupabaseUrl(input.url);
  const anonKey = sanitizeAnonKey(input.anonKey);
  if (!url || !anonKey) return null;
  return { url, anonKey };
}

export function isSupabaseConfig(value: unknown): value is SupabaseConfig {
  if (!value || typeof value !== "object") return false;
  const config = value as Partial<SupabaseConfig>;
  return (
    typeof config.url === "string" &&
    typeof config.anonKey === "string" &&
    Boolean(normalizeSupabaseUrl(config.url)) &&
    Boolean(sanitizeAnonKey(config.anonKey))
  );
}

export function describeSupabaseConfigError(input: {
  url: unknown;
  anonKey: unknown;
}): string | null {
  const rawKey = typeof input.anonKey === "string" ? input.anonKey.trim() : "";
  if (rawKey && isServiceRoleKey(rawKey)) {
    return "A chave configurada é service_role. Use a publishable/anon: a secret nunca deve ir para o navegador.";
  }
  if (!normalizeSupabaseUrl(input.url)) return "SUPABASE_URL inválida ou ausente.";
  if (!sanitizeAnonKey(input.anonKey)) {
    return "SUPABASE_ANON_KEY inválida ou ausente.";
  }
  return null;
}
