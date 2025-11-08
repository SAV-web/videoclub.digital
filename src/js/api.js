// =================================================================
//          MÓDULO DE SERVICIO API (v3.1 - Caché Robusta)
// =================================================================
// v3.1 - Implementada una estrategia de caché más inteligente y robusta.
//      - Aumentado el tamaño y el TTL de la caché para ser más efectiva.
//      - Exportada la instancia de la caché para poder invalidarla desde fuera.

import { CONFIG } from "./config.js";
import { supabase } from "./supabaseClient.js";
import { LRUCache } from "https://esm.sh/lru-cache@10.2.0";

// ==========================================================
//  ▼▼▼ MEJORA: Caché única, más grande y con TTL más largo ▼▼▼
// ==========================================================
export const queryCache = new LRUCache({
  max: 200, // Aumentamos a 200 entradas para manejar mejor la paginación.
  ttl: 1000 * 60 * 5, // 5 minutos, un tiempo más razonable.
});

const suggestionControllers = {};

/**
 * Busca y recupera películas...
 * @param {AbortSignal} [signal] - ...
 * @returns {Promise<{items: Array<object>, total: number}>} - ...
 */
export async function fetchMovies(
  activeFilters,
  currentPage,
  pageSize = CONFIG.ITEMS_PER_PAGE,
  signal
) {
  const queryKey = JSON.stringify({ ...activeFilters, currentPage, pageSize });

  if (queryCache.has(queryKey)) {
    console.log(
      `%c[CACHE HIT] Sirviendo desde caché para la clave: ${queryKey}`,
      "color: #28a745"
    );
    return queryCache.get(queryKey);
  }
  console.log(
    `%c[CACHE MISS] Petición de red para la clave: ${queryKey}`,
    "color: #dc3545"
  );

  try {
    const selectionCodeForAPI = activeFilters.studio || activeFilters.selection;
    const rpcCall = supabase.rpc("search_movies_offset", {
      // ... (parámetros sin cambios)
      search_term: activeFilters.searchTerm,
      genre_name: activeFilters.genre,
      p_year_start: activeFilters.year
        ? parseInt(activeFilters.year.split("-")[0], 10)
        : null,
      p_year_end: activeFilters.year
        ? parseInt(activeFilters.year.split("-")[1], 10)
        : null,
      country_name: activeFilters.country,
      director_name: activeFilters.director,
      actor_name: activeFilters.actor,
      media_type: activeFilters.mediaType,
      selection_code: selectionCodeForAPI, // <-- USAMOS LA NUEVA VARIABLE
      excluded_genres:
        activeFilters.excludedGenres.length > 0
          ? activeFilters.excludedGenres
          : null,
      excluded_countries:
        activeFilters.excludedCountries.length > 0
          ? activeFilters.excludedCountries
          : null,
      sort_field: activeFilters.sort.split(",")[0],
      sort_direction: activeFilters.sort.split(",")[1],
      page_limit: pageSize,
      page_offset: (currentPage - 1) * pageSize,
    });

    if (signal) {
      rpcCall.abortSignal(signal);
    }

    const { data, error } = await rpcCall;

    if (error) {
      if (error.name === "AbortError") {
        console.log("Petición a la BBDD abortada por la señal.");
        return new Promise(() => {});
      }
      console.error("Error en la llamada RPC:", error);
      throw new Error("No se pudieron obtener los datos de la base de datos.");
    }

    const result = data || { total: 0, items: [] };
    queryCache.set(queryKey, result);
    return result;
  } catch (error) {
    if (error.name === "AbortError") {
      return new Promise(() => {});
    }
    throw error;
  }
}

const fetchSuggestions = async (rpcName, searchTerm) => {
  if (!searchTerm || searchTerm.length < 2) return [];

  if (suggestionControllers[rpcName]) {
    suggestionControllers[rpcName].abort();
  }
  suggestionControllers[rpcName] = new AbortController();

  try {
    const { data, error } = await supabase
      .rpc(rpcName, { search_term: searchTerm })
      .abortSignal(suggestionControllers[rpcName].signal);

    if (error) {
      if (error.name !== "AbortError")
        console.error(`Error en sugerencias para '${rpcName}':`, error);
      return [];
    }
    return data.map((item) => item.suggestion);
  } catch (error) {
    if (error.name !== "AbortError")
      console.error(`Excepción en sugerencias para '${rpcName}':`, error);
    return [];
  }
};

export const fetchGenreSuggestions = (term) =>
  fetchSuggestions("get_genre_suggestions", term);
export const fetchDirectorSuggestions = (term) =>
  fetchSuggestions("get_director_suggestions", term);
export const fetchActorSuggestions = (term) =>
  fetchSuggestions("get_actor_suggestions", term);
export const fetchCountrySuggestions = (term) =>
  fetchSuggestions("get_country_suggestions", term);
