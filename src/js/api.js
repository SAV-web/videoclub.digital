// src/js/api.js
import { CONFIG } from "./constants.js";
import { createClient } from "@supabase/supabase-js";
import { LRUCache } from "lru-cache";
import { createAbortableRequest } from "./utils.js";
import { getUserDataForMovie } from "./state.js";

export const supabase = createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_ANON_KEY);

export const queryCache = new LRUCache({
  max: 300,
  ttl: 1000 * 60 * 30, // 30 minutos
  updateAgeOnGet: true,
  ttlAutopurge: true,
});

function createCanonicalCacheKey(filters, page, pageSize) {
  const normalizedFilters = {};
  Object.keys(filters).sort().forEach((key) => {
      const value = filters[key];
      const hasValue = value !== null && value !== undefined && value !== "";
      const isNonEmptyArray = Array.isArray(value) && value.length > 0;
      if (hasValue && (!Array.isArray(value) || isNonEmptyArray)) {
        if (isNonEmptyArray) normalizedFilters[key] = [...value].sort();
        else normalizedFilters[key] = value;
      }
    });
  return JSON.stringify({ filters: normalizedFilters, page, pageSize });
}

function buildRpcParams(activeFilters, currentPage, pageSize, requestCount) {
  let yearStart = null;
  let yearEnd = null;
  if (activeFilters.year) {
    const parts = activeFilters.year.split("-").map(Number);
    if (parts.length === 2 && !parts.some(isNaN)) {
      [yearStart, yearEnd] = parts;
    }
  }

  const [sortField = "relevance", sortDirection = "asc"] = (activeFilters.sort || "relevance,asc").split(",");
  const offset = (currentPage - 1) * CONFIG.ITEMS_PER_PAGE;

  return {
    search_term: activeFilters.searchTerm || null,
    genre_name: activeFilters.genre || null,
    p_year_start: yearStart,
    p_year_end: yearEnd,
    country_name: activeFilters.country || null,
    director_name: activeFilters.director || null,
    actor_name: activeFilters.actor || null,
    media_type: activeFilters.mediaType || "all",
    selection_code: activeFilters.studio || activeFilters.selection || null,
    excluded_genres: activeFilters.excludedGenres?.length > 0 ? activeFilters.excludedGenres : null,
    excluded_countries: activeFilters.excludedCountries?.length > 0 ? activeFilters.excludedCountries : null,
    sort_field: sortField,
    sort_direction: sortDirection,
    page_limit: pageSize,
    page_offset: offset,
    get_count: requestCount // NUEVO PARÁMETRO
  };
}

export async function fetchMovies(activeFilters, currentPage, pageSize = CONFIG.ITEMS_PER_PAGE, signal, requestCount = true) {
  // Incluimos requestCount en la clave de caché
  const queryKey = createCanonicalCacheKey({ ...activeFilters, requestCount }, currentPage, pageSize);

  if (queryCache.has(queryKey)) {
    return queryCache.get(queryKey);
  }

  try {
    const rpcParams = buildRpcParams(activeFilters, currentPage, pageSize, requestCount);
    
    // Configuración correcta de Supabase v2 para AbortSignal
    const rpcCall = supabase.rpc("search_movies_offset", rpcParams);
    if (signal) {
       // OJO: En v2 a veces esto se hace diferente, pero si falla, el catch lo atrapa.
       // Lo más estándar es pasar { signal } en opciones si el método lo soporta, 
       // pero rpc() retorna un Promise-like builder. 
       if (typeof rpcCall.abortSignal === 'function') {
           rpcCall.abortSignal(signal);
       }
    }

    const { data, error } = await rpcCall;

    if (error) {
      if (error.name === "AbortError" || error.message?.includes("abort")) {
         return { aborted: true, items: [], total: -1 };
      }
      console.error("Error RPC Supabase:", error); // Esto saldrá en tu consola
      throw new Error("Error de base de datos");
    }

    const result = { total: data?.total ?? -1, items: data?.items || [] };
    
    if (!signal?.aborted) queryCache.set(queryKey, result);
    
    return result;

  } catch (error) {
    if (error.name === "AbortError" || (signal && signal.aborted)) {
        return { aborted: true, items: [], total: -1 };
    }
    throw error;
  }
}

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

export async function setUserMovieDataAPI(movieId, partialData) {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session || !session.user) throw new Error("Debes iniciar sesión.");
  const userId = session.user.id;
  const currentState = getUserDataForMovie(movieId) || { rating: null, onWatchlist: false };
  const mergedData = { ...currentState, ...partialData };
  const payload = {
    user_id: userId, movie_id: movieId, rating: mergedData.rating, on_watchlist: mergedData.onWatchlist, updated_at: new Date().toISOString()
  };
  const { error } = await supabase.from('user_movie_entries').upsert(payload, { onConflict: 'user_id, movie_id' });
  if (error) throw new Error("No se pudo guardar tu acción.");
}

const fetchSuggestions = async (rpcName, searchTerm) => {
  if (!searchTerm || searchTerm.length < 2) return [];
  const requestKey = `suggestion-${rpcName}`;
  const controller = createAbortableRequest(requestKey);
  try {
    const { data, error } = await supabase.rpc(rpcName, { search_term: searchTerm }).abortSignal(controller.signal);
    if (error) return [];
    return data.map((item) => item.suggestion);
  } catch (error) { return []; }
};

export const fetchGenreSuggestions = (term) => fetchSuggestions("get_genre_suggestions", term);
export const fetchDirectorSuggestions = (term) => fetchSuggestions("get_director_suggestions", term);
export const fetchCountrySuggestions = (term) => fetchSuggestions("get_country_suggestions", term);
export const fetchActorSuggestions = async (term) => {
  const suggestions = await fetchSuggestions("get_actor_suggestions", term);
  const ignoredTerms = ["(a)", "animación", "animacion", "documental"];
  return suggestions.filter(name => !ignoredTerms.includes(name.toLowerCase()));
};