// =================================================================
//          ALMACÉN LOCAL CANÓNICO (LOCAL-FIRST ARCHITECTURE)
// =================================================================
// En la arquitectura Local-First, IndexedDB en el dispositivo del
// usuario es la FUENTE DE VERDAD INMEDIATA (0 ms de latencia y cero
// rollbacks). Supabase actúa como espejo secundario de sincronización.
// =================================================================

import { UserMovieEntry } from "./types.js";
import { normalizeUserMovieEntry } from "./contracts.js";

export const LOCAL_DB_NAME = "videoclub_local_db";
export const LOCAL_DB_VERSION = 1;
export const STORE_USER_ENTRIES = "user_entries";

export interface LocalUserEntry {
  movieId: number;
  rating: number | null;
  onWatchlist: boolean;
  updatedAt: number; // timestamp UTC en milisegundos
  syncStatus: "synced" | "dirty" | "deleted";
}

let dbInstance: IDBDatabase | null = null;
let isClosing = false;

/**
 * Abre o reutiliza la conexión a la base de datos IndexedDB local.
 */
export function openLocalDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      return reject(new Error("IndexedDB no está disponible en este entorno."));
    }

    if (dbInstance && !isClosing) {
      return resolve(dbInstance);
    }

    const request = indexedDB.open(LOCAL_DB_NAME, LOCAL_DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_USER_ENTRIES)) {
        const store = db.createObjectStore(STORE_USER_ENTRIES, { keyPath: "movieId" });
        store.createIndex("by_syncStatus", "syncStatus", { unique: false });
      }
    };

    request.onsuccess = () => {
      dbInstance = request.result;
      dbInstance.onversionchange = () => {
        if (dbInstance) {
          dbInstance.close();
          dbInstance = null;
        }
      };
      resolve(dbInstance);
    };

    request.onerror = () => reject(request.error);
  });
}

/**
 * Cierra la conexión activa a IndexedDB (útil para tests y teardown).
 */
export function closeLocalDB(): void {
  if (dbInstance) {
    isClosing = true;
    try {
      dbInstance.close();
    } finally {
      dbInstance = null;
      isClosing = false;
    }
  }
}

/**
 * Obtiene una entrada individual desde el almacenamiento local.
 */
export async function getLocalEntry(movieId: number): Promise<LocalUserEntry | null> {
  try {
    const db = await openLocalDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_USER_ENTRIES, "readonly");
      const store = tx.objectStore(STORE_USER_ENTRIES);
      const req = store.get(movieId);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    });
  } catch {
    return null;
  }
}

/**
 * Guarda o actualiza una entrada en IndexedDB con estado 'dirty' o 'deleted'.
 * Se ejecuta síncronamente al gesto del usuario en 0 ms.
 */
export async function saveLocalEntry(
  movieId: number,
  partialData: Partial<UserMovieEntry>,
  customTimestamp?: number
): Promise<LocalUserEntry> {
  const current = await getLocalEntry(movieId);
  const baseRating = current && current.syncStatus !== "deleted" ? current.rating : null;
  const baseWatchlist = current && current.syncStatus !== "deleted" ? current.onWatchlist : false;

  const normalized = normalizeUserMovieEntry({
    rating: partialData.rating !== undefined ? partialData.rating : baseRating,
    onWatchlist: partialData.onWatchlist !== undefined ? partialData.onWatchlist : baseWatchlist
  });

  const isInactive = normalized.rating === null && !normalized.onWatchlist;
  const now = customTimestamp || Date.now();

  const entry: LocalUserEntry = {
    movieId,
    rating: normalized.rating,
    onWatchlist: normalized.onWatchlist,
    updatedAt: now,
    syncStatus: isInactive ? "deleted" : "dirty"
  };

  const db = await openLocalDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_USER_ENTRIES, "readwrite");
    const store = tx.objectStore(STORE_USER_ENTRIES);
    const req = store.put(entry);
    req.onsuccess = () => resolve(entry);
    req.onerror = () => reject(req.error);
  });
}

/**
 * Obtiene todas las entradas activas en un diccionario Record<string, UserMovieEntry>
 * para hidratar instantáneamente el estado reactivo en memoria al arrancar la app.
 */
export async function getAllLocalEntries(): Promise<Record<string, UserMovieEntry>> {
  try {
    const db = await openLocalDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_USER_ENTRIES, "readonly");
      const store = tx.objectStore(STORE_USER_ENTRIES);
      const req = store.getAll();

      req.onsuccess = () => {
        const rows: LocalUserEntry[] = req.result || [];
        const result: Record<string, UserMovieEntry> = {};

        for (const row of rows) {
          if (row.syncStatus !== "deleted") {
            result[String(row.movieId)] = {
              rating: row.rating,
              onWatchlist: row.onWatchlist
            };
          }
        }
        resolve(result);
      };
      req.onerror = () => reject(req.error);
    });
  } catch {
    return {};
  }
}

/**
 * Obtiene todas las entradas pendientes de sincronizar con Supabase ('dirty' o 'deleted').
 */
export async function getPendingSyncEntries(): Promise<LocalUserEntry[]> {
  try {
    const db = await openLocalDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_USER_ENTRIES, "readonly");
      const store = tx.objectStore(STORE_USER_ENTRIES);
      const req = store.getAll();

      req.onsuccess = () => {
        const rows: LocalUserEntry[] = req.result || [];
        const pending = rows.filter(r => r.syncStatus === "dirty" || r.syncStatus === "deleted");
        resolve(pending);
      };
      req.onerror = () => reject(req.error);
    });
  } catch {
    return [];
  }
}

/**
 * Marca las entradas como sincronizadas ('synced') tras confirmación de Supabase,
 * o purga físicamente aquellas que fueron eliminadas ('deleted').
 */
export async function markEntriesAsSynced(movieIds: number[], syncTimestamp: number): Promise<void> {
  if (!movieIds || movieIds.length === 0) return;

  const db = await openLocalDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_USER_ENTRIES, "readwrite");
    const store = tx.objectStore(STORE_USER_ENTRIES);

    let processed = 0;
    const total = movieIds.length;

    const checkComplete = () => {
      processed++;
      if (processed >= total) resolve();
    };

    for (const id of movieIds) {
      const getReq = store.get(id);
      getReq.onsuccess = () => {
        const current: LocalUserEntry | undefined = getReq.result;
        if (!current) {
          checkComplete();
          return;
        }

        // Si el usuario no ha realizado otra mutación posterior mientras se enviaba la red
        if (current.updatedAt <= syncTimestamp) {
          if (current.syncStatus === "deleted") {
            const delReq = store.delete(id);
            delReq.onsuccess = checkComplete;
            delReq.onerror = () => reject(delReq.error);
          } else {
            current.syncStatus = "synced";
            const putReq = store.put(current);
            putReq.onsuccess = checkComplete;
            putReq.onerror = () => reject(putReq.error);
          }
        } else {
          checkComplete();
        }
      };
      getReq.onerror = () => reject(getReq.error);
    }
  });
}

/**
 * Reconciliación Bidireccional LWW (Last-Write-Wins):
 * Fusiona un lote de entradas descargadas de Supabase con el almacenamiento local.
 */
export async function mergeRemoteEntries(
  remoteEntries: Array<{
    movie_id: number;
    rating: number | null;
    on_watchlist: boolean;
    updated_at?: string | null;
  }>
): Promise<{ mergedMap: Record<string, UserMovieEntry>; hasLocalChangesToUpload: boolean }> {
  const db = await openLocalDB();
  const allCurrent = await new Promise<LocalUserEntry[]>((resolve, reject) => {
    const tx = db.transaction(STORE_USER_ENTRIES, "readonly");
    const store = tx.objectStore(STORE_USER_ENTRIES);
    const req = store.getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });

  const localMap = new Map<number, LocalUserEntry>();
  for (const item of allCurrent) {
    localMap.set(item.movieId, item);
  }

  let hasLocalChangesToUpload = false;
  const updatesToApply: LocalUserEntry[] = [];

  for (const remote of remoteEntries) {
    const movieId = remote.movie_id;
    const remoteTime = remote.updated_at ? new Date(remote.updated_at).getTime() : 0;
    const local = localMap.get(movieId);

    if (!local) {
      // Entrada remota no existe localmente: adoptarla como sincronizada
      updatesToApply.push({
        movieId,
        rating: remote.rating,
        onWatchlist: remote.on_watchlist,
        updatedAt: remoteTime || Date.now(),
        syncStatus: "synced"
      });
    } else if (local.syncStatus === "dirty" || local.syncStatus === "deleted") {
      // Conflicto: la versión local tiene cambios no subidos
      if (local.updatedAt > remoteTime) {
        // La mutación local es más reciente -> Prevalece local y se programa para subir
        hasLocalChangesToUpload = true;
      } else {
        // La remota es más reciente -> Prevalece remota
        updatesToApply.push({
          movieId,
          rating: remote.rating,
          onWatchlist: remote.on_watchlist,
          updatedAt: remoteTime,
          syncStatus: "synced"
        });
      }
    } else {
      // La entrada local ya estaba sincronizada: actualizar con la versión remota
      updatesToApply.push({
        movieId,
        rating: remote.rating,
        onWatchlist: remote.on_watchlist,
        updatedAt: remoteTime,
        syncStatus: "synced"
      });
    }
  }

  // Comprobar si hay entradas locales que no existen en el servidor y deben subirse
  for (const local of allCurrent) {
    if (local.syncStatus === "dirty" || local.syncStatus === "deleted") {
      hasLocalChangesToUpload = true;
      break;
    }
  }

  // Aplicar las actualizaciones en IndexedDB
  if (updatesToApply.length > 0) {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_USER_ENTRIES, "readwrite");
      const store = tx.objectStore(STORE_USER_ENTRIES);
      let count = 0;
      let resolved = false;

      const done = () => {
        if (!resolved) {
          resolved = true;
          resolve();
        }
      };

      for (const entry of updatesToApply) {
        const req = store.put(entry);
        req.onsuccess = () => {
          count++;
          if (count >= updatesToApply.length) done();
        };
        req.onerror = () => reject(req.error);
      }

      tx.oncomplete = done;
      tx.onerror = () => reject(tx.error);
    });
  }

  // Devolver el mapa unificado consolidado
  const mergedMap = await getAllLocalEntries();
  return { mergedMap, hasLocalChangesToUpload };
}

/**
 * Vacía completamente el almacén local (usado al cerrar sesión o en tests).
 */
export async function clearLocalStore(): Promise<void> {
  try {
    const db = await openLocalDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_USER_ENTRIES, "readwrite");
      const store = tx.objectStore(STORE_USER_ENTRIES);
      const req = store.clear();
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  } catch {
    // Ignorar si la base de datos no está disponible
  }
}
