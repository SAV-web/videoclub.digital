// =================================================================
//          MÓDULO DE API (Supabase + Caché + Deduplicación)
// =================================================================
// FICHERO: src/js/api.js
// RESPONSABILIDAD:
// - Comunicación con Supabase (RPC y Tablas).
// - Gestión de Caché (LRU) para evitar peticiones redundantes.
// - Deduplicación de peticiones en vuelo (Race Conditions).
// =================================================================

import { CONFIG, IGNORED_ACTORS } from "./constants.js";
import { createClient } from "@supabase/supabase-js";
import { LRUCache } from "lru-cache";
import { createAbortableRequest } from "./utils.js";
import { getUserDataForMovie } from "./state.js";

// Inicialización del cliente Supabase
// GUARD: Evitar crash en PROD si faltan credenciales.
// Si hay URL/Key (real o placeholder de dev), iniciamos cliente.
// Si no (PROD sin config), usamos un Mock que falla controladamente al usarse.
const sbUrl = CONFIG.SUPABASE_URL;
const sbKey = CONFIG.SUPABASE_ANON_KEY;

// Helper para error de configuración (Mock unificado)
const notConfiguredError = () => Promise.reject(new Error("Supabase no configurado (Faltan credenciales)"));

export const supabase = (sbUrl && sbKey) 
  ? createClient(sbUrl, sbKey)
  : {
      // Mock de seguridad: Permite que la app cargue, pero falla al pedir datos
      rpc: notConfiguredError,
      from: () => ({ 
        select: notConfiguredError,
        upsert: notConfiguredError
      }),
      auth: {
        getSession: () => Promise.resolve({ data: { session: null }, error: null }),
        onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
        signInWithPassword: notConfiguredError,
        signOut: notConfiguredError,
        signUp: notConfiguredError
      }
    };

// --- SISTEMA DE CACHÉ ---

// TTL de 30 minutos: el catálogo es estable y no requiere refresco inmediato.
export const queryCache = new LRUCache({
  max: 300, // Guardar hasta 300 páginas de resultados
  ttl: 1000 * 60 * 30, 
  updateAgeOnGet: true,
  ttlAutopurge: true,
});

// TTL corto (5 min): optimiza la escritura repetitiva sin consumir mucha memoria.
const suggestionsCache = new LRUCache({
  max: 100,
  ttl: 1000 * 60 * 5,
});

// --- HELPERS INTERNOS ---

function parseYearRange(yearStr) {
  if (!yearStr) return { start: null, end: null };
  const parts = yearStr.split("-").map(Number);
  if (parts.length === 2 && !parts.some(isNaN)) {
    return { start: parts[0], end: parts[1] };
  }
  return { start: null, end: null };
}

const isAbort = (error, signal) => 
  error?.name === "AbortError" || 
  signal?.aborted || 
  (error?.message && error.message.toLowerCase().includes("abort"));

/**
 * Genera una clave única y determinista para la caché basada en los filtros.
 * Ordena las claves y los arrays para que {a:1, b:2} sea igual a {b:2, a:1}.
 */
function createCanonicalCacheKey(filters, page, pageSize) {
  const normalizedFilters = {};
  // Solo normalizar campos de texto libre donde el casing no importa
  const textFields = new Set(['searchTerm', 'genre', 'country', 'director', 'actor', 'excludedGenres', 'excludedCountries']);

  Object.keys(filters).sort().forEach((key) => {
      const value = filters[key];
      // Ignorar valores nulos o vacíos para normalizar la clave
      const hasValue = value !== null && value !== undefined && value !== "";
      const isNonEmptyArray = Array.isArray(value) && value.length > 0;
      
      if (hasValue && (!Array.isArray(value) || isNonEmptyArray)) {
        if (textFields.has(key)) {
          // Normalización segura (Trim + Lowercase) solo para texto
          if (typeof value === 'string') {
            normalizedFilters[key] = value.trim().toLowerCase();
          } else if (Array.isArray(value)) {
            normalizedFilters[key] = value.map(v => (typeof v === 'string' ? v.trim().toLowerCase() : v)).sort();
          }
        } else {
          // Para códigos (IDs, Sort, etc) conservar casing, pero ordenar arrays
          normalizedFilters[key] = Array.isArray(value) ? [...value].sort() : value;
        }
      }
    });
  return JSON.stringify({ filters: normalizedFilters, page, pageSize });
}

/**
 * Mapea los filtros del frontend a los parámetros esperados por la función RPC de PostgreSQL.
 */
function buildRpcParams(activeFilters, currentPage, pageSize, requestCount) {
  const { start: yearStart, end: yearEnd } = parseYearRange(activeFilters.year);

  const [sortField = "relevance", sortDirection = "asc"] = (activeFilters.sort || "relevance,asc").split(",");
  const offset = (currentPage - 1) * pageSize;

  return {
    search_term: activeFilters.searchTerm || null,
    genre_name: activeFilters.genre || null,
    p_year_start: yearStart,
    p_year_end: yearEnd,
    country_name: activeFilters.country || null,
    director_name: activeFilters.director || null,
    actor_name: activeFilters.actor || null,
    media_type: activeFilters.mediaType || "all",
    p_selection_code: activeFilters.selection || null,
    p_studio_code: activeFilters.studio || null,
    excluded_genres: activeFilters.excludedGenres?.length > 0 ? activeFilters.excludedGenres : null,
    excluded_countries: activeFilters.excludedCountries?.length > 0 ? activeFilters.excludedCountries : null,
    sort_field: sortField,
    sort_direction: sortDirection,
    page_limit: pageSize,
    page_offset: offset,
    get_count: requestCount // Optimización: false para no recalcular el total en paginación
  };
}

// Mapa para deduplicación de peticiones en vuelo
const inFlightRequests = new Map();

/**
 * Obtiene películas desde Supabase con caché y deduplicación.
 * @param {Object} activeFilters - Filtros actuales.
 * @param {number} currentPage - Página actual.
 * @param {number} pageSize - Tamaño de página.
 * @param {AbortSignal} signal - Señal para cancelar la petición.
 * @param {boolean} requestCount - Si se debe pedir el conteo total (caro).
 */
export function fetchMovies(activeFilters, currentPage, pageSize = CONFIG.ITEMS_PER_PAGE, signal, requestCount = true) {
  // Incluimos requestCount en la clave porque el resultado varía (total vs -1)
  const queryKey = createCanonicalCacheKey({ ...activeFilters, requestCount }, currentPage, pageSize);

  const cached = queryCache.get(queryKey);
  if (cached) {
    return Promise.resolve(cached);
  }

  // Deduplicación: Si ya hay una petición idéntica en curso, reutilizamos su promesa
  const inFlightPromise = inFlightRequests.get(queryKey);
  if (inFlightPromise) return inFlightPromise;

  const promise = (async () => {
    try {
      const rpcParams = buildRpcParams(activeFilters, currentPage, pageSize, requestCount);
      
      let query = supabase.rpc("search_movies_offset", rpcParams);
      if (signal) {
        query = query.abortSignal(signal);
      }

      const { data, error } = await query;

      if (error) {
        if (isAbort(error, signal)) {
            return { aborted: true, items: [], total: -1 };
        }
        console.error("[API] Error RPC Supabase:", error);
        throw new Error("Error de base de datos al obtener películas.");
      }

      const result = { total: data?.total ?? -1, items: data?.items || [] };
      
      if (!signal?.aborted) {
        queryCache.set(queryKey, result);
      }
      
      return result;

    } catch (error) {
      if (isAbort(error, signal)) {
          return { aborted: true, items: [], total: -1 };
      }
      throw error;
    } finally {
      // Limpieza: Solo borrar si somos la petición activa (race condition safety)
      if (inFlightRequests.get(queryKey) === promise) {
        inFlightRequests.delete(queryKey);
      }
    }
  })();

  inFlightRequests.set(queryKey, promise);
  return promise;
}

/**
 * Carga los datos de usuario (votos, watchlist) para TODAS las películas.
 * Se llama al iniciar sesión.
 */
export async function fetchUserMovieData() {
  const { data, error } = await supabase.from('user_movie_entries').select('movie_id, rating, on_watchlist');
  if (error) throw new Error("No se pudieron cargar tus datos.");
  
  const userMap = {};
  if (data) {
    data.forEach(item => {
      userMap[item.movie_id] = { rating: item.rating, onWatchlist: item.on_watchlist };
    });
  }
  return userMap;
}

/**
 * Guarda o actualiza la interacción del usuario con una película.
 */
export async function setUserMovieDataAPI(movieId, partialData) {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session || !session.user) throw new Error("Debes iniciar sesión.");
  
  const userId = session.user.id;
  // Merge optimista con el estado actual para no perder datos
  const currentState = getUserDataForMovie(movieId) || { rating: null, onWatchlist: false };
  const mergedData = { ...currentState, ...partialData };
  
  const payload = {
    user_id: userId, 
    movie_id: movieId, 
    rating: mergedData.rating, 
    on_watchlist: mergedData.onWatchlist, 
    updated_at: new Date().toISOString()
  };
  
  const { error } = await supabase.from('user_movie_entries').upsert(payload, { onConflict: 'user_id, movie_id' });
  if (error) throw new Error("No se pudo guardar tu acción.");
}

// --- SUGERENCIAS (AUTOCOMPLETE) ---

const fetchSuggestions = async (rpcName, searchTerm) => {
  if (!searchTerm || searchTerm.length < 2) return [];
  
  const cacheKey = `suggest:${rpcName}:${searchTerm.toLowerCase()}`;
  if (suggestionsCache.has(cacheKey)) {
    return suggestionsCache.get(cacheKey);
  }

  // Debounce de red: createAbortableRequest cancela automáticamente la petición anterior
  const requestKey = `suggestion-${rpcName}`;
  const controller = createAbortableRequest(requestKey);
  
  try {
    const { data, error } = await supabase.rpc(rpcName, { search_term: searchTerm }).abortSignal(controller.signal);
    
    if (error) {
      if (error.name === "AbortError") return []; // Ignorar cancelaciones
      // Diagnóstico en desarrollo: Avisar si falla el RPC
      if (import.meta.env.DEV) console.warn(`[API] Error en sugerencias (${rpcName}):`, error);
      return [];
    }
    
    const results = data.map((item) => item.suggestion);
    
    suggestionsCache.set(cacheKey, results);
    return results;
  } catch (error) { return []; }
};

export const fetchGenreSuggestions = (term) => fetchSuggestions("get_genre_suggestions", term);
export const fetchDirectorSuggestions = (term) => fetchSuggestions("get_director_suggestions", term);
export const fetchCountrySuggestions = (term) => fetchSuggestions("get_country_suggestions", term);
export const fetchActorSuggestions = async (term) => {
  const suggestions = await fetchSuggestions("get_actor_suggestions", term);
  // Filtrar actores ignorados (animación, etc.)
  return suggestions.filter(name => !IGNORED_ACTORS.includes(name.trim().toLowerCase()));
};

// --- DATOS ALEATORIOS (Discovery) ---

export const fetchRandomTopActors = async () => {
  const { data, error } = await supabase.rpc("get_random_top_actors", { limit_count: 5 });
  if (error) return [];
  return data.map(d => d.name).filter(name => !IGNORED_ACTORS.includes(name.trim().toLowerCase()));
};

export const fetchRandomTopDirectors = async () => {
  const { data, error } = await supabase.rpc("get_random_top_directors", { limit_count: 5 });
  if (error) return [];
  return data.map(d => d.name);
};