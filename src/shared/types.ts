// =================================================================
//          TIPOS COMPARTIDOS (src/shared/types.ts)
// =================================================================
// Separación explícita por capas de responsabilidad:
// 1. Fila cruda de Supabase (Database/PostgREST).
// 2. Modelo normalizado de Dominio (Domain Movie).
// 3. Modelo de Presentación UI (Mapped Movie).
// 4. Modelo específico de SEO / SSR (Astro Document).
// 5. Contratos de Búsqueda y Respuestas de API.
// =================================================================

import type { StudioConfig } from "./constants.js";
export type { StudioConfig };

// =================================================================
// 1. CAPA DE BASE DE DATOS / FILA CRUDA (Supabase Row)
// =================================================================

export interface SupabaseMovieRow {
  id: number;
  title: string;
  original_title: string | null;
  year: number | null;
  year_end: number | null;
  type: string | null;
  genres_list?: string | null;
  directors_list?: string | null;
  actors_list?: string | null;
  selections_list?: string | null;
  studios_list?: string | null;
  genres?: string | null;
  directors?: string | null;
  actors?: string | null;
  country?: string | null;
  country_code?: string | null;
  minutes: number | null;
  fa_id: string | null;
  fa_rating: number | null;
  fa_votes: number | null;
  imdb_id: string | null;
  imdb_rating: number | null;
  imdb_votes: number | null;
  avg_rating: number | null;
  synopsis: string | null;
  thumbhash_st: string | null;
  last_synced_at?: number | string | null;
  episodes: number | null;
  wikipedia: string | null;
  justwatch: string | null;
  slug?: string | null;
  countries?: { name: string; code: string } | null;
  user_movie_entries?: Array<{ rating: number | null; on_watchlist: boolean }> | { rating: number | null; on_watchlist: boolean } | null;
}

/**
 * Alias canónico para la fila cruda de la base de datos (usado en Astro y migraciones).
 */
export type MovieRow = SupabaseMovieRow;

// =================================================================
// 2. CAPA DE DOMINIO NORMALIZADO (Domain Model)
// =================================================================

export interface Movie {
  id: number;
  title: string;
  original_title: string | null;
  year: number | null;
  year_end: number | null;
  type: string | null;
  genres_list?: string | null;
  directors_list?: string | null;
  actors_list?: string | null;
  selections_list?: string | null;
  studios_list?: string | null;
  genres?: string | null;
  directors?: string | null;
  actors?: string | null;
  country?: string | null;
  country_code?: string | null;
  minutes: number | null;
  fa_id: string | null;
  fa_rating: number | null;
  fa_votes: number | null;
  imdb_id: string | null;
  imdb_rating: number | null;
  imdb_votes: number | null;
  avg_rating: number | null;
  synopsis: string | null;
  thumbhash_st: string | null;
  last_synced_at: number; // Timestamp garantizado en segundos tras shapeRawMovieRow
  episodes: number | null;
  wikipedia: string | null;
  justwatch: string | null;
  slug?: string | null;
}

// =================================================================
// 3. CAPA DE PRESENTACIÓN UI (Presentation Model)
// =================================================================

export interface MappedMovie extends Movie {
  isSeries: boolean;
  displayYear: string;
  posterUrl: string;
  displayOriginalTitle: string;
  hasOriginalTitle: boolean;
  displayEpisodes: string;
  parsedActors: string[];
  parsedDirectors: string[];
  studioList: string[];
}

export interface UserMovieEntry {
  rating: number | null;
  onWatchlist: boolean;
}

export interface MovieCardElement extends HTMLElement {
  movieData?: MappedMovie | (PersonDetails & { isPerson: true });
}

// =================================================================
// 4. CAPA DE SEO / SSR (Astro Document Model)
// =================================================================

export interface SeoMovieDocument extends SupabaseMovieRow {
  slug: string;
}

// =================================================================
// 5. CONTRATOS DE FILTRADO, BÚSQUEDA Y API
// =================================================================

export interface ActiveFilters {
  searchTerm: string;
  genre: string | null;
  year: string | null;
  country: string | null;
  director: string | null;
  actor: string | null;
  selection: string | null;
  studio: string | null;
  sort: string;
  mediaType: "all" | "movies" | "series";
  excludedGenres: string[];
  excludedCountries: string[];
  myList: null | "rated" | "watchlist" | "mixed";
}

export interface ApiResponse<T = MappedMovie> {
  total: number;
  items: T[];
  aborted?: boolean;
}

export type SearchResult<T = MappedMovie> = ApiResponse<T>;

export interface PersonDetails {
  id: number;
  name: string;
  photo: string | null;
  thumbhash_st?: string | null;
  birthday: string | null;
  deathday: string | null;
  place_of_birth: string | null;
  biography: string | null;
  titulo_bio: string | null;
  countries: { name: string; code: string } | null;
  hasBothRoles?: boolean;
  currentRole?: 'director' | 'actor';
  components?: string | null;
}

export interface VipData {
  type: "person" | "collection" | "studio";
  data?: PersonDetails | Record<string, unknown> | null;
  code?: string;
  total?: number;
  thumbhash_st?: string | null;
}
