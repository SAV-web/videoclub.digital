import type { MovieRow } from './types';

const POSTER_BASE_URL =
  'https://wibygecgfczcvaqewleq.supabase.co/storage/v1/object/public/posters/';

export function getPosterUrl(movie: Pick<MovieRow, 'image'>): string {
  return movie.image && movie.image !== '.' ? `${POSTER_BASE_URL}${movie.image}.webp` : '';
}

/** Convierte "Drama, Thriller" en ["Drama", "Thriller"]. Nunca asumas array vacío si el campo es null. */
export function parseList(value: string | null | undefined): string[] {
  if (!value) return [];
  return value.split(',').map((s) => s.trim()).filter(Boolean);
}

export function buildCanonicalPath(movie: MovieRow): string {
  return `/pelicula/${movie.slug}/`;
}
