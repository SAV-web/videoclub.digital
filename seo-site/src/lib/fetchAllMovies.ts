import { supabase } from './supabase';
import { isValidMovieRow, type MovieRow } from './types';

const PAGE_SIZE = 1000;

/**
 * Proyección explícita de los campos estrictamente requeridos por la plantilla [slugId].astro
 * y los metadatos OpenGraph/Schema.org/JSON-LD. Reduce drásticamente el ancho de banda y la memoria del build.
 */
const MOVIE_PROJECTION = [
  'id',
  'title',
  'original_title',
  'slug',
  'year',
  'year_end',
  'type',
  'genres_list',
  'directors_list',
  'actors_list',
  'studios_list',
  'synopsis',
  'minutes',
  'episodes',
  'image',
  'fa_id',
  'fa_rating',
  'fa_votes',
  'imdb_id',
  'imdb_rating',
  'imdb_votes',
  'avg_rating',
  'wikipedia',
  'justwatch',
  'countries(name, code)',
].join(', ');

function validateAndFilterRows(rows: unknown[], context: string, seenSlugs: Set<string>): MovieRow[] {
  const valid: MovieRow[] = [];
  for (const row of rows) {
    if (isValidMovieRow(row)) {
      if (seenSlugs.has(row.slug)) {
        console.warn(`[SEO Build] Slug duplicado omitido (${context}): "${row.slug}" (ID ${row.id})`);
        continue;
      }
      seenSlugs.add(row.slug);
      valid.push(row);
    } else {
      console.warn(`[SEO Build] Fila omitida por contrato inválido (${context}):`, row);
    }
  }
  return valid;
}

/**
 * Trae películas para generar las páginas estáticas.
 *
 * Modo desarrollo (SEO_SAMPLE_SIZE definido, ej. "10"): una sola petición
 * sin paginar, ordenada por id (determinista — las mismas 10 películas en
 * cada build, para poder comparar cambios de plantilla sin ruido).
 *
 * Modo producción (SEO_SAMPLE_SIZE sin definir): paginación completa
 * (~20 peticiones de 1.000 filas para las ~20.000 filas actuales).
 */
export async function fetchAllMovies(): Promise<MovieRow[]> {
  const sampleSize = Number(import.meta.env.SEO_SAMPLE_SIZE) || 0;
  const seenSlugs = new Set<string>();

  if (sampleSize > 0) {
    const { data, error } = await supabase
      .from('movies')
      .select(MOVIE_PROJECTION)
      .not('slug', 'is', null)
      .neq('slug', '')
      .order('id', { ascending: true })
      .limit(sampleSize);

    if (error) throw new Error(`Error en muestra de prueba: ${error.message}`);
    const valid = validateAndFilterRows(data ?? [], `muestra ${sampleSize}`, seenSlugs);
    if (valid.length === 0 && (data?.length ?? 0) > 0) {
      throw new Error(`[SEO Build] Todas las filas de la muestra fallaron la validación de contrato.`);
    }
    return valid;
  }

  let all: MovieRow[] = [];
  let from = 0;

  while (true) {
    const { data, error } = await supabase
      .from('movies')
      .select(MOVIE_PROJECTION)
      .not('slug', 'is', null)
      .neq('slug', '')
      .range(from, from + PAGE_SIZE - 1)
      .order('id', { ascending: true });

    if (error) throw new Error(`Error al paginar movies (offset ${from}): ${error.message}`);
    if (!data || data.length === 0) break;

    const validPage = validateAndFilterRows(data, `offset ${from}`, seenSlugs);
    all = all.concat(validPage);
    if (data.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }

  return all;
}

