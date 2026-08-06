/// <reference types="vite/client" />

// =================================================================
//   GESTIÓN DE CACHÉ DE PELÍCULAS CONSULTADAS (Checked Movie IDs)
// =================================================================
// Módulo desacoplado para romper la dependencia circular entre state.ts y api.ts.
// Mantiene un Set en memoria con los IDs de películas cuyo estado de usuario
// (valoración / lista de seguimiento) ya ha sido verificado en Supabase.
// =================================================================

import { normalizeMovieId } from "./contracts.js";

const checkedUserMovieIds = new Set<string>();

/**
 * Limpia el conjunto de IDs verificados (ej. al cerrar sesión o cambiar de usuario).
 */
export function clearCheckedUserMovieIds(): void {
  checkedUserMovieIds.clear();
}

/**
 * Marca un ID de película como ya consultado o actualizado.
 */
export function markMovieIdAsChecked(movieId: number | string): void {
  const normId = normalizeMovieId(movieId);
  if (normId !== null) {
    checkedUserMovieIds.add(String(normId));
  }
}

/**
 * Comprueba si un ID de película ya ha sido verificado previamente.
 */
export function isMovieIdChecked(movieId: number | string): boolean {
  const normId = normalizeMovieId(movieId);
  return normId !== null ? checkedUserMovieIds.has(String(normId)) : false;
}
