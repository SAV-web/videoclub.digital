/// <reference types="vite/client" />

// =================================================================
//          EL MENSAJERO (API, Base de Datos y Caché)
// =================================================================
// Pide los datos a Supabase, pero usa memoria (Caché LRU) para 
// recordar lo que ya ha descargado y no pedirlo dos veces.
// =================================================================

import { CONFIG, IGNORED_ACTORS, REGIONAL_GROUPS, TEXT_FILTER_KEYS } from "./constants.js";
import { LRUCache } from "lru-cache";
import { createAbortableRequest, mapMoviePayload, normalizeText, parseYearRangeRaw } from "./utils.js";
import { isMovieIdChecked, markMovieIdAsChecked, clearCheckedUserMovieIds } from "./checkedIds.js";
export { clearCheckedUserMovieIds, markMovieIdAsChecked };
import { getUserDataForMovie, updateUserDataForMovie, setUserMovieData, appEvents } from "./state.js";
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
import { Movie, ActiveFilters, UserMovieEntry, ApiResponse, PersonDetails, MappedMovie } from "./types.js";
import type { SupabaseClient } from "@supabase/supabase-js";



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
            onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => { } } } }),
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
      updateUserDataForMovie(m.id, { rating: rawEntry.rating, onWatchlist: rawEntry.on_watchlist });
    }
  }

  const isSeries = m.type && String(m.type).toLowerCase().startsWith("s");
  const item: Record<string, unknown> = {
    ...m,
    genres: (m.genres || m.genres_list || null),
    directors: (m.directors || m.directors_list || null),
    actors: (m.actors || m.actors_list || null),
    genres_list: (m.genres_list || m.genres || null),
    directors_list: (m.directors_list || m.directors || null),
    actors_list: (m.actors_list || m.actors || null),
    original_title: (m.original_title && m.title && m.original_title.toLowerCase() === m.title.toLowerCase()) ? null : m.original_title,
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

  let promise!: Promise<ApiResponse>;
  promise = (async () => {
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

        const items = (data || []).map(mRaw => mapMoviePayload(shapeRawMovieRow(mRaw)));

        return normalizeMoviesResponse({ total: normRequestCount ? (count || 0) : -1, items });
      }

      // MODO B: CATÁLOGO PÚBLICO (Motor potente)
      const rpcParams = stateToRpcParams(normFilters, normPage, normPageSize, normRequestCount, normExplicitOffset);
      let query = supabase.rpc("search_movies_offset", rpcParams);
      if (signal) query = query.abortSignal(signal);

      const { data, error } = await query;

      if (error) throw (isAbortError(error, signal) ? { name: "AbortError" } : createAppError(ERROR_CODES.DATABASE, "Fallo en la BD", error));

      const result = normalizeMoviesResponse({ total: data?.total ?? -1, items: data?.items }, mapMoviePayload);

      // Filtro de precisión para garantizar que el nombre del actor o director coincida exactamente con una de las personas de la lista
      // (Evita que buscar "Yuna" devuelva a "Madeleine Yuna Voyles")
      if (result.items && result.items.length > 0) {
        if (normFilters.actor) {
          const targetActorNorm = normalizeText(normFilters.actor);
          result.items = result.items.filter(m =>
            m.parsedActors && m.parsedActors.some(a => normalizeText(a) === targetActorNorm)
          );
        }
        if (normFilters.director) {
          const targetDirectorNorm = normalizeText(normFilters.director);
          result.items = result.items.filter(m =>
            m.parsedDirectors && m.parsedDirectors.some(d => normalizeText(d) === targetDirectorNorm)
          );
        }
      }

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

/**
 * Descarga el 100% de los datos y votos del usuario activo desde Supabase.
 * Se ejecuta al iniciar sesión o recargar la página para tener la totalidad
 * de las puntuaciones en memoria desde el primer instante.
 */
export async function fetchAllUserMovieData(): Promise<Record<string, UserMovieEntry>> {
  try {
    const supabase = await getSupabase();
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) return {};

    const { data, error } = await supabase
      .from('user_movie_entries')
      .select('movie_id, rating, on_watchlist')
      .eq('user_id', session.user.id);

    if (error || !data) {
      if (import.meta.env.DEV) {
        console.error("Error al descargar catálogo completo de usuario:", error);
      }
      return {};
    }

    const userMap: Record<string, UserMovieEntry> = {};
    data.forEach(i => {
      if (i.movie_id) {
        userMap[i.movie_id] = { rating: i.rating, onWatchlist: i.on_watchlist };
        markMovieIdAsChecked(i.movie_id);
      }
    });

    const normalized = normalizeUserMovieData(userMap);
    setUserMovieData(normalized);
    appEvents.emit("userDataUpdated");
    return normalized;
  } catch (err) {
    if (import.meta.env.DEV) {
      console.error("Error en fetchAllUserMovieData:", err);
    }
    return {};
  }
}

// Descarga los datos del usuario únicamente para las películas visibles en pantalla (Lazy Sync por IDs)
export async function fetchUserMovieDataForIds(movieIds: (number | string)[]): Promise<Record<string, UserMovieEntry>> {
  if (!movieIds || movieIds.length === 0) return {};

  const uncachedIds: number[] = [];
  for (const rawId of movieIds) {
    const normId = normalizeMovieId(rawId);
    if (normId !== null && !isMovieIdChecked(normId)) {
      uncachedIds.push(normId);
    }
  }

  // Si los IDs ya fueron verificados o cargados en memoria, devolver los datos del estado
  if (uncachedIds.length === 0) {
    const existing: Record<string, UserMovieEntry> = {};
    for (const rawId of movieIds) {
      const normId = normalizeMovieId(rawId);
      if (normId !== null) {
        const u = getUserDataForMovie(normId);
        if (u) existing[String(normId)] = u;
      }
    }
    return existing;
  }

  const supabase = await getSupabase();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.user) return {};

  const { data, error } = await supabase
    .from('user_movie_entries')
    .select('movie_id, rating, on_watchlist')
    .in('movie_id', uncachedIds);

  if (error) {
    if (import.meta.env.DEV) {
      console.error("Error al cargar datos del usuario para el lote de películas:", error);
    }
    return {};
  }

  // Marcar todos los IDs de la página como consultados para no repetir peticiones
  uncachedIds.forEach(id => markMovieIdAsChecked(id));

  const userMap: Record<string, UserMovieEntry> = {};
  (data || []).forEach(i => {
    if (i.movie_id) {
      userMap[i.movie_id] = { rating: i.rating, onWatchlist: i.on_watchlist };
    }
  });

  const normalized = normalizeUserMovieData(userMap);
  for (const [id, entry] of Object.entries(normalized)) {
    updateUserDataForMovie(id, entry);
  }
  return normalized;
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

  const table = type === 'director' ? 'directors' : 'actors';

  try {
    const supabase = await getSupabase();

    const { data, error } = await supabase
      .from(table)
      .select('id, name, photo, thumbhash_st, birthday, deathday, place_of_birth, biography, titulo_bio, countries(name, code)')
      .eq('name_norm', normalizeText(name))
      .single();


    if (error || !data) {
      if (error && import.meta.env.DEV) {
        console.warn(`[API] Error al cargar detalles de la persona (${type}: ${name}):`, error);
      }
      personCache.set(key, NOT_FOUND);
      return null;
    }

    const personData = data as unknown as PersonDetails;
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
  return suggestions.filter(name => !(IGNORED_ACTORS as readonly string[]).includes(name.trim().toLowerCase()));
};

// --- DATOS ALEATORIOS (Discovery) ---

export const fetchRandomTopActors = async (): Promise<string[]> => {
  const supabase = await getSupabase();

  const { data, error } = await supabase.rpc("get_random_top_actors", { limit_count: 5 });
  if (error) return [];
  return (data as Array<{ name: string }> || []).map(d => d.name).filter((name: string) => !(IGNORED_ACTORS as readonly string[]).includes(name.trim().toLowerCase()));
};

export const fetchRandomTopDirectors = async (): Promise<string[]> => {
  const supabase = await getSupabase();

  const { data, error } = await supabase.rpc("get_random_top_directors", { limit_count: 5 });
  if (error) return [];
  return (data as Array<{ name: string }> || []).map(d => d.name);
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
