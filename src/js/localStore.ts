// =================================================================
//          ALMACÉN LOCAL CANÓNICO (LOCAL-FIRST ARCHITECTURE)
// =================================================================
// En la arquitectura Local-First, IndexedDB en el dispositivo del
// usuario es la FUENTE DE VERDAD INMEDIATA (0 ms de latencia y cero
// rollbacks). Supabase actúa como espejo secundario de sincronización.
// =================================================================

import { UserMovieEntry, Movie, MappedMovie } from "./types.js";
import { normalizeUserMovieEntry } from "./contracts.js";

export const LOCAL_DB_NAME = "videoclub_local_db";
export const LOCAL_DB_VERSION = 2;
export const STORE_USER_ENTRIES = "user_entries";
export const STORE_CACHED_MOVIES = "cached_movies";
export const MAX_CACHED_MOVIES = 3500;

export interface LocalUserEntry {
  movieId: number;
  rating: number | null;
  onWatchlist: boolean;
  updatedAt: number; // timestamp UTC en milisegundos
  syncStatus: "synced" | "dirty" | "deleted";
}

export type CachedMovie = (Movie | MappedMovie) & { cachedAt: number };

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
      const tx = (event.target as IDBOpenDBRequest).transaction;

      // 1. Almacén de entradas de usuario (user_entries)
      let userStore: IDBObjectStore | null = null;
      if (!db.objectStoreNames.contains(STORE_USER_ENTRIES)) {
        userStore = db.createObjectStore(STORE_USER_ENTRIES, { keyPath: "movieId" });
      } else if (tx && typeof tx.objectStore === "function") {
        userStore = tx.objectStore(STORE_USER_ENTRIES);
      }

      if (userStore && userStore.indexNames && typeof userStore.indexNames.contains === "function") {
        if (!userStore.indexNames.contains("by_syncStatus")) {
          userStore.createIndex("by_syncStatus", "syncStatus", { unique: false });
        }
        if (!userStore.indexNames.contains("by_watchlist")) {
          userStore.createIndex("by_watchlist", "onWatchlist", { unique: false });
        }
        if (!userStore.indexNames.contains("by_rating")) {
          userStore.createIndex("by_rating", "rating", { unique: false });
        }
      }

      // 2. Almacén de fichas de películas cacheadas (cached_movies)
      let movieStore: IDBObjectStore | null = null;
      if (!db.objectStoreNames.contains(STORE_CACHED_MOVIES)) {
        movieStore = db.createObjectStore(STORE_CACHED_MOVIES, { keyPath: "id" });
      } else if (tx && typeof tx.objectStore === "function") {
        movieStore = tx.objectStore(STORE_CACHED_MOVIES);
      }

      if (movieStore && movieStore.indexNames && typeof movieStore.indexNames.contains === "function") {
        if (!movieStore.indexNames.contains("by_cachedAt")) {
          movieStore.createIndex("by_cachedAt", "cachedAt", { unique: false });
        }
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
 * Guarda o actualiza atómicamente la entrada de usuario en user_entries y opcionalmente
 * la ficha de la película en cached_movies dentro de una única transacción ACID de IndexedDB.
 */
export async function saveLocalEntryWithMovie(
  movieId: number,
  partialData: Partial<UserMovieEntry>,
  movieData?: Movie | MappedMovie | null,
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
    const shouldCacheMovie = Boolean(movieData && movieData.id === movieId);
    const storeNames = shouldCacheMovie
      ? [STORE_USER_ENTRIES, STORE_CACHED_MOVIES]
      : [STORE_USER_ENTRIES];

    let isResolved = false;
    const safeResolve = () => {
      if (!isResolved) {
        isResolved = true;
        resolve(entry);
      }
    };

    const tx = db.transaction(storeNames, "readwrite");
    const userStore = tx.objectStore(STORE_USER_ENTRIES);
    const userReq = userStore.put(entry);
    if (userReq) {
      userReq.onsuccess = () => {
        if (!shouldCacheMovie) safeResolve();
      };
    }

    if (shouldCacheMovie && movieData) {
      const movieStore = tx.objectStore(STORE_CACHED_MOVIES);
      const cachedRecord: CachedMovie = {
        ...movieData,
        cachedAt: now
      };
      const movieReq = movieStore.put(cachedRecord);
      if (movieReq) {
        movieReq.onsuccess = safeResolve;
      }
    }

    tx.oncomplete = safeResolve;
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error || new Error("Transacción atómica en IndexedDB abortada."));
  });
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
  return saveLocalEntryWithMovie(movieId, partialData, null, customTimestamp);
}

/**
 * Guarda en lote un conjunto de entradas de usuario importadas en una única transacción de IndexedDB.
 * Cada entrada se marca con estado 'dirty' (o 'deleted' si no tiene valoración ni watchlist),
 * permitiendo sincronización en lote en segundo plano.
 */
export async function saveLocalEntriesBatch(
  entries: Array<{ movieId: number; rating: number | null; onWatchlist: boolean }>,
  customTimestamp?: number
): Promise<{ importedCount: number; mergedMap: Record<string, UserMovieEntry> }> {
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

  const now = customTimestamp || Date.now();
  const updatesToPut: LocalUserEntry[] = [];

  for (const item of entries) {
    const normalized = normalizeUserMovieEntry({
      rating: item.rating,
      onWatchlist: item.onWatchlist
    });

    const isInactive = normalized.rating === null && !normalized.onWatchlist;
    const entry: LocalUserEntry = {
      movieId: item.movieId,
      rating: normalized.rating,
      onWatchlist: normalized.onWatchlist,
      updatedAt: now,
      syncStatus: isInactive ? "deleted" : "dirty"
    };

    localMap.set(item.movieId, entry);
    updatesToPut.push(entry);
  }

  if (updatesToPut.length > 0) {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_USER_ENTRIES, "readwrite");
      const store = tx.objectStore(STORE_USER_ENTRIES);
      for (const entry of updatesToPut) {
        store.put(entry);
      }
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error || new Error("Transacción en lote abortada."));
    });
  }

  const mergedMap: Record<string, UserMovieEntry> = {};
  for (const [id, entry] of localMap.entries()) {
    if (entry.syncStatus !== "deleted") {
      mergedMap[String(id)] = {
        rating: entry.rating,
        onWatchlist: entry.onWatchlist
      };
    }
  }

  return { importedCount: updatesToPut.length, mergedMap };
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
 * Guarda un lote de fichas de películas en cached_movies.
 * Si el almacén excede MAX_CACHED_MOVIES, purga los registros más antiguos (política LRU).
 */
export async function saveCachedMovies(movies: Array<Movie | MappedMovie>): Promise<void> {
  if (!movies || movies.length === 0) return;

  try {
    const db = await openLocalDB();
    if (!db.objectStoreNames.contains(STORE_CACHED_MOVIES)) return;

    const now = Date.now();

    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_CACHED_MOVIES, "readwrite");
      const store = tx.objectStore(STORE_CACHED_MOVIES);

      for (const m of movies) {
        if (!m || typeof m.id !== "number") continue;
        const entry: CachedMovie = {
          ...m,
          cachedAt: now
        };
        store.put(entry);
      }

      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });

    // Purgado prudente de retención LRU si se supera MAX_CACHED_MOVIES
    await pruneOldCachedMovies();
  } catch (error) {
    if (import.meta.env.DEV) {
      console.warn("[LocalStore] Error al guardar películas en caché local:", error);
    }
  }
}

/**
 * Purgado LRU para mantener cached_movies por debajo del límite prudente.
 * Implementa un Escudo de Inmunidad (Pinning Shield): las películas presentes
 * en la colección activa del usuario (user_entries con rating o en watchlist)
 * jamás son expulsadas de IndexedDB por la política LRU.
 */
export async function pruneOldCachedMovies(maxLimit = MAX_CACHED_MOVIES): Promise<void> {
  try {
    const db = await openLocalDB();
    if (!db.objectStoreNames.contains(STORE_CACHED_MOVIES)) return;

    const count = await new Promise<number>((resolve) => {
      const tx = db.transaction(STORE_CACHED_MOVIES, "readonly");
      const req = tx.objectStore(STORE_CACHED_MOVIES).count();
      req.onsuccess = () => resolve(req.result || 0);
      req.onerror = () => resolve(0);
    });

    if (count <= maxLimit) return;

    // Escudo de Inmunidad: obtener IDs protegidos de la colección activa del usuario
    const protectedIds = new Set<number>();
    if (db.objectStoreNames.contains(STORE_USER_ENTRIES)) {
      await new Promise<void>((resolve) => {
        const tx = db.transaction(STORE_USER_ENTRIES, "readonly");
        const store = tx.objectStore(STORE_USER_ENTRIES);
        const req = store.getAll();
        req.onsuccess = () => {
          const rows: LocalUserEntry[] = req.result || [];
          for (const row of rows) {
            if (row.syncStatus !== "deleted" && (row.rating !== null || row.onWatchlist)) {
              protectedIds.add(row.movieId);
            }
          }
          resolve();
        };
        req.onerror = () => resolve();
      });
    }

    const excess = count - maxLimit;
    await new Promise<void>((resolve) => {
      const tx = db.transaction(STORE_CACHED_MOVIES, "readwrite");
      const store = tx.objectStore(STORE_CACHED_MOVIES);
      const index = store.index("by_cachedAt");
      const req = index.openKeyCursor(); // Orden ascendente: los más antiguos primero
      let deleted = 0;

      req.onsuccess = (e) => {
        const cursor = (e.target as IDBRequest<IDBCursorWithValue>).result;
        if (!cursor || deleted >= excess) {
          resolve();
          return;
        }

        const id = Number(cursor.primaryKey);
        // Escudo de Inmunidad: si la película forma parte de la colección del usuario, se preserva
        if (protectedIds.has(id)) {
          cursor.continue();
          return;
        }

        store.delete(cursor.primaryKey);
        deleted++;
        cursor.continue();
      };
      req.onerror = () => resolve();
    });
  } catch (error) {
    if (import.meta.env.DEV) {
      console.warn("[LocalStore] Error al purgar caché de películas:", error);
    }
  }
}

/**
 * Recupera una ficha individual desde cached_movies.
 */
export async function getCachedMovie(id: number): Promise<CachedMovie | null> {
  try {
    const db = await openLocalDB();
    if (!db.objectStoreNames.contains(STORE_CACHED_MOVIES)) return null;

    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_CACHED_MOVIES, "readonly");
      const req = tx.objectStore(STORE_CACHED_MOVIES).get(id);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    });
  } catch {
    return null;
  }
}

/**
 * Recupera un conjunto de fichas desde cached_movies dados sus IDs.
 */
export async function getCachedMoviesByIds(ids: number[]): Promise<Map<number, CachedMovie>> {
  const result = new Map<number, CachedMovie>();
  if (!ids || ids.length === 0) return result;

  try {
    const db = await openLocalDB();
    if (!db.objectStoreNames.contains(STORE_CACHED_MOVIES)) return result;

    return new Promise((resolve) => {
      const tx = db.transaction(STORE_CACHED_MOVIES, "readonly");
      const store = tx.objectStore(STORE_CACHED_MOVIES);

      let pending = ids.length;
      const checkDone = () => {
        pending--;
        if (pending <= 0) resolve(result);
      };

      for (const id of ids) {
        const req = store.get(id);
        req.onsuccess = () => {
          if (req.result) {
            result.set(id, req.result);
          }
          checkDone();
        };
        req.onerror = () => checkDone();
      }
    });
  } catch {
    return result;
  }
}

/**
 * Obtiene los IDs de películas en la Watchlist utilizando el índice 'by_watchlist'.
 */
export async function getLocalWatchlistMovieIds(): Promise<number[]> {
  try {
    const db = await openLocalDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_USER_ENTRIES, "readonly");
      const store = tx.objectStore(STORE_USER_ENTRIES);
      const index = store.index("by_watchlist");
      const req = index.getAll(IDBKeyRange.only(true));

      req.onsuccess = () => {
        const rows: LocalUserEntry[] = req.result || [];
        const activeIds = rows
          .filter(r => r.syncStatus !== "deleted" && r.onWatchlist)
          .map(r => r.movieId);
        resolve(activeIds);
      };
      req.onerror = () => reject(req.error);
    });
  } catch {
    return [];
  }
}

/**
 * Obtiene los IDs de películas puntuadas utilizando el índice 'by_rating'.
 */
export async function getLocalRatedMovieIds(): Promise<number[]> {
  try {
    const db = await openLocalDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_USER_ENTRIES, "readonly");
      const store = tx.objectStore(STORE_USER_ENTRIES);
      const index = store.index("by_rating");
      // En IndexedDB, los números >= 1 son claves válidas
      const req = index.getAll(IDBKeyRange.lowerBound(1));

      req.onsuccess = () => {
        const rows: LocalUserEntry[] = req.result || [];
        const activeIds = rows
          .filter(r => r.syncStatus !== "deleted" && r.rating !== null)
          .map(r => r.movieId);
        resolve(activeIds);
      };
      req.onerror = () => reject(req.error);
    });
  } catch {
    return [];
  }
}

/**
 * Vacía completamente el almacén local (usado al cerrar sesión o en tests).
 */
export async function clearLocalStore(): Promise<void> {
  try {
    const db = await openLocalDB();
    return new Promise((resolve, reject) => {
      let isResolved = false;
      const safeResolve = () => {
        if (!isResolved) {
          isResolved = true;
          resolve();
        }
      };

      const storeNames = [STORE_USER_ENTRIES];
      if (db.objectStoreNames.contains(STORE_CACHED_MOVIES)) {
        storeNames.push(STORE_CACHED_MOVIES);
      }
      const tx = db.transaction(storeNames, "readwrite");
      const userClear = tx.objectStore(STORE_USER_ENTRIES).clear();
      if (userClear) {
        userClear.onsuccess = safeResolve;
      }
      if (db.objectStoreNames.contains(STORE_CACHED_MOVIES)) {
        tx.objectStore(STORE_CACHED_MOVIES).clear();
      }
      tx.oncomplete = safeResolve;
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    // Ignorar si la base de datos no está disponible
  }
}
