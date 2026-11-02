"use client";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { isSupabaseConfig, type SupabaseConfig } from "./config";

export interface SupabaseConfigResponse {
  config: SupabaseConfig | null;
  problem: string | null;
}

let cachedClient: SupabaseClient | null = null;
let cachedSignature: string | null = null;

const AUTH_STORAGE_KEY = "estokar:auth";
const LEGACY_AUTH_STORAGE_KEY = "meu-caixa:auth";

/** Preserva a sessão anônima criada antes da troca de nome. */
function migrateAuthStorage() {
  if (typeof window === "undefined") return;
  try {
    const legacy = window.localStorage.getItem(LEGACY_AUTH_STORAGE_KEY);
    if (!legacy) return;
    if (!window.localStorage.getItem(AUTH_STORAGE_KEY)) {
      window.localStorage.setItem(AUTH_STORAGE_KEY, legacy);
    }
    window.localStorage.removeItem(LEGACY_AUTH_STORAGE_KEY);
  } catch {
    // Modo privado ou storage indisponível: segue com uma sessão nova.
  }
}

export function getSupabaseClient(config: SupabaseConfig): SupabaseClient {
  migrateAuthStorage();
  const signature = `${config.url}\u0000${config.anonKey}`;
  if (!cachedClient || cachedSignature !== signature) {
    cachedClient = createClient(config.url, config.anonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: false,
        storageKey: AUTH_STORAGE_KEY,
      },
      global: {
        headers: { "x-application-name": "estokar" },
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
