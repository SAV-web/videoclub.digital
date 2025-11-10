// =================================================================
//
//          MÓDULO DE SERVICIO API (v3.3 - Capa de Adaptación)
//
// =================================================================
//
//  FICHERO:  src/js/api.js
//  AUTOR:    Tu Mentor Experto
//  VERSIÓN:  3.3
//
//  RESPONSABILIDADES:
//    - Abstraer todas las comunicaciones con el backend (Supabase).
//    - Gestionar una caché en memoria (LRU) para las consultas de películas,
//      mejorando el rendimiento y reduciendo las peticiones de red.
//    - Manejar la cancelación de peticiones para evitar condiciones de carrera.
//    - Proporcionar una capa de adaptación que desacopla el estado del
//      frontend del contrato de la API de la base de datos.
//
//  HISTORIAL DE CAMBIOS:
//    v3.3 - REFACTOR ARQUITECTÓNICO: Introducida la función `buildRpcParams`,
//           que actúa como una capa de adaptación (Adapter Pattern). Esta
//           función desacopla el estado del frontend del contrato de la API
//           de la base de datos. Valida, limpia y transforma los filtros
//           antes de enviarlos a la RPC, aumentando la robustez y mantenibilidad.
//
//    v3.2 - Implementada la clave de caché canónica (`createCanonicalCacheKey`)
//           para aumentar drásticamente el `hit rate` de la caché.
//
//    v3.1 - Implementada la estrategia de caché LRU con TTL.
//
// =================================================================

import { CONFIG } from "./config.js";
import { supabase } from "./supabaseClient.js";
// LRUCache es una implementación eficiente de una caché "Least Recently Used"
// (El menos usado recientemente se descarta primero).
import { LRUCache } from "https://esm.sh/lru-cache@10.2.0";

/**
 * Instancia de la caché de consultas. Se exporta para poder ser invalidada
 * desde otros módulos (ej. al cambiar los datos de usuario en main.js).
 * @type {LRUCache<string, object>}
 */
export const queryCache = new LRUCache({
  max: 200, // Almacena hasta 200 resultados de consultas diferentes.
  ttl: 1000 * 60 * 5, // Las entradas de caché expiran después de 5 minutos.
});

/**
 * Almacena los `AbortController` para cada tipo de sugerencia, permitiendo
 * cancelar peticiones anteriores si el usuario sigue escribiendo.
 * @type {Object.<string, AbortController>}
 */
const suggestionControllers = {};

/**
 * Crea una clave de caché canónica y consistente a partir de un objeto de filtros.
 * Ordena las claves del objeto y los valores de los arrays internos para
 * asegurar que la misma consulta lógica siempre produzca la misma clave.
 *
 * @param {object} filters - El objeto de filtros activos.
 * @param {number} page - El número de página actual.
 * @param {number} pageSize - El tamaño de la página.
 * @returns {string} La clave de caché normalizada y en formato JSON string.
 */
function createCanonicalCacheKey(filters, page, pageSize) {
  const normalizedFilters = {};

  // 1. Obtiene las claves del objeto de filtros y las ordena alfabéticamente.
  //    Esto garantiza que {a:1, b:2} y {b:2, a:1} produzcan la misma clave.
  Object.keys(filters)
    .sort()
    .forEach((key) => {
      const value = filters[key];

      // 2. Ignora valores nulos, indefinidos, cadenas vacías o arrays vacíos,
      //    ya que no tienen efecto en la consulta SQL y añadirían "ruido" a la clave.
      const hasValue = value !== null && value !== undefined && value !== "";
      const isNonEmptyArray = Array.isArray(value) && value.length > 0;

      if (hasValue && (!Array.isArray(value) || isNonEmptyArray)) {
        // 3. Si el valor es un array (ej. excludedGenres), crea una copia y la ordena.
        //    Esto garantiza que ['A', 'B'] y ['B', 'A'] produzcan la misma clave.
        if (isNonEmptyArray) {
          normalizedFilters[key] = [...value].sort();
        } else {
          normalizedFilters[key] = value;
        }
      }
    });

  // 4. Construye el objeto final con todos los parámetros relevantes y lo convierte a string.
  return JSON.stringify({ filters: normalizedFilters, page, pageSize });
}

/**
 * (Capa de Adaptación) Transforma el objeto de filtros del estado del frontend
 * al formato exacto que espera la función RPC `search_movies_offset` de la base de datos.
 * Esta función es el "traductor" entre el frontend y el backend.
 *
 * @param {object} activeFilters - El objeto `activeFilters` del estado.
 * @param {number} currentPage - El número de página actual.
 * @param {number} pageSize - El tamaño de la página.
 * @returns {object} Un objeto con los parámetros listos para ser enviados a la RPC.
 */
function buildRpcParams(activeFilters, currentPage, pageSize) {
  // 1. Parsear el rango de años desde un string 'YYYY-YYYY' a dos números.
  let yearStart = null;
  let yearEnd = null;
  if (activeFilters.year) {
    const parts = activeFilters.year.split("-").map(Number);
    // Valida que el parseo sea correcto (dos números válidos).
    if (parts.length === 2 && !parts.some(isNaN)) {
      [yearStart, yearEnd] = parts;
    }
  }

  // 2. Parsear el campo de ordenación desde un string 'campo,direccion' a dos variables.
  const [sortField = "relevance", sortDirection = "asc"] = (
    activeFilters.sort || "relevance,asc"
  ).split(",");

  // 3. Construir el objeto de parámetros final, asegurando valores por defecto y nulos
  //    para que coincidan con lo que espera la función de PostgreSQL.
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
 * Función principal para buscar y recuperar películas. Utiliza una estrategia de caché
 * "Cache-First". Si la consulta está en caché y no ha expirado, la devuelve
 * inmediatamente. De lo contrario, realiza la petición a la base de datos,
 * almacena el resultado en caché y luego lo devuelve.
 *
 * @param {object} activeFilters - Objeto con los filtros a aplicar.
 * @param {number} currentPage - El número de página a solicitar.
 * @param {number} [pageSize] - El número de resultados por página.
 * @param {AbortSignal} [signal] - Una señal para cancelar la petición (AbortController).
 * @returns {Promise<{items: Array<object>, total: number}>} Un objeto con los resultados y el total.
 */
export async function fetchMovies(
  activeFilters,
  currentPage,
  pageSize = CONFIG.ITEMS_PER_PAGE,
  signal
) {
  // Generamos una clave única y consistente para la consulta actual.
  const queryKey = createCanonicalCacheKey(
    activeFilters,
    currentPage,
    pageSize
  );

  // Estrategia "Cache-First":
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
    // 1. Transformar los filtros del frontend al formato que espera el backend.
    const rpcParams = buildRpcParams(activeFilters, currentPage, pageSize);

    // 2. Construir la llamada a la RPC de Supabase con los parámetros ya saneados.
    const rpcCall = supabase.rpc("search_movies_offset", rpcParams);

    // 3. Asociar la señal de cancelación si se proporcionó.
    if (signal) {
      rpcCall.abortSignal(signal);
    }

    // 4. Ejecutar la llamada.
    const { data, error } = await rpcCall;

    // 5. Manejar la respuesta.
    if (error) {
      if (error.name === "AbortError") {
        return new Promise(() => {}); // Detiene la cadena de promesas en caso de cancelación.
      }
      console.error("Error en la llamada RPC 'search_movies_offset':", error);
      throw new Error("No se pudieron obtener los datos de la base de datos.");
    }

    const result = data || { total: 0, items: [] };

    // 6. Almacenar el resultado en caché para futuras peticiones.
    queryCache.set(queryKey, result);

    return result;
  } catch (error) {
    if (error.name === "AbortError") {
      return new Promise(() => {});
    }
    throw error;
  }
}

/**
 * Función genérica y reutilizable para obtener sugerencias de autocompletado.
 * Cancela peticiones anteriores del mismo tipo para evitar condiciones de carrera.
 *
 * @param {string} rpcName - El nombre de la función RPC de Supabase a llamar.
 * @param {string} searchTerm - El término de búsqueda del usuario.
 * @returns {Promise<string[]>} Un array de strings con las sugerencias.
 */
const fetchSuggestions = async (rpcName, searchTerm) => {
  if (!searchTerm || searchTerm.length < 2) {
    return [];
  }

  // Si ya hay una petición en curso para este tipo de sugerencia, la cancelamos.
  if (suggestionControllers[rpcName]) {
    suggestionControllers[rpcName].abort();
  }
  // Creamos un nuevo controlador para la petición actual.
  suggestionControllers[rpcName] = new AbortController();

  try {
    const { data, error } = await supabase
      .rpc(rpcName, { search_term: searchTerm })
      .abortSignal(suggestionControllers[rpcName].signal);

    if (error) {
      if (error.name !== "AbortError") {
        console.error(`Error al obtener sugerencias para '${rpcName}':`, error);
      }
      return [];
    }
    // La RPC devuelve un array de objetos {suggestion: '...'}. Mapeamos para obtener solo el string.
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

// Exportamos "wrappers" específicos para cada tipo de sugerencia,
// haciendo la API del módulo más clara y fácil de usar desde otros ficheros.
export const fetchGenreSuggestions = (term) =>
  fetchSuggestions("get_genre_suggestions", term);
export const fetchDirectorSuggestions = (term) =>
  fetchSuggestions("get_director_suggestions", term);
export const fetchActorSuggestions = (term) =>
  fetchSuggestions("get_actor_suggestions", term);
export const fetchCountrySuggestions = (term) =>
  fetchSuggestions("get_country_suggestions", term);
