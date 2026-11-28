/// <reference types="vite/client" />

// =================================================================
//                      MÓDULO DE ESTADO (El "Cerebro")
// =================================================================
// - Guarda los datos importantes (filtros, página actual, etc.).
// - Usa un "vigilante" (Proxy) para avisar al instante cuando algo cambia.
// =================================================================


import { DEFAULTS, CONFIG, TEXT_FILTER_KEYS } from "./constants.js";
import { normalizeText } from "./utils.js";
import {
  areContractValuesEqual,
  buildPrettyPath,
  getAppBasePath,
  normalizeActiveFilters,
  normalizeFilterValue,
  normalizeMovieId,
  normalizePageNumber,
  normalizeSort,
  normalizeMediaType,
  normalizeTotalMovies,
  normalizeUserMovieData,
  normalizeUserMovieEntry,
  parsePrettyPath,
  REVERSE_SORT_SLUG_MAP,
  slugToPersonQuery,
  toSlug,
  canCombinePersonFilter,
} from "./contracts.js";
import { ActiveFilters, UserMovieEntry } from "./types.js";

interface AppState {
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
    actor2: null,
    primaryPersonRole: null,
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
  'filtersReset': { keepSort?: boolean; newFilter?: { type: string; value: unknown }; replaceHistory?: boolean } | undefined;
  'filter:apply': { type: string; value: unknown; combine?: boolean };
  'vipManifest:loaded': undefined;
  'collaborators:loaded': undefined;
  'uiActionTriggered': undefined;
  'updateSidebarUI': undefined;
  'userDataUpdated': undefined;
  'myList:revalidated': undefined;
  'userMovieDataChanged': { movieId: number };
  'card:requestUpdate': { cardElement: HTMLElement };
  'state:changed': { path: string; value: unknown; oldValue: unknown };
  'page:requestChange': { direction: number; target: 'first' | 'last' };
  'auth:requested': undefined;
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
const proxyCache = new WeakMap<object, any>();

function makeReactive<T extends object>(obj: T, path: string = ""): T {
  const cached = proxyCache.get(obj);
  if (cached) return cached as T;

  const proxy = new Proxy(obj, {
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

  proxyCache.set(obj, proxy);
  return proxy;
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

const URL_PARAM_MAP: Record<string, keyof ActiveFilters | "page"> = {
  search: "searchTerm",
  year: "year",
  sort: "sort",
  type: "mediaType",
  p: "page",
  exg: "excludedGenres",
  exc: "excludedCountries",
  list: "myList"
};

const REVERSE_URL_PARAM_MAP = Object.fromEntries(
  Object.entries(URL_PARAM_MAP).map(([key, value]) => [value, key])
) as Record<keyof ActiveFilters | "page", string>;

// Convierte el estado actual en Pretty URL ({ pathname: '/drama/eeuu/', search: 'sort=fa_votes,desc&p=2' })
export function stateToPrettyUrl(activeFilters: ActiveFilters, currentPage: number): { pathname: string; search: string } {
  const pathname = buildPrettyPath(activeFilters);
  const params = stateToUrlParams(activeFilters, currentPage);
  const search = params.toString();
  return { pathname, search };
}

// Convierte los filtros no posicionales en parámetros para la query string
function stateToUrlParams(activeFilters: ActiveFilters, currentPage: number): URLSearchParams {
  const params = new URLSearchParams();

  Object.entries(activeFilters).forEach(([key, value]) => {
    // genre, country, selection, studio, excludedGenres y excludedCountries van en pretty path.
    // El primer VIP (director o actor según primaryPersonRole) va en pretty path; el segundo VIP va en query string.
    if (key === "genre" || key === "country" || key === "selection" || key === "studio" || key === "excludedGenres" || key === "excludedCountries" || key === "primaryPersonRole") return;

    if (key === "director") {
      if (activeFilters.primaryPersonRole === "actor" && activeFilters.actor && typeof value === "string" && value.trim()) {
        const slug = toSlug(value);
        if (slug) params.set("director", slug);
      }
      return;
    }

    if (key === "actor") {
      if (activeFilters.director && activeFilters.primaryPersonRole !== "actor" && typeof value === "string" && value.trim()) {
        const slug = toSlug(value);
        if (slug) params.set("actor", slug);
      }
      return;
    }

    if (key === "actor2") {
      if (!activeFilters.director && activeFilters.actor && typeof value === "string" && value.trim()) {
        const slug = toSlug(value);
        if (slug) params.set("actor2", slug);
      }
      return;
    }

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
          (key === "year" && (!value || value === `${CONFIG.YEAR_MIN}-${CONFIG.YEAR_MAX}` || value === `${CONFIG.YEAR_MIN}-` || value === `-${CONFIG.YEAR_MAX}`))) return;
      
      if (key === "sort") {
        const slug = REVERSE_SORT_SLUG_MAP[value] || value;
        params.set(shortKey, slug);
        return;
      }

      const valToSet = TEXT_FILTER_KEYS.has(key) ? normalizeText(value) : value;
      params.set(shortKey, valToSet);
    }
  });
  
  if (currentPage > 1) params.set("p", String(currentPage));
  return params;
}

// Lee la URL completa (pathname + search) y actualiza el estado de la aplicación
export function syncStateWithUrl(pathname: string = "/", queryString: string = ""): void {
  resetFiltersState();

  const params = new URLSearchParams(queryString);
  const routeParam = params.get("_p");
  const extraQuery = params.get("_q");

  // Si venimos de redirección SPA 404 (ej. GitHub Pages: ?_p=/director/brian-de-palma/)
  const effectivePathname = routeParam ? (routeParam.startsWith("/") ? routeParam : `/${routeParam}`) : pathname;

  // Si la ruta corresponde a una landing SEO en el Edge, redirigir a la URL canónica limpia sin query string
  if (routeParam && typeof window !== "undefined") {
    const cleanLower = effectivePathname.toLowerCase();
    const isSeoPrefixed = 
      cleanLower.startsWith("/titulo/") ||
      cleanLower.startsWith("/genero/") ||
      cleanLower.startsWith("/pais/") ||
      cleanLower.startsWith("/estudio/") ||
      cleanLower.startsWith("/seleccion/");
    if (isSeoPrefixed) {
      const canonicalPath = cleanLower.replace(/\/+$/, "") + "/";
      window.location.replace(canonicalPath);
      return;
    }
  }

  // 1. Sincronizar filtros de catálogo, personas o exclusiones desde los segmentos del pathname
  const pathFilters = parsePrettyPath(effectivePathname);
  if (pathFilters.director) setFilter("director", pathFilters.director);
  if (pathFilters.actor) setFilter("actor", pathFilters.actor);
  if (pathFilters.genre) setFilter("genre", pathFilters.genre);
  if (pathFilters.country) setFilter("country", pathFilters.country);
  if (pathFilters.selection) setFilter("selection", pathFilters.selection);
  if (pathFilters.studio) setFilter("studio", pathFilters.studio);
  if (pathFilters.excludedGenres.length > 0) setFilter("excludedGenres", pathFilters.excludedGenres);
  if (pathFilters.excludedCountries.length > 0) setFilter("excludedCountries", pathFilters.excludedCountries);

  // 2. Sincronizar parámetros técnicos desde la query string
  const effectiveParams = extraQuery ? new URLSearchParams(extraQuery) : params;
  setCurrentPage(effectiveParams.get("p") || effectiveParams.get("page"));

  // Cruce de personas vía query params (ej. /director/scorsese/?actor=robert-de-niro o /actor/al-pacino/?actor2=robert-de-niro)
  const qpDirector = effectiveParams.get("director");
  const qpActor = effectiveParams.get("actor");
  const qpActor2 = effectiveParams.get("actor2");

  if (!state.activeFilters.director && !state.activeFilters.actor) {
    if (qpDirector) setFilter("director", slugToPersonQuery(qpDirector));
    if (qpActor) setFilter("actor", slugToPersonQuery(qpActor));
  } else if (state.activeFilters.director && !state.activeFilters.actor) {
    if (qpActor) setFilter("actor", slugToPersonQuery(qpActor));
  } else if (!state.activeFilters.director && state.activeFilters.actor) {
    if (qpDirector) {
      setFilter("director", slugToPersonQuery(qpDirector));
    } else if (qpActor2) {
      setFilter("actor2", slugToPersonQuery(qpActor2));
    }
  }

  Object.entries(URL_PARAM_MAP).forEach(([shortKey, stateKey]) => {
    if (stateKey === "page") return;
    const val = effectiveParams.get(shortKey) ??
      (stateKey === "searchTerm" ? (effectiveParams.get("buscar") ?? effectiveParams.get("q")) : null) ??
      (stateKey === "sort" ? effectiveParams.get("orden") : null) ??
      effectiveParams.get(stateKey);
    if (val !== null) {
      if (["excludedGenres", "excludedCountries"].includes(stateKey)) {
        setFilter(stateKey, val.split(","));
      } else if (stateKey === "myList") {
        setFilter(stateKey, val === "true" ? "mixed" : val);
      } else if (stateKey === "searchTerm") {
        setSearchTerm(val);
      } else if (stateKey === "sort") {
        setSort(val);
      } else if (stateKey === "mediaType") {
        setMediaType(val);
      } else {
        setFilter(stateKey, val);
      }
    }
  });
  
  const urlHasSort = effectiveParams.has("sort") || effectiveParams.has("orden");
  if (!urlHasSort) {
    const storedSort = typeof localStorage !== "undefined" ? localStorage.getItem("preferred_sort") : null;
    if (storedSort) {
      setSort(storedSort);
    }
  }
  if (!state.activeFilters.sort) setSort(DEFAULTS.SORT);
  if (!state.activeFilters.mediaType) setMediaType(DEFAULTS.MEDIA_TYPE);

  // Si había parámetro _p, restaurar la URL limpia en el historial ahora que los módulos JS ya cargaron
  if (routeParam && typeof window !== "undefined") {
    const basePrefix = getAppBasePath();
    const cleanRoute = routeParam.startsWith("/") ? routeParam : `/${routeParam}`;
    const searchString = extraQuery ? `?${extraQuery}` : "";
    const restoredUrl = `${basePrefix}${cleanRoute}${searchString}${window.location.hash}`;
    window.history.replaceState(null, "", restoredUrl);
  }
}

/**
 * canonicalizeCurrentUrl()
 * ─────────────────────────────────────────────────────────────────────────────
 * Asegura que la URL visible en el navegador sea siempre la forma canónica del
 * estado activo. Se ejecuta DESPUÉS de haber sincronizado el estado con la URL
 * entrante (syncStateWithUrl), y realiza 4 pasos:
 *
 *  1. Leer el estado normalizado que ya está en memoria.
 *  2. Re-serializarlo con stateToPrettyUrl() -> genera la URL canónica.
 *  3. Comparar con window.location (pathname + search).
 *  4. Si difieren, ejecutar history.replaceState() para sustituir la entrada
 *     actual del historial sin añadir una nueva (el botón "Atrás" no se rompe).
 *
 * Casos que corrige automáticamente:
 *  - Parámetros alias:    ?page=2 -> ?p=2  |  ?q=x -> ?buscar=x
 *  - Sort interno:        ?sort=fa_rating,desc -> ?sort=nota-fa
 *  - Segmentos invertidos:/uk/drama/ -> /drama/uk/
 *  - Trailing slash:      /drama/uk  -> /drama/uk/
 *  - Exclusiones en QS:   ?exg=Animación -> /no-animacion/
 *
 * @returns true si se realizó una sustitución, false si ya era canónica.
 */
export function canonicalizeCurrentUrl(): boolean {
  if (typeof window === "undefined") return false;

  const activeFilters = getActiveFilters();
  const currentPage = getCurrentPage();

  const { pathname: canonPath, search: canonSearch } = stateToPrettyUrl(activeFilters, currentPage);

  // Construir la URL canónica completa (con hash preservado)
  const canonFull = canonSearch
    ? `${canonPath}?${canonSearch}${window.location.hash}`
    : `${canonPath}${window.location.hash}`;

  // URL actual sin base-prefix de GitHub Pages
  let currentPath = window.location.pathname;
  const basePrefix = getAppBasePath();
  if (basePrefix) currentPath = currentPath.slice(basePrefix.length) || "/";
  const currentSearch = window.location.search;
  const currentFull = currentSearch
    ? `${currentPath}${currentSearch}${window.location.hash}`
    : `${currentPath}${window.location.hash}`;

  if (canonFull === currentFull) return false;

  // Reemplazar la entrada actual sin añadir al historial
  const finalUrl = `${basePrefix}${canonFull}`;
  window.history.replaceState(window.history.state, "", finalUrl);
  return true;
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
    "genre", "country", "director", "actor", "actor2", "selection", "studio"
  ];

  for (const key of INCLUDED_FILTERS) {
    if (f[key]) count++;
  }

  return count;
}

export function setTotalMovies(total: unknown): void { state.totalMovies = normalizeTotalMovies(total); }
export const setSort = (sort: unknown): void => { state.activeFilters.sort = normalizeSort(sort); };
export const setMediaType = (type: unknown): void => { state.activeFilters.mediaType = normalizeMediaType(type); state.totalMovies = 0; };

function clearAllPersonFilters(): void {
  state.activeFilters.director = null;
  state.activeFilters.actor = null;
  state.activeFilters.actor2 = null;
  state.activeFilters.primaryPersonRole = null;
}

function clearCatalogFiltersForPerson(): void {
  state.activeFilters.genre = null;
  state.activeFilters.country = null;
  state.activeFilters.selection = null;
  state.activeFilters.studio = null;
  state.activeFilters.year = null;
  state.activeFilters.excludedGenres = [];
  state.activeFilters.excludedCountries = [];
  state.activeFilters.mediaType = DEFAULTS.MEDIA_TYPE;
}

// Aplica un filtro (ej: país = 'España')
export function setFilter(type: string, value: unknown): boolean {
  if (!(type in state.activeFilters)) return false;
  const normalizedValue = normalizeFilterValue(type, value);
  if (normalizedValue === undefined) return false;

  const currentVal = state.activeFilters[type as keyof ActiveFilters];
  if (areContractValuesEqual(currentVal, normalizedValue)) return true; // Nada cambia

  // Regla de promoción al eliminar actor principal mientras hay un segundo actor activo
  if (type === "actor" && !normalizedValue) {
    state.activeFilters.actor = state.activeFilters.actor2 || null;
    state.activeFilters.actor2 = null;
    state.activeFilters.primaryPersonRole = state.activeFilters.actor
      ? (state.activeFilters.director && state.activeFilters.primaryPersonRole === "director" ? "director" : "actor")
      : (state.activeFilters.director ? "director" : null);
    state.totalMovies = 0;
    return true;
  }

  if (type === "director" && !normalizedValue) {
    state.activeFilters.director = null;
    state.activeFilters.primaryPersonRole = state.activeFilters.actor ? "actor" : null;
    state.totalMovies = 0;
    return true;
  }

  if (type === "actor2") {
    if (!normalizedValue) {
      state.activeFilters.actor2 = null;
      state.totalMovies = 0;
      return true;
    }
    const strVal = String(normalizedValue);
    if (state.activeFilters.director) {
      state.activeFilters.actor2 = null;
      return false;
    }
    if (!state.activeFilters.actor) {
      state.activeFilters.actor = strVal;
      state.activeFilters.actor2 = null;
      clearCatalogFiltersForPerson();
      state.totalMovies = 0;
      return true;
    }
    if (toSlug(state.activeFilters.actor) === toSlug(strVal)) {
      return false;
    }
  }

  Reflect.set(state.activeFilters, type, normalizedValue);

  // Reglas de Exclusividad de Negocio
  if (normalizedValue) {
    // Exclusividad Estricta: genre y excludedGenres NUNCA pueden coexistir.
    // country y excludedCountries NUNCA pueden coexistir.
    if (type === 'genre' && typeof normalizedValue === 'string') {
      state.activeFilters.excludedGenres = [];
    }
    if (type === 'country' && typeof normalizedValue === 'string') {
      state.activeFilters.excludedCountries = [];
    }
    if (type === 'excludedGenres' && Array.isArray(normalizedValue) && normalizedValue.length > 0) {
      state.activeFilters.genre = null;
    }
    if (type === 'excludedCountries' && Array.isArray(normalizedValue) && normalizedValue.length > 0) {
      state.activeFilters.country = null;
    }

    // Selección y Estudio son mutuamente excluyentes entre sí
    if (type === 'selection') state.activeFilters.studio = null;
    if (type === 'studio') state.activeFilters.selection = null;

    // Las personas son 100% excluyentes con cualquier otra categoría de catálogo
    if (type === 'director' || type === 'actor' || type === 'actor2') {
      clearCatalogFiltersForPerson();
      if (type === 'director') {
        state.activeFilters.actor2 = null;
        if (!state.activeFilters.actor || state.activeFilters.primaryPersonRole !== 'actor') {
          state.activeFilters.primaryPersonRole = 'director';
        }
      } else if (type === 'actor') {
        if (state.activeFilters.director) {
          state.activeFilters.actor2 = null;
          if (state.activeFilters.primaryPersonRole !== 'director') {
            state.activeFilters.primaryPersonRole = 'actor';
          }
        } else {
          state.activeFilters.primaryPersonRole = 'actor';
          if (state.activeFilters.actor2 && toSlug(state.activeFilters.actor2) === toSlug(String(normalizedValue))) {
            state.activeFilters.actor2 = null;
          }
        }
      } else if (type === 'actor2') {
        state.activeFilters.primaryPersonRole = 'actor';
      }
    } else if (type !== 'sort' && type !== 'mediaType' && type !== 'searchTerm' && type !== 'myList') {
      clearAllPersonFilters();
    }
  }

  state.totalMovies = 0; // Obligamos a recalcular resultados
  return true;
}

/**
 * Añade una segunda persona o sustituye al segundo VIP del cruce actual
 * respetando la regla de negocio: máximo 2 personas, solo Director + Actor o
 * Actor + Actor (nunca 2 Directores).
 */
export function combinePersonFilter(type: "director" | "actor", value: unknown): boolean {
  const normalizedValue = normalizeFilterValue(type, value);
  if (typeof normalizedValue !== "string" || !normalizedValue) return false;
  if (!canCombinePersonFilter(state.activeFilters, type, normalizedValue, true, true)) return false;

  const primaryIsActor = state.activeFilters.primaryPersonRole === "actor" && Boolean(state.activeFilters.actor);

  if (type === "director") {
    if (state.activeFilters.actor2) setFilter("actor2", null);
    const applied = setFilter("director", normalizedValue);
    if (applied && primaryIsActor) {
      state.activeFilters.primaryPersonRole = "actor";
    }
    return applied;
  }

  if (primaryIsActor) {
    if (state.activeFilters.director) setFilter("director", null);
    return setFilter("actor2", normalizedValue);
  }
  if (!state.activeFilters.actor || state.activeFilters.director) {
    return setFilter("actor", normalizedValue);
  }
  return setFilter("actor2", normalizedValue);
}

// Guarda lo que escribe el usuario en el buscador y limpia el resto de filtros
export function setSearchTerm(term: string | null | undefined): boolean {
  const normalizedTerm = normalizeFilterValue("searchTerm", term || "") as string;
  state.activeFilters.searchTerm = normalizedTerm;
  state.totalMovies = 0;
  
  if (normalizedTerm.length > 0) {
    const toClear: Array<keyof ActiveFilters> = ['genre', 'year', 'country', 'director', 'actor', 'actor2', 'primaryPersonRole', 'selection', 'studio', 'myList'];
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
    // Sólo 1 bento por menú: reemplazamos por el nuevo y limpiamos SIEMPRE el positivo de esa categoría y las entidades de persona
    state.activeFilters[listKey] = [normalizedValue];
    if (type === 'genre') state.activeFilters.genre = null;
    if (type === 'country') state.activeFilters.country = null;
    clearAllPersonFilters();
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


  const strId = String(normalizedMovieId);
  const current = state.userMovieData[strId] || { onWatchlist: false, rating: null, note: null };
  const updated = normalizeUserMovieEntry({ ...current, ...data });
  
  if (current.rating === updated.rating && current.onWatchlist === updated.onWatchlist && current.note === updated.note) return;
  
  state.userMovieData[strId] = updated; // Esto dispara automáticamente el evento en makeReactive
}

// Borra datos de usuario (al hacer logout)
export function clearUserMovieData(): void {
  state.userMovieData = {};

}

// Devuelve el número total de películas activas en la lista de seguimiento (Watchlist)
export function getWatchlistCount(): number {
  return Object.values(state.userMovieData).filter(entry => entry && entry.onWatchlist).length;
}
