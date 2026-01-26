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
    myList: null, // null | 'rated' | 'watchlist' | 'mixed'
  },
  userMovieData: {},
};

// Inicialización con clonación profunda
let state = structuredClone(initialState);

// Caché para conteo de filtros (Optimización O(1) en lectura)
let cachedFilterCount = -1;

// =================================================================
//          GETTERS (Lectura de Estado)
// =================================================================

/**
 * Devuelve una instantánea inmutable del estado completo.
 */
export const getState = () => {
  const currentState = {
    ...state,
    activeFilters: getActiveFilters(),
    userMovieData: getAllUserMovieData() // Composición de getters: evita duplicar lógica de clonado
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
  // 0. Si estamos en "Mi Lista", es un filtro significativo
  if (state.activeFilters.myList) return true;

  // 1. Reutilizar lógica de conteo (Maneja exclusiones, rangos de año por defecto y filtros estándar)
  if (getActiveFilterCount() > 0) return true;

  // 2. Verificar búsqueda por texto (getActiveFilterCount la ignora explícitamente)
  const { searchTerm } = state.activeFilters;
  return !!(searchTerm && searchTerm.trim().length > 0);
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
  if (cachedFilterCount !== -1) return cachedFilterCount;

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
    "mediaType", "sort", "searchTerm", "myList",
    "excludedGenres", "excludedCountries", "year"
  ]);

  Object.entries(activeFilters).forEach(([key, value]) => {
    if (!ignoredKeys.has(key) && value) {
      count++;
    }
  });

  cachedFilterCount = count;
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
  
  // 4.2: Optimización - Si el valor no cambia, no hacemos nada (evita invalidar total)
  if (currentValue === value) return true;

  // 4.1: Detección robusta de "nuevo filtro" (considerando null/undefined/vacío como inactivo)
  const isEmpty = (v) => v === null || v === undefined || v === "";
  const isAddingNewFilter = !isEmpty(value) && isEmpty(currentValue);

  if (!force && isAddingNewFilter && getActiveFilterCount() >= CONFIG.MAX_ACTIVE_FILTERS) {
    if (import.meta.env.DEV) {
      console.warn(`[State] Filtro '${filterType}' bloqueado. Límite (${CONFIG.MAX_ACTIVE_FILTERS}) alcanzado.`);
    }
    return false;
  }

  // Lógica de Exclusividad: Si activamos myList, limpiamos otros filtros (excepto sort/mediaType)
  // Esto se maneja mejor en el controlador (sidebar.js), pero aquí aseguramos consistencia si se llama directo.
  if (filterType === 'myList' && value) {
     // No limpiamos aquí para evitar efectos secundarios ocultos, el caller debe limpiar.
  }

  state.activeFilters[filterType] = value;
  // Invalidate total: el total depende de filtros, y se recalcula sólo en page 1 (smart count).
  state.totalMovies = 0;
  cachedFilterCount = -1; // Invalidar caché de conteo
  return true;
}

export function setSearchTerm(term) {
  state.activeFilters.searchTerm = term;
  // Invalidate total: el total depende de filtros, y se recalcula sólo en page 1 (smart count).
  state.totalMovies = 0;
  let filtersCleared = false;
  
  // Lógica de exclusividad: Si buscamos por texto, limpiamos actor y director
  if (term && term.length > 0) {
    if (state.activeFilters.actor || state.activeFilters.director) {
      filtersCleared = true;
    }
    state.activeFilters.actor = null;
    state.activeFilters.director = null;
    
    // Si buscamos, salimos de "Mi Lista" para mostrar resultados globales
    state.activeFilters.myList = false;
  }
  return filtersCleared;
}

export function setSort(sortValue) {
  state.activeFilters.sort = sortValue;
}

export function setMediaType(mediaType) {
  state.activeFilters.mediaType = mediaType;
  // Invalidate total: el total depende de filtros, y se recalcula sólo en page 1 (smart count).
  state.totalMovies = 0;
}

/**
 * Alterna un filtro de exclusión (Añadir/Quitar).
 */
export function toggleExcludedFilter(filterType, value) {
  // 5) Simplificación: Mapeo literal para mejor legibilidad y extensibilidad
  const listMap = {
    genre: state.activeFilters.excludedGenres,
    country: state.activeFilters.excludedCountries
  };
  
  const targetList = listMap[filterType];

  if (!targetList) return false;

  const index = targetList.indexOf(value);

  if (index > -1) {
    // Si existe, lo quitamos (siempre permitido)
    targetList.splice(index, 1);
    // Invalidate total: el total depende de filtros, y se recalcula sólo en page 1 (smart count).
    state.totalMovies = 0;
    cachedFilterCount = -1;
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
    // Invalidate total: el total depende de filtros, y se recalcula sólo en page 1 (smart count).
    state.totalMovies = 0;
    cachedFilterCount = -1;
    return true;
  }
}

export function resetFiltersState() {
  // Reinicio limpio desde el estado inicial
  state.activeFilters = structuredClone(initialState.activeFilters);
  state.totalMovies = 0; // Forzar recálculo visual del total
  cachedFilterCount = -1;
}

// --- Gestión de Datos de Usuario ---

export function setUserMovieData(data) {
  state.userMovieData = data || {};
}

export function updateUserDataForMovie(movieId, data) {
  // Inmutabilidad: Reemplazar objeto en lugar de mutarlo con Object.assign
  const current = state.userMovieData[movieId] || { onWatchlist: false, rating: null };
  const updated = { ...current, ...data };
  
  // 7.1 Optimización: Evitar eventos si no hay cambios reales
  if (current.rating === updated.rating && current.onWatchlist === updated.onWatchlist) {
    return;
  }

  // En DEV: Congelar la entrada individual para garantizar integridad referencial
  if (import.meta.env.DEV) Object.freeze(updated);
  
  state.userMovieData[movieId] = updated;

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