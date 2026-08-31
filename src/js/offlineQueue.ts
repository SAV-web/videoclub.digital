// =================================================================
//          SISTEMA DE COLA OFFLINE Y BACKGROUND SYNC
// =================================================================
// Permite guardar valoraciones y cambios de watchlist en IndexedDB
// cuando el usuario no tiene conexión y los sincroniza automáticamente
// con Supabase al recuperar la red (usando Background Sync API o 'online').
// =================================================================

import { UserMovieEntry } from "./types.js";
import { setUserMovieDataAPI } from "./api.js";
import { showToast } from "./ui.js";
import { appEvents } from "./state.js";

const DB_NAME = "videoclub_offline_db";
const DB_VERSION = 1;
const STORE_NAME = "pending_entries";

export interface PendingUserEntry {
  movieId: number;
  rating?: number | null;
  onWatchlist?: boolean;
  timestamp: number;
}

/**
 * Abre la conexión a IndexedDB de forma segura.
 */
function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      return reject(new Error("IndexedDB no está disponible en este entorno."));
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: "movieId" });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/**
 * Encola o actualiza una acción offline en IndexedDB.
 */
export async function enqueueOfflineEntry(
  movieId: number,
  partialData: Partial<UserMovieEntry>
): Promise<void> {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      const store = tx.objectStore(STORE_NAME);

      const entry: PendingUserEntry = {
        movieId,
        ...partialData,
        timestamp: Date.now()
      };

      const request = store.put(entry);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  } catch (error) {
    if (import.meta.env.DEV) {
      console.error("[OfflineQueue] Error al encolar en IndexedDB:", error);
    }
  }
}

/**
 * Obtiene todas las entradas pendientes de sincronizar.
 */
export async function getPendingEntries(): Promise<PendingUserEntry[]> {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readonly");
      const store = tx.objectStore(STORE_NAME);
      const request = store.getAll();

      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => reject(request.error);
    });
  } catch {
    return [];
  }
}

/**
 * Elimina una entrada ya sincronizada de IndexedDB.
 */
export async function removePendingEntry(movieId: number): Promise<void> {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      const store = tx.objectStore(STORE_NAME);
      const request = store.delete(movieId);

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  } catch (error) {
    if (import.meta.env.DEV) {
      console.error(`[OfflineQueue] Error al eliminar entrada ${movieId}:`, error);
    }
  }
}

/**
 * Registra una tarea de Background Sync con el Service Worker (Chromium).
 */
export async function requestBackgroundSync(): Promise<void> {
  if (typeof window !== "undefined" && typeof navigator !== "undefined" && "serviceWorker" in navigator && "SyncManager" in window) {
    try {
      const registration = await navigator.serviceWorker.ready;
      // Background Sync API (W3C Draft)
      if ("sync" in registration) {
        await (registration as any).sync.register("sync-ratings");
        return;
      }
    } catch (err) {
      if (import.meta.env.DEV) {
        console.warn("[OfflineQueue] Background Sync register falló:", err);
      }
    }
  }
}

let isSyncing = false;

/**
 * Procesa la cola de acciones pendientes enviándolas a Supabase.
 */
export async function syncPendingEntries(): Promise<number> {
  if (isSyncing || (typeof navigator !== "undefined" && !navigator.onLine)) return 0;
  isSyncing = true;

  try {
    const pending = await getPendingEntries();
    if (pending.length === 0) return 0;

    let syncedCount = 0;

    for (const item of pending) {
      try {
        const partialData: Partial<UserMovieEntry> = {};
        if (item.rating !== undefined) partialData.rating = item.rating;
        if (item.onWatchlist !== undefined) partialData.onWatchlist = item.onWatchlist;

        await setUserMovieDataAPI(item.movieId, partialData);
        await removePendingEntry(item.movieId);
        syncedCount++;
      } catch (err: unknown) {
        if (import.meta.env.DEV) {
          console.warn(`[OfflineQueue] Fallo al sincronizar película ${item.movieId}:`, err);
        }
      }
    }

    if (syncedCount > 0) {
      showToast(
        syncedCount === 1
          ? "Acción sincronizada con éxito."
          : `${syncedCount} acciones sincronizadas con éxito.`,
        "success"
      );
      appEvents.emit("userDataUpdated");
    }

    return syncedCount;
  } finally {
    isSyncing = false;
  }
}

/**
 * Inicializa los escuchadores para Background Sync y recuperación de conexión.
 */
export function initOfflineSync(): () => void {
  if (typeof window === "undefined") {
    return () => {};
  }

  const handleOnline = () => {
    syncPendingEntries();
  };

  const handleMessage = (event: MessageEvent) => {
    if (event.data && event.data.type === "SYNC_PENDING_ENTRIES") {
      syncPendingEntries();
    }
  };

  window.addEventListener("online", handleOnline);

  if (typeof navigator !== "undefined" && "serviceWorker" in navigator) {
    navigator.serviceWorker.addEventListener("message", handleMessage);
  }

  // Intento de sincronización al arrancar si hay conexión
  if (typeof navigator !== "undefined" && navigator.onLine) {
    syncPendingEntries();
  }

  return () => {
    window.removeEventListener("online", handleOnline);
    if (typeof navigator !== "undefined" && "serviceWorker" in navigator) {
      navigator.serviceWorker.removeEventListener("message", handleMessage);
    }
  };
}
