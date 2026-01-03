// =================================================================
//                      MÓDULO DE ESTADO (v4.0 - Optimizado)
// =================================================================
// - Gestión centralizada del estado de la aplicación.
// - Implementa inmutabilidad defensiva en desarrollo.
// - Lógica de negocio para límites de filtros y conteo dinámico.
// =================================================================

import { DEFAULTS, CONFIG } from "./constants.js";

// Estado Inicial
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

// Inicialización con clonación profunda
let state = structuredClone(initialState);

// =================================================================
//          GETTERS (Lectura de Estado)
// =================================================================

/**
 * Devuelve una instantánea inmutable del estado completo.
 */
export const getState = () => {
  const currentState = {
    ...state,
    activeFilters: getActiveFilters(), // Reutiliza la lógica de clonado de filtros
    userMovieData: { ...state.userMovieData }
  };

  // En desarrollo: Congelar para detectar mutaciones accidentales
  if (import.meta.env.DEV) {
    Object.freeze(currentState);
  }
  
  return currentState;
};

/**
 * Devuelve los filtros activos asegurando copias de los arrays internos.
 */
export const getActiveFilters = () => {
  const filters = { 
    ...state.activeFilters,
    excludedGenres: [...state.activeFilters.excludedGenres],
    excludedCountries: [...state.activeFilters.excludedCountries]
  };

  if (import.meta.env.DEV) {
    Object.freeze(filters);
    Object.freeze(filters.excludedGenres);
    Object.freeze(filters.excludedCountries);
  }
  
  return filters;
};

export const getCurrentPage = () => state.currentPage;

/**
 * Comprueba si hay filtros aplicados que requieran una petición filtrada.
 * Ignora ordenación y tipo de medio.
 */
export function hasActiveMeaningfulFilters() {
  const { activeFilters } = state;
  // Lista de claves que NO se consideran filtros de contenido
  const metaKeys = new Set(["mediaType", "sort", "page"]);

  return Object.keys(activeFilters).some(key => {
    if (metaKeys.has(key)) return false;
    
    const value = activeFilters[key];
    if (Array.isArray(value)) return value.length > 0;
    return value !== null && value !== "" && value !== undefined;
  });
}

/**
 * Obtiene datos de usuario (votos/watchlist) para una película específica.
 */
export const getUserDataForMovie = (movieId) => {
  const userData = state.userMovieData[movieId] 
    ? { ...state.userMovieData[movieId] } 
    : undefined;

  if (import.meta.env.DEV && userData) Object.freeze(userData);
  return userData;
};

export const getAllUserMovieData = () => {
  const allData = { ...state.userMovieData };
  if (import.meta.env.DEV) Object.freeze(allData); // Shallow freeze es suficiente aquí si las entradas se congelan al crearse
  return allData;
};

// =================================================================
//          LOGICA DE NEGOCIO (Helpers)
// =================================================================

/**
 * Cuenta cuántos filtros "reales" están aplicados.
 * Dinámico: No requiere hardcodear claves.
 */
export function getActiveFilterCount() {
  const { activeFilters } = state;
  let count = 0;

  // 1. Filtros de exclusión (Arrays)
  if (activeFilters.excludedGenres.length > 0) count++;
  if (activeFilters.excludedCountries.length > 0) count++;

  // 2. Filtro de Año (lógica especial de rango)
  const defaultYearRange = `${CONFIG.YEAR_MIN}-${CONFIG.YEAR_MAX}`;
  if (activeFilters.year && activeFilters.year !== defaultYearRange) {
    count++;
  }

  // 3. Filtros estándar (Claves dinámicas)
  // Ignoramos claves técnicas o que ya hemos contado
  const ignoredKeys = new Set([
    "mediaType", "sort", "searchTerm", 
    "excludedGenres", "excludedCountries", "year"
  ]);

  Object.entries(activeFilters).forEach(([key, value]) => {
    if (!ignoredKeys.has(key) && value) {
      count++;
    }
  });

  return count;
}

// =================================================================
//          SETTERS (Mutación controlada)
// =================================================================

export function setCurrentPage(page) {
  state.currentPage = page;
}

export function setTotalMovies(total) {
  state.totalMovies = total;
}

/**
 * Aplica un filtro simple.
 * @param {string} filterType - Clave del filtro (genre, country, etc.)
 * @param {string|null} value - Valor a aplicar o null para limpiar.
 * @param {boolean} [force=false] - Si true, ignora el límite máximo de filtros (útil para sliders).
 * @returns {boolean} True si se aplicó, False si se bloqueó por límites.
 */
export function setFilter(filterType, value, force = false) {
  if (!(filterType in state.activeFilters)) return false;

  const currentValue = state.activeFilters[filterType];
  
  // Solo validamos límites si estamos AÑADIENDO un valor nuevo (no borrando ni cambiando uno existente)
  const isAddingNewFilter = value !== null && currentValue === null;

  if (!force && isAddingNewFilter && getActiveFilterCount() >= CONFIG.MAX_ACTIVE_FILTERS) {
    if (import.meta.env.DEV) {
      console.warn(`[State] Filtro '${filterType}' bloqueado. Límite (${CONFIG.MAX_ACTIVE_FILTERS}) alcanzado.`);
    }
    return false;
  }

  state.activeFilters[filterType] = value;
  return true;
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
 * Alterna un filtro de exclusión (Añadir/Quitar).
 */
export function toggleExcludedFilter(filterType, value) {
  // Mapeo dinámico para evitar switch/if
  const targetList = filterType === "genre" ? state.activeFilters.excludedGenres 
                   : filterType === "country" ? state.activeFilters.excludedCountries 
                   : null;

  if (!targetList) return false;

  const index = targetList.indexOf(value);

  if (index > -1) {
    // Si existe, lo quitamos (siempre permitido)
    targetList.splice(index, 1);
    return true;
  } else {
    // Si no existe, intentamos añadirlo
    
    // Validación 1: Límite específico de exclusiones
    if (targetList.length >= CONFIG.MAX_EXCLUDED_FILTERS) {
      if (import.meta.env.DEV) console.warn(`[State] Límite de exclusiones para ${filterType} alcanzado.`);
      return false;
    }
    
    // Validación 2: Límite global de filtros
    if (getActiveFilterCount() >= CONFIG.MAX_ACTIVE_FILTERS) {
      if (import.meta.env.DEV) console.warn(`[State] Límite global de filtros alcanzado.`);
      return false;
    }

    targetList.push(value);
    return true;
  }
}

export function resetFiltersState() {
  // Reinicio limpio desde el estado inicial
  state.activeFilters = structuredClone(initialState.activeFilters);
  state.totalMovies = 0; // Forzar recálculo visual del total
}

// --- Gestión de Datos de Usuario ---

export function setUserMovieData(data) {
  state.userMovieData = data || {};
}

export function updateUserDataForMovie(movieId, data) {
  if (!state.userMovieData[movieId]) {
    state.userMovieData[movieId] = { onWatchlist: false, rating: null };
  }
  
  Object.assign(state.userMovieData[movieId], data);

  // Sistema de eventos para reactividad en la UI sin frameworks
  document.dispatchEvent(
    new CustomEvent("userMovieDataChanged", {
      detail: { movieId },
    })
  );
}

export function clearUserMovieData() {
  state.userMovieData = {};
}