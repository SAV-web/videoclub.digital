// =================================================================
//                      MÓDULO DE ESTADO
// =================================================================
// Este fichero es el "cerebro" o la "única fuente de verdad" (Single Source of Truth) de la aplicación.
// Centraliza todos los datos dinámicos (filtros, paginación, etc.) en un solo lugar.
// Esto previene que el estado se disperse por la aplicación, facilitando su gestión y depuración.

import { DEFAULTS } from './constants.js';
import { CONFIG } from './config.js';

/**
 * @typedef {object} ActiveFilters
 * @property {string} searchTerm
 * @property {string|null} genre
 * @property {string|null} year
 * @property {string|null} country
 * @property {string|null} director
 * @property {string|null} actor
 * @property {string|null} selection
 * @property {string} sort
 * @property {string} mediaType
 * @property {string[]} excludedGenres - Array de géneros a excluir.
 * @property {string[]} excludedCountries - Array de países a excluir.
 */

/**
 * @typedef {object} AppState
 * @property {number} currentPage
 * @property {number} totalMovies
 * @property {ActiveFilters} activeFilters
 * @property {number} latestRequestId - ID para evitar race conditions en las peticiones a la API.
 */

/**
 * El estado por defecto de la aplicación al cargarse por primera vez.
 * @type {AppState}
 */
const initialState = {
    currentPage: 1,
    totalMovies: 0,
    activeFilters: {
        searchTerm: '',
        genre: null,
        year: null,
        country: null,
        director: null,
        actor: null,
        selection: null,
        sort: DEFAULTS.SORT,
        mediaType: DEFAULTS.MEDIA_TYPE,
        excludedGenres: [],
        excludedCountries: [],
    },
    latestRequestId: 0
};

// `state` es la variable que contendrá el estado actual de la aplicación.
// Se inicializa con una copia profunda del `initialState` para evitar mutaciones accidentales del objeto original.
let state = structuredClone(initialState);

// =================================================================
//          GETTERS (LECTORES DE ESTADO)
// =================================================================
// Funciones para OBTENER datos del estado. Son la única vía de acceso de lectura desde fuera.
// Devuelven copias para asegurar la inmutabilidad (que el estado no se pueda cambiar por accidente).

/**
 * Devuelve una copia profunda del estado completo de la aplicación.
 * @returns {AppState}
 */
export const getState = () => {
    return structuredClone(state);
};

/**
 * Devuelve una copia profunda de los filtros activos.
 * @returns {ActiveFilters}
 */
export const getActiveFilters = () => {
    return structuredClone(state.activeFilters);
};

/**
 * Devuelve el número de la página actual.
 * @returns {number}
 */
export const getCurrentPage = () => {
    return state.currentPage;
};

/**
 * Devuelve el ID de la última petición a la API.
 * @returns {number}
 */
export function getLatestRequestId() {
    return state.latestRequestId;
}

/**
 * Comprueba si hay filtros "significativos" activos.
 * Un filtro es significativo si no es el de tipo de medio ('mediaType')
 * o el de ordenación por defecto.
 * @returns {boolean}
 */
export function hasActiveMeaningfulFilters() {
    const { activeFilters } = state;

    for (const key in activeFilters) {
        const value = activeFilters[key];

        // ✨ CORRECCIÓN: Ignoramos siempre los filtros de tipo de medio y de ordenación.
        if (key === 'mediaType' || key === 'sort') {
            continue;
        }

        // Si encontramos cualquier otro filtro con un valor (que no sea un array vacío),
        // significa que hay un filtro significativo activo.
        if (Array.isArray(value) ? value.length > 0 : value) {
            return true;
        }
    }
    return false;
}

// =================================================================
//          SETTERS (MODIFICADORES DE ESTADO)
// =================================================================
// Funciones para MODIFICAR el estado. Son la única vía para cambiar los datos.
// Esto crea un flujo de datos predecible y controlado.

/**
 * Establece el número de la página actual.
 * @param {number} page
 */
export function setCurrentPage(page) {
    state.currentPage = page;
}

/**
 * Establece el número total de películas encontradas en la última búsqueda.
 * @param {number} total
 */
export function setTotalMovies(total) {
    state.totalMovies = total;
}

/**
 * Establece el valor para un tipo de filtro específico.
 * @param {keyof ActiveFilters} filterType - El tipo de filtro a modificar (ej: 'genre', 'year').
 * @param {string|null} value - El valor del filtro.
 */
export function setFilter(filterType, value) {
    if (filterType in state.activeFilters) {
        // ✨ NUEVA LÓGICA: Si se establece un filtro de país, se limpia cualquier exclusión de país.
        // Esto asegura que los filtros de inclusión y exclusión de país sean mutuamente exclusivos.
        if (filterType === 'country' && value !== null) {
            state.activeFilters.excludedCountries = [];
        }

        state.activeFilters[filterType] = value;
    }
}

/**
 * Establece el término de búsqueda.
 * @param {string} term
 */
export function setSearchTerm(term) {
    state.activeFilters.searchTerm = term;
}

/**
 * Establece el criterio de ordenación.
 * @param {string} sortValue
 */
export function setSort(sortValue) {
    state.activeFilters.sort = sortValue;
}

/**
 * Establece el tipo de medio (cine, tv o todo).
 * @param {string} mediaType
 */
export function setMediaType(mediaType) {
    state.activeFilters.mediaType = mediaType;
}

/**
 * Añade o quita un valor de un filtro de exclusión (que es un array).
 * @param {'genre'|'country'} filterType - El tipo de filtro a modificar.
 * @param {string} value - El valor a añadir o quitar del array.
 * @returns {boolean} - Devuelve `true` si la operación fue exitosa, `false` si se alcanzó un límite.
 */
export function toggleExcludedFilter(filterType, value) {
    const config = {
        genre: {
            list: state.activeFilters.excludedGenres,
            limit: 3 // ✨ Límite restaurado a 3
        },
        country: {
            list: state.activeFilters.excludedCountries,
            limit: 3 // ✨ Límite restaurado a 3
        },
        // ✨ NUEVO: Añadimos director y actor a la configuración de exclusión si fuera necesario en el futuro
        // Por ahora, no tienen límite y no se usan, pero la estructura está lista.
        director: { list: [], limit: 0 },
        actor: { list: [], limit: 0 }
    };

    if (!config[filterType]) {
        return false; // Tipo de filtro no soportado.
    }

    const { list, limit } = config[filterType];
    const index = list.indexOf(value);

    if (index > -1) {
        // Si ya está en la lista, lo quitamos
        list.splice(index, 1);
        return true;
    } else {
        // Si no está, intentamos añadirlo, pero primero comprobamos el límite.
        // ✨ NUEVA LÓGICA: Si se añade una exclusión de país, se limpia cualquier filtro de inclusión de país.
        if (filterType === 'country') {
            state.activeFilters.country = null;
        }

        if (list.length >= limit) {
            console.warn(`Límite de ${limit} filtros excluidos para ${filterType} alcanzado.`);
            return false; // La operación falló, se alcanzó el límite.
        }
        list.push(value);
        return true; // La operación tuvo éxito.
    }
}

/**
 * Incrementa el contador de peticiones y devuelve el nuevo ID.
 * Se llama justo antes de hacer una petición a la API.
 * @returns {number}
 */
export function incrementRequestId() {
    state.latestRequestId++;
    return state.latestRequestId;
}

/**
 * Resetea el estado de los filtros a sus valores iniciales por defecto.
 * No resetea la paginación ni otros aspectos del estado global.
 * Esto incluye limpiar los géneros excluidos gracias a que `initialState` ya los tiene vacíos.
 */
export function resetFiltersState() {
    state.activeFilters = structuredClone(initialState.activeFilters);
}