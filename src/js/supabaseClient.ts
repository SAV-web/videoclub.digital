// =================================================================
//        CLIENTE SUPABASE BASE (src/js/supabaseClient.ts)
// =================================================================
// Instancia neutral y diferida del cliente Supabase.
// Permite romper ciclos de dependencia entre api.ts y auth.ts,
// ofreciendo un único punto de inicialización para el cliente SDK.
// =================================================================

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { CONFIG } from "./constants.js";
import { ERROR_CODES, createAppError } from "./contracts.js";

const notConfiguredError = () =>
  Promise.reject(
    createAppError(ERROR_CODES.CONFIGURATION, "Supabase no configurado (Faltan credenciales)")
  );

// Almacenamiento dinámico que alterna entre localStorage y sessionStorage según el checkbox de "Recordar sesión"
const customAuthStorage = {
  getItem(key: string): string | null {
    const remember = localStorage.getItem("videoclub:remember_me") !== "false";
    return remember ? localStorage.getItem(key) : sessionStorage.getItem(key);
  },
  setItem(key: string, value: string): void {
    const remember = localStorage.getItem("videoclub:remember_me") !== "false";
    if (remember) {
      localStorage.setItem(key, value);
    } else {
      sessionStorage.setItem(key, value);
    }
  },
  removeItem(key: string): void {
    localStorage.removeItem(key);
    sessionStorage.removeItem(key);
  },
};

let supabasePromise: Promise<SupabaseClient> | null = null;

// CARGA DIFERIDA DE LA BASE DE DATOS (Solo descarga/instancia Supabase cuando hace falta)
export function getSupabase(): Promise<SupabaseClient> {
  if (!supabasePromise) {
    supabasePromise = (async () => {
      const globalProcess = (globalThis as unknown as { process?: { env?: Record<string, string | undefined> } })?.process;
      const isTestEnv =
        Boolean(globalProcess?.env?.NODE_ENV === "test") ||
        Boolean((globalThis as unknown as Record<string, unknown>)?._isTestEnv) ||
        (typeof window !== "undefined" && Boolean((window as unknown as Record<string, unknown>)?._isTestEnv));
      const { SUPABASE_URL: url, SUPABASE_ANON_KEY: key } = CONFIG;

      if (url && key && !isTestEnv) {
        return createClient(url, key, {
          auth: {
            persistSession: true,
            storage: customAuthStorage,
          },
        });
      } else {
        const createMockQuery = () => {
          const p = Promise.resolve({
            data: null,
            error: createAppError(ERROR_CODES.CONFIGURATION, "Supabase no configurado (Faltan credenciales)"),
          }) as unknown as Promise<{ data: null; error: Error }> & { abortSignal: (s: unknown) => unknown };
          p.abortSignal = () => p;
          return p;
        };

        const mockClient = {
          // Mock falso para que la web arranque aunque no haya claves de BD puestas
          rpc: createMockQuery,
          from: () => {
            const queryObj: Record<string, unknown> = {
              select: () => queryObj,
              eq: () => queryObj,
              not: () => queryObj,
              or: () => queryObj,
              ilike: () => queryObj,
              order: () => queryObj,
              abortSignal: () => queryObj,
              limit: () => queryObj,
              in: () => queryObj,
              maybeSingle: () => Promise.resolve({ data: null, error: null }),
              single: () => Promise.resolve({ data: null, error: null }),
              range: () => Promise.resolve({ data: [], error: null, count: 0 }),
              upsert: createMockQuery,
            };
            return queryObj;
          },
          auth: {
            getSession: () => Promise.resolve({ data: { session: null }, error: null }),
            onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
            signInWithPassword: notConfiguredError,
            signUp: notConfiguredError,
            signOut: () => Promise.resolve({ error: null }),
            resetPasswordForEmail: notConfiguredError,
            updateUser: notConfiguredError,
          },
        };
        return mockClient as unknown as SupabaseClient;
      }
    })();
  }
  return supabasePromise;
}

export type { SupabaseClient };
