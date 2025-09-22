// =================================================================
//                      MÓDULO DE ESTADO
// =================================================================
// Este fichero es el "cerebro" o la "única fuente de verdad" de la aplicación.
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
 */
export function resetFiltersState() {
    state.activeFilters = structuredClone(initialState.activeFilters);
}