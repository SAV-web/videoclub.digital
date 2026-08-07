import { supabase } from './supabase';
import type { MovieRow } from './types';

const PAGE_SIZE = 1000;

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

  if (sampleSize > 0) {
    const { data, error } = await supabase
      .from('movies')
      .select('*, countries(name, code)')
      .order('id', { ascending: true })
      .limit(sampleSize);

    if (error) throw new Error(`Error en muestra de prueba: ${error.message}`);
    return (data ?? []) as MovieRow[];
  }

  let all: MovieRow[] = [];
  let from = 0;

  while (true) {
    const { data, error } = await supabase
      .from('movies')
      .select('*, countries(name, code)')
      .range(from, from + PAGE_SIZE - 1)
      .order('id', { ascending: true });

    if (error) throw new Error(`Error al paginar movies (offset ${from}): ${error.message}`);
    if (!data || data.length === 0) break;

    all = all.concat(data as MovieRow[]);
    if (data.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }

  return all;
}
