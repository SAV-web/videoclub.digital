// =================================================================
//
//          MÓDULO DE SERVICIO API (v3.2 - Caché Canónica)
//
// =================================================================
//
//  VERSIÓN:  3.2
//
//  RESPONSABILIDADES:
//    - Abstraer todas las comunicaciones con el backend (Supabase).
//    - Gestionar una caché en memoria (LRU) para las consultas de películas,
//      mejorando el rendimiento y reduciendo las peticiones de red.
//    - Manejar la cancelación de peticiones para evitar condiciones de carrera.
//    - Proporcionar funciones para obtener sugerencias de autocompletado.
//
//  HISTORIAL DE CAMBIOS:
//    v3.2 - Implementada una función de normalización (`createCanonicalCacheKey`)
//           para las claves de caché. Se ordenan las propiedades del objeto de
//           filtros y los valores de los arrays para garantizar que consultas
//           idénticas (independientemente del orden de parámetros) generen
//           la misma clave. Aumenta drásticamente el `hit rate` de la caché.
//
//    v3.1 - Implementada una estrategia de caché más inteligente y robusta
//           con un TTL (Time To Live) y un tamaño máximo.
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
    .forEach(key => {
      const value = filters[key];

      // 2. Ignora valores nulos, indefinidos, cadenas vacías o arrays vacíos,
      //    ya que no tienen efecto en la consulta SQL y añadirían "ruido" a la clave.
      const hasValue = value !== null && value !== undefined && value !== '';
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
  const queryKey = createCanonicalCacheKey(activeFilters, currentPage, pageSize);

  // Estrategia "Cache-First":
  if (queryCache.has(queryKey)) {
    console.log(
      `%c[CACHE HIT] Sirviendo desde caché para la clave normalizada: ${queryKey}`,
      "color: #28a745"
    );
    return queryCache.get(queryKey);
  }

  // Si no hay un HIT en la caché, procedemos con la petición de red.
  console.log(
    `%c[CACHE MISS] Petición de red para la clave normalizada: ${queryKey}`,
    "color: #dc3545"
  );

  try {
    // El backend espera un único `selection_code` que puede ser un estudio o una selección.
    const selectionCodeForAPI = activeFilters.studio || activeFilters.selection;
    
    // Construimos la llamada a la Remote Procedure Call (RPC) de Supabase.
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
      selection_code: selectionCodeForAPI,
      excluded_genres:
        activeFilters.excludedGenres?.length > 0
          ? activeFilters.excludedGenres
          : null,
      excluded_countries:
        activeFilters.excludedCountries?.length > 0
          ? activeFilters.excludedCountries
          : null,
      sort_field: activeFilters.sort.split(",")[0],
      sort_direction: activeFilters.sort.split(",")[1],
      page_limit: pageSize,
      page_offset: (currentPage - 1) * pageSize,
    });

    // Si se proporcionó una señal de cancelación, la asociamos a la llamada.
    if (signal) {
      rpcCall.abortSignal(signal);
    }

    // Ejecutamos la llamada y esperamos la respuesta.
    const { data, error } = await rpcCall;

    if (error) {
      // Si el error es una cancelación deliberada, lo registramos y devolvemos una promesa
      // pendiente que nunca se resuelve, deteniendo el flujo de ejecución.
      if (error.name === "AbortError") {
        console.log("Petición a la BBDD abortada por la señal.");
        return new Promise(() => {}); // Detiene la cadena de promesas.
      }
      // Para cualquier otro error, lo registramos y lanzamos una excepción.
      console.error("Error en la llamada RPC 'search_movies_offset':", error);
      throw new Error("No se pudieron obtener los datos de la base de datos.");
    }

    const result = data || { total: 0, items: [] };
    
    // Almacenamos el resultado exitoso en la caché para futuras peticiones.
    queryCache.set(queryKey, result);
    
    return result;
  } catch (error) {
    // Capturamos cualquier excepción, incluyendo la de cancelación.
    if (error.name === "AbortError") {
      return new Promise(() => {});
    }
    // Re-lanzamos otros errores para que sean manejados por el llamador.
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
      console.error(`Excepción al obtener sugerencias para '${rpcName}':`, error);
    }
    return [];
  }
};

// Exportamos "wrappers" específicos para cada tipo de sugerencia,
// haciendo la API del módulo más clara y fácil de usar desde otros ficheros.
export const fetchGenreSuggestions = (term) => fetchSuggestions("get_genre_suggestions", term);
export const fetchDirectorSuggestions = (term) => fetchSuggestions("get_director_suggestions", term);
export const fetchActorSuggestions = (term) => fetchSuggestions("get_actor_suggestions", term);
export const fetchCountrySuggestions = (term) => fetchSuggestions("get_country_suggestions", term);