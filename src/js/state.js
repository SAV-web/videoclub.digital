// =-================================================================
//                      MÓDULO DE ESTADO (v3.3 - Getters Optimizados)
// =================================================================
// v3.3 - Se reemplaza el costoso `structuredClone()` en los getters por
//        copias superficiales (`shallow copies`) usando el operador de propagación.
//        Esto mejora significativamente el rendimiento en cada lectura de estado,
//        ofreciendo una protección de inmutabilidad suficiente para la arquitectura actual.
// =================================================================

import { DEFAULTS } from "./constants.js";
import { CONFIG } from "./config.js";

// ... (typedefs sin cambios)
/**
 * @typedef {object} ActiveFilters
 * @property {string} searchTerm
 * @property {string|null} genre
 * @property {string|null} year
 * @property {string|null} country
 * @property {string|null} director
 * @property {string|null} actor
 * @property {string|null} selection
 * @property {string|null} studio
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
    studio: null,
    sort: DEFAULTS.SORT,
    mediaType: DEFAULTS.MEDIA_TYPE,
    excludedGenres: [],
    excludedCountries: [],
  },
  userMovieData: {},
};

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

// ▼▼▼ LA FUNCIÓN CLAVE, AHORA OPTIMIZADA ▼▼▼
export const getUserDataForMovie = (movieId) => {
  const entry = state.userMovieData[movieId];
  // Si la entrada existe, devuelve una copia superficial. Si no, undefined.
  return entry ? { ...entry } : undefined;
};

export const getAllUserMovieData = () => {
  // También optimizamos esta función para ser consistente.
  return { ...state.userMovieData };
};

// =================================================================
//          LÓGICA DE LÍMITE DE FILTROS Y SETTERS
// =================================================================
// ... (resto del fichero sin cambios)
// ... (getActiveFilterCount, setFilter, etc.)
export function getActiveFilterCount() {
  const { activeFilters } = state;
  let count = 0;

  const countableInclusionFilters = [
    "selection",
    "studio",
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

export function setCurrentPage(page) {
  state.currentPage = page;
}

export function setTotalMovies(total) {
  state.totalMovies = total;
}

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
  state.activeFilters = structuredClone(initialState.activeFilters);
}

export function setUserMovieData(data) {
  state.userMovieData = data || {};
}

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