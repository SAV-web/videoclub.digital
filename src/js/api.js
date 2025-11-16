// =================================================================
//
//          MÓDULO DE SERVICIO API (v4.0 - Gestor de Peticiones Centralizado)
//
// =================================================================
//
//  FICHERO:  src/js/api.js
//  AUTOR:    Tu Mentor Experto
//  VERSIÓN:  4.0
//
//  HISTORIAL DE CAMBIOS:
//    v4.0 - REFACTOR ARQUITECTÓNICO: Se elimina la gestión local de AbortController
//           y se adopta el nuevo módulo centralizado `requestManager`.
//           Esto unifica la lógica de cancelación de peticiones en toda la app.
//
//    v3.3 - Introducida la capa de adaptación `buildRpcParams`.
//
//    v3.2 - Implementada la clave de caché canónica.
//
// =================================================================

import { CONFIG } from "./config.js";
import { supabase } from "./supabaseClient.js";
import { LRUCache } from "lru-cache";
// ✨ NUEVA IMPORTACIÓN: Traemos nuestro gestor de peticiones centralizado.
import { createAbortableRequest } from "./utils/requestManager.js";

/**
 * Instancia de la caché de consultas. Se exporta para poder ser invalidada
 * desde otros módulos (ej. al cambiar los datos de usuario en main.js).
 */
export const queryCache = new LRUCache({
  max: 200, // Almacena hasta 200 resultados de consultas diferentes.
  ttl: 1000 * 60 * 5, // Las entradas de caché expiran después de 5 minutos.
});

// ❌ ELIMINADO: El objeto `suggestionControllers` ya no es necesario.
// const suggestionControllers = {};

/**
 * Crea una clave de caché canónica y consistente a partir de un objeto de filtros.
 * Ordena las claves para asegurar que la misma consulta lógica siempre produzca la misma clave.
 *
 * @param {object} filters - El objeto de filtros activos.
 * @param {number} page - El número de página actual.
 * @param {number} pageSize - El tamaño de la página.
 * @returns {string} La clave de caché normalizada.
 */
function createCanonicalCacheKey(filters, page, pageSize) {
  const normalizedFilters = {};
  Object.keys(filters)
    .sort()
    .forEach((key) => {
      const value = filters[key];
      const hasValue = value !== null && value !== undefined && value !== "";
      const isNonEmptyArray = Array.isArray(value) && value.length > 0;

      if (hasValue && (!Array.isArray(value) || isNonEmptyArray)) {
        if (isNonEmptyArray) {
          normalizedFilters[key] = [...value].sort();
        } else {
          normalizedFilters[key] = value;
        }
      }
    });
  return JSON.stringify({ filters: normalizedFilters, page, pageSize });
}

/**
 * (Capa de Adaptación) Transforma los filtros del frontend al formato que espera la RPC.
 *
 * @param {object} activeFilters - El objeto `activeFilters` del estado.
 * @param {number} currentPage - El número de página actual.
 * @param {number} pageSize - El tamaño de la página.
 * @returns {object} Un objeto con los parámetros listos para ser enviados a la RPC.
 */
function buildRpcParams(activeFilters, currentPage, pageSize) {
  let yearStart = null;
  let yearEnd = null;
  if (activeFilters.year) {
    const parts = activeFilters.year.split("-").map(Number);
    if (parts.length === 2 && !parts.some(isNaN)) {
      [yearStart, yearEnd] = parts;
    }
  }

  const [sortField = "relevance", sortDirection = "asc"] = (
    activeFilters.sort || "relevance,asc"
  ).split(",");

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
    excluded_genres:
      activeFilters.excludedGenres?.length > 0
        ? activeFilters.excludedGenres
        : null,
    excluded_countries:
      activeFilters.excludedCountries?.length > 0
        ? activeFilters.excludedCountries
        : null,
    sort_field: sortField,
    sort_direction: sortDirection,
    page_limit: pageSize,
    page_offset: (currentPage - 1) * pageSize,
  };
}

/**
 * Función principal para buscar películas, con estrategia "Cache-First".
 *
 * @param {object} activeFilters - Objeto con los filtros a aplicar.
 * @param {number} currentPage - El número de página a solicitar.
 * @param {number} [pageSize] - El número de resultados por página.
 * @param {AbortSignal} [signal] - Una señal para cancelar la petición.
 * @returns {Promise<{items: Array<object>, total: number}>} Un objeto con los resultados y el total.
 */
export async function fetchMovies(
  activeFilters,
  currentPage,
  pageSize = CONFIG.ITEMS_PER_PAGE,
  signal
) {
  const queryKey = createCanonicalCacheKey(
    activeFilters,
    currentPage,
    pageSize
  );

  if (queryCache.has(queryKey)) {
    console.log(
      `%c[CACHE HIT] Sirviendo desde caché para: ${queryKey}`,
      "color: #28a745"
    );
    return queryCache.get(queryKey);
  }

  console.log(
    `%c[CACHE MISS] Petición de red para: ${queryKey}`,
    "color: #dc3545"
  );

  try {
    const rpcParams = buildRpcParams(activeFilters, currentPage, pageSize);
    const rpcCall = supabase.rpc("search_movies_offset", rpcParams);

    if (signal) {
      rpcCall.abortSignal(signal);
    }

    const { data, error } = await rpcCall;

    if (error) {
      if (error.name === "AbortError") {
        console.log("Petición de películas cancelada.");
        return new Promise(() => {});
      }
      console.error("Error en la llamada RPC 'search_movies_offset':", error);
      throw new Error("No se pudieron obtener los datos de la base de datos.");
    }

    const result = {
        total: data?.total || 0,
        items: data?.items || [],
    };
    
    queryCache.set(queryKey, result);
    return result;

  } catch (error) {
    // Si el error no es de cancelación, lo relanzamos para que sea manejado por el llamador.
    if (error.name !== "AbortError") {
      throw error;
    }
    // Si es un AbortError, simplemente retornamos una promesa que nunca se resuelve
    // para detener la cadena de ejecución de forma segura.
    return new Promise(() => {});
  }
}

/**
 * Función genérica para obtener sugerencias de autocompletado.
 * Ahora utiliza el gestor centralizado para cancelar peticiones anteriores del mismo tipo.
 *
 * @param {string} rpcName - El nombre de la función RPC de Supabase a llamar.
 * @param {string} searchTerm - El término de búsqueda del usuario.
 * @returns {Promise<string[]>} Un array de strings con las sugerencias.
 */
const fetchSuggestions = async (rpcName, searchTerm) => {
  if (!searchTerm || searchTerm.length < 2) {
    return [];
  }
  
  // ✨ LÓGICA REFACTORIZADA: Usamos el gestor central.
  // Creamos una clave única para este tipo de sugerencia.
  const requestKey = `suggestion-${rpcName}`;
  const controller = createAbortableRequest(requestKey);

  try {
    const { data, error } = await supabase
      .rpc(rpcName, { search_term: searchTerm })
      .abortSignal(controller.signal); // Usamos la señal del nuevo controlador.

    if (error) {
      if (error.name !== "AbortError") {
        console.error(`Error al obtener sugerencias para '${rpcName}':`, error);
      }
      return [];
    }
    return data.map((item) => item.suggestion);
  } catch (error) {
    if (error.name !== "AbortError") {
      console.error(
        `Excepción al obtener sugerencias para '${rpcName}':`,
        error
      );
    }
    return [];
  }
};

// Wrappers específicos para cada tipo de sugerencia. Su interfaz no cambia.
export const fetchGenreSuggestions = (term) =>
  fetchSuggestions("get_genre_suggestions", term);
export const fetchDirectorSuggestions = (term) =>
  fetchSuggestions("get_director_suggestions", term);
export const fetchActorSuggestions = (term) =>
  fetchSuggestions("get_actor_suggestions", term);
export const fetchCountrySuggestions = (term) =>
  fetchSuggestions("get_country_suggestions", term);