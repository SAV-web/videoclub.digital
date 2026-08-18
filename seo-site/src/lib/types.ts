import type { MovieRow } from '../../../src/shared/types';
export type { MovieRow };


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

