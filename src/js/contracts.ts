// =================================================================
//                 CONTRATOS DE DATOS DE LA APLICACIÓN
// =================================================================
// Este módulo define las formas válidas de estado, filtros, respuestas
// de API y errores. Es una frontera ligera: normaliza entradas externas
// y evita que datos inválidos se propaguen por la UI.
// =================================================================

import { CONFIG, DEFAULTS } from "./constants.js";
import { ActiveFilters, Movie, UserMovieEntry } from "./types.js";

export const FILTER_KEYS: ReadonlyArray<string> = [
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
];

const TEXT_FILTER_KEYS = new Set<string>(["searchTerm", "genre", "country", "director", "actor", "selection", "studio"]);
const LIST_FILTER_KEYS = new Set<string>(["excludedGenres", "excludedCountries"]);
const SORT_VALUES = new Set<string>([
  "relevance,asc",
  "year,desc",
  "year,asc",
  "fa_rating,desc",
  "imdb_rating,desc",
  "fa_votes,desc",
  "imdb_votes,desc",
]);
const MEDIA_TYPES = new Set<string>(["all", "movies", "series"]);
const MY_LIST_MODES = new Set<string | null>([null, "rated", "watchlist", "mixed"]);

export const ERROR_CODES = {
  ABORTED: "ABORTED",
  AUTH_REQUIRED: "AUTH_REQUIRED",
  CONFIGURATION: "CONFIGURATION",
  DATABASE: "DATABASE",
  NETWORK: "NETWORK",
  VALIDATION: "VALIDATION",
  UNKNOWN: "UNKNOWN",
} as const;

export type ErrorCode = typeof ERROR_CODES[keyof typeof ERROR_CODES];

export class AppError extends Error {
  override readonly name = "AppError";
  readonly code: ErrorCode;
  readonly cause: unknown;

  constructor(code: ErrorCode, message: string, cause: unknown = null) {
    super(message);
    this.code = code;
    this.cause = cause;
  }
}

export const createAppError = (code: ErrorCode, message: string, cause: unknown = null): AppError => 
  new AppError(code, message, cause);

export function isAbortError(error: unknown, signal?: AbortSignal | null): boolean {
  const err = error as Record<string, unknown> | null | undefined;
  return err?.name === "AbortError" ||
    err?.code === ERROR_CODES.ABORTED ||
    !!(signal?.aborted) ||
    !!(typeof err?.message === "string" && err.message.toLowerCase().includes("abort"));
}

export function toAppError(
  error: unknown, 
  fallbackCode: ErrorCode = ERROR_CODES.UNKNOWN, 
  fallbackMessage: string = "Ha ocurrido un error inesperado."
): AppError {
  if (error instanceof AppError) return error;
  if (isAbortError(error)) return createAppError(ERROR_CODES.ABORTED, "Petición cancelada.", error);
  const err = error as Record<string, unknown> | null | undefined;
  if (typeof err?.message === "string" && err.message.includes("Failed to fetch")) {
    return createAppError(ERROR_CODES.NETWORK, "Error de conexión. Revisa tu internet.", error);
  }
  const errMsg = typeof err?.message === "string" ? err.message : fallbackMessage;
  return createAppError(fallbackCode, errMsg, error);
}

export function normalizePageNumber(value: unknown, fallback: number = 1): number {
  const page = Number.parseInt(String(value), 10);
  return Number.isFinite(page) && page > 0 ? page : fallback;
}

export function normalizeTotalMovies(value: unknown): number {
  const total = Number.parseInt(String(value), 10);
  if (!Number.isFinite(total)) return 0;
  return Math.max(-1, total);
}

export function normalizePageSize(value: unknown, fallback: number = CONFIG.ITEMS_PER_PAGE): number {
  const pageSize = Number.parseInt(String(value), 10);
  return Number.isFinite(pageSize) && pageSize > 0 ? pageSize : fallback;
}

export function normalizeOffset(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const offset = Number.parseInt(String(value), 10);
  return Number.isFinite(offset) && offset >= 0 ? offset : null;
}

export function normalizeSort(value: unknown): string {
  const strValue = String(value ?? "");
  return SORT_VALUES.has(strValue) ? strValue : DEFAULTS.SORT;
}

export function normalizeMediaType(value: unknown): "all" | "movies" | "series" {
  const strValue = String(value ?? "");
  return MEDIA_TYPES.has(strValue) ? (strValue as "all" | "movies" | "series") : (DEFAULTS.MEDIA_TYPE as "all" | "movies" | "series");
}

export function normalizeMyList(value: unknown): null | "rated" | "watchlist" | "mixed" {
  const normalized = value === true || value === "true" ? "mixed" : value;
  const strValue = normalized === null || normalized === undefined ? null : String(normalized);
  return MY_LIST_MODES.has(strValue) ? (strValue as null | "rated" | "watchlist" | "mixed") : null;
}

export function normalizeYearRange(value: unknown): string | null {
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

export function normalizeTextValue(value: unknown): string {
  return typeof value === "string" ? value.trim() : (value !== null && value !== undefined ? String(value).trim() : "");
}

export function normalizeNullableText(value: unknown): string | null {
  const text = normalizeTextValue(value);
  return text.length > 0 ? text : null;
}

export function normalizeStringList(value: unknown): string[] {
  const source = Array.isArray(value) 
    ? value 
    : (typeof value === "string" ? value.split(",") : (value !== null && value !== undefined ? [String(value)] : []));
  return [...new Set(source.map(normalizeTextValue).filter(Boolean))];
}

export function normalizeFilterValue(key: string, value: unknown): unknown {
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

export function normalizeActiveFilters(filters: Partial<ActiveFilters> = {}): ActiveFilters {
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

export function areContractValuesEqual(left: unknown, right: unknown): boolean {
  if (Array.isArray(left) || Array.isArray(right)) {
    const leftList = normalizeStringList(left);
    const rightList = normalizeStringList(right);
    return leftList.length === rightList.length && leftList.every((item, index) => item === rightList[index]);
  }
  return left === right;
}

export function normalizeMovieId(value: unknown): number | null {
  const movieId = Number.parseInt(String(value), 10);
  return Number.isFinite(movieId) && movieId > 0 ? movieId : null;
}

export function normalizeUserMovieEntry(entry: unknown = {}): UserMovieEntry {
  if (!entry || typeof entry !== "object") return { rating: null, onWatchlist: false };
  const e = entry as Record<string, unknown>;
  const ratingVal = e.rating === null || e.rating === undefined ? null : Number.parseInt(String(e.rating), 10);
  const rating = Number.isFinite(ratingVal) && ratingVal !== null && ratingVal >= 1 && ratingVal <= 10 ? ratingVal : null;
  const onWatchlist = e.onWatchlist === true || e.on_watchlist === true;
  return { rating, onWatchlist };
}

export function normalizeUserMovieData(data: unknown = {}): Record<string, UserMovieEntry> {
  if (!data || typeof data !== "object") return {};
  return Object.fromEntries(
    Object.entries(data as Record<string, unknown>)
      .map(([movieId, entry]) => {
        const id = normalizeMovieId(movieId);
        return [id !== null ? String(id) : null, normalizeUserMovieEntry(entry)] as const;
      })
      .filter(([movieId]) => movieId !== null) as Array<[string, UserMovieEntry]>
  );
}

interface MovieQueryParams {
  activeFilters?: Partial<ActiveFilters>;
  currentPage?: unknown;
  pageSize?: unknown;
  requestCount?: boolean;
  explicitOffset?: unknown;
}

export function normalizeMovieQuery({ activeFilters, currentPage, pageSize, requestCount, explicitOffset }: MovieQueryParams) {
  return {
    activeFilters: normalizeActiveFilters(activeFilters),
    currentPage: normalizePageNumber(currentPage),
    pageSize: normalizePageSize(pageSize),
    requestCount: requestCount !== false,
    explicitOffset: normalizeOffset(explicitOffset),
  };
}

export function normalizeMovieRows(items: unknown): Movie[] {
  return Array.isArray(items)
    ? items.filter((item): item is Movie => 
        !!(item && typeof item === "object" && normalizeMovieId((item as Record<string, unknown>).id) !== null && typeof (item as Record<string, unknown>).title === "string")
      )
    : [];
}

export function normalizeMoviesResponse<T = Movie>(
  response: unknown, 
  mapItem: (item: Movie) => T = (item: Movie) => item as unknown as T
): { total: number; items: T[]; aborted?: boolean } {
  const resp = response as Record<string, unknown> | null | undefined;
  return {
    total: normalizeTotalMovies(resp?.total ?? -1),
    items: normalizeMovieRows(resp?.items).map(mapItem),
    ...(resp?.aborted ? { aborted: true } : {}),
  };
}


