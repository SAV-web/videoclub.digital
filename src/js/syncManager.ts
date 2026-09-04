// =================================================================
//          SINCRONIZADOR DE FONDO (BACKGROUND SYNC MANAGER)
// =================================================================
// Orquesta la sincronización bidireccional entre el almacenamiento
// local (IndexedDB) y Supabase en segundo plano sin bloquear jamás la UI.
// =================================================================

import { getSupabase } from "./api.js";
import {
  getPendingSyncEntries,
  markEntriesAsSynced,
  mergeRemoteEntries,
  LocalUserEntry
} from "./localStore.js";
import { setUserMovieData, appEvents } from "./state.js";

let syncTimeout: ReturnType<typeof setTimeout> | null = null;
let isSyncing = false;

/**
 * Solicita el registro de Background Sync en el Service Worker si está disponible.
 */
export async function requestBackgroundSync(): Promise<void> {
  if ("serviceWorker" in navigator && "SyncManager" in window) {
    try {
      const registration = await navigator.serviceWorker.ready;
      // @ts-expect-error - SyncManager está disponible en navegadores compatibles con Background Sync API
      await registration.sync.register("sync-user-entries");
    } catch {
      // Si el navegador no lo soporta o está en modo incógnito estricto, no bloqueamos
    }
  }
}

/**
 * Programa una sincronización con debounce para evitar llamadas masivas
 * si el usuario pulsa varias valoraciones consecutivas.
 */
export function scheduleSync(debounceMs = 300): void {
  if (syncTimeout) {
    clearTimeout(syncTimeout);
  }

  requestBackgroundSync();

  syncTimeout = setTimeout(() => {
    syncWithServer().catch(err => {
      if (import.meta.env.DEV) {
        console.warn("[SyncManager] Sincronización en segundo plano pospuesta:", err);
      }
    });
  }, debounceMs);
}

/**
 * Sube las entradas locales marcadas como 'dirty' o 'deleted' a Supabase.
 * Si no hay conexión o no hay sesión, se pospone silenciosamente.
 */
export async function syncWithServer(): Promise<void> {
  if (isSyncing || typeof navigator !== "undefined" && !navigator.onLine) {
    return;
  }

  isSyncing = true;
  const syncTimestamp = Date.now();

  try {
    const supabase = await getSupabase();
    const { data: { session } } = await supabase.auth.getSession();

    // Si el usuario es invitado (anónimo), los datos quedan seguros en IndexedDB hasta que inicie sesión
    if (!session?.user) {
      return;
    }

    const pending = await getPendingSyncEntries();
    if (pending.length === 0) {
      return;
    }

    const userId = session.user.id;
    const toDeleteIds: number[] = [];
    const toUpsert: Array<{
      user_id: string;
      movie_id: number;
      rating: number | null;
      on_watchlist: boolean;
      updated_at: string;
    }> = [];
    const processedIds: number[] = [];

    for (const entry of pending) {
      if (entry.syncStatus === "deleted") {
        toDeleteIds.push(entry.movieId);
        processedIds.push(entry.movieId);
      } else if (entry.syncStatus === "dirty") {
        toUpsert.push({
          user_id: userId,
          movie_id: entry.movieId,
          rating: entry.rating,
          on_watchlist: entry.onWatchlist,
          updated_at: new Date(entry.updatedAt).toISOString()
        });
        processedIds.push(entry.movieId);
      }
    }

    // 1. Ejecutar eliminaciones en lote si las hay
    if (toDeleteIds.length > 0) {
      const { error: delError } = await supabase
        .from("user_movie_entries")
        .delete()
        .eq("user_id", userId)
        .in("movie_id", toDeleteIds);

      if (delError && import.meta.env.DEV) {
        console.warn("[SyncManager] Error al eliminar en Supabase:", delError);
      }
    }

    // 2. Ejecutar inserciones / actualizaciones en lote si las hay
    if (toUpsert.length > 0) {
      const { error: upsertError } = await supabase
        .from("user_movie_entries")
        .upsert(toUpsert, { onConflict: "user_id, movie_id" });

      if (upsertError && import.meta.env.DEV) {
        console.warn("[SyncManager] Error al hacer upsert en Supabase:", upsertError);
      }
    }

    // 3. Confirmar sincronización en IndexedDB
    await markEntriesAsSynced(processedIds, syncTimestamp);
  } catch (error) {
    if (import.meta.env.DEV) {
      console.warn("[SyncManager] Error durante la sincronización de red:", error);
    }
  } finally {
    isSyncing = false;
  }
}

/**
 * Reconciliación al Iniciar Sesión (Merge on Login):
 * Descarga las entradas remotas del usuario y las fusiona con las locales mediante LWW.
 * Si había películas guardadas en modo invitado, se subirán automáticamente.
 */
export async function mergeOnLogin(userId: string): Promise<void> {
  try {
    const supabase = await getSupabase();
    const PAGE_SIZE = 1000;
    let from = 0;
    const allRows: Array<{
      movie_id: number | string;
      rating: number | null;
      on_watchlist: boolean;
      updated_at?: string | null;
    }> = [];

    while (true) {
      const { data, error } = await supabase
        .from("user_movie_entries")
        .select("movie_id, rating, on_watchlist, updated_at")
        .eq("user_id", userId)
        .order("id", { ascending: true })
        .range(from, from + PAGE_SIZE - 1);

      if (error) {
        if (import.meta.env.DEV) {
          console.warn("[SyncManager] Error al descargar catálogo remoto:", error);
        }
        break;
      }

      if (!data || data.length === 0) {
        break;
      }

      allRows.push(...data);
      if (data.length < PAGE_SIZE) {
        break;
      }
      from += PAGE_SIZE;
    }

    const remoteEntries = allRows.map(r => ({
      movie_id: Number(r.movie_id),
      rating: r.rating !== undefined ? r.rating : null,
      on_watchlist: Boolean(r.on_watchlist),
      updated_at: r.updated_at
    }));

    const { mergedMap, hasLocalChangesToUpload } = await mergeRemoteEntries(remoteEntries);

    // Actualizar estado reactivo en memoria
    setUserMovieData(mergedMap);
    appEvents.emit("userDataUpdated");

    // Si el usuario tenía entradas en modo invitado o más recientes localmente, sincronizar de inmediato
    if (hasLocalChangesToUpload) {
      scheduleSync(100);
    }
  } catch (error) {
    if (import.meta.env.DEV) {
      console.error("[SyncManager] Excepción en mergeOnLogin:", error);
    }
  }
}

/**
 * Inicializa los escuchadores globales de conectividad y ciclo de vida de la página
 * para sincronizar automáticamente al recuperar la red o enfocar la pestaña.
 */
export function initSyncListeners(): () => void {
  if (typeof window === "undefined") {
    return () => {};
  }

  const onOnline = () => {
    scheduleSync(200);
  };

  window.addEventListener("online", onOnline);

  return () => {
    window.removeEventListener("online", onOnline);
    if (syncTimeout) {
      clearTimeout(syncTimeout);
      syncTimeout = null;
    }
  };
}
