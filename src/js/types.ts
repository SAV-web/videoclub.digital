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
  synopsis: string;
  thumbhash_st: string | null;
  last_synced_at: number;
  episodes: number | null;
  wikipedia: string | null;
  justwatch: string | null;
}

export interface UserMovieEntry {
  rating: number | null;
  onWatchlist: boolean;
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

export interface ApiResponse {
  total: number;
  items: Movie[];
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
  countries: { name: string; code: string } | null;
}

export interface VipData {
  type: "person" | "collection" | "studio";
  data?: PersonDetails | Record<string, unknown> | null;
  code: string;
  total: number;
}

export interface MovieCardElement extends HTMLElement {
  movieData?: MappedMovie | (PersonDetails & { isPerson: true });
}

