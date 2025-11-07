// =================================================================
//          MÓDULO DE SERVICIO API (v3.1 - Con AbortController)
// =================================================================
// v3.1 - Implementado AbortController para permitir la cancelación externa
//        de peticiones desde el orquestador (main.js).
// =================================================================

import { CONFIG } from "./config.js";
import { supabase } from "./supabaseClient.js";
import { LRUCache } from "https://esm.sh/lru-cache@10.2.0";

const cache = new LRUCache({
  max: 50,
  ttl: 1000 * 120, // 2 minutos
});

const suggestionControllers = {};

/**
 * Busca y recupera películas invocando de forma segura la Función de Base de Datos.
 * @param {object} activeFilters - El objeto con todos los filtros activos.
 * @param {number} currentPage - El número de la página a solicitar.
 * @param {number} pageSize - El número de elementos por página.
 * @param {AbortSignal} [signal] - Una señal del AbortController para cancelar la petición.
 * @returns {Promise<{items: Array<object>, total: number}>} - Una promesa que resuelve al objeto con los resultados.
 */
export async function fetchMovies(
  activeFilters,
  currentPage,
  pageSize = CONFIG.ITEMS_PER_PAGE,
  // ▼▼▼ MEJORA 1: La función ahora acepta un cuarto parámetro 'signal' ▼▼▼
  signal
) {
  const queryKey = JSON.stringify({ ...activeFilters, currentPage, pageSize });

  if (cache.has(queryKey)) {
    console.log(
      `%c[CACHE HIT] Sirviendo desde caché para la clave: ${queryKey}`,
      "color: #28a745"
    );
    return cache.get(queryKey);
  }
  console.log(
    `%c[CACHE MISS] Petición de red para la clave: ${queryKey}`,
    "color: #dc3545"
  );

  try {
    const rpcCall = supabase.rpc("search_movies_offset", {
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
      selection_code: activeFilters.selection,
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

    // ▼▼▼ MEJORA 2: Se adjunta la señal a la llamada de Supabase si existe. ▼▼▼
    // Esto conecta la petición de red con el controlador que la originó.
    if (signal) {
      rpcCall.abortSignal(signal);
    }

    const { data, error } = await rpcCall;

    if (error) {
      // ▼▼▼ MEJORA 3: Manejo específico del error de cancelación. ▼▼▼
      // Un 'AbortError' no es un fallo, es una cancelación intencionada.
      // Lo tratamos de forma silenciosa para que no se muestre un error al usuario.
      if (error.name === "AbortError") {
        console.log("Petición a la BBDD abortada por la señal.");
        // Devolvemos una promesa que nunca se resuelve para detener la cadena de ejecución.
        return new Promise(() => {});
      }
      console.error("Error en la llamada RPC:", error);
      throw new Error("No se pudieron obtener los datos de la base de datos.");
    }

    const result = data || { total: 0, items: [] };

    cache.set(queryKey, result);
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
