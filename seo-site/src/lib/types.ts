export interface MovieRow {
  id: number;
  title: string;
  original_title: string | null;
  year: number | null;
  year_end: string | null;
  type: string | null;
  minutes: number | null;
  synopsis: string | null;
  image: string;
  fa_id: string | null;
  fa_rating: number | null;
  fa_votes: number | null;
  imdb_id: string | null;
  imdb_rating: number | null;
  imdb_votes: number | null;
  avg_rating: number | null;
  genres_list: string | null;
  directors_list: string | null;
  actors_list: string | null;
  studios_list: string | null;
  selections_list: string | null;
  episodes: number | null;
  wikipedia: string | null;
  justwatch: string | null;
  last_synced_at: string | null;
  slug: string;
  countries: { name: string; code: string } | null;
}

/**
 * Validador de contrato en tiempo de ejecución (Type Guard).
 * Garantiza que los campos mínimos obligatorios para la generación SSG existan y sean válidos.
 */
export function isValidMovieRow(row: unknown): row is MovieRow {
  if (!row || typeof row !== 'object') return false;
  const r = row as Record<string, unknown>;
  return (
    typeof r.id === 'number' &&
    Number.isFinite(r.id) &&
    typeof r.title === 'string' &&
    r.title.trim().length > 0 &&
    typeof r.slug === 'string' &&
    r.slug.trim().length > 0
  );
}
