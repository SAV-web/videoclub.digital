// =================================================================
//          MÓDULO DE SERVICIO API (Versión Segura)
// =================================================================
// Ubicación: src/js/api.js
//
// Responsabilidades:
// 1. Usar el cliente de Supabase para invocar la Edge Function 'search-movies'.
//    - Si el usuario está logueado, el cliente adjuntará el token JWT automáticamente.
//    - Si es anónimo, no se adjuntará ningún token.
// 2. Eliminar la dependencia de la API Key pública.
// 3. Mantener la lógica de caché y cancelación de peticiones.
// =================================================================

import { CONFIG } from './config.js';
// Importamos la instancia ÚNICA del cliente de Supabase.
// Este cliente es "inteligente": conoce el estado de autenticación del usuario.
import { supabase } from './supabaseClient.js';
import { LRUCache } from 'https://esm.sh/lru-cache@10.2.0';

const cache = new LRUCache({
    max: 50,
    ttl: 1000 * 120, // 2 minutos
});

let movieFetchController = null;
const suggestionControllers = {};

/**
 * Busca y recupera películas invocando de forma segura la Edge Function.
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

    try {
        // =================================================================
        // CAMBIO CRÍTICO: De 'fetch' a 'supabase.functions.invoke'
        // =================================================================
        // Usamos el método 'invoke' del cliente de Supabase. Esto se encarga de:
        // - Construir la URL correcta a la Edge Function.
        // - Adjuntar el token JWT del usuario si está logueado.
        // - Manejar las cabeceras estándar de Supabase.
        const { data, error } = await supabase.functions.invoke('search-movies', {
            body: { activeFilters, currentPage, pageSize },
            signal: movieFetchController.signal,
        });
        // =================================================================

        // Si la función devuelve un error (ej. el token expiró), lo lanzamos.
        if (error) {
            throw new Error(error.message);
        }

        // La respuesta de la función ahora está en la propiedad 'data'.
        const result = data;
        cache.set(queryKey, result);
        return result;

    } catch (error) {
        if (error.name === 'AbortError') {
            console.log('Petición a la Edge Function cancelada.');
            return new Promise(() => {}); // Detiene la cadena de promesas.
        }
        // Propagamos el error para que sea manejado en main.js y se muestre un toast.
        throw error;
    }
}

/**
 * Función genérica y reutilizable para obtener sugerencias de autocompletado.
 * Esta función no necesita cambios, ya que llama a RPCs que son públicamente legibles.
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