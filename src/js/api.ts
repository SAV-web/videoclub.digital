/// <reference types="vite/client" />

// =================================================================
//          EL MENSAJERO (API, Base de Datos y Caché)
// =================================================================
// Pide los datos a Supabase, pero usa memoria (Caché LRU) para 
// recordar lo que ya ha descargado y no pedirlo dos veces.
// =================================================================

import { CONFIG, IGNORED_ACTORS, REGIONAL_GROUPS } from "./constants.js";
import { LRUCache } from "lru-cache";
import { createAbortableRequest, mapMoviePayload, normalizeText } from "./utils.js";
// @ts-ignore (state.js es un archivo JS híbrido por ahora)
import { getUserDataForMovie } from "./state.js";
import {
  ERROR_CODES,
  createAppError,
  isAbortError,
  normalizeMovieId,
  normalizeMovieQuery,
  normalizeMoviesResponse,
  normalizeUserMovieData,
  normalizeUserMovieEntry,
  toAppError,
} from "./contracts.js";
import { Movie, ActiveFilters, UserMovieEntry, ApiResponse, PersonDetails } from "./types.js";
import type { SupabaseClient } from "@supabase/supabase-js";

// Set estático para normalizar caché (Campos de texto libre)
const CANONICAL_TEXT_FIELDS = new Set<string>(['searchTerm', 'genre', 'country', 'director', 'actor', 'excludedGenres', 'excludedCountries']);

const notConfiguredError = () => Promise.reject(createAppError(ERROR_CODES.CONFIGURATION, "Supabase no configurado (Faltan credenciales)"));

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
  }
};

let supabasePromise: Promise<SupabaseClient> | null = null;

// 1. CARGA DIFERIDA DE LA BASE DE DATOS (Solo descarga Supabase cuando hace falta)
export function getSupabase(): Promise<SupabaseClient> {
  if (!supabasePromise) {
    supabasePromise = (async () => {
      const { SUPABASE_URL: url, SUPABASE_ANON_KEY: key } = CONFIG;

      if (url && key) {
        const { createClient } = await import("@supabase/supabase-js");
        return createClient(url, key, {
          auth: {
            persistSession: true,
            storage: customAuthStorage
          }
        });
      } else {
        const mockClient = {
          // Mock falso para que la web arranque aunque no haya claves de BD puestas
          rpc: notConfiguredError,
          from: () => ({ select: notConfiguredError, upsert: notConfiguredError }),
          auth: {
            getSession: () => Promise.resolve({ data: { session: null }, error: null }),
            onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
            signInWithPassword: notConfiguredError,
            signUp: notConfiguredError,
            signOut: notConfiguredError,
            resetPasswordForEmail: notConfiguredError,
            updateUser: notConfiguredError
          }
        };
        return mockClient as unknown as SupabaseClient;
      }
    })();
  }
  return supabasePromise;
}

// --- SISTEMA DE CACHÉ ---

// TTL de 30 minutos: el catálogo es estable y no requiere refresco inmediato.
export const queryCache = new LRUCache<string, ApiResponse>({
  max: 300, // Guardar hasta 300 páginas de resultados
  ttl: 1000 * 60 * 30, 
  updateAgeOnGet: true,
  ttlAutopurge: true,
});

// TTL corto (5 min): optimiza la escritura repetitiva sin consumir mucha memoria.
const suggestionsCache = new LRUCache<string, string[]>({
  max: 100,
  ttl: 1000 * 60 * 5,
});

// --- 3. PREPARAR DATOS Y LLAVES ---

// Saca el principio y fin de un texto como "2010-2020"
const parseYearRange = (y: string | null | undefined): { start: number | null; end: number | null } => {
  if (!y) return { start: null, end: null };
  const p = y.split("-").map(Number);
  return { start: p[0] || null, end: (p.length > 1 ? p[1] : p[0]) || null };
};

// Crea una firma única para recordar una búsqueda exacta (Ej: "accion-pagina-2")
const createCanonicalCacheKey = (filters: ActiveFilters, page: number, pageSize: number): string => {
  const norm: Record<string, unknown> = {};
  
  Object.keys(filters).sort().forEach(k => {
    const v = filters[k as keyof ActiveFilters];
    
    // Ignorar valores nulos, vacíos o arrays sin longitud
    if (v === null || v === undefined || v === "" || (Array.isArray(v) && v.length === 0)) return;
    
    if (Array.isArray(v)) {
      // Clonar profundamente el array de strings/numbers convirtiéndolos a texto plano para evitar mutación externa
      const clonedArray = v.map(x => (x !== null && x !== undefined) ? String(x) : "");
      
      if (CANONICAL_TEXT_FIELDS.has(k)) {
        norm[k] = clonedArray.map(x => x.trim().toLowerCase()).sort();
      } else {
        norm[k] = clonedArray.sort();
      }
    } else if (typeof v === "object") {
      // Clonado JSON profundo preventivo por si el filtro se expande con sub-estructuras
      norm[k] = JSON.parse(JSON.stringify(v));
    } else {
      // Tratamiento seguro de tipos primitivos
      norm[k] = CANONICAL_TEXT_FIELDS.has(k) ? String(v).trim().toLowerCase() : v;
    }
  });
  
  return JSON.stringify({ filters: norm, page, pageSize });
};

// Traduce lo que pide el usuario al idioma que entiende el servidor SQL
function stateToRpcParams(
  activeFilters: ActiveFilters, 
  currentPage: number, 
  pageSize: number, 
  requestCount: boolean, 
  explicitOffset: number | null
): Record<string, unknown> {
  const { start: yearStart, end: yearEnd } = parseYearRange(activeFilters.year);
  const [sortField = "relevance", sortDirection = "asc"] = (activeFilters.sort || "relevance,asc").split(",");
  const offset = explicitOffset !== null ? explicitOffset : (currentPage - 1) * pageSize;

  const region = Object.values(REGIONAL_GROUPS).find(r => r.value === activeFilters.country);

  return {
    search_term: activeFilters.searchTerm || null,
    genre_name: activeFilters.genre || null,
    p_year_start: yearStart,
    p_year_end: yearEnd,
    country_name: region ? null : activeFilters.country,
    p_country_codes: region ? region.codes : null,
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
  if (inFlightPromise) return inFlightPromise;

  const promise = (async () => {
    const supabase = await getSupabase();
    
    try {
      // MODO A: MI LISTA (Películas privadas del usuario)
      if (normFilters.myList) {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.user) return { total: 0, items: [] };

        let query = supabase
          .from('movies')
          .select(`
            id, title, original_title, year, year_end, type, 
            genres:genres_list, directors:directors_list, actors:actors_list, 
            minutes, image, fa_id, fa_rating, fa_votes, 
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
        if (sortField === 'relevance') query = query.order('relevance', { ascending: true });
        else query = query.order(sortField, { ascending: sortDirection === 'asc', nullsFirst: false });

        const start = (normPage - 1) * normPageSize;
        const { data, error, count } = await query.range(start, start + normPageSize - 1);

        if (error) throw (isAbortError(error, signal) ? { name: "AbortError" } : toAppError(error, ERROR_CODES.DATABASE, "No se pudo cargar tu lista."));

        const items = (data || []).map((mRaw: unknown) => {
          const m = mRaw as Record<string, unknown> & {
            type?: string | null;
            original_title?: string | null;
            title?: string | null;
            year_end?: string | null;
            episodes?: number | null;
            countries?: { name: string; code: string } | null;
            last_synced_at?: string | null;
          };
          const isSeries = m.type && String(m.type).toLowerCase().startsWith('s');
          const item = {
            ...m,
            original_title: (m.original_title && m.title && m.original_title.toLowerCase() === m.title.toLowerCase()) ? null : m.original_title,
            year_end: isSeries ? m.year_end : null,
            episodes: isSeries ? m.episodes : null,
            country: m.countries?.name || null,
            country_code: m.countries?.code || null,
            last_synced_at: m.last_synced_at ? Math.floor(new Date(m.last_synced_at).getTime() / 1000) : null
          };
          delete item.countries;
          delete item.user_movie_entries; // Limpiamos el join para el frontend
          return mapMoviePayload(item as unknown as Movie);
        });

        return normalizeMoviesResponse({ total: normRequestCount ? (count || 0) : -1, items });
      }
      
      // MODO B: CATÁLOGO PÚBLICO (Motor potente)
      const rpcParams = stateToRpcParams(normFilters, normPage, normPageSize, normRequestCount, normExplicitOffset);
      let query = supabase.rpc("search_movies_offset", rpcParams);
      if (signal) query = query.abortSignal(signal);

      const { data, error } = await query;

      if (error) throw (isAbortError(error, signal) ? { name: "AbortError" } : createAppError(ERROR_CODES.DATABASE, "Fallo en la BD", error));

      const result = normalizeMoviesResponse({ total: data?.total ?? -1, items: data?.items }, mapMoviePayload);
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

// Descarga todas las pelis que ha votado el usuario (Para pintarle las estrellas rosas al abrir la web)
export async function fetchUserMovieData(): Promise<Record<string, UserMovieEntry>> {
  const supabase = await getSupabase();
  const step = 1000;

  // 1. Obtener la primera página y el conteo exacto de registros en una sola consulta
  const { data: firstPageData, error: firstPageError, count } = await supabase
    .from('user_movie_entries')
    .select('movie_id, rating, on_watchlist', { count: 'exact' })
    .range(0, step - 1);

  if (firstPageError) {
    throw createAppError(ERROR_CODES.DATABASE, "No se pudieron cargar tus datos.", firstPageError);
  }

  const allData = [...(firstPageData || [])];

  // 2. Si hay más registros de los que cupieron en el primer lote, pedir el resto en paralelo
  if (count !== null && count !== undefined && count > step) {
    const promises = [];
    for (let from = step; from < count; from += step) {
      promises.push(
        supabase
          .from('user_movie_entries')
          .select('movie_id, rating, on_watchlist')
          .range(from, from + step - 1)
      );
    }

    const responses = await Promise.all(promises);

    for (const resp of responses) {
      if (resp.error) {
        throw createAppError(ERROR_CODES.DATABASE, "No se pudieron cargar tus datos.", resp.error);
      }
      if (resp.data) {
        allData.push(...resp.data);
      }
    }
  } else if ((count === null || count === undefined) && firstPageData?.length === step) {
    // FALLBACK: Si no tenemos el conteo pero la primera página vino llena, recurrimos a paginación secuencial
    let hasMore = true;
    let from = step;

    while (hasMore) {
      const { data, error } = await supabase
        .from('user_movie_entries')
        .select('movie_id, rating, on_watchlist')
        .range(from, from + step - 1);

      if (error) {
        throw createAppError(ERROR_CODES.DATABASE, "No se pudieron cargar tus datos.", error);
      }

      if (data && data.length > 0) {
        allData.push(...data);
        from += step;
        hasMore = data.length === step;
      } else {
        hasMore = false;
      }
    }
  }

  const userMap: Record<string, UserMovieEntry> = {};
  allData.forEach(i => userMap[i.movie_id] = { rating: i.rating, onWatchlist: i.on_watchlist });
  return normalizeUserMovieData(userMap);
}

// Memoria para los VIPs (Actores/Directores). Máximo 50 a la vez para no ahogar el móvil.
const personCache = new LRUCache<string, PersonDetails | null>({
  max: 50,
  ttl: 1000 * 60 * 60, 
});

// Saca la foto y la fecha de nacimiento de un VIP cuando le clicas
export async function fetchPersonDetails(type: 'director' | 'actor', name: string): Promise<PersonDetails | null> {
  if (!name) return null;
  const key = `${type}:${name}`;
  if (personCache.has(key)) return personCache.get(key) || null;
  
  const table = type === 'director' ? 'directors' : 'actors';
  
  try {
    const supabase = await getSupabase();

    const { data, error } = await supabase
      .from(table)
      .select('id, name, photo, birthday, deathday, place_of_birth, biography, titulo_bio, countries(name, code)')
      .eq('name_norm', normalizeText(name))
      .single();
      
    if (error) {
      if (import.meta.env.DEV) {
        console.warn(`[API] Error al cargar detalles de la persona (${type}: ${name}):`, error);
      }
      personCache.set(key, null);
      return null;
    }
    
    if (!data) {
      personCache.set(key, null);
      return null;
    }

    const personData = data as unknown as PersonDetails;
    personCache.set(key, personData);
    return personData;
  } catch(e) {
    if (import.meta.env.DEV) {
      console.error(`[API] Excepción capturada en fetchPersonDetails (${type}: ${name}):`, e);
    }
    return null;
  }
}

// Guarda en BD que le has puesto 5 estrellas o la has metido en pendientes
export async function setUserMovieDataAPI(movieId: number | string, partialData: Partial<UserMovieEntry>): Promise<void> {
  const normalizedMovieId = normalizeMovieId(movieId);
  if (!normalizedMovieId) throw createAppError(ERROR_CODES.VALIDATION, "Película inválida.");

  const supabase = await getSupabase();
  
  const { data: { session } } = await supabase.auth.getSession();
  if (!session || !session.user) throw createAppError(ERROR_CODES.AUTH_REQUIRED, "Debes iniciar sesión.");
  
  const currentState = getUserDataForMovie(normalizedMovieId) || { rating: null, onWatchlist: false };
  const mergedData = normalizeUserMovieEntry({ ...currentState, ...partialData });
  
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
  return suggestions.filter(name => !IGNORED_ACTORS.includes(name.trim().toLowerCase()));
};

// --- DATOS ALEATORIOS (Discovery) ---

export const fetchRandomTopActors = async (): Promise<string[]> => {
  const supabase = await getSupabase();
  
  const { data, error } = await supabase.rpc("get_random_top_actors", { limit_count: 5 });
  if (error) return [];
  return (data as Array<{ name: string }> || []).map(d => d.name).filter((name: string) => !IGNORED_ACTORS.includes(name.trim().toLowerCase()));
};

export const fetchRandomTopDirectors = async (): Promise<string[]> => {
  const supabase = await getSupabase();
  
  const { data, error } = await supabase.rpc("get_random_top_directors", { limit_count: 5 });
  if (error) return [];
  return (data as Array<{ name: string }> || []).map(d => d.name);
};
