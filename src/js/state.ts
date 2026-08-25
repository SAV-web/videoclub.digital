/// <reference types="vite/client" />

// =================================================================
//                      MÓDULO DE ESTADO (El "Cerebro")
// =================================================================
// - Guarda los datos importantes (filtros, página actual, etc.).
// - Usa un "vigilante" (Proxy) para avisar al instante cuando algo cambia.
// =================================================================

import { clearCheckedUserMovieIds, markMovieIdAsChecked } from "./checkedIds.js";
import { DEFAULTS, CONFIG, TEXT_FILTER_KEYS } from "./constants.js";
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
import { ActiveFilters, UserMovieEntry } from "./types.js";

export interface AppState {
  currentPage: number;
  totalMovies: number;
  activeFilters: ActiveFilters;
  userMovieData: Record<string, UserMovieEntry>;
}

// 1. Estado inicial: La configuración por defecto al entrar a la web.
const initialState: AppState = {
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
    myList: null,
  }),
  userMovieData: {},
};

export interface AppEventPayloads {
  'filtersReset': { keepSort?: boolean; newFilter?: { type: string; value: unknown } };
  'filter:apply': { type: string; value: unknown; force?: boolean };
  'uiActionTriggered': undefined;
  'updateSidebarUI': undefined;
  'userDataUpdated': undefined;
  'userMovieDataChanged': { movieId: number };
  'card:requestUpdate': { cardElement: HTMLElement };
  'state:changed': { path: string; value: unknown; oldValue: unknown };
  'page:requestChange': { direction: number; target: 'first' | 'last' };
}

export const appEvents = {
  events: {} as Record<string, Array<(data: unknown) => void>>,
  on<K extends keyof AppEventPayloads>(event: K, fn: (data: AppEventPayloads[K]) => void): () => void {
    if (!this.events[event]) this.events[event] = [];
    const handler = fn as (data: unknown) => void;
    this.events[event].push(handler);
    return () => {
      this.off(event, fn);
    };
  },
  off<K extends keyof AppEventPayloads>(event: K, fn: (data: AppEventPayloads[K]) => void): void {
    if (!this.events[event]) return;
    const handler = fn as (data: unknown) => void;
    this.events[event] = this.events[event].filter(h => h !== handler);
  },
  clear<K extends keyof AppEventPayloads>(event: K): void {
    delete this.events[event];
  },
  clearAll(): void {
    this.events = {};
  },
  emit<K extends keyof AppEventPayloads>(event: K, data?: AppEventPayloads[K]): void {
    if (this.events[event]) {
      this.events[event].forEach(fn => fn(data));
    }
  }
};



// 2. El Vigilante (Proxy Profundo): Envuelve un objeto y reacciona cuando cambia cualquier dato anidado.
function makeReactive<T extends object>(obj: T, path: string = ""): T {
  return new Proxy(obj, {
    get(target, property) {
      const val = Reflect.get(target, property);
      if (typeof val === 'object' && val !== null && !Object.isFrozen(val)) {
        return makeReactive(val, `${path}${String(property)}.`);
      }
      return val;
    },
    set(target, property, value) {
      const oldValue = Reflect.get(target, property);
      const success = Reflect.set(target, property, value);
      
      // Si el valor realmente cambió y es de datos de usuario, avisamos a la web
      if (success && oldValue !== value) {
        const fullPath = `${path}${String(property)}`;
        appEvents.emit('state:changed', { path: fullPath, value, oldValue });
        
        if (fullPath.startsWith("userMovieData.")) {
          const parts = fullPath.split(".");
          const movieId = parseInt(parts[1], 10);
          if (!isNaN(movieId)) {
            appEvents.emit("userMovieDataChanged", { movieId });
          }
        }
      }
      return success;
    }
  });
}

// Creamos nuestro estado global vigilado
let state = makeReactive<AppState>({
  currentPage: initialState.currentPage,
  totalMovies: initialState.totalMovies,
  activeFilters: structuredClone(initialState.activeFilters),
  userMovieData: {}
});

// =================================================================
//          TRADUCTOR DE URL (Para poder compartir enlaces)
// =================================================================

export const URL_PARAM_MAP: Record<string, keyof ActiveFilters | "page"> = {
  q: "searchTerm", genre: "genre", year: "year", country: "country",
  dir: "director", actor: "actor", sel: "selection", stu: "studio",
  sort: "sort", type: "mediaType", p: "page",
  exg: "excludedGenres", exc: "excludedCountries",
  list: "myList"
};

export const REVERSE_URL_PARAM_MAP = Object.fromEntries(
  Object.entries(URL_PARAM_MAP).map(([key, value]) => [value, key])
) as Record<keyof ActiveFilters | "page", string>;

// Convierte el estado actual en texto para la URL (?genre=Accion&p=2)
export function stateToUrlParams(activeFilters: ActiveFilters, currentPage: number): URLSearchParams {
  const params = new URLSearchParams();

  Object.entries(activeFilters).forEach(([key, value]) => {
    const shortKey = REVERSE_URL_PARAM_MAP[key as keyof ActiveFilters];
    if (!shortKey) return;
    
    if (Array.isArray(value) && value.length > 0) {
      params.set(shortKey, value.join(","));
    } else if (key === "myList" && value) {
      params.set(shortKey, value);
    } else if (typeof value === "string" && value.trim() !== "") {
      // No ponemos en la URL los valores por defecto
      if ((key === "mediaType" && value === DEFAULTS.MEDIA_TYPE) ||
          (key === "sort" && value === DEFAULTS.SORT) ||
          (key === "year" && value === `${CONFIG.YEAR_MIN}-${CONFIG.YEAR_MAX}`)) return;
      
      const valToSet = (key === "selection" || key === "studio")
        ? value.toUpperCase()
        : (TEXT_FILTER_KEYS.has(key) ? normalizeText(value) : value);
      params.set(shortKey, valToSet);
    }
  });
  
  if (currentPage > 1) params.set("p", String(currentPage));
  return params;
}

// Lee la URL y actualiza el estado
export function syncStateWithUrlParams(queryString: string): void {
  resetFiltersState();
  const params = new URLSearchParams(queryString);
  
  setCurrentPage(params.get("p") || params.get("page"));

  Object.entries(URL_PARAM_MAP).forEach(([shortKey, stateKey]) => {
    if (stateKey === "page") return;
    const val = params.get(shortKey) ?? params.get(stateKey);
    if (val !== null) {
      if (["excludedGenres", "excludedCountries"].includes(stateKey)) {
        setFilter(stateKey, val.split(","), true);
      } else if (stateKey === "myList") {
        setFilter(stateKey, val === "true" ? "mixed" : val, true);
      } else if (stateKey === "searchTerm") {
        setSearchTerm(val);
      } else if (stateKey === "sort") {
        setSort(val);
      } else if (stateKey === "mediaType") {
        setMediaType(val);
      } else {
        setFilter(stateKey, val, true);
      }
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
export const getState = (): AppState => ({
  ...state,
  activeFilters: getActiveFilters(),
  userMovieData: getAllUserMovieData()
});

// Obtiene los filtros actuales creando copias de las listas para evitar modificaciones accidentales
export const getActiveFilters = (): ActiveFilters => ({
  ...state.activeFilters,
  excludedGenres: [...state.activeFilters.excludedGenres],
  excludedCountries: [...state.activeFilters.excludedCountries]
});

export const getTotalMovies = (): number => state.totalMovies;
export const getCurrentPage = (): number => state.currentPage;
export const setCurrentPage = (page: unknown): void => { state.currentPage = normalizePageNumber(page); };
export const getUserDataForMovie = (id: number | string): UserMovieEntry | undefined => {
  const normId = normalizeMovieId(id);
  return normId !== null && state.userMovieData[String(normId)] 
    ? { ...state.userMovieData[String(normId)] } 
    : undefined;
};
export const getAllUserMovieData = (): Record<string, UserMovieEntry> => ({ ...state.userMovieData });

/**
 * ¿Hay algún filtro importante aplicado?
 */
export function hasActiveMeaningfulFilters(): boolean {
  if (state.activeFilters.myList || getActiveFilterCount() > 0) return true;
  return !/^\s*$/.test(state.activeFilters.searchTerm || "");
}

// =================================================================
//          LOGICA DE NEGOCIO (Helpers)
// =================================================================

// Cuenta cuántos filtros "reales" hay activos (Patrón Whitelist)
export function getActiveFilterCount(): number {
  const f = state.activeFilters;
  let count = f.excludedGenres.length + f.excludedCountries.length;
  if (f.year && f.year !== `${CONFIG.YEAR_MIN}-${CONFIG.YEAR_MAX}`) count++;

  const INCLUDED_FILTERS: Array<keyof ActiveFilters> = [
    "genre", "country", "director", "actor", "selection", "studio"
  ];

  for (const key of INCLUDED_FILTERS) {
    if (f[key]) count++;
  }

  return count;
}

export function setTotalMovies(total: unknown): void { state.totalMovies = normalizeTotalMovies(total); }
export const setSort = (sort: unknown): void => { state.activeFilters.sort = normalizeSort(sort); };
export const setMediaType = (type: unknown): void => { state.activeFilters.mediaType = normalizeMediaType(type); state.totalMovies = 0; };

// Aplica un filtro (ej: país = 'España')
export function setFilter(type: string, value: unknown, force: boolean = false): boolean {
  if (!(type in state.activeFilters)) return false;
  const normalizedValue = normalizeFilterValue(type, value);
  if (normalizedValue === undefined) return false;
  
  const currentVal = state.activeFilters[type as keyof ActiveFilters];
  if (areContractValuesEqual(currentVal, normalizedValue)) return true; // Nada cambia

  const isNew = normalizedValue && !currentVal;
  if (!force && isNew && getActiveFilterCount() >= CONFIG.MAX_ACTIVE_FILTERS) return false;

  Reflect.set(state.activeFilters, type, normalizedValue);

  // Reglas de Exclusividad de Negocio
  if (normalizedValue) {
    if (type === 'genre') state.activeFilters.excludedGenres = [];
    if (type === 'country') state.activeFilters.excludedCountries = [];
    if (type === 'excludedGenres' && Array.isArray(normalizedValue) && normalizedValue.length > 0) state.activeFilters.genre = null;
    if (type === 'excludedCountries' && Array.isArray(normalizedValue) && normalizedValue.length > 0) state.activeFilters.country = null;

    // Selección y Estudio son mutuamente excluyentes entre sí
    if (type === 'selection') state.activeFilters.studio = null;
    if (type === 'studio') state.activeFilters.selection = null;

    // Director y Actor son 100% excluyentes con cualquier otra categoría
    if (type === 'director' || type === 'actor') {
      state.activeFilters.genre = null;
      state.activeFilters.country = null;
      state.activeFilters.selection = null;
      state.activeFilters.studio = null;
      state.activeFilters.excludedGenres = [];
      state.activeFilters.excludedCountries = [];
      if (type === 'director') state.activeFilters.actor = null;
      if (type === 'actor') state.activeFilters.director = null;
    } else if (type !== 'sort' && type !== 'mediaType' && type !== 'searchTerm' && type !== 'myList') {
      state.activeFilters.director = null;
      state.activeFilters.actor = null;
    }
  }

  state.totalMovies = 0; // Obligamos a recalcular resultados
  return true;
}

// Guarda lo que escribe el usuario en el buscador y limpia el resto de filtros
export function setSearchTerm(term: string | null | undefined): boolean {
  const normalizedTerm = normalizeFilterValue("searchTerm", term || "") as string;
  state.activeFilters.searchTerm = normalizedTerm;
  state.totalMovies = 0;
  
  if (normalizedTerm.length > 0) {
    const toClear: Array<keyof ActiveFilters> = ['genre', 'year', 'country', 'director', 'actor', 'selection', 'studio', 'myList'];
    const arraysToClear: Array<keyof ActiveFilters> = ['excludedGenres', 'excludedCountries'];
    
    const hadFilters = toClear.some(k => state.activeFilters[k]) || arraysToClear.some(k => {
      const val = state.activeFilters[k];
      return Array.isArray(val) && val.length > 0;
    });
    
    if (hadFilters) {
      toClear.forEach(k => Reflect.set(state.activeFilters, k, null));
      arraysToClear.forEach(k => Reflect.set(state.activeFilters, k, []));
      return true; // Avisa que se han limpiado cosas
    }
  }
  return false;
}

// Excluye un filtro (Botón papelera / pausa) - Sólo 1 bento por menú
export function toggleExcludedFilter(type: string, value: unknown): boolean {
  if (!["genre", "country"].includes(type)) return false;
  const normalizedValue = normalizeFilterValue(type, value) as string;
  if (!normalizedValue) return false;

  const listKey = type === 'genre' ? 'excludedGenres' : 'excludedCountries';
  const list = state.activeFilters[listKey];
  const index = list.indexOf(normalizedValue);

  if (index > -1) {
    // Si ya está excluido, lo quitamos de la lista
    state.activeFilters[listKey] = [];
  } else {
    // Sólo 1 bento por menú: reemplazamos por el nuevo y limpiamos el positivo de esa categoría
    state.activeFilters[listKey] = [normalizedValue];
    if (type === 'genre') state.activeFilters.genre = null;
    if (type === 'country') state.activeFilters.country = null;
  }
  state.totalMovies = 0;
  return true;
}

// Devuelve todos los filtros a cero
export function resetFiltersState(): void {
  state.activeFilters = normalizeActiveFilters(initialState.activeFilters);
  state.totalMovies = 0; 
}

// --- Gestión de Datos de Usuario ---

// Guarda en bloque las películas del usuario (al hacer login)
export function setUserMovieData(data: unknown): void {
  state.userMovieData = normalizeUserMovieData(data);
  appEvents.emit("userDataUpdated");
}

// Actualiza si el usuario vota o añade a 'Mi Lista' una sola peli
export function updateUserDataForMovie(movieId: number | string, data: Partial<UserMovieEntry>): void {
  const normalizedMovieId = normalizeMovieId(movieId);
  if (normalizedMovieId === null) return;

  markMovieIdAsChecked(normalizedMovieId);
  const strId = String(normalizedMovieId);
  const current = state.userMovieData[strId] || { onWatchlist: false, rating: null };
  const updated = normalizeUserMovieEntry({ ...current, ...data });
  
  if (current.rating === updated.rating && current.onWatchlist === updated.onWatchlist) return;
  
  state.userMovieData[strId] = updated; // Esto dispara automáticamente el evento en makeReactive
}

// Borra datos de usuario (al hacer logout)
export function clearUserMovieData(): void {
  state.userMovieData = {};
  clearCheckedUserMovieIds();
}
