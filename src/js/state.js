// =================================================================
//                      MÓDULO DE ESTADO (El "Cerebro")
// =================================================================
// - Guarda los datos importantes (filtros, página actual, etc.).
// - Usa un "vigilante" (Proxy) para avisar al instante cuando algo cambia.
// =================================================================

import { DEFAULTS, CONFIG } from "./constants.js";
import { normalizeText } from "./utils.js";
import {
  areContractValuesEqual,
  normalizeActiveFilters,
  normalizeFilterValue,
  normalizeMovieId,
  normalizePageNumber,
  normalizeSort,
  normalizeMediaType,
  normalizeTotalMovies,
  normalizeUserMovieData,
  normalizeUserMovieEntry,
} from "./contracts.js";

// 1. Estado inicial: La configuración por defecto al entrar a la web.
const initialState = {
  currentPage: 1,
  totalMovies: 0,
  activeFilters: normalizeActiveFilters({
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
  }),
  userMovieData: {},
};

export const appEvents = {
  events: {},
  on(event, fn) {
    if (!this.events[event]) this.events[event] = [];
    this.events[event].push(fn);
  },
  emit(event, data) {
    if (this.events[event]) this.events[event].forEach(fn => fn(data));
  }
};

// 2. El Vigilante (Proxy Profundo): Envuelve un objeto y reacciona cuando cambia cualquier dato anidado.
function makeReactive(obj, path = "") {
  return new Proxy(obj, {
    get(target, property) {
      const val = target[property];
      if (typeof val === 'object' && val !== null && !Object.isFrozen(val)) {
        return makeReactive(val, `${path}${String(property)}.`);
      }
      return val;
    },
    set(target, property, value) {
      const oldValue = target[property];
      target[property] = value; // Aplicamos el cambio real
      
      // Si el valor realmente cambió y es de datos de usuario, avisamos a la web
      if (oldValue !== value) {
        const fullPath = `${path}${String(property)}`;
        appEvents.emit('state:changed', { path: fullPath, value, oldValue });
        
        if (fullPath.startsWith("userMovieData.")) {
          const parts = fullPath.split(".");
          const movieId = parseInt(parts[1], 10);
          if (!isNaN(movieId)) appEvents.emit("userMovieDataChanged", { movieId });
        }
      }
      return true; // Asignación exitosa
    }
  });
}

// Creamos nuestro estado global vigilado
let state = makeReactive({
  currentPage: initialState.currentPage,
  totalMovies: initialState.totalMovies,
  activeFilters: structuredClone(initialState.activeFilters),
  userMovieData: {}
});

// =================================================================
//          TRADUCTOR DE URL (Para poder compartir enlaces)
// =================================================================

export const URL_PARAM_MAP = {
  q: "searchTerm", genre: "genre", year: "year", country: "country",
  dir: "director", actor: "actor", sel: "selection", stu: "studio",
  sort: "sort", type: "mediaType", p: "page",
  exg: "excludedGenres", exc: "excludedCountries",
  list: "myList"
};
export const REVERSE_URL_PARAM_MAP = Object.fromEntries(Object.entries(URL_PARAM_MAP).map(([key, value]) => [value, key]));

// Convierte el estado actual en texto para la URL (?genre=Accion&p=2)
export function stateToUrlParams(activeFilters, currentPage) {
  const params = new URLSearchParams();

  Object.entries(activeFilters).forEach(([key, value]) => {
    const shortKey = REVERSE_URL_PARAM_MAP[key];
    if (!shortKey) return;
    
    if (Array.isArray(value) && value.length > 0) params.set(shortKey, value.join(","));
    else if (key === "myList" && value) params.set(shortKey, value);
    else if (typeof value === "string" && value.trim() !== "") {
      // No ponemos en la URL los valores por defecto
      if ((key === "mediaType" && value === DEFAULTS.MEDIA_TYPE) ||
          (key === "sort" && value === DEFAULTS.SORT) ||
          (key === "year" && value === `${CONFIG.YEAR_MIN}-${CONFIG.YEAR_MAX}`)) return;
      
      const valToSet = ['director', 'actor', 'genre', 'country'].includes(key) ? normalizeText(value) : value;
      params.set(shortKey, valToSet);
    }
  });
  
  if (currentPage > 1) params.set("p", currentPage);
  return params;
}

// Lee la URL y actualiza el estado
export function syncStateWithUrlParams(queryString) {
  resetFiltersState();
  const params = new URLSearchParams(queryString);
  
  setCurrentPage(params.get("p"));

  Object.entries(URL_PARAM_MAP).forEach(([shortKey, stateKey]) => {
    if (stateKey === "page") return;
    const val = params.get(shortKey);
    if (val !== null) {
      if (["excludedGenres", "excludedCountries"].includes(stateKey)) setFilter(stateKey, val.split(","), true);
      else if (stateKey === "myList") setFilter(stateKey, val === "true" ? "mixed" : val, true);
      else if (stateKey === "searchTerm") setSearchTerm(val);
      else if (stateKey === "sort") setSort(val);
      else if (stateKey === "mediaType") setMediaType(val);
      else setFilter(stateKey, val, true);
    }
  });
  
  if (!state.activeFilters.sort) setSort(DEFAULTS.SORT);
  if (!state.activeFilters.mediaType) setMediaType(DEFAULTS.MEDIA_TYPE);
}

// =================================================================
//          GETTERS (Lectura de Estado)
// =================================================================

/**
 * Obtiene una copia segura de todo el estado
 */
export const getState = () => ({ ...state, activeFilters: getActiveFilters(), userMovieData: getAllUserMovieData() });

// Obtiene los filtros actuales creando copias de las listas para evitar modificaciones accidentales
export const getActiveFilters = () => ({
  ...state.activeFilters,
  excludedGenres: [...state.activeFilters.excludedGenres],
  excludedCountries: [...state.activeFilters.excludedCountries]
});

export const getCurrentPage = () => state.currentPage;
export const setCurrentPage = (page) => { state.currentPage = normalizePageNumber(page); };
export const getUserDataForMovie = (id) => state.userMovieData[id] ? { ...state.userMovieData[id] } : undefined;
export const getAllUserMovieData = () => ({ ...state.userMovieData });

/**
 * ¿Hay algún filtro importante aplicado?
 */
export function hasActiveMeaningfulFilters() {
  if (state.activeFilters.myList || getActiveFilterCount() > 0) return true;
  return !!state.activeFilters.searchTerm?.trim();
}

// =================================================================
//          LOGICA DE NEGOCIO (Helpers)
// =================================================================

// Cuenta cuántos filtros "reales" hay activos
export function getActiveFilterCount() {
  let count = state.activeFilters.excludedGenres.length + state.activeFilters.excludedCountries.length;
  if (state.activeFilters.year && state.activeFilters.year !== `${CONFIG.YEAR_MIN}-${CONFIG.YEAR_MAX}`) count++;

  for (const key in state.activeFilters) {
    if (!["mediaType", "sort", "searchTerm", "myList", "excludedGenres", "excludedCountries", "year"].includes(key) && state.activeFilters[key]) {
      count++;
    }
  }
  return count;
}

export function setTotalMovies(total) { state.totalMovies = normalizeTotalMovies(total); }
export const setSort = (sort) => { state.activeFilters.sort = normalizeSort(sort); };
export const setMediaType = (type) => { state.activeFilters.mediaType = normalizeMediaType(type); state.totalMovies = 0; };

// Aplica un filtro (ej: país = 'España')
export function setFilter(type, value, force = false) {
  if (!(type in state.activeFilters)) return false;
  const normalizedValue = normalizeFilterValue(type, value);
  if (normalizedValue === undefined) return false;
  if (areContractValuesEqual(state.activeFilters[type], normalizedValue)) return true; // Nada cambia

  const isNew = normalizedValue && !state.activeFilters[type];
  if (!force && isNew && getActiveFilterCount() >= CONFIG.MAX_ACTIVE_FILTERS) return false;

  state.activeFilters[type] = normalizedValue;
  state.totalMovies = 0; // Obligamos a recalcular resultados
  return true;
}

// Guarda lo que escribe el usuario en el buscador y limpia el resto de filtros
export function setSearchTerm(term) {
  const normalizedTerm = normalizeFilterValue("searchTerm", term);
  state.activeFilters.searchTerm = normalizedTerm;
  state.totalMovies = 0;
  
  if (normalizedTerm.length > 0) {
    const toClear = ['genre', 'year', 'country', 'director', 'actor', 'selection', 'studio', 'myList'];
    const arraysToClear = ['excludedGenres', 'excludedCountries'];
    
    const hadFilters = toClear.some(k => state.activeFilters[k]) || arraysToClear.some(k => state.activeFilters[k]?.length > 0);
    
    if (hadFilters) {
      toClear.forEach(k => state.activeFilters[k] = null);
      arraysToClear.forEach(k => state.activeFilters[k] = []);
      return true; // Avisa que se han limpiado cosas
    }
  }
  return false;
}

// Excluye un filtro (Botón papelera / pausa)
export function toggleExcludedFilter(type, value) {
  if (!["genre", "country"].includes(type)) return false;
  const normalizedValue = normalizeFilterValue(type, value);
  if (!normalizedValue) return false;

  const listKey = type === 'genre' ? 'excludedGenres' : 'excludedCountries';
  const list = state.activeFilters[listKey];
  const index = list.indexOf(normalizedValue);

  if (index > -1) {
    // Si ya está excluido, lo quitamos de la lista
    const newList = [...list];
    newList.splice(index, 1);
    state.activeFilters[listKey] = newList;
  } else {
    if (type === 'genre') {
      // Si es género, reemplazamos por el nuevo (máximo 1). Al asignar, activamos el Proxy.
      state.activeFilters[listKey] = [normalizedValue];
    } else {
      // Si no está excluido, lo añadimos (respetando límites)
      if (list.length >= CONFIG.MAX_EXCLUDED_FILTERS || getActiveFilterCount() >= CONFIG.MAX_ACTIVE_FILTERS) return false;
      state.activeFilters[listKey] = [...list, normalizedValue];
    }
  }
  state.totalMovies = 0;
  return true;
}

// Devuelve todos los filtros a cero
export function resetFiltersState() {
  state.activeFilters = normalizeActiveFilters(initialState.activeFilters);
  state.totalMovies = 0; 
}

// --- Gestión de Datos de Usuario ---

// Guarda en bloque las películas del usuario (al hacer login)
export function setUserMovieData(data) {
  state.userMovieData = normalizeUserMovieData(data);
}

// Actualiza si el usuario vota o añade a 'Mi Lista' una sola peli
export function updateUserDataForMovie(movieId, data) {
  const normalizedMovieId = normalizeMovieId(movieId);
  if (!normalizedMovieId) return;

  const current = state.userMovieData[normalizedMovieId] || { onWatchlist: false, rating: null };
  const updated = normalizeUserMovieEntry({ ...current, ...data });
  
  if (current.rating === updated.rating && current.onWatchlist === updated.onWatchlist) return;
  
  state.userMovieData[normalizedMovieId] = updated; // Esto dispara automáticamente el evento en makeReactive
}

// Borra datos de usuario (al hacer logout)
export function clearUserMovieData() {
  state.userMovieData = {};
}
