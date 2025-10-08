// =================================================================
//                MÓDULO DE SERVICIO API (SUPABASE)
// =================================================================
// Este módulo actúa como la única puerta de entrada para la obtención de datos.
// Responsabilidades:
// 1. Conectarse a Supabase usando createClient desde ESM.
// 2. Encapsular las llamadas a funciones RPC (Remote Procedure Call).
// 3. Gestionar la cancelación de peticiones de red obsoletas (AbortController).
// 4. Implementar una caché (LRU) para mejorar el rendimiento.
// 5. Normalizar todas las respuestas a un formato consistente { items, total }.
// 6. Gestionar los errores de forma centralizada.

import { CONFIG } from './config.js';
// ✨ MEJORA: Se usa una URL de esm.sh con versión bloqueada para mayor estabilidad.
// En un proyecto con build step, estos módulos estarían instalados localmente.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.8';
import { LRUCache } from 'https://esm.sh/lru-cache@10.2.0';


const supabaseClient = createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_ANON_KEY);


const cache = new LRUCache({
    max: 50,
    ttl: 1000 * 120, // 2 minutos
});

let movieFetchController = null;
const suggestionControllers = {};

/**
 * Busca y recupera películas de la base de datos.
 * Esta es la función principal de obtención de datos.
 */
export async function fetchMovies(activeFilters, currentPage, pageSize = CONFIG.ITEMS_PER_PAGE) {
    const queryKey = JSON.stringify({ ...activeFilters, currentPage, pageSize });

    if (cache.has(queryKey)) {
        console.log(`%c[CACHE HIT] Sirviendo desde caché para la clave: ${queryKey}`, 'color: #28a745');
        return cache.get(queryKey);
    }
    console.log(`%c[CACHE MISS] Petición de red para la clave: ${queryKey}`, 'color: #dc3545');

    if (movieFetchController) {
        movieFetchController.abort();
    }
    movieFetchController = new AbortController();

    const { searchTerm, genre, year, country, director, actor, sort, mediaType, selection, excludedGenres, excludedCountries } = activeFilters;
    const offset = (currentPage - 1) * pageSize;

    const rpcParams = {
        search_term: searchTerm || '', p_genre_name: genre, p_year: year,
        p_country_name: country, p_director_name: director, p_actor_name: actor,
        p_media_type: mediaType, p_selection: selection, p_sort: sort,
        p_excluded_genres: excludedGenres,
        p_excluded_countries: excludedCountries,
        p_limit: pageSize, p_offset: offset
    };

    const { data, error } = await supabaseClient
        .rpc('search_and_count', rpcParams)
        .abortSignal(movieFetchController.signal);

    // ✨ MEJORA: Gestión de errores centralizada. Si hay un error, se lanza para que
    // el llamador (la UI en main.js) decida cómo gestionarlo. No se loguea aquí.
    if (error) {
        throw error;
    }
    
    // ✨ MEJORA CRÍTICA: Normalización de la respuesta.
    // Independientemente del resultado, la estructura de la respuesta siempre es la misma.
    const items = data || [];
    const total = items.length > 0 ? items[0].total_count : 0;
    const result = { items, total };

    cache.set(queryKey, result);

    return result;
}

/**
 * Función genérica y reutilizable para obtener sugerencias de autocompletado.
 */
const fetchSuggestions = async (rpcName, searchTerm) => {
    if (!searchTerm || searchTerm.length < 2) return [];

    if (suggestionControllers[rpcName]) {
        suggestionControllers[rpcName].abort();
    }
    suggestionControllers[rpcName] = new AbortController();

    try {
        const { data, error } = await supabaseClient
            .rpc(rpcName, { search_term: searchTerm })
            .abortSignal(suggestionControllers[rpcName].signal);

        // Para las sugerencias (no críticas), si hay un error que no sea de aborto,
        // lo logueamos aquí pero devolvemos un array vacío para no romper la UI.
        if (error) {
            if (error.name !== 'AbortError') {
                console.error(`Error fetching suggestions for '${rpcName}':`, error);
            }
            return [];
        }
        return data.map(item => item.suggestion);
    } catch (error) {
        if (error.name !== 'AbortError') {
            console.error(`Exception during suggestion call for '${rpcName}':`, error);
        }
        return [];
    }
};

export const fetchGenreSuggestions = (term) => fetchSuggestions('get_genre_suggestions', term);
export const fetchDirectorSuggestions = (term) => fetchSuggestions('get_director_suggestions', term);
export const fetchActorSuggestions = (term) => fetchSuggestions('get_actor_suggestions', term);
export const fetchCountrySuggestions = (term) => fetchSuggestions('get_country_suggestions', term);