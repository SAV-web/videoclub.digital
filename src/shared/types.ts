// =================================================================
//          TIPOS COMPARTIDOS (src/shared/types.ts)
// =================================================================
// Tipos e interfaces comunes compartidos entre SPA y Astro.
// =================================================================

import type { StudioConfig } from "./constants.js";
export type { StudioConfig };

export interface MovieRow {
  id: number;
  title: string;
  original_title: string | null;
  year: number | null;
  year_end: string | null;
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
  image: string;
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
  user_movie_entries?: Array<{ rating: number | null; on_watchlist: boolean }> | null;
}

export interface Movie {
  id: number;
  title: string;
  original_title: string | null;
  year: number | null;
  year_end: string | null;
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
  image: string;
  fa_id: string | null;
  fa_rating: number | null;
  fa_votes: number | null;
  imdb_id: string | null;
  imdb_rating: number | null;
  imdb_votes: number | null;
  avg_rating: number | null;
  synopsis: string | null;
  thumbhash_st: string | null;
  last_synced_at: number;
  episodes: number | null;
  wikipedia: string | null;
  justwatch: string | null;
  slug?: string | null;
}

export interface UserMovieEntry {
  rating: number | null;
  onWatchlist: boolean;
}

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

export interface ApiResponse<T = MappedMovie> {
  total: number;
  items: T[];
  aborted?: boolean;
}


export interface PersonDetails {
  id: number;
  name: string;
  photo: string | null;
  birthday: string | null;
  deathday: string | null;
  place_of_birth: string | null;
  biography: string | null;
  titulo_bio: string | null;
  countries: { name: string; code: string } | null;
}

export interface VipData {
  type: "person" | "collection" | "studio";
  data?: PersonDetails | Record<string, unknown> | null;
  code?: string;
  total?: number;
}

export interface MovieCardElement extends HTMLElement {
  movieData?: MappedMovie | (PersonDetails & { isPerson: true });
}
