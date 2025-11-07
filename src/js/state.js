// =================================================================
//                      MÓDULO DE ESTADO (v3.3 - Getters Optimizados)
// =================================================================
// v3.3 - Se reemplaza el costoso `structuredClone()` en los getters por
//        copias superficiales (`shallow copies`) usando el operador de propagación.
//        Esto mejora significativamente el rendimiento en cada lectura de estado,
//        ofreciendo una protección de inmutabilidad suficiente para la arquitectura actual.

import { DEFAULTS } from "./constants.js";
import { CONFIG } from "./config.js";

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
 * @property {UserMovieData} userMovieData
 */

const initialState = {
  currentPage: 1,
  totalMovies: 0,
  activeFilters: {
    searchTerm: "",
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
  userMovieData: {},
};

// Usamos `structuredClone` UNA SOLA VEZ para asegurar que el estado inicial
// sea completamente independiente y no pueda ser mutado accidentalmente.
let state = structuredClone(initialState);

// =================================================================
//          GETTERS (LECTORES DE ESTADO OPTIMIZADOS)
// =================================================================

/**
 * Devuelve una copia superficial y segura del estado global.
 * @returns {AppState}
 */
export const getState = () => {
  // 1. Copia superficial del objeto de estado principal.
  const currentState = { ...state };

  // 2. Reemplaza las propiedades anidadas con sus propias copias superficiales.
  currentState.activeFilters = getActiveFilters(); // Reutiliza la función de abajo.
  currentState.userMovieData = { ...state.userMovieData };

  // Devuelve un objeto que es seguro contra mutaciones accidentales de primer y segundo nivel.
  return currentState;
};

/**
 * Devuelve una copia superficial y segura de los filtros activos.
 * Es la función de lectura de estado más llamada, ahora es ultrarrápida.
 * @returns {ActiveFilters}
 */
export const getActiveFilters = () => {
  // 1. Copia superficial del objeto de filtros.
  const filters = { ...state.activeFilters };

  // 2. Clona explícitamente los arrays internos.
  // Esto previene que `filters.excludedGenres.push(...)` afecte al estado original.
  filters.excludedGenres = [...state.activeFilters.excludedGenres];
  filters.excludedCountries = [...state.activeFilters.excludedCountries];

  return filters;
};

export const getCurrentPage = () => {
  return state.currentPage;
};

export function hasActiveMeaningfulFilters() {
  const { activeFilters } = state;
  // No necesitamos una copia aquí, es una lectura pura y sincrónica.
  for (const key in activeFilters) {
    if (key === "mediaType" || key === "sort") {
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
  const entry = state.userMovieData[movieId];
  // Si la entrada existe, devuelve una copia. Si no, undefined.
  return entry ? { ...entry } : undefined;
};

export const getAllUserMovieData = () => {
  return { ...state.userMovieData };
};

// =================================================================
//          LÓGICA DE LÍMITE DE FILTROS Y SETTERS
// =================================================================

/**
 * Cuenta el número de filtros "significativos" que están actualmente activos.
 * @returns {number} El número total de filtros activos.
 */
export function getActiveFilterCount() {
  const { activeFilters } = state;
  let count = 0;

  const countableInclusionFilters = [
    "selection",
    "genre",
    "country",
    "director",
    "actor",
  ];
  countableInclusionFilters.forEach((type) => {
    if (activeFilters[type]) {
      count++;
    }
  });

  if (activeFilters.excludedGenres.length > 0) count++;
  if (activeFilters.excludedCountries.length > 0) count++;

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
    const isAddingNewFilter =
      value !== null && state.activeFilters[filterType] !== value;
    if (
      isAddingNewFilter &&
      getActiveFilterCount() >= CONFIG.MAX_ACTIVE_FILTERS
    ) {
      console.warn(
        `Límite de ${CONFIG.MAX_ACTIVE_FILTERS} filtros alcanzado. La acción de añadir '${filterType}' fue bloqueada.`
      );
      return false;
    }
    state.activeFilters[filterType] = value;
    return true;
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
    list.splice(index, 1);
    return true;
  } else {
    if (list.length >= limit) {
      console.warn(
        `Límite de ${limit} filtros excluidos para ${filterType} alcanzado.`
      );
      return false;
    }
    if (getActiveFilterCount() >= CONFIG.MAX_ACTIVE_FILTERS) {
      console.warn(
        `Límite global de ${CONFIG.MAX_ACTIVE_FILTERS} filtros alcanzado. La exclusión fue bloqueada.`
      );
      return false;
    }
    list.push(value);
    return true;
  }
}

export function resetFiltersState() {
  // Reseteamos usando el clon del estado inicial para mantener la integridad.
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

  document.dispatchEvent(
    new CustomEvent("userMovieDataChanged", {
      detail: { movieId },
    })
  );
}

export function clearUserMovieData() {
  state.userMovieData = {};
}
