import {
  describeSupabaseConfigError,
  sanitizeSupabaseConfig,
} from "@/lib/supabase/config";

// A leitura acontece a cada requisição: trocar as variáveis de ambiente no
// container não exige rebuild da imagem.
export const dynamic = "force-dynamic";

export function GET() {
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey =
    process.env.SUPABASE_ANON_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  const supabase = sanitizeSupabaseConfig({ url, anonKey });
  const problem = supabase ? null : describeSupabaseConfigError({ url, anonKey });

  return Response.json(
    { supabase, problem },
    {
      status: 200,
      headers: {
        "cache-control": "no-store, no-cache, must-revalidate",
      },
    },
  );
}
