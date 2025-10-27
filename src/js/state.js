// =================================================================
//                      MÓDULO DE ESTADO (v3.1 - Eventos Granulares)
// =================================================================
// v3.1 - Añadido un evento granular 'userMovieDataChanged' al actualizar
//        los datos de una película. Esto permite a la UI realizar
//        actualizaciones dirigidas y mucho más eficientes.

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
    userMovieData: {},
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

export const getUserDataForMovie = (movieId) => {
    return state.userMovieData[movieId] ? { ...state.userMovieData[movieId] } : undefined;
};

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

// --- SETTERS DE DATOS DE USUARIO ---

export function setUserMovieData(data) {
    state.userMovieData = data || {};
}

/**
 * Actualiza (o crea) la entrada para una película específica.
 * Permite actualizaciones parciales (ej. solo cambiar 'rating').
 * Despacha un evento granular 'userMovieDataChanged' para una actualización de UI dirigida.
 * @param {number | string} movieId - El ID de la película.
 * @param {Partial<UserMovieEntry>} data - Los datos a actualizar.
 */
export function updateUserDataForMovie(movieId, data) {
    if (!state.userMovieData[movieId]) {
        state.userMovieData[movieId] = { onWatchlist: false, rating: null };
    }
    Object.assign(state.userMovieData[movieId], data);
    
    // --- ¡NUEVO! Evento granular para actualizaciones de UI eficientes ---
    document.dispatchEvent(new CustomEvent('userMovieDataChanged', { 
        detail: { movieId } 
    }));
}

export function clearUserMovieData() {
    state.userMovieData = {};
}