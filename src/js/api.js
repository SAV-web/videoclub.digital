// =================================================================
//          MÓDULO DE SERVICIO API (v3 - Cancelación Externa)
// =================================================================
// v3.0 - Refactorizado para una cancelación de peticiones más robusta.
//        - La función `fetchMovies` ya no crea ni gestiona su propio AbortController.
//        - Ahora acepta un parámetro opcional `signal` desde el orquestador (main.js).
//        - Esto centraliza el control de las peticiones asíncronas, eliminando
//          posibles race conditions y haciendo el código más predecible.
// =================================================================

import { CONFIG } from './config.js';
import { supabase } from './supabaseClient.js';
import { LRUCache } from 'https://esm.sh/lru-cache@10.2.0';

// La caché se mantiene para evitar peticiones de red idénticas en un corto periodo de tiempo.
const cache = new LRUCache({
    max: 50,
    ttl: 1000 * 120, // 2 minutos
});

// Los controladores para las sugerencias de autocompletado se mantienen aquí,
// ya que son peticiones independientes y de bajo impacto.
const suggestionControllers = {};

/**
 * Busca y recupera películas invocando de forma segura la Función de Base de Datos.
 * @param {object} activeFilters - El objeto con todos los filtros activos.
 * @param {number} currentPage - El número de la página a solicitar.
 * @param {number} pageSize - El número de elementos por página.
 * @param {AbortSignal} [signal] - Una señal del AbortController para cancelar la petición.
 * @returns {Promise<{items: Array<object>, total: number}>} - Una promesa que resuelve al objeto con los resultados.
 */
export async function fetchMovies(activeFilters, currentPage, pageSize = CONFIG.ITEMS_PER_PAGE, signal) {
    const queryKey = JSON.stringify({ ...activeFilters, currentPage, pageSize });

    if (cache.has(queryKey)) {
        console.log(`%c[CACHE HIT] Sirviendo desde caché para la clave: ${queryKey}`, 'color: #28a745');
        return cache.get(queryKey);
    }
    console.log(`%c[CACHE MISS] Petición de red para la clave: ${queryKey}`, 'color: #dc3545');

    try {
        // La construcción de la llamada RPC se mantiene igual.
        const rpcCall = supabase.rpc('search_movies_offset', {
            search_term: activeFilters.searchTerm,
            genre_name: activeFilters.genre,
            p_year_start: activeFilters.year ? parseInt(activeFilters.year.split('-')[0], 10) : null,
            p_year_end: activeFilters.year ? parseInt(activeFilters.year.split('-')[1], 10) : null,
            country_name: activeFilters.country,
            director_name: activeFilters.director,
            actor_name: activeFilters.actor,
            media_type: activeFilters.mediaType,
            selection_code: activeFilters.selection,
            excluded_genres: activeFilters.excludedGenres.length > 0 ? activeFilters.excludedGenres : null,
            excluded_countries: activeFilters.excludedCountries.length > 0 ? activeFilters.excludedCountries : null,
            sort_field: activeFilters.sort.split(',')[0],
            sort_direction: activeFilters.sort.split(',')[1],
            page_limit: pageSize,
            page_offset: (currentPage - 1) * pageSize
        });

        // << CAMBIO CLAVE >>: Si se proporcionó una señal de cancelación, se adjunta a la llamada.
        // Esto permite que el orquestador (main.js) aborte esta petición desde fuera.
        if (signal) {
            rpcCall.abortSignal(signal);
        }

        const { data, error } = await rpcCall;

        if (error) {
            // Si el error es de tipo 'AbortError', no es un fallo real, sino una cancelación
            // intencionada. Lo manejamos específicamente para evitar mensajes de error innecesarios.
            if (error.name === 'AbortError') {
                console.log('Petición a la BBDD abortada por la señal.');
                // Devolvemos una promesa que nunca se resuelve para detener la cadena de ejecución.
                return new Promise(() => {});
            }
            // Para otros errores, los propagamos.
            console.error('Error en la llamada RPC:', error);
            throw new Error('No se pudieron obtener los datos de la base de datos.');
        }
        
        // Si la función SQL devuelve null (caso improbable), aseguramos una respuesta válida.
        const result = data || { total: 0, items: [] };

        cache.set(queryKey, result);
        return result;

    } catch (error) {
        // Capturamos cualquier otro error, incluyendo el 'AbortError' si no fue manejado antes.
        if (error.name === 'AbortError') {
            return new Promise(() => {});
        }
        throw error;
    }
}


/**
 * Función genérica para obtener sugerencias de autocompletado.
 * (Sin cambios, su lógica es autocontenida y correcta).
 */
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
            if (error.name !== 'AbortError') console.error(`Error en sugerencias para '${rpcName}':`, error);
            return [];
        }
        return data.map(item => item.suggestion);
    } catch (error) {
        if (error.name !== 'AbortError') console.error(`Excepción en sugerencias para '${rpcName}':`, error);
        return [];
    }
};

export const fetchGenreSuggestions = (term) => fetchSuggestions('get_genre_suggestions', term);
export const fetchDirectorSuggestions = (term) => fetchSuggestions('get_director_suggestions', term);
export const fetchActorSuggestions = (term) => fetchSuggestions('get_actor_suggestions', term);
export const fetchCountrySuggestions = (term) => fetchSuggestions('get_country_suggestions', term);