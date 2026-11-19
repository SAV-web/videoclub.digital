/// <reference types="vite/client" />

// =================================================================
//          COMPONENTE: Revert Action (Deshacer Cambios Accidentales)
// =================================================================
// FICHERO: src/js/components/card/revertAction.ts
// RESPONSABILIDAD: Gestión del botón de rehacer/revertir en la esquina
// superior derecha del cartel tras votar o alternar watchlist, y su
// ciclo de vida (permanece hasta votar otra película o tocar filtros).
// =================================================================

import { appEvents, updateUserDataForMovie, getUserDataForMovie } from "../../state.js";
import { saveLocalEntryWithMovie } from "../../localStore.js";
import { scheduleSync } from "../../syncManager.js";
import { showToast } from "../../ui.js";
import { triggerHapticFeedback } from "../../utils.js";
import { normalizeMovieId } from "../../contracts.js";
import type { MappedMovie, MovieCardElement, UserMovieEntry } from "../../types.js";

export interface RevertSnapshot {
  movieId: number;
  rating: number | null;
  onWatchlist: boolean;
  note: string | null;
  movieData: MappedMovie | null;
}

let activeSnapshot: RevertSnapshot | null = null;
let listenersInitialized = false;

/**
 * Evalúa si el estado actual de la película en memoria difiere del snapshot previo.
 * Si el usuario vuelve a poner la misma nota o estado de watchlist, no hay diferencia
 * significativa y por tanto no es necesario mostrar el botón de revertir.
 */
export function hasMeaningfulDifference(normId: number): boolean {
  if (!activeSnapshot || activeSnapshot.movieId !== normId) return false;

  const current = getUserDataForMovie(normId);
  const currentRating = current?.rating ?? null;
  const currentWatchlist = current?.onWatchlist ?? false;
  const currentNote = current?.note ?? null;

  const snapshotRating = activeSnapshot.rating ?? null;
  const snapshotWatchlist = activeSnapshot.onWatchlist ?? false;
  const snapshotNote = activeSnapshot.note ?? null;

  return (
    currentRating !== snapshotRating ||
    currentWatchlist !== snapshotWatchlist ||
    currentNote !== snapshotNote
  );
}

/**
 * Obtiene el snapshot de la acción activa susceptible de ser revertida.
 */
export function getActiveRevertSnapshot(): RevertSnapshot | null {
  return activeSnapshot;
}

/**
 * Determina si hay una acción reversible activa para una película específica.
 * Devuelve false si el usuario ha devuelto la película a su estado original.
 */
export function isMovieRevertActive(movieId: number | string | null | undefined): boolean {
  const normId = normalizeMovieId(movieId);
  if (normId === null || activeSnapshot === null || activeSnapshot.movieId !== normId) return false;
  return hasMeaningfulDifference(normId);
}

/**
 * Registra el snapshot previo antes de mutar la película.
 * Si ya hay un snapshot para esta misma película, conservamos el snapshot original
 * para que deshacer restaure el estado anterior al inicio de los cambios.
 */
export function registerRevertSnapshot(
  movieId: number,
  prevUserData: UserMovieEntry | undefined,
  movieData: MappedMovie | null
): void {
  const normId = normalizeMovieId(movieId);
  if (normId === null) return;

  if (!activeSnapshot || activeSnapshot.movieId !== normId) {
    activeSnapshot = {
      movieId: normId,
      rating: prevUserData?.rating ?? null,
      onWatchlist: prevUserData?.onWatchlist ?? false,
      note: prevUserData?.note ?? null,
      movieData
    };
  }
}

/**
 * Muestra el botón de revertir en la película especificada y lo oculta en cualquier otra.
 * Si el estado actual ha vuelto a coincidir con el snapshot original (misma nota o watchlist),
 * limpia la acción de revertir y oculta el botón.
 */
export function showRevertButtonForMovie(movieId: number): void {
  const normId = normalizeMovieId(movieId);
  if (normId === null || typeof document === "undefined") return;

  // Si no hay snapshot o el estado actual es idéntico al snapshot original,
  // no es necesario el icono revertir.
  if (!activeSnapshot || activeSnapshot.movieId !== normId || !hasMeaningfulDifference(normId)) {
    clearActiveRevertAction();
    return;
  }

  // 1. Ocultar en tarjetas de cualquier otra película
  const activeButtons = document.querySelectorAll<HTMLElement>('.card-revert-btn:not([hidden])');
  activeButtons.forEach((btn) => {
    const card = btn.closest<HTMLElement>('.movie-card');
    if (!card || card.dataset.movieId !== String(normId)) {
      btn.hidden = true;
    }
  });

  // 2. Mostrar en todas las instancias de esta película (grid y/o modal)
  const matchingCards = document.querySelectorAll<HTMLElement>(`.movie-card[data-movie-id="${normId}"]`);
  matchingCards.forEach((card) => {
    const btn = card.querySelector<HTMLElement>('.card-revert-btn');
    if (btn) {
      btn.hidden = false;
    }
  });
}

/**
 * Invalida y oculta cualquier botón de revertir activo.
 * Se invoca cuando se tocan o cambian los filtros.
 */
export function clearActiveRevertAction(): void {
  if (!activeSnapshot) return;
  activeSnapshot = null;

  if (typeof document !== "undefined") {
    const activeButtons = document.querySelectorAll<HTMLElement>('.card-revert-btn:not([hidden])');
    activeButtons.forEach((btn) => {
      btn.hidden = true;
    });
  }
}

/**
 * Ejecuta la reversión del cambio accidental:
 * Restaura el estado previo en memoria, persiste en almacenamiento Local-First,
 * programa la sincronización perimetral, actualiza la UI y oculta el botón.
 */
export async function executeRevertAction(
  movieId: number,
  card?: MovieCardElement,
  onRestored?: (card: MovieCardElement) => void
): Promise<void> {
  const normId = normalizeMovieId(movieId);
  if (normId === null || !activeSnapshot || activeSnapshot.movieId !== normId) return;

  const snapshot = activeSnapshot;
  // Limpiar snapshot para evitar reentrancia
  activeSnapshot = null;

  const restoredState: Partial<UserMovieEntry> = {
    rating: snapshot.rating,
    onWatchlist: snapshot.onWatchlist
  };
  if (snapshot.note !== undefined) {
    restoredState.note = snapshot.note;
  }

  // 1. Ocultar los botones de rehacer inmediatamente
  if (typeof document !== "undefined") {
    document.querySelectorAll<HTMLElement>('.card-revert-btn:not([hidden])').forEach((btn) => {
      btn.hidden = true;
    });
  }

  // 2. Actualizar estado reactivo en memoria (dispara userMovieDataChanged)
  triggerHapticFeedback("light");
  updateUserDataForMovie(normId, restoredState);

  // 3. Callback de actualización síncrona si está disponible
  if (card && onRestored) {
    onRestored(card);
  }

  // 4. Persistencia Local-First garantizada
  const movieData = snapshot.movieData || (card?.movieData as MappedMovie) || null;
  await saveLocalEntryWithMovie(normId, restoredState, movieData);
  triggerHapticFeedback("success");
  showToast("Cambio revertido", "info");

  // 5. Sincronización en background con Supabase
  scheduleSync(200);
}

/**
 * Registra los escuchadores globales de eventos para invalidar el botón
 * cuando el usuario interactúe con los filtros.
 */
export function initRevertActionListeners(): () => void {
  if (listenersInitialized) return () => {};
  listenersInitialized = true;

  const unsubs: Array<() => void> = [];

  // Reset o aplicación de filtros
  unsubs.push(appEvents.on("filtersReset", clearActiveRevertAction));
  unsubs.push(appEvents.on("filter:apply", clearActiveRevertAction));

  // Cambios de estado en filtros, búsqueda o paginación
  unsubs.push(appEvents.on("state:changed", (data: { path?: string }) => {
    if (data?.path && (data.path.startsWith("activeFilters.") || data.path === "searchTerm" || data.path === "currentPage")) {
      clearActiveRevertAction();
    }
  }));

  return () => {
    unsubs.forEach((fn) => fn());
    listenersInitialized = false;
  };
}
