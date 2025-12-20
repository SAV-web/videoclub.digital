// =-================================================================
//                      MÓDULO DE ESTADO (v3.4 - Inmutabilidad en Desarrollo)
// =================================================================
// v3.4 - Se introduce Object.freeze() en los getters durante el desarrollo
//        para prevenir mutaciones accidentales del estado, siguiendo
//        las mejores prácticas de programación defensiva. Este código
//        se elimina automáticamente en producción para no afectar el rendimiento.
// v3.3 - Optimizados los getters con copias superficiales.
// =================================================================

import { DEFAULTS, CONFIG } from "./constants.js";

// ... (typedefs sin cambios)
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
//          GETTERS (CON PROTECCIÓN DE INMUTABILIDAD EN DESARROLLO)
// =================================================================

export const getState = () => {
  const currentState = { ...state };
  currentState.activeFilters = getActiveFilters();
  currentState.userMovieData = { ...state.userMovieData };

  // Solo en desarrollo, congelamos el estado para detectar mutaciones.
  if (import.meta.env.DEV) {
    Object.freeze(currentState);
  }
  
  return currentState;
};

export const getActiveFilters = () => {
  const filters = { ...state.activeFilters };
  filters.excludedGenres = [...state.activeFilters.excludedGenres];
  filters.excludedCountries = [...state.activeFilters.excludedCountries];

  // Solo en desarrollo: congelamos el objeto y sus arrays internos.
  // Si cualquier otra parte del código intenta modificar este objeto,
  // la consola lanzará un error, ayudándonos a encontrar bugs de mutación.
  if (import.meta.env.DEV) {
    Object.freeze(filters);
    Object.freeze(filters.excludedGenres);
    Object.freeze(filters.excludedCountries);
  }
  
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

export const getUserDataForMovie = (movieId) => {
  const entry = state.userMovieData[movieId];
  const userData = entry ? { ...entry } : undefined;

  if (import.meta.env.DEV && userData) {
    Object.freeze(userData);
  }

  return userData;
};

export const getAllUserMovieData = () => {
  const allData = { ...state.userMovieData };

  if (import.meta.env.DEV) {
    // Congelamos cada entrada individual del objeto
    for(const key in allData) {
        Object.freeze(allData[key]);
    }
    Object.freeze(allData);
  }

  return allData;
};

// =================================================================
//          SETTERS (El único lugar donde se debe mutar el estado)
// =================================================================
// ... (El resto del fichero permanece sin cambios)

// (Pega aquí el resto de tus funciones setter: getActiveFilterCount, setCurrentPage, etc.)
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
      // MEJORA: Log solo en desarrollo. En producción esto se elimina.
      if (import.meta.env.DEV) {
        console.warn(
          `[State] Límite de ${CONFIG.MAX_ACTIVE_FILTERS} filtros alcanzado. Bloqueado: '${filterType}'.`
        );
      }
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
      // MEJORA: Log solo en desarrollo
      if (import.meta.env.DEV) {
        console.warn(
          `[State] Límite de ${limit} exclusiones para ${filterType} alcanzado.`
        );
      }
      return false;
    }
    if (getActiveFilterCount() >= CONFIG.MAX_ACTIVE_FILTERS) {
      // MEJORA: Log solo en desarrollo
      if (import.meta.env.DEV) {
        console.warn(
          `[State] Límite global de filtros alcanzado. Exclusión bloqueada.`
        );
      }
      return false;
    }
    list.push(value);
    return true;
  }
}

export function resetFiltersState() {
  state.activeFilters = structuredClone(initialState.activeFilters);
  state.totalMovies = 0; // Forzar recálculo del total al cambiar contexto (ej: popstate)
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