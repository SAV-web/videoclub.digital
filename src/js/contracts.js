// =================================================================
//                 CONTRATOS DE DATOS DE LA APLICACIÓN
// =================================================================
// Este módulo define las formas válidas de estado, filtros, respuestas
// de API y errores. Es una frontera ligera: normaliza entradas externas
// y evita que datos inválidos se propaguen por la UI.
// =================================================================

import { CONFIG, DEFAULTS } from "./constants.js";

export const FILTER_KEYS = Object.freeze([
  "searchTerm",
  "genre",
  "year",
  "country",
  "director",
  "actor",
  "selection",
  "studio",
  "sort",
  "mediaType",
  "excludedGenres",
  "excludedCountries",
  "myList",
]);

const TEXT_FILTER_KEYS = new Set(["searchTerm", "genre", "country", "director", "actor", "selection", "studio"]);
const LIST_FILTER_KEYS = new Set(["excludedGenres", "excludedCountries"]);
const SORT_VALUES = new Set([
  "relevance,asc",
  "year,desc",
  "year,asc",
  "fa_rating,desc",
  "imdb_rating,desc",
  "fa_votes,desc",
  "imdb_votes,desc",
]);
const MEDIA_TYPES = new Set(["all", "movies", "series"]);
const MY_LIST_MODES = new Set([null, "rated", "watchlist", "mixed"]);

export const ERROR_CODES = Object.freeze({
  ABORTED: "ABORTED",
  AUTH_REQUIRED: "AUTH_REQUIRED",
  CONFIGURATION: "CONFIGURATION",
  DATABASE: "DATABASE",
  NETWORK: "NETWORK",
  VALIDATION: "VALIDATION",
  UNKNOWN: "UNKNOWN",
});

/**
 * @typedef {Object} ActiveFilters
 * @property {string} searchTerm
 * @property {?string} genre
 * @property {?string} year
 * @property {?string} country
 * @property {?string} director
 * @property {?string} actor
 * @property {?string} selection
 * @property {?string} studio
 * @property {string} sort
 * @property {"all"|"movies"|"series"} mediaType
 * @property {string[]} excludedGenres
 * @property {string[]} excludedCountries
 * @property {?("rated"|"watchlist"|"mixed")} myList
 */

/**
 * @typedef {Object} AppState
 * @property {number} currentPage
 * @property {number} totalMovies
 * @property {ActiveFilters} activeFilters
 * @property {Record<string, UserMovieEntry>} userMovieData
 */

/**
 * @typedef {Object} UserMovieEntry
 * @property {?number} rating
 * @property {boolean} onWatchlist
 */

/**
 * @typedef {Object} MoviesResponse
 * @property {number} total
 * @property {Array<Object>} items
 * @property {boolean=} aborted
 */

export class AppError extends Error {
  constructor(code, message, cause = null) {
    super(message);
    this.name = "AppError";
    this.code = code;
    this.cause = cause;
  }
}

export const createAppError = (code, message, cause = null) => new AppError(code, message, cause);

export function isAbortError(error, signal) {
  return error?.name === "AbortError" ||
    error?.code === ERROR_CODES.ABORTED ||
    signal?.aborted ||
    error?.message?.toLowerCase().includes("abort");
}

export function toAppError(error, fallbackCode = ERROR_CODES.UNKNOWN, fallbackMessage = "Ha ocurrido un error inesperado.") {
  if (error instanceof AppError) return error;
  if (isAbortError(error)) return createAppError(ERROR_CODES.ABORTED, "Petición cancelada.", error);
  if (error?.message?.includes("Failed to fetch")) return createAppError(ERROR_CODES.NETWORK, "Error de conexión. Revisa tu internet.", error);
  return createAppError(fallbackCode, error?.message || fallbackMessage, error);
}

export function normalizePageNumber(value, fallback = 1) {
  const page = Number.parseInt(value, 10);
  return Number.isFinite(page) && page > 0 ? page : fallback;
}

export function normalizeTotalMovies(value) {
  const total = Number.parseInt(value, 10);
  if (!Number.isFinite(total)) return 0;
  return Math.max(-1, total);
}

export function normalizePageSize(value, fallback = CONFIG.ITEMS_PER_PAGE) {
  const pageSize = Number.parseInt(value, 10);
  return Number.isFinite(pageSize) && pageSize > 0 ? pageSize : fallback;
}

export function normalizeOffset(value) {
  if (value === null || value === undefined) return null;
  const offset = Number.parseInt(value, 10);
  return Number.isFinite(offset) && offset >= 0 ? offset : null;
}

export function normalizeSort(value) {
  return SORT_VALUES.has(value) ? value : DEFAULTS.SORT;
}

export function normalizeMediaType(value) {
  return MEDIA_TYPES.has(value) ? value : DEFAULTS.MEDIA_TYPE;
}

export function normalizeMyList(value) {
  const normalized = value === true || value === "true" ? "mixed" : value;
  return MY_LIST_MODES.has(normalized) ? normalized : null;
}

export function normalizeYearRange(value) {
  if (value === null || value === undefined || value === "") return null;

  const parts = String(value).split("-").map(part => Number.parseInt(part, 10));
  const [rawStart, rawEnd = rawStart] = parts;
  if (!Number.isFinite(rawStart)) return null;

  const minYear = CONFIG.YEAR_MIN;
  const maxYear = CONFIG.YEAR_MAX;
  const start = Math.min(Math.max(rawStart, minYear), maxYear);
  const end = Math.min(Math.max(rawEnd, minYear), maxYear);
  const orderedStart = Math.min(start, end);
  const orderedEnd = Math.max(start, end);

  return orderedStart === orderedEnd ? String(orderedStart) : `${orderedStart}-${orderedEnd}`;
}

export function normalizeTextValue(value) {
  return typeof value === "string" ? value.trim() : "";
}

export function normalizeNullableText(value) {
  const text = normalizeTextValue(value);
  return text.length > 0 ? text : null;
}

export function normalizeStringList(value) {
  const source = Array.isArray(value) ? value : (typeof value === "string" ? value.split(",") : []);
  return [...new Set(source.map(normalizeTextValue).filter(Boolean))];
}

export function normalizeFilterValue(key, value) {
  if (!FILTER_KEYS.includes(key)) return undefined;
  if (key === "sort") return normalizeSort(value);
  if (key === "mediaType") return normalizeMediaType(value);
  if (key === "myList") return normalizeMyList(value);
  if (key === "year") return normalizeYearRange(value);
  if (LIST_FILTER_KEYS.has(key)) return normalizeStringList(value);
  if (key === "searchTerm") return normalizeTextValue(value);
  if (TEXT_FILTER_KEYS.has(key)) return normalizeNullableText(value);
  return value;
}

/**
 * @param {Partial<ActiveFilters>} filters
 * @returns {ActiveFilters}
 */
export function normalizeActiveFilters(filters = {}) {
  return {
    searchTerm: normalizeTextValue(filters.searchTerm),
    genre: normalizeNullableText(filters.genre),
    year: normalizeYearRange(filters.year),
    country: normalizeNullableText(filters.country),
    director: normalizeNullableText(filters.director),
    actor: normalizeNullableText(filters.actor),
    selection: normalizeNullableText(filters.selection),
    studio: normalizeNullableText(filters.studio),
    sort: normalizeSort(filters.sort),
    mediaType: normalizeMediaType(filters.mediaType),
    excludedGenres: normalizeStringList(filters.excludedGenres),
    excludedCountries: normalizeStringList(filters.excludedCountries),
    myList: normalizeMyList(filters.myList),
  };
}

export function areContractValuesEqual(left, right) {
  if (Array.isArray(left) || Array.isArray(right)) {
    const leftList = normalizeStringList(left);
    const rightList = normalizeStringList(right);
    return leftList.length === rightList.length && leftList.every((item, index) => item === rightList[index]);
  }
  return left === right;
}

export function normalizeMovieId(value) {
  const movieId = Number.parseInt(value, 10);
  return Number.isFinite(movieId) && movieId > 0 ? movieId : null;
}

export function normalizeUserMovieEntry(entry = {}) {
  const rating = entry.rating === null || entry.rating === undefined ? null : Number.parseInt(entry.rating, 10);
  return {
    rating: Number.isFinite(rating) && rating >= 1 && rating <= 10 ? rating : null,
    onWatchlist: entry.onWatchlist === true || entry.on_watchlist === true,
  };
}

export function normalizeUserMovieData(data = {}) {
  return Object.fromEntries(
    Object.entries(data)
      .map(([movieId, entry]) => [normalizeMovieId(movieId), normalizeUserMovieEntry(entry)])
      .filter(([movieId]) => movieId !== null)
  );
}

export function normalizeMovieQuery({ activeFilters, currentPage, pageSize, requestCount, explicitOffset }) {
  return {
    activeFilters: normalizeActiveFilters(activeFilters),
    currentPage: normalizePageNumber(currentPage),
    pageSize: normalizePageSize(pageSize),
    requestCount: requestCount !== false,
    explicitOffset: normalizeOffset(explicitOffset),
  };
}

export function normalizeMovieRows(items) {
  return Array.isArray(items)
    ? items.filter(item => item && typeof item === "object" && normalizeMovieId(item.id) && typeof item.title === "string")
    : [];
}

export function normalizeMoviesResponse(response, mapItem = item => item) {
  return {
    total: normalizeTotalMovies(response?.total ?? -1),
    items: normalizeMovieRows(response?.items).map(mapItem),
    ...(response?.aborted ? { aborted: true } : {}),
  };
}
