"use client";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { isSupabaseConfig, type SupabaseConfig } from "./config";

export interface SupabaseConfigResponse {
  config: SupabaseConfig | null;
  problem: string | null;
}

let cachedClient: SupabaseClient | null = null;
let cachedSignature: string | null = null;

export function getSupabaseClient(config: SupabaseConfig): SupabaseClient {
  const signature = `${config.url}\u0000${config.anonKey}`;
  if (!cachedClient || cachedSignature !== signature) {
    cachedClient = createClient(config.url, config.anonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: false,
        storageKey: "meu-caixa:auth",
      },
      global: {
        headers: { "x-application-name": "meu-caixa" },
      },
    });
    cachedSignature = signature;
  }
  return cachedClient;
}

/**
 * Busca a configuração no servidor em tempo de execução. Assim a mesma imagem
 * Docker funciona com qualquer projeto Supabase, só trocando o ambiente.
 */
export async function loadSupabaseConfig(): Promise<SupabaseConfigResponse> {
  try {
    const response = await fetch("/api/config", {
      cache: "no-store",
      headers: { accept: "application/json" },
    });
    if (!response.ok) {
      return {
        config: null,
        problem: `O servidor respondeu ${response.status} ao ler a configuração.`,
      };
    }

    const payload: unknown = await response.json();
    if (!payload || typeof payload !== "object") {
      return { config: null, problem: "Resposta de configuração inválida." };
    }

    const { supabase, problem } = payload as {
      supabase?: unknown;
      problem?: unknown;
    };

    if (isSupabaseConfig(supabase)) {
      return { config: supabase, problem: null };
    }

    return {
      config: null,
      problem:
        typeof problem === "string" && problem.trim()
          ? problem
          : "Supabase não configurado.",
    };
  } catch {
    return {
      config: null,
      problem: "Não foi possível ler a configuração do Supabase.",
    };
  }
}
