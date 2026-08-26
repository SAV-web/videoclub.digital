// =================================================================
//                 CONTRATOS DE DATOS DE LA APLICACIÓN
// =================================================================
// Este módulo define las formas válidas de estado, filtros, respuestas
// de API y errores. Es una frontera ligera: normaliza entradas externas
// y evita que datos inválidos se propaguen por la UI.
// =================================================================

import { CONFIG, DEFAULTS, TEXT_FILTER_KEYS } from "./constants.js";
import { ActiveFilters, Movie, UserMovieEntry } from "./types.js";
import { toSlug, GENRE_SLUG_MAP, genreToSlug } from "../shared/slugs.js";

// Re-exportamos para que los módulos SPA que ya importan de contracts no se rompan
export { toSlug, GENRE_SLUG_MAP, genreToSlug };

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

/**
 * Convierte una cadena de filtro de año (ej: "1980-2020", "1995" o null) en una tupla [minYear, maxYear].
 */
export function parseYearRangeRaw(yearStr?: string | null): [number, number] {
  if (!yearStr || !yearStr.trim()) return [CONFIG.YEAR_MIN, CONFIG.YEAR_MAX];
  const parts = yearStr.split("-").map(Number);
  const min = isNaN(parts[0]) ? CONFIG.YEAR_MIN : parts[0];
  const max = parts.length > 1 ? (isNaN(parts[1]) ? CONFIG.YEAR_MAX : parts[1]) : min;
  return [min, max];
}

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

const LIST_FILTER_KEYS = new Set<string>(["excludedGenres", "excludedCountries"]);

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
  if (signal?.aborted) return true;
  const err = error as Record<string, unknown> | null | undefined;
  if (!err) return false;
  return err.name === "AbortError" ||
    err.code === ERROR_CODES.ABORTED ||
    (typeof err.message === "string" && (
      err.message.toLowerCase().includes("abort") ||
      err.message.toLowerCase().includes("cancel")
    )) ||
    (typeof (err.details) === "string" && (
      (err.details as string).toLowerCase().includes("abort") ||
      (err.details as string).toLowerCase().includes("cancel")
    )) ||
    (err.cause ? isAbortError(err.cause) : false);
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

export const SORT_SLUG_MAP: Record<string, string> = {
  recientes: "year,desc",
  antiguas: "year,asc",
  "nota-fa": "fa_rating,desc",
  "nota-imdb": "imdb_rating,desc",
  "votos-fa": "fa_votes,desc",
  "votos-imdb": "imdb_votes,desc",
};

export const REVERSE_SORT_SLUG_MAP: Record<string, string> = Object.fromEntries(
  Object.entries(SORT_SLUG_MAP).map(([slug, val]) => [val, slug])
);

export function normalizeSort(value: unknown): string {
  const strValue = String(value ?? "").trim().toLowerCase();
  if (SORT_SLUG_MAP[strValue]) return SORT_SLUG_MAP[strValue];
  if (SORT_VALUES.has(strValue)) return strValue;
  return DEFAULTS.SORT;
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
  const str = String(value).trim();
  if (!str) return null;

  const [rawStart, rawEnd] = parseYearRangeRaw(str);
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

// toSlug y GENRE_SLUG_MAP importados de ../shared/slugs.js (ver imports arriba)

export const COUNTRY_SLUG_MAP: Record<string, string> = {
  eeuu: "EEUU",
  espana: "España",
  uk: "UK",
  francia: "Francia",
  japon: "Japón",
  italia: "Italia",
  alemania: "Alemania",
  canada: "Canadá",
  australia: "Australia",
  "corea-del-sur": "Corea del Sur",
  "hong-kong": "Hong Kong",
  mexico: "México",
  argentina: "Argentina",
  suecia: "Suecia",
  dinamarca: "Dinamarca",
  noruega: "Noruega",
  polonia: "Polonia",
  rusia: "Rusia",
  "union-sovietica": "Unión Soviética",
  irlanda: "Irlanda",
  belgica: "Bélgica",
  austria: "Austria",
  "paises-bajos": "Países Bajos",
  suiza: "Suiza",
  portugal: "Portugal",
  grecia: "Grecia",
  "rep-checa": "Rep. Checa",
  hungria: "Hungría",
  rumania: "Rumanía",
  brasil: "Brasil",
  chile: "Chile",
  colombia: "Colombia",
  cuba: "Cuba",
  india: "India",
  china: "China",
  taiwan: "Taiwán",
  iran: "Irán",
  turquia: "Turquía",
  "nueva-zelanda": "Nueva Zelanda",
  islandia: "Islandia",
  finlandia: "Finlandia",
  sudafrica: "Sudáfrica",
  israel: "Israel",
  libano: "Líbano",
  egipto: "Egipto",
  tailandia: "Tailandia",
  indonesia: "Indonesia",
  filipinas: "Filipinas",
  latam: "latam",
  nordic: "nordic"
};

export const STUDIO_SLUGS: ReadonlySet<string> = new Set([
  "warner", "universal", "sony", "paramount", "disney", "netflix",
  "amazon", "fox", "lionsgate", "canalplus", "bbc", "miramax",
  "a24", "movistar", "apple"
]);

export const SELECTION_SLUGS: ReadonlySet<string> = new Set([
  "1001movies", "tspdt", "criterion", "kinolorber", "toptv",
  "hbo", "acontra", "arrow", "eureka", "imprint"
]);

// genreToSlug importada de ../shared/slugs.js (ver imports arriba)

export function countryToSlug(country: string | null | undefined): string | null {
  if (!country) return null;
  const norm = country.trim().toLowerCase();
  const direct = Object.keys(COUNTRY_SLUG_MAP).find(slug => COUNTRY_SLUG_MAP[slug].toLowerCase() === norm);
  if (direct) return direct;
  return toSlug(country);
}

export function slugToPersonQuery(slug: string): string {
  if (!slug) return "";
  return slug.replace(/-/g, " ").trim();
}

export function buildPrettyPath(filters: {
  genre?: string | null;
  country?: string | null;
  studio?: string | null;
  selection?: string | null;
  director?: string | null;
  actor?: string | null;
}): string {
  // 1. Prioridad: Entidades VIP de Persona (excluyentes de catálogo)
  if (filters.director) {
    const dirSlug = toSlug(filters.director);
    return dirSlug ? `/director/${dirSlug}/` : "/";
  }

  if (filters.actor) {
    const actSlug = toSlug(filters.actor);
    return actSlug ? `/actor/${actSlug}/` : "/";
  }

  // 2. Jerarquía de Catálogo
  const segments: string[] = [];

  const genreSlug = genreToSlug(filters.genre);
  if (genreSlug) segments.push(genreSlug);

  const countrySlug = countryToSlug(filters.country);
  if (countrySlug) segments.push(countrySlug);

  if (filters.selection) {
    const selCode = filters.selection.toLowerCase().trim();
    if (SELECTION_SLUGS.has(selCode)) segments.push(selCode);
  } else if (filters.studio) {
    const stuCode = filters.studio.toLowerCase().trim();
    if (STUDIO_SLUGS.has(stuCode)) segments.push(stuCode);
  }

  if (segments.length === 0) return "/";
  return `/${segments.join("/")}/`;
}

export function parsePrettyPath(pathname: string): {
  genre: string | null;
  country: string | null;
  studio: string | null;
  selection: string | null;
  director: string | null;
  actor: string | null;
} {
  const result = {
    genre: null as string | null,
    country: null as string | null,
    studio: null as string | null,
    selection: null as string | null,
    director: null as string | null,
    actor: null as string | null
  };

  if (!pathname || pathname === "/") return result;

  let cleanPath = pathname;
  if (cleanPath.startsWith("/videoclub.digital/")) {
    cleanPath = cleanPath.slice("/videoclub.digital".length);
  }

  const rawSegments = cleanPath.split("/").map(s => s.trim().toLowerCase()).filter(Boolean);
  if (rawSegments.length === 0) return result;

  // 1. Detección de prefijo de persona /director/{slug}/ o /actor/{slug}/
  if (rawSegments[0] === "director" && rawSegments.length >= 2) {
    result.director = slugToPersonQuery(rawSegments.slice(1).join("-"));
    return result;
  }

  if (rawSegments[0] === "actor" && rawSegments.length >= 2) {
    result.actor = slugToPersonQuery(rawSegments.slice(1).join("-"));
    return result;
  }

  // 2. Detección de filtros de catálogo posicionales/semánticos
  for (const seg of rawSegments) {
    if (SELECTION_SLUGS.has(seg)) {
      result.selection = seg;
      result.studio = null;
    } else if (STUDIO_SLUGS.has(seg)) {
      result.studio = seg;
      result.selection = null;
    } else if (GENRE_SLUG_MAP[seg]) {
      result.genre = GENRE_SLUG_MAP[seg];
    } else if (COUNTRY_SLUG_MAP[seg]) {
      result.country = COUNTRY_SLUG_MAP[seg];
    }
  }

  return result;
}

export function normalizeStudioCode(value: unknown): string | null {
  const text = normalizeTextValue(value).toLowerCase();
  if (!text || !STUDIO_SLUGS.has(text)) return null;
  return text;
}

export function normalizeSelectionCode(value: unknown): string | null {
  const text = normalizeTextValue(value).toLowerCase();
  if (!text || !SELECTION_SLUGS.has(text)) return null;
  return text;
}

export function normalizeCodeValue(value: unknown): string | null {
  const text = normalizeTextValue(value).toLowerCase();
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
  if (key === "studio") return normalizeStudioCode(value);
  if (key === "selection") return normalizeSelectionCode(value);
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
    selection: normalizeSelectionCode(filters.selection),
    studio: normalizeStudioCode(filters.studio),
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


