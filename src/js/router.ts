/// <reference types="vite/client" />

// =================================================================
//          MÓDULO: Router & URL Synchronization
// =================================================================
// FICHERO: src/js/router.ts
// RESPONSABILIDAD: Sincronización bidireccional entre la URL (Pretty Paths
// y QueryParams) y el estado global, persistencia de posición de scroll
// y manipulación de History API (pushState/replaceState).
// =================================================================

import { getAppBasePath } from "./contracts.js";
import {
  syncStateWithUrl,
  canonicalizeCurrentUrl,
  stateToPrettyUrl,
  getActiveFilters,
  getCurrentPage
} from "./state.js";
import {
  dom,
  updateTypeFilterUI,
  updateMobileStatusBar
} from "./ui.js";

const scrollPositionsCache = new Map<string, number>();

/**
 * Guarda la posición de scroll actual asociada a la URL completa actual.
 */
export function saveCurrentScrollPosition(): void {
  if (typeof window === "undefined") return;
  const currentKey = `${window.location.pathname}${window.location.search}`;
  const scrollY = Math.max(0, window.scrollY);
  scrollPositionsCache.set(currentKey, scrollY);

  try {
    const currentState = window.history.state || {};
    if (currentState.scrollY !== scrollY) {
      window.history.replaceState({ ...currentState, scrollY }, "", window.location.href);
    }
  } catch {}
}

/**
 * Obtiene la posición de scroll almacenada para una URL dada.
 */
export function getSavedScrollPosition(url?: string): number {
  if (typeof window === "undefined") return 0;
  const key = url || `${window.location.pathname}${window.location.search}`;
  return scrollPositionsCache.get(key) ?? 0;
}

/**
 * Lee la URL actual del navegador, sincroniza el estado inmutable
 * y actualiza los elementos visuales de control (input de búsqueda, select de orden,
 * toggles de tipo y la barra de estado móvil).
 */
export function readUrlAndSetState(): void {
  syncStateWithUrl(window.location.pathname, window.location.search);
  // Canonicalizar la URL después de normalizar el estado (sin añadir entrada al historial)
  canonicalizeCurrentUrl();

  const activeFilters = getActiveFilters();
  if (dom.searchInput) dom.searchInput.value = activeFilters.searchTerm || "";
  if (dom.sortSelect) dom.sortSelect.value = activeFilters.sort;
  updateTypeFilterUI(activeFilters.mediaType as "movies" | "series" | "all");
  updateMobileStatusBar();
}

/**
 * Serializa los filtros activos y la página a una Pretty URL canónica
 * y actualiza el historial del navegador mediante pushState o replaceState.
 */
export function updateUrl({ replace = false }: { replace?: boolean } = {}): void {
  const basePrefix = getAppBasePath();
  const { pathname, search } = stateToPrettyUrl(getActiveFilters(), getCurrentPage());
  const cleanPath = search ? `${pathname}?${search}` : pathname;
  const newUrl = `${basePrefix}${cleanPath}`;
  const currentFullUrl = `${window.location.pathname}${window.location.search}`;

  if (newUrl !== currentFullUrl) {
    saveCurrentScrollPosition();
    if (typeof window !== "undefined" && window.history) {
      if (replace) {
        const nextState = { ...window.history.state, path: newUrl };
        delete nextState.profileModalOpen;
        delete nextState.quickViewOpen;
        window.history.replaceState(nextState, "", newUrl);
      } else {
        window.history.pushState({ path: newUrl, scrollY: 0 }, "", newUrl);
      }
    }
  } else if (replace && typeof window !== "undefined" && window.history) {
    const nextState = { ...window.history.state, path: newUrl };
    delete nextState.profileModalOpen;
    delete nextState.quickViewOpen;
    window.history.replaceState(nextState, "", newUrl);
  }
}

/**
 * Normaliza una URL (barra final canónica y parámetros de query string ordenados)
 * para realizar comparaciones de equivalencia fidedignas en eventos popstate.
 */
export function normalizeUrl(path: string, query: string): string {
  const cleanPath = path.endsWith("/") ? path : `${path}/`;
  const params = new URLSearchParams(query);
  params.sort();
  const sortedQuery = params.toString();
  return `${cleanPath}${sortedQuery ? `?${sortedQuery}` : ""}`;
}
