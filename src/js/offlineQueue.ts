// =================================================================
//          SISTEMA DE COLA OFFLINE Y BACKGROUND SYNC (ADAPTADOR)
// =================================================================
// Capa de compatibilidad que redirige al nuevo motor Local-First
// (src/js/localStore.ts y src/js/syncManager.ts).
// =================================================================

import { UserMovieEntry } from "./types.js";
import {
  saveLocalEntry,
  getPendingSyncEntries,
  markEntriesAsSynced,
  clearLocalStore,
  LocalUserEntry
} from "./localStore.js";
import {
  requestBackgroundSync,
  syncWithServer,
  scheduleSync,
  initSyncListeners
} from "./syncManager.js";

export { requestBackgroundSync, syncWithServer, scheduleSync, initSyncListeners };

export interface PendingUserEntry {
  movieId: number;
  rating?: number | null;
  onWatchlist?: boolean;
  timestamp: number;
}

/**
 * Encola o actualiza una acción en el almacén local e inicia sincronización de fondo.
 */
export async function enqueueOfflineEntry(
  movieId: number,
  partialData: Partial<UserMovieEntry>
): Promise<void> {
  await saveLocalEntry(movieId, partialData);
  scheduleSync(100);
}

/**
 * Obtiene todas las entradas pendientes de sincronizar.
 */
export async function getPendingEntries(): Promise<PendingUserEntry[]> {
  const pending = await getPendingSyncEntries();
  return pending.map(p => ({
    movieId: p.movieId,
    rating: p.rating,
    onWatchlist: p.onWatchlist,
    timestamp: p.updatedAt
  }));
}

/**
 * Elimina una entrada ya sincronizada de IndexedDB.
 */
export async function removePendingEntry(movieId: number): Promise<void> {
  await markEntriesAsSynced([movieId], Date.now());
}

/**
 * Vacía todas las entradas pendientes del almacén local.
 */
export async function clearOfflineEntries(): Promise<void> {
  await clearLocalStore();
}

/**
 * Sincroniza las acciones pendientes con el servidor.
 */
export async function syncOfflineQueue(): Promise<{ syncedCount: number; failedCount: number }> {
  const before = await getPendingSyncEntries();
  await syncWithServer();
  const after = await getPendingSyncEntries();
  const syncedCount = Math.max(0, before.length - after.length);
  return { syncedCount, failedCount: after.length };
}

/**
 * Alias compatible con tests existentes para sincronizar entradas pendientes.
 */
export async function syncPendingEntries(): Promise<void> {
  await syncWithServer();
}

/**
 * Inicializa la sincronización offline y eventos de red.
 */
export function initOfflineSync(): () => void {
  return initSyncListeners();
}
