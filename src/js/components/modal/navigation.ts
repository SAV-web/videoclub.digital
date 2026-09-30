import { prefetchImageUrl } from "../card/index.js";
import { appEvents, getCurrentPage, getTotalMovies } from "../../state.js";
import { getPosterUrl } from "../../utils.js";
import { CSS_CLASSES, CONFIG } from "../../constants.js";
import type { MappedMovie, MovieCardElement } from "../../types.js";

/**
 * Obtiene la lista de tarjetas visibles en el grid principal.
 */
export function getGridCards(): HTMLElement[] {
  const grid = document.getElementById("grid-container");
  if (!grid) return [];
  return Array.from(grid.querySelectorAll<HTMLElement>(".movie-card[data-movie-id]"));
}

export interface NavigateToSiblingOptions {
  content: HTMLElement | null;
  modal: HTMLElement | null;
  openModal: (card: MovieCardElement, cards?: HTMLElement[] | null) => void;
}

/**
 * Navega a la tarjeta anterior o siguiente.
 * @param {number} direction - -1 (Anterior) o 1 (Siguiente).
 */
export function navigateToSibling(direction: number, options: NavigateToSiblingOptions): void {
  const { content, modal, openModal } = options;
  if (!content) return;

  const currentId = content.dataset.movieId;
  if (!currentId) return;

  const cards = getGridCards();
  const currentIndex = cards.findIndex(c => c.dataset.movieId === currentId);

  if (currentIndex === -1) return;

  const nextIndex = currentIndex + direction;
  if (nextIndex >= 0 && nextIndex < cards.length) {
    openModal(cards[nextIndex] as MovieCardElement, cards);
  } else {
    // Si sale de los límites, intentamos cambiar de página
    const isWallMode = document.body.classList.contains(CSS_CLASSES.ROTATION_DISABLED);
    const pageSize = isWallMode ? CONFIG.WALL_MODE_ITEMS_PER_PAGE : CONFIG.ITEMS_PER_PAGE;
    const totalPages = Math.ceil(getTotalMovies() / pageSize);
    const currentPage = getCurrentPage();

    if (direction === 1 && currentPage < totalPages) {
      modal?.classList.add("modal-is-loading");
      appEvents.emit("page:requestChange", { direction: 1, target: "first" });
    } else if (direction === -1 && currentPage > 1) {
      modal?.classList.add("modal-is-loading");
      appEvents.emit("page:requestChange", { direction: -1, target: "last" });
    }
  }
}

/**
 * Actualiza el estado (habilitado/deshabilitado) de los botones de navegación.
 */
export function updateNavButtons(
  currentId: number | string,
  contextCards: HTMLElement[] | null = null,
  domButtons?: { prevBtn: HTMLButtonElement | null; nextBtn: HTMLButtonElement | null }
): void {
  const prevBtn = domButtons?.prevBtn ?? (document.getElementById("modal-prev-btn") as HTMLButtonElement | null);
  const nextBtn = domButtons?.nextBtn ?? (document.getElementById("modal-next-btn") as HTMLButtonElement | null);
  const strId = String(currentId);

  const cards = contextCards || getGridCards();
  const currentIndex = cards.findIndex(c => c.dataset.movieId === strId);

  if (currentIndex === -1) {
    if (prevBtn) prevBtn.disabled = true;
    if (nextBtn) nextBtn.disabled = true;
    return;
  }

  const isWallMode = document.body.classList.contains(CSS_CLASSES.ROTATION_DISABLED);
  const pageSize = isWallMode ? CONFIG.WALL_MODE_ITEMS_PER_PAGE : CONFIG.ITEMS_PER_PAGE;
  const totalPages = Math.ceil(getTotalMovies() / pageSize);
  const currentPage = getCurrentPage();

  const hasPrev = currentIndex > 0 || currentPage > 1;
  const hasNext = currentIndex < cards.length - 1 || currentPage < totalPages;

  if (prevBtn) {
    prevBtn.disabled = !hasPrev;
  }
  if (nextBtn) {
    nextBtn.disabled = !hasNext;
  }
}

/**
 * Precarga de forma predictiva y limitada (máximo 2) las imágenes de las fichas inmediatamente adyacentes (anterior / siguiente).
 */
export function prefetchAdjacentModalImages(
  cardElement: MovieCardElement,
  contextCards: HTMLElement[] | null = null
): void {
  const cards = contextCards || getGridCards();
  if (!cards || cards.length === 0) return;

  const currentId = cardElement?.dataset?.movieId || (cardElement?.movieData ? String(cardElement.movieData.id) : null);
  if (!currentId) return;

  const currentIndex = cards.findIndex(c => c.dataset.movieId === currentId);
  if (currentIndex === -1) return;

  const adjacentIndices = [currentIndex - 1, currentIndex + 1];
  for (const idx of adjacentIndices) {
    if (idx >= 0 && idx < cards.length) {
      const adjacentCard = cards[idx] as MovieCardElement;
      const img = adjacentCard.querySelector<HTMLImageElement>("img");
      const movieData = adjacentCard.movieData as Partial<MappedMovie> | undefined;
      const url = img?.dataset?.src || (img?.src && !img.src.startsWith("data:") ? img.src : null) || movieData?.posterUrl || (movieData?.slug ? getPosterUrl(movieData.slug) : null);
      if (url) {
        prefetchImageUrl(url);
      }
    }
  }
}
