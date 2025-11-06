// =================================================================
//                      MÓDULO DE ESTADO (v3.2 - Con Límite de Filtros)
// =================================================================
// v3.2 - Implementado un límite global para el número de filtros "significativos" activos.
//      - La lógica de validación reside aquí para actuar como única fuente de verdad.
//      - Los setters (setFilter, toggleExcludedFilter) ahora devuelven un booleano
//        para indicar si la operación de cambio de estado fue exitosa o fue bloqueada por el límite.

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
//          LÓGICA DE LÍMITE DE FILTROS
// =================================================================

/**
 * Cuenta el número de filtros "significativos" que están actualmente activos.
 * Esta función es la base para la validación del límite.
 * @returns {number} El número total de filtros activos.
 */
export function getActiveFilterCount() {
    const { activeFilters } = state;
    let count = 0;

    // Lista de los tipos de filtro de inclusión que cuentan para el límite.
    const countableInclusionFilters = ['selection', 'genre', 'country', 'director', 'actor'];
    countableInclusionFilters.forEach(type => {
        if (activeFilters[type]) {
            count++;
        }
    });

    // Un grupo de exclusiones cuenta como un único filtro.
    if (activeFilters.excludedGenres.length > 0) count++;
    if (activeFilters.excludedCountries.length > 0) count++;

    // El rango de años solo cuenta si ha sido modificado del valor por defecto.
    const defaultYearRange = `${CONFIG.YEAR_MIN}-${CONFIG.YEAR_MAX}`;
    if (activeFilters.year && activeFilters.year !== defaultYearRange) {
        count++;
    }

    return count;
}


// =================================================================
//          SETTERS (MODIFICADORES DE ESTADO)
// =================================================================

export function setCurrentPage(page) {
    state.currentPage = page;
}

export function setTotalMovies(total) {
    state.totalMovies = total;
}

/**
 * Establece un filtro de inclusión, validando primero si se ha alcanzado el límite.
 * @param {string} filterType - El tipo de filtro a establecer.
 * @param {string|null} value - El valor del filtro.
 * @returns {boolean} `true` si el filtro se aplicó, `false` si fue bloqueado por el límite.
 */
export function setFilter(filterType, value) {
    if (filterType in state.activeFilters) {
        // Validación: Solo comprobamos el límite si estamos intentando AÑADIR un nuevo filtro.
        // Si `value` es null, estamos quitando un filtro, lo cual siempre está permitido.
        const isAddingNewFilter = value !== null && state.activeFilters[filterType] !== value;
        if (isAddingNewFilter && getActiveFilterCount() >= CONFIG.MAX_ACTIVE_FILTERS) {
            console.warn(`Límite de ${CONFIG.MAX_ACTIVE_FILTERS} filtros alcanzado. La acción de añadir '${filterType}' fue bloqueada.`);
            return false; // Indica a la UI que la acción falló.
        }

        state.activeFilters[filterType] = value;
        return true; // Indica que el cambio de estado fue exitoso.
    }
    return false;
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

/**
 * Añade o quita un filtro de la lista de exclusión, validando el límite global.
 * @param {string} filterType - 'genre' o 'country'.
 * @param {string} value - El valor a añadir/quitar.
 * @returns {boolean} `true` si la operación tuvo éxito, `false` si fue bloqueada.
 */
export function toggleExcludedFilter(filterType, value) {
    const config = {
        genre: { list: state.activeFilters.excludedGenres, limit: 3 },
        country: { list: state.activeFilters.excludedCountries, limit: 3 },
    };

    if (!config[filterType]) return false;
    const { list, limit } = config[filterType];
    const index = list.indexOf(value);

    if (index > -1) {
        // Si el filtro ya está en la lista, lo quitamos. Esto siempre se permite.
        list.splice(index, 1);
        return true;
    } else {
        // Si no está, intentamos añadirlo.
        
        // Primero, validamos el límite de exclusiones por categoría (ej. max 3 géneros excluidos).
        if (list.length >= limit) {
            console.warn(`Límite de ${limit} filtros excluidos para ${filterType} alcanzado.`);
            return false;
        }

        // Segundo, validamos el límite global de filtros activos.
        // Esto es crucial si, por ejemplo, ya tenemos 3 filtros de inclusión y queremos añadir una exclusión.
        if (getActiveFilterCount() >= CONFIG.MAX_ACTIVE_FILTERS) {
            console.warn(`Límite global de ${CONFIG.MAX_ACTIVE_FILTERS} filtros alcanzado. La exclusión fue bloqueada.`);
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
 * @param {number | string} movieId - El ID de la película.
 * @param {Partial<UserMovieEntry>} data - Los datos a actualizar.
 */
export function updateUserDataForMovie(movieId, data) {
    if (!state.userMovieData[movieId]) {
        state.userMovieData[movieId] = { onWatchlist: false, rating: null };
    }
    Object.assign(state.userMovieData[movieId], data);
    
    document.dispatchEvent(new CustomEvent('userMovieDataChanged', { 
        detail: { movieId } 
    }));
}

export function clearUserMovieData() {
    state.userMovieData = {};
}