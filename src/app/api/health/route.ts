import { sanitizeSupabaseConfig } from "@/lib/supabase/config";

// Health check para Docker, Render, Railway e monitoramento externo.
// Não expõe a chave: só informa se a configuração pública está presente.
export const dynamic = "force-dynamic";

export function GET() {
  const configured = Boolean(
    sanitizeSupabaseConfig({
      url: process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL,
      anonKey:
        process.env.SUPABASE_ANON_KEY ??
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    }),
  );

  return Response.json(
    {
      ok: true,
      supabase: configured ? "configured" : "missing",
    },
    {
      status: 200,
      headers: {
        "cache-control": "no-store, no-cache, must-revalidate",
      },
    },
  );
}
