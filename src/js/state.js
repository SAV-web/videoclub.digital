// =================================================================
//                      MÓDULO DE ESTADO (v3 - Consolidado)
// =================================================================
// v3.0 - Refactorizada la gestión de estado del usuario.
//        Se reemplaza 'userLists' por 'userMovieData', un objeto
//        que mapea movieId -> { onWatchlist, rating }.
//        Esto se alinea con la nueva tabla 'user_movie_entries'.

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
 * @property {string[]} excludedGenres
 * @property {string[]} excludedCountries
 */

/**
 * @typedef {object} UserMovieEntry
 * @property {boolean} onWatchlist
 * @property {number|null} rating
 */

/**
 * @typedef {object.<string, UserMovieEntry>} UserMovieData
 */

/**
 * @typedef {object} AppState
 * @property {number} currentPage
 * @property {number} totalMovies
 * @property {ActiveFilters} activeFilters
 * @property {number} latestRequestId
 * @property {UserMovieData} userMovieData
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
    latestRequestId: 0,
    userMovieData: {}, // El estado inicial es un objeto vacío
};

let state = structuredClone(initialState);

// =================================================================
//          GETTERS (LECTORES DE ESTADO)
// =================================================================

export const getState = () => {
    return structuredClone(state);
};

export const getActiveFilters = () => {
    return structuredClone(state.activeFilters);
};

export const getCurrentPage = () => {
    return state.currentPage;
};

export function getLatestRequestId() {
    return state.latestRequestId;
}

export function hasActiveMeaningfulFilters() {
    const { activeFilters } = state;
    for (const key in activeFilters) {
        if (key === 'mediaType' || key === 'sort') {
            continue;
        }
        const value = activeFilters[key];
        if (Array.isArray(value) ? value.length > 0 : value) {
            return true;
        }
    }
    return false;
}

// --- GETTERS REFACTORIZADOS PARA DATOS DE USUARIO ---

/**
 * Obtiene los datos de usuario para una película específica.
 * @param {number | string} movieId - El ID de la película.
 * @returns {UserMovieEntry | undefined} Una copia del objeto de datos, o undefined si no existe.
 */
export const getUserDataForMovie = (movieId) => {
    // Devuelve una copia para mantener la inmutabilidad
    return state.userMovieData[movieId] ? { ...state.userMovieData[movieId] } : undefined;
};

/**
 * Devuelve todos los datos de usuario.
 * @returns {UserMovieData}
 */
export const getAllUserMovieData = () => {
    return structuredClone(state.userMovieData);
};

// =================================================================
//          SETTERS (MODIFICADORES DE ESTADO)
// =================================================================

export function setCurrentPage(page) {
    state.currentPage = page;
}

export function setTotalMovies(total) {
    state.totalMovies = total;
}

export function setFilter(filterType, value) {
    if (filterType in state.activeFilters) {
        if (filterType === 'country' && value !== null) {
            state.activeFilters.excludedCountries = [];
        }
        if (filterType === 'genre' && value !== null) {
            state.activeFilters.excludedGenres = [];
        }
        state.activeFilters[filterType] = value;
    }
}

export function setSearchTerm(term) {
    state.activeFilters.searchTerm = term;
}

export function setSort(sortValue) {
    state.activeFilters.sort = sortValue;
}

export function setMediaType(mediaType) {
    state.activeFilters.mediaType = mediaType;
}

export function toggleExcludedFilter(filterType, value) {
    const config = {
        genre: { list: state.activeFilters.excludedGenres, limit: 3 },
        country: { list: state.activeFilters.excludedCountries, limit: 3 },
    };

    if (!config[filterType]) return false;

    const { list, limit } = config[filterType];
    const index = list.indexOf(value);

    if (index > -1) {
        list.splice(index, 1);
        return true;
    } else {
        if (filterType === 'country') state.activeFilters.country = null;
        if (filterType === 'genre') state.activeFilters.genre = null;
        if (list.length >= limit) {
            console.warn(`Límite de ${limit} filtros excluidos para ${filterType} alcanzado.`);
            return false;
        }
        list.push(value);
        return true;
    }
}

export function incrementRequestId() {
    state.latestRequestId++;
    return state.latestRequestId;
}

export function resetFiltersState() {
    state.activeFilters = structuredClone(initialState.activeFilters);
}

// --- SETTERS REFACTORIZADOS PARA DATOS DE USUARIO ---

/**
 * Reemplaza completamente los datos de película del usuario.
 * Se usa al cargar los datos después del login.
 * @param {UserMovieData} data - El objeto completo de datos de usuario.
 */
export function setUserMovieData(data) {
    state.userMovieData = data || {};
}

/**
 * Actualiza (o crea) la entrada para una película específica.
 * Permite actualizaciones parciales (ej. solo cambiar 'rating').
 * @param {number | string} movieId - El ID de la película.
 * @param {Partial<UserMovieEntry>} data - Los datos a actualizar.
 */
export function updateUserDataForMovie(movieId, data) {
    if (!state.userMovieData[movieId]) {
        // Si no existe una entrada para esta película, la creamos con valores por defecto.
        state.userMovieData[movieId] = { onWatchlist: false, rating: null };
    }
    // Fusionamos los nuevos datos con los existentes.
    Object.assign(state.userMovieData[movieId], data);
}

/**
 * Limpia todos los datos de película del usuario. Se usa al cerrar sesión.
 */
export function clearUserMovieData() {
    state.userMovieData = {};
}