/// <reference types="vite/client" />

// =================================================================
//          EL MENSAJERO (API, Base de Datos y Caché)
// =================================================================
// Pide los datos a Supabase, pero usa memoria (Caché LRU) para 
// recordar lo que ya ha descargado y no pedirlo dos veces.
// =================================================================

import { CONFIG, IGNORED_ACTORS_SET, TEXT_FILTER_KEYS } from "./constants.js";
import { LRUCache } from "lru-cache";
import { createAbortableRequest, mapMoviePayload, normalizeText, parseYearRangeRaw } from "./utils.js";

import { getUserDataForMovie, updateUserDataForMovie, getAllUserMovieData, appEvents } from "./state.js";
import {
  ERROR_CODES,
  createAppError,
  isAbortError,
  normalizeMovieId,
  normalizeMovieQuery,
  normalizeMoviesResponse,
  normalizeUserMovieEntry,
  toAppError,
  toSlug,
} from "./contracts.js";
import { Movie, ActiveFilters, UserMovieEntry, ApiResponse, PersonDetails, MappedMovie } from "./types.js";
import { getSupabase } from "./supabaseClient.js";
import { getCurrentSession } from "./auth.js";
import { saveCachedMovies, getCachedMoviesByIds } from "./localStore.js";

// Re-exportamos getSupabase para preservar compatibilidad con tests y módulos externos
export { getSupabase };

// --- SISTEMA DE CACHÉ ---

// TTL de 30 minutos: el catálogo es estable y no requiere refresco inmediato.
export const queryCache = new LRUCache<string, ApiResponse>({
  max: 300, // Guardar hasta 300 páginas de resultados
  ttl: 1000 * 60 * 30,
  updateAgeOnGet: true,
});


// TTL corto (5 min): optimiza la escritura repetitiva sin consumir mucha memoria.
const suggestionsCache = new LRUCache<string, string[]>({
  max: 100,
  ttl: 1000 * 60 * 5,
});

// --- 3. PREPARAR DATOS Y LLAVES ---

export const parseYearRange = (y: string | null | undefined): { start: number | null; end: number | null } => {
  if (!y) return { start: null, end: null };
  const [min, max] = parseYearRangeRaw(y);
  return {
    start: min <= CONFIG.YEAR_MIN ? null : min,
    end: max >= CONFIG.YEAR_MAX ? null : max
  };
};

// Crea una firma única para recordar una búsqueda exacta (Ej: "accion-pagina-2")
export const createCanonicalCacheKey = (filters: ActiveFilters & { explicitOffset?: number | null }, page: number, pageSize: number): string => {
  const norm: Record<string, unknown> = {};

  Object.keys(filters).sort().forEach(k => {
    const v = filters[k as keyof ActiveFilters];

    // Ignorar valores nulos, vacíos o arrays sin longitud
    if (v === null || v === undefined || v === "" || (Array.isArray(v) && v.length === 0)) return;

    if (Array.isArray(v)) {
      // Clonar profundamente el array de strings/numbers convirtiéndolos a texto plano para evitar mutación externa
      const clonedArray = v.map(x => (x !== null && x !== undefined) ? String(x) : "");

      if (TEXT_FILTER_KEYS.has(k)) {
        norm[k] = clonedArray.map(x => x.trim().toLowerCase()).sort();
      } else {
        norm[k] = clonedArray.sort();
      }
    } else if (typeof v === "object") {
      // Clonado JSON profundo preventivo por si el filtro se expande con sub-estructuras
      norm[k] = JSON.parse(JSON.stringify(v));
    } else {
      // Tratamiento seguro de tipos primitivos
      norm[k] = TEXT_FILTER_KEYS.has(k) ? String(v).trim().toLowerCase() : v;
    }
  });

  return JSON.stringify({ filters: norm, page, pageSize });
};

// Traduce lo que pide el usuario al idioma que entiende el servidor SQL
export function stateToRpcParams(
  activeFilters: ActiveFilters,
  currentPage: number,
  pageSize: number,
  requestCount: boolean,
  explicitOffset: number | null
): Record<string, unknown> {
  const { start: yearStart, end: yearEnd } = parseYearRange(activeFilters.year);
  const [sortField = "relevance", sortDirection = "asc"] = (activeFilters.sort || "relevance,asc").split(",");
  const offset = explicitOffset !== null ? explicitOffset : (currentPage - 1) * pageSize;

  return {
    search_term: activeFilters.searchTerm || null,
    genre_name: activeFilters.genre ? activeFilters.genre.trim() || null : null,
    p_year_start: yearStart,
    p_year_end: yearEnd,
    country_name: activeFilters.country || null,
    p_country_codes: null,
    director_name: activeFilters.director || null,
    actor_name: activeFilters.actor || null,
    media_type: activeFilters.mediaType || "all",
    p_selection_code: activeFilters.selection || null,
    p_studio_code: activeFilters.studio || null,
    excluded_genres: activeFilters.excludedGenres && activeFilters.excludedGenres.length > 0 ? activeFilters.excludedGenres : null,
    excluded_countries: activeFilters.excludedCountries && activeFilters.excludedCountries.length > 0 ? activeFilters.excludedCountries : null,
    sort_field: sortField,
    sort_direction: sortDirection,
    page_limit: (pageSize && pageSize > 0) ? pageSize : 42,
    page_offset: offset,
    get_count: requestCount
  };
}

// Evita que pidamos exactamente los mismos datos a la BD dos veces al mismo tiempo
const inFlightRequests = new Map<string, Promise<ApiResponse>>();

import type { SupabaseMovieRow } from "./types.js";

export type RawMovieRow = Partial<SupabaseMovieRow> & Record<string, unknown>;

/**
 * Normaliza una fila cruda de la tabla movies o un join de Supabase al tipo unificado Movie.
 * Efecto secundario: Si mRaw contiene la propiedad user_movie_entries, sincroniza
 * automáticamente el estado global de valoraciones del usuario (userMovieData).
 */
export function shapeRawMovieRow(mRaw: unknown): Movie {
  const m = (mRaw || {}) as RawMovieRow;

  if (m.id && m.user_movie_entries) {
    const rawEntry = Array.isArray(m.user_movie_entries) ? m.user_movie_entries[0] : m.user_movie_entries;
    if (rawEntry && typeof rawEntry === "object") {
      const existing = getUserDataForMovie(m.id);
      if (!existing) {
        updateUserDataForMovie(m.id, { rating: rawEntry.rating, onWatchlist: rawEntry.on_watchlist });
      }
    }
  }

  const isSeries = m.type && String(m.type).toLowerCase().startsWith("s");
  const fallbackSlug = m.title ? `${toSlug(String(m.title))}${m.year ? `-${m.year}` : ""}` : "";
  const slug = (typeof m.slug === "string" && m.slug.length > 0) ? m.slug : fallbackSlug;

  const item: Record<string, unknown> = {
    ...m,
    slug,
    genres: (m.genres || m.genres_list || null),
    directors: (m.directors || m.directors_list || null),
    actors: (m.actors || m.actors_list || null),
    genres_list: (m.genres_list || m.genres || null),
    directors_list: (m.directors_list || m.directors || null),
    actors_list: (m.actors_list || m.actors || null),
    original_title: m.original_title || m.title || null,
    year_end: isSeries ? m.year_end : null,
    episodes: isSeries ? m.episodes : null,
    country: m.countries?.name || m.country || null,
    country_code: m.countries?.code || m.country_code || null,
    last_synced_at: typeof m.last_synced_at === "number"
      ? m.last_synced_at
      : (m.last_synced_at ? Math.floor(new Date(m.last_synced_at).getTime() / 1000) : 0)
  };

  delete item.countries;
  delete item.user_movie_entries;
  return item as unknown as Movie;
}


/**
 * Invoca el motor de búsqueda del catálogo público utilizando el endpoint perimetral
 * optimizado con Edge Caching (/api/rpc/search_movies_offset) cuando se ejecuta en el navegador.
 * Dispone de fallback resiliente transparente hacia Supabase SDK directo en caso de error o tests.
 */
async function executeCatalogRpc(
  rpcParams: Record<string, unknown>,
  signal?: AbortSignal | null,
  passedSupabase?: any
): Promise<{ data: any; error: any }> {
  const globalProc = (globalThis as unknown as { process?: { env?: Record<string, string | undefined> } })?.process;
  const isBrowser = typeof window !== "undefined" && typeof window.fetch === "function";
  const isTest = Boolean(globalProc?.env?.NODE_ENV === "test") || Boolean((globalThis as unknown as Record<string, unknown>)?._isTestEnv);

  if (isBrowser && !isTest) {
    try {
      const response = await fetch("/api/rpc/search_movies_offset", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "apikey": CONFIG.SUPABASE_ANON_KEY,
        },
        body: JSON.stringify(rpcParams),
        signal: signal ?? undefined,
      });

      if (response.ok) {
        const data = await response.json();
        return { data, error: null };
      }
    } catch (e: any) {
      if (signal?.aborted || e?.name === "AbortError") {
        throw { name: "AbortError" };
      }
    }
  }

  const supabase = passedSupabase || await getSupabase();
  let query = supabase.rpc("search_movies_offset", rpcParams);
  if (signal) query = query.abortSignal(signal);
  return await query;
}

/**
 * Construye la respuesta de Mi Lista directamente desde IndexedDB y memoria (Local-First),
 * permitiendo render instantáneo (0 ms) en modo offline, degradación de red o precarga.
 */
export async function getLocalMyListResponse(
  filters: ActiveFilters,
  page: number,
  pageSize: number,
  requestCount: boolean
): Promise<ApiResponse | null> {
  try {
    const userEntries = getAllUserMovieData();
    const targetIds: number[] = [];

    for (const [idStr, entry] of Object.entries(userEntries)) {
      if (!entry) continue;
      const id = Number(idStr);
      if (!Number.isFinite(id)) continue;

      if (filters.myList === "watchlist" && entry.onWatchlist) {
        targetIds.push(id);
      } else if (filters.myList === "rated" && entry.rating !== null) {
        targetIds.push(id);
      } else if (filters.myList === "mixed" && (entry.onWatchlist || entry.rating !== null)) {
        targetIds.push(id);
      }
    }

    if (targetIds.length === 0) {
      return { total: 0, items: [] };
    }

    // Recuperar las fichas disponibles en cached_movies
    const cachedMap = await getCachedMoviesByIds(targetIds);
    if (cachedMap.size === 0) return null;
    if (cachedMap.size < targetIds.length) return null;

    // Mapear a MappedMovie
    const availableMovies: MappedMovie[] = [];
    for (const id of targetIds) {
      const rawMovie = cachedMap.get(id);
      if (rawMovie) {
        availableMovies.push(mapMoviePayload(shapeRawMovieRow(rawMovie)));
      }
    }

    if (availableMovies.length === 0) return null;

    // Filtrar por tipo de medio (mediaType)
    let filtered = availableMovies;
    if (filters.mediaType === "movies") {
      filtered = filtered.filter(m => !m.isSeries && (!m.type || !m.type.toLowerCase().startsWith("s")));
    } else if (filters.mediaType === "series") {
      filtered = filtered.filter(m => m.isSeries || (m.type && m.type.toLowerCase().startsWith("s")));
    }

    // Ordenar según filters.sort
    const [sortField, sortDirection] = (filters.sort || "relevance,asc").split(",");
    const isAsc = sortDirection === "asc";

    filtered.sort((a, b) => {
      const valA: any = (a as any)[sortField];
      const valB: any = (b as any)[sortField];

      const aHasVal = valA !== undefined && valA !== null;
      const bHasVal = valB !== undefined && valB !== null;

      if (aHasVal && !bHasVal) return -1;
      if (!aHasVal && bHasVal) return 1;

      if (aHasVal && bHasVal) {
        if (typeof valA === "string") {
          const cmp = valA.localeCompare(valB, "es", { sensitivity: "base" });
          if (cmp !== 0) return isAsc ? cmp : -cmp;
        } else {
          const diff = isAsc ? valA - valB : valB - valA;
          if (diff !== 0) return diff;
        }
      }

      // Desempate canónico idéntico a PostgreSQL (ORDER BY ... ASC, id ASC)
      return a.id - b.id;
    });

    const total = requestCount ? filtered.length : -1;
    const start = (page - 1) * pageSize;
    const items = filtered.slice(start, start + pageSize);

    return normalizeMoviesResponse({ total, items });
  } catch {
    return null;
  }
}

/**
 * Revalida Mi Lista en segundo plano contra Supabase sin bloquear el hilo principal.
 * Si detecta novedades o discrepancias respecto a la caché local, actualiza IndexedDB
 * y emite 'userDataUpdated' para refrescar el estado de la UI.
 */
function revalidateMyListInBackground(
  userId: string,
  filters: ActiveFilters,
  page: number,
  pageSize: number,
  requestCount: boolean,
  currentLocalRes: ApiResponse
): void {
  setTimeout(async () => {
    try {
      const supabase = await getSupabase();
      let query = supabase
        .from('movies')
        .select(`
          id, title, original_title, year, year_end, type, relevance,
          genres:genres_list, directors:directors_list, actors:actors_list, 
          minutes, slug, fa_id, fa_rating, fa_votes, 
          imdb_id, imdb_rating, imdb_votes, avg_rating, 
          synopsis, thumbhash_st, last_synced_at, 
          episodes, wikipedia, selections_list, studios_list, justwatch,
          countries(name, code),
          user_movie_entries!inner(user_id, rating, on_watchlist)
        `, requestCount ? { count: 'exact' } : {})
        .eq('user_movie_entries.user_id', userId);

      if (filters.myList === 'rated') query = query.not('user_movie_entries.rating', 'is', null);
      else if (filters.myList === 'watchlist') query = query.eq('user_movie_entries.on_watchlist', true);
      else query = query.or('on_watchlist.eq.true,rating.not.is.null', { referencedTable: 'user_movie_entries' });

      if (filters.mediaType === 'movies') query = query.or('type.is.null,type.not.ilike.S%');
      else if (filters.mediaType === 'series') query = query.ilike('type', 'S%');

      const [sortField, sortDirection] = (filters.sort || "relevance,asc").split(",");
      if (sortField === 'relevance') query = query.order('relevance', { ascending: true }).order('id', { ascending: true });
      else query = query.order(sortField, { ascending: sortDirection === 'asc', nullsFirst: false }).order('id', { ascending: true });

      const start = (page - 1) * pageSize;
      const { data, error, count } = await query.range(start, start + pageSize - 1);

      if (error || !data) return;

      const remoteItems = (data || []).map(mRaw => mapMoviePayload(shapeRawMovieRow(mRaw)));
      if (remoteItems.length > 0) {
        saveCachedMovies(remoteItems).catch(() => {});
      }

      const localIds = (currentLocalRes.items || []).map(m => m.id);
      const remoteIds = remoteItems.map(m => m.id);
      const hasDifferences = localIds.length !== remoteIds.length ||
        localIds.some((id, idx) => id !== remoteIds[idx]) ||
        (requestCount && count !== undefined && count !== currentLocalRes.total);

      if (hasDifferences) {
        const queryKey = createCanonicalCacheKey({ ...filters }, page, pageSize);
        queryCache.set(queryKey, normalizeMoviesResponse({ total: count ?? -1, items: remoteItems }));
        appEvents.emit("userDataUpdated");
      }
    } catch {
      // Silenciar errores en segundo plano sin alterar la experiencia visual
    }
  }, 50);
}

// Trae las películas principales para pintar el muro
export function fetchMovies(
  activeFilters: Partial<ActiveFilters>,
  currentPage: number,
  pageSize: number = CONFIG.ITEMS_PER_PAGE,
  signal?: AbortSignal | null,
  requestCount: boolean = true,
  explicitOffset: number | null = null
): Promise<ApiResponse> {
  const request = normalizeMovieQuery({ activeFilters, currentPage, pageSize, requestCount, explicitOffset });
  const normFilters = request.activeFilters;
  const normPage = request.currentPage;
  const normPageSize = request.pageSize;
  const normRequestCount = request.requestCount;
  const normExplicitOffset = request.explicitOffset;

  // Excluir requestCount de la firma de caché para evitar duplicación de slots en la caché LRU
  const queryKey = createCanonicalCacheKey({ ...normFilters, explicitOffset: normExplicitOffset }, normPage, normPageSize);

  if (!normFilters.myList) {
    const cached = queryCache.get(queryKey);
    // Servimos de la caché solo si no se requiere conteo (requestCount=false) o si ya tenemos el conteo exacto válido
    if (cached && (!normRequestCount || cached.total >= 0)) {
      return Promise.resolve(cached);
    }
  }

  const inFlightPromise = inFlightRequests.get(queryKey);
  if (inFlightPromise) {
    return inFlightPromise.then(res => {
      // Si la petición previa en vuelo fue cancelada por otro contexto pero el llamador actual
      // sigue activo (su signal NO está abortado), lanzamos una petición limpia e independiente.
      if (res.aborted && signal && !signal.aborted) {
        return fetchMovies(activeFilters, currentPage, pageSize, signal, requestCount, explicitOffset);
      }
      // Si la petición previa en vuelo se resolvió sin conteo (total < 0) pero el llamador actual
      // requiere explícitamente el conteo real, lanzamos la consulta con conteo:
      if (normRequestCount && res.total < 0 && !res.aborted && (!signal || !signal.aborted)) {
        return fetchMovies(activeFilters, currentPage, pageSize, signal, true, explicitOffset);
      }
      return res;
    });
  }

  let promise!: Promise<ApiResponse>;
  promise = (async () => {

    try {
      // MODO A: MI LISTA (Películas privadas del usuario)
      if (normFilters.myList) {
        const isOffline = typeof navigator !== "undefined" && !navigator.onLine;

        // 1. Intento de resolución Local-First (0 ms) si tenemos los datos completos en IndexedDB
        const localRes = await getLocalMyListResponse(normFilters, normPage, normPageSize, normRequestCount);

        if (localRes !== null) {
          if (!isOffline) {
            // Revalidación asíncrona transparente en segundo plano (patrón SWR)
            getCurrentSession().then(session => {
              if (session?.user) {
                revalidateMyListInBackground(session.user.id, normFilters, normPage, normPageSize, normRequestCount, localRes);
              }
            }).catch(() => {});
          }
          return localRes;
        }

        // 2. Si la caché local es insuficiente o está vacía, acudimos a la red
        if (isOffline) {


          return { total: 0, items: [] };
        }

        const session = await getCurrentSession();
        if (!session?.user) {



          return { total: 0, items: [] };
        }

        try {
          const supabase = await getSupabase();
          let query = supabase
            .from('movies')
            .select(`
              id, title, original_title, year, year_end, type, relevance,
          genres:genres_list, directors:directors_list, actors:actors_list, 
              minutes, slug, fa_id, fa_rating, fa_votes, 
              imdb_id, imdb_rating, imdb_votes, avg_rating, 
              synopsis, thumbhash_st, last_synced_at, 
              episodes, wikipedia, selections_list, studios_list, justwatch,
              countries(name, code),
              user_movie_entries!inner(user_id, rating, on_watchlist)
            `, normRequestCount ? { count: 'exact' } : {})
            .eq('user_movie_entries.user_id', session.user.id);

          if (signal) query = query.abortSignal(signal);

          if (normFilters.myList === 'rated') query = query.not('user_movie_entries.rating', 'is', null);
          else if (normFilters.myList === 'watchlist') query = query.eq('user_movie_entries.on_watchlist', true);
          else query = query.or('on_watchlist.eq.true,rating.not.is.null', { referencedTable: 'user_movie_entries' });

          if (normFilters.mediaType === 'movies') query = query.or('type.is.null,type.not.ilike.S%');
          else if (normFilters.mediaType === 'series') query = query.ilike('type', 'S%');

          const [sortField, sortDirection] = (normFilters.sort || "relevance,asc").split(",");
          if (sortField === 'relevance') query = query.order('relevance', { ascending: true }).order('id', { ascending: true });
      else query = query.order(sortField, { ascending: sortDirection === 'asc', nullsFirst: false }).order('id', { ascending: true });

          const start = (normPage - 1) * normPageSize;
          const { data, error, count } = await query.range(start, start + normPageSize - 1);

          if (error) {
            if (isAbortError(error, signal)) throw { name: "AbortError" };
            // Resiliencia: si Supabase devuelve error de red/timeout, recurrir a la caché local
            const fallbackRes = await getLocalMyListResponse(normFilters, normPage, normPageSize, normRequestCount);
            if (fallbackRes && fallbackRes.items.length > 0) return fallbackRes;
            throw toAppError(error, ERROR_CODES.DATABASE, "No se pudo cargar tu lista.");
          }

          const items = (data || []).map(mRaw => mapMoviePayload(shapeRawMovieRow(mRaw)));

          if (items.length > 0) {
            saveCachedMovies(items).catch(() => {});
          }

          return normalizeMoviesResponse({ total: normRequestCount ? (count || 0) : -1, items });
        } catch (err: any) {
          if (isAbortError(err, signal)) throw err;
          const fallbackRes = await getLocalMyListResponse(normFilters, normPage, normPageSize, normRequestCount);
          if (fallbackRes && fallbackRes.items.length > 0) return fallbackRes;
          throw err;
        }
      }

      // MODO B: CATÁLOGO PÚBLICO (Motor potente con reintento resiliente para cold-starts)
      const rpcParams = stateToRpcParams(normFilters, normPage, normPageSize, normRequestCount, normExplicitOffset);
      let data: any = null;
      let error: any = null;
      const MAX_RETRIES = 2;

      for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
        if (signal?.aborted) throw { name: "AbortError" };

        const response = await executeCatalogRpc(rpcParams, signal);
        data = response.data;
        error = response.error;

        if (!error) break;

        // Si fue cancelado por el usuario o por cambio de navegación, salir sin reintentar
        if (isAbortError(error, signal)) {
          throw { name: "AbortError" };
        }

        // Si no es el último intento, esperar antes de reintentar (300ms, 600ms)
        if (attempt < MAX_RETRIES) {
          const delay = (attempt + 1) * 300;
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }

      if (error) {
        if (isAbortError(error, signal)) throw { name: "AbortError" };
        throw createAppError(ERROR_CODES.DATABASE, "No se pudo conectar con el catálogo. Inténtalo de nuevo.", error);
      }

      const rawItems = (data?.items || []).map((mRaw: unknown) => shapeRawMovieRow(mRaw));
      const result = normalizeMoviesResponse({ total: data?.total ?? -1, items: rawItems }, mapMoviePayload);

      if (!signal?.aborted) {
        // Si ya hay un total real guardado en la caché y la consulta actual devolvió total=-1, preservamos el conteo previo
        const existing = queryCache.get(queryKey);
        if (existing && existing.total >= 0 && result.total < 0) {
          result.total = existing.total;
        }
        queryCache.set(queryKey, result);
      }
      return result;

    } catch (error: unknown) {
      if (isAbortError(error, signal)) return { aborted: true, items: [], total: -1 };
      throw toAppError(error, ERROR_CODES.UNKNOWN);
    } finally {
      if (inFlightRequests.get(queryKey) === promise) inFlightRequests.delete(queryKey);
    }
  })();

  inFlightRequests.set(queryKey, promise);
  return promise;
}



const NOT_FOUND = Symbol("person-not-found");
// Memoria para los VIPs (Actores/Directores). Máximo 50 a la vez para no ahogar el móvil.
const personCache = new LRUCache<string, PersonDetails | typeof NOT_FOUND>({
  max: 50,
  ttl: 1000 * 60 * 60,
});

// Saca la foto y la fecha de nacimiento de un VIP cuando le clicas
export async function fetchPersonDetails(type: 'director' | 'actor', name: string): Promise<PersonDetails | null> {
  if (!name) return null;
  const key = `${type}:${name}`;
  if (personCache.has(key)) {
    const cached = personCache.get(key);
    return cached === NOT_FOUND ? null : (cached ?? null);
  }

  const roleTypes = type === 'director' ? ['D', 'DA', 'AD'] : ['A', 'AD', 'DA'];
  const nameNorm = normalizeText(name);
  const words = nameNorm.split(/[\s-]+/).filter(w => w.length > 0);
  const wildcardPattern = words.length > 0 ? `%${words.join('%')}%` : `%${nameNorm}%`;

  try {
    const supabase = await getSupabase();
    const safeNameNorm = `"${nameNorm.replace(/"/g, '""')}"`;
    const safeNameLike = `"%${name.replace(/"/g, '""')}%"`;

    const selectFields = 'id, name, slug, type, vip, thumbhash_st, birthday, deathday, place_of_birth, biography, titulo_bio, countries(name, code), components';

    // 1. Intento de coincidencia exacta prioritario (name_norm o components para colectivos) filtrado por tipo de rol
    let primaryRes = await supabase
      .from('people')
      .select(selectFields)
      .in('type', roleTypes)
      .or(type === 'director' ? `name_norm.eq.${safeNameNorm},components.ilike.${safeNameLike}` : `name_norm.eq.${safeNameNorm}`)
      .limit(1);

    // 2. Si no hay coincidencia exacta (ej. slug parcial o variantes), fallback con todas las palabras
    if (!primaryRes.data || (Array.isArray(primaryRes.data) && primaryRes.data.length === 0)) {
      primaryRes = await supabase
        .from('people')
        .select(selectFields)
        .in('type', roleTypes)
        .ilike('name_norm', wildcardPattern)
        .limit(1);
    }

    const rawData = primaryRes.data as unknown;
    const rowData = (Array.isArray(rawData) ? rawData[0] : rawData) as Record<string, any> | null;

    if (primaryRes.error || !rowData) {
      if (primaryRes.error && import.meta.env.DEV) {
        console.warn(`[API] Error al cargar detalles de la persona (${type}: ${name}):`, primaryRes.error);
      }
      personCache.set(key, NOT_FOUND);
      return null;
    }

    const hasBothRoles = rowData.type === 'AD' || rowData.type === 'DA';
    const rawCountries = rowData.countries || null;
    const countries = (Array.isArray(rawCountries) ? rawCountries[0] || null : rawCountries) as { name: string; code: string } | null;

    const personData: PersonDetails = {
      ...(rowData as unknown as PersonDetails),
      slug: (rowData.slug || null) as string | null,
      thumbhash_st: (rowData.thumbhash_st || null) as string | null,
      birthday: (rowData.birthday || null) as string | null,
      deathday: (rowData.deathday || null) as string | null,
      place_of_birth: (rowData.place_of_birth || null) as string | null,
      biography: (rowData.biography || null) as string | null,
      titulo_bio: (rowData.titulo_bio || null) as string | null,
      countries,
      hasBothRoles,
      currentRole: type
    };

    personCache.set(key, personData);
    return personData;
  } catch (e) {
    if (import.meta.env.DEV) {
      console.error(`[API] Excepción capturada en fetchPersonDetails (${type}: ${name}):`, e);
    }
    personCache.set(key, NOT_FOUND);
    return null;
  }
}

const groupDetailsCache = new Map<string, { thumbhash_st: string | null } | null>();

/**
 * Consulta los detalles (incluyendo thumbhash_st / thumbhash) de un estudio o selección en BD.
 */
export async function fetchGroupDetails(
  type: "studio" | "selection",
  code: string
): Promise<{ thumbhash_st: string | null } | null> {
  const normCode = code.toLowerCase().trim();
  const cacheKey = `${type}:${normCode}`;
  if (groupDetailsCache.has(cacheKey)) {
    return groupDetailsCache.get(cacheKey) || null;
  }

  const supabase = await getSupabase();
  if (!supabase) return null;

  try {
    const table = type === "studio" ? "studios" : "selections";
    const { data, error } = await supabase
      .from(table)
      .select("code, thumbhash_st")
      .eq("code", normCode)
      .maybeSingle();

    if (error) {
      if (import.meta.env.DEV) {
        console.warn(`[API] Error consultando ${table} (${normCode}):`, error.message);
      }
      return null;
    }

    const row = data as { thumbhash_st?: string | null } | null;
    const thumbhash_st = row ? (row.thumbhash_st || null) : null;
    const result = { thumbhash_st };
    groupDetailsCache.set(cacheKey, result);
    return result;
  } catch (e) {
    if (import.meta.env.DEV) {
      console.error(`[API] Excepción capturada en fetchGroupDetails (${type}: ${normCode}):`, e);
    }
    return null;
  }
}

// Guarda en BD que le has puesto 5 estrellas o la has metido en pendientes
export async function setUserMovieDataAPI(movieId: number | string, partialData: Partial<UserMovieEntry>): Promise<void> {
  const normalizedMovieId = normalizeMovieId(movieId);
  if (!normalizedMovieId) throw createAppError(ERROR_CODES.VALIDATION, "Película inválida.");

  const supabase = await getSupabase();

  const session = await getCurrentSession();
  if (!session || !session.user) throw createAppError(ERROR_CODES.AUTH_REQUIRED, "Debes iniciar sesión.");

  const currentState = getUserDataForMovie(normalizedMovieId) || { rating: null, onWatchlist: false };
  const mergedData = normalizeUserMovieEntry({ ...currentState, ...partialData });

  // Si ambas acciones quedan inactivas (sin nota y sin watchlist), eliminamos la fila para no dejar filas vacías
  if (mergedData.rating === null && !mergedData.onWatchlist) {
    const { error } = await supabase
      .from('user_movie_entries')
      .delete()
      .match({ user_id: session.user.id, movie_id: normalizedMovieId });
    if (error) throw createAppError(ERROR_CODES.DATABASE, "No se pudo actualizar tu acción.", error);
    return;
  }

  const payload = {
    user_id: session.user.id,
    movie_id: normalizedMovieId,
    rating: mergedData.rating,
    on_watchlist: mergedData.onWatchlist,
    updated_at: new Date().toISOString()
  };

  const { error } = await supabase.from('user_movie_entries').upsert(payload, { onConflict: 'user_id, movie_id' });
  if (error) throw createAppError(ERROR_CODES.DATABASE, "No se pudo guardar tu acción.", error);
}

// --- SUGERENCIAS (AUTOCOMPLETE) ---

const fetchSuggestions = async (rpcName: string, searchTerm: string): Promise<string[]> => {
  if (!searchTerm || searchTerm.length < 2) return [];

  const cacheKey = `suggest:${rpcName}:${searchTerm.toLowerCase()}`;
  if (suggestionsCache.has(cacheKey)) return suggestionsCache.get(cacheKey) || [];

  // Evitar solapamientos si el usuario escribe muy rápido
  const controller = createAbortableRequest(`suggestion-${rpcName}`);

  try {
    const supabase = await getSupabase();

    const { data, error } = await supabase.rpc(rpcName, { search_term: searchTerm }).abortSignal(controller.signal);

    if (error) {
      if (isAbortError(error, controller.signal)) return [];
      if (import.meta.env.DEV) {
        console.warn(`[API] Error al cargar sugerencias para ${rpcName} ("${searchTerm}"):`, error);
      }
      return [];
    }

    const results = (data as Array<{ suggestion: string }> || []).map(item => item.suggestion);

    suggestionsCache.set(cacheKey, results);
    return results;
  } catch (error) {
    if (isAbortError(error, controller.signal)) return [];
    if (import.meta.env.DEV) {
      console.error(`[API] Excepción capturada en fetchSuggestions (${rpcName} para "${searchTerm}"):`, error);
    }
    return [];
  }
};

export const fetchGenreSuggestions = (term: string) => fetchSuggestions("get_genre_suggestions", term);
export const fetchDirectorSuggestions = (term: string) => fetchSuggestions("get_director_suggestions", term);
export const fetchCountrySuggestions = (term: string) => fetchSuggestions("get_country_suggestions", term);
export const fetchActorSuggestions = async (term: string): Promise<string[]> => {
  const suggestions = await fetchSuggestions("get_actor_suggestions", term);
  // Filtrar actores ignorados (animación, etc.)
  return suggestions.filter(name => !IGNORED_ACTORS_SET.has(name.trim().toLowerCase()));
};

/**
 * Obtiene el detalle completo de una única película por su ID.
 * Útil cuando el usuario accede por enlace directo a la SPA con ?movie={id}.
 */
export async function fetchMovieById(id: number | string): Promise<MappedMovie | null> {
  const normId = Number(id);
  if (!normId || isNaN(normId)) return null;

  try {
    const supabaseClient = await getSupabase();
    const { data, error } = await supabaseClient
      .from("movies")
      .select("*, countries(name, code)")
      .eq("id", normId)
      .maybeSingle();

    if (error || !data) return null;
    return mapMoviePayload(shapeRawMovieRow(data));
  } catch {
    return null;
  }
}
