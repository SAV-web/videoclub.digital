/// <reference types="vite/client" />

// =================================================================
//          COMPONENTE: Movie Card (Ficha e Interacciones)
// =================================================================
// FICHERO: src/js/components/card/index.ts
// RESPONSABILIDAD: Gestión del renderizado y API pública de tarjeta.
// =================================================================

import { CONFIG, CSS_CLASSES, ICONS } from "../../constants.js";
import { createElement } from "../../utils.js";
import { hasActiveMeaningfulFilters } from "../../state.js";

import type { MappedMovie, ActiveFilters, VipData, PersonDetails } from "../../types.js";
import {
  getCardGeneration,
  getFlippedCard,
  getFlipOnboardingTimeout,
  setFlipOnboardingTimeout,
  getFlipBackTimeout,
  setFlipBackTimeout
} from "./context.js";

import {
  unflipAllCards,
  prefetchImageUrl,
  toggleWatchlist,
  handleCardClick,
  updateCardUI,
  adjustQuickViewNoteHeight,
  applyLqipImage,
  populatePersonFields,
  type PopulatePersonOptions,
  createCardElement,
  createPersonCardElement,
  createCollectionCardElement,
  createStudioCardElement
} from "./cardElement.js";

import {
  disposeCardEvents,
  initCardInteractions,
  cleanupLazyImages,
  reobserveLazyImages
} from "./lifecycle.js";

// Re-exportar API pública para compatibilidad con consumidores externos hasta el paso 4
export {
  unflipAllCards,
  prefetchImageUrl,
  disposeCardEvents,
  initCardInteractions,
  toggleWatchlist,
  handleCardClick,
  updateCardUI,
  adjustQuickViewNoteHeight,
  applyLqipImage,
  populatePersonFields,
  type PopulatePersonOptions
};

export {
  getActiveRevertSnapshot,
  isMovieRevertActive,
  hasMeaningfulDifference,
  registerRevertSnapshot,
  showRevertButtonForMovie,
  clearActiveRevertAction,
  executeRevertAction,
  initRevertActionListeners
} from "./revertAction.js";

// Estado de Renderizado
let currentRenderRequestId = 0;

// =================================================================
//          5. GESTIÓN DE GRID (Renderizado Masivo)
// =================================================================

export async function renderMovieGrid(
  container: HTMLElement | null,
  movies: MappedMovie[],
  vipData: VipData | null = null
): Promise<void> {
  const renderId = ++currentRenderRequestId;
  unflipAllCards();
  if (!container) return;

  const hasVip = Boolean(vipData && (
    (vipData.type === 'person' && vipData.data) ||
    (vipData.type === 'collection' && vipData.code) ||
    (vipData.type === 'studio' && vipData.code)
  ));
  const offset = hasVip ? 1 : 0;

  const fragment = document.createDocumentFragment();

  if (vipData) {
    if (vipData.type === 'person' && vipData.data) {
      fragment.appendChild(createPersonCardElement(vipData.data as PersonDetails));
    } else if (vipData.type === 'collection' && vipData.code) {
      fragment.appendChild(createCollectionCardElement(vipData.code, vipData.total, vipData.thumbhash_st));
    } else if (vipData.type === 'studio' && vipData.code) {
      fragment.appendChild(createStudioCardElement(vipData.code, vipData.total, vipData.thumbhash_st));
    }
  }

  for (let i = 0; i < movies.length; i++) {
    fragment.appendChild(createCardElement(movies[i], i + offset));
  }

  if (renderId !== currentRenderRequestId || !document.body.contains(container)) return;

  cleanupLazyImages(container);
  container.replaceChildren(fragment);
}

/**
 * Extrae y preserva los nodos DOM reales de un grid renderizado en un DocumentFragment
 * para su restauración instantánea al navegar Atrás/Adelante sin reconstruir tarjetas ni re-cargar pósters.
 */
export function captureGridNodes(container: HTMLElement | null): DocumentFragment | null {
  if (!container || typeof document === "undefined" || typeof DocumentFragment === "undefined") return null;
  if (typeof container.firstChild === "undefined" || !container.firstChild) return null;

  unflipAllCards();
  cleanupLazyImages(container);

  const fragment = document.createDocumentFragment();
  while (container.firstChild) {
    const child = container.firstChild as HTMLElement;
    child.classList?.remove("is-hovered");
    fragment.appendChild(child);
  }
  return fragment.childNodes.length > 0 ? fragment : null;
}

/**
 * Restaura un DocumentFragment capturado previamente en el contenedor del grid
 * y re-observa únicamente las imágenes diferidas que aún no se hubieran cargado.
 */
export function restoreGridNodes(container: HTMLElement | null, fragment: DocumentFragment): void {
  currentRenderRequestId++;
  unflipAllCards();
  if (!container) return;

  cleanupLazyImages(container);
  reobserveLazyImages(fragment);
  container.replaceChildren(fragment);
}

// Skeletons y Estados Vacíos
export function renderSkeletons(container: HTMLElement | null, pagContainer: HTMLElement | null): void {
  currentRenderRequestId++;
  if (pagContainer) pagContainer.textContent = "";
  if (!container) return;

  cleanupLazyImages(container);

  const isWallMode = document.body.classList.contains(CSS_CLASSES.ROTATION_DISABLED);
  const count = isWallMode ? CONFIG.WALL_MODE_ITEMS_PER_PAGE : CONFIG.ITEMS_PER_PAGE;

  const frag = document.createDocumentFragment();
  for (let i = 0; i < count; i++) {
    frag.appendChild(createElement("div", { className: "skeleton-card" }));
  }
  container.replaceChildren(frag);
}

export function renderNoResults(
  container: HTMLElement | null,
  pagContainer: HTMLElement | null,
  filters: ActiveFilters
): void {
  currentRenderRequestId++;
  if (container) {
    cleanupLazyImages(container);
    container.textContent = "";
  }
  if (pagContainer) pagContainer.textContent = "";
  if (!container) return;

  const div = createElement("div", { className: "no-results", attributes: { role: "status" } });

  // Micro-ilustración editorial (SVG Inline)
  div.appendChild(createElement("div", { className: "no-results-icon", innerHTML: ICONS.POPCORN }));

  div.appendChild(createElement("h3", { textContent: "No se encontraron resultados" }));

  const hasFilters = hasActiveMeaningfulFilters();
  let msg = "";
  if (filters.myList === "watchlist") {
    msg = "Aún no tienes obras en tu lista de pendientes. Pulsa en el marcador de cualquier ficha para guardarla aquí.";
  } else if (filters.myList === "rated") {
    msg = "Aún no has votado ninguna obra. Haz clic en las estrellas de cualquier ficha para valorarla.";
  } else if (filters.searchTerm) {
    msg = `Prueba a simplificar tu búsqueda para "${filters.searchTerm}".`;
  } else if (hasFilters) {
    msg = "Intenta eliminar algunos filtros.";
  }

  if (msg) div.appendChild(createElement("p", { textContent: msg }));

  div.appendChild(createElement("button", {
    id: "clear-filters-from-empty",
    className: "btn btn--outline",
    textContent: filters.myList ? "Ver catálogo completo" : "Limpiar filtros"
  }));

  container.appendChild(div);
}

export function renderErrorState(container: HTMLElement | null, pagContainer: HTMLElement | null, message: string): void {
  currentRenderRequestId++;
  if (container) {
    cleanupLazyImages(container);
    container.textContent = "";
  }
  if (pagContainer) pagContainer.textContent = "";

  const div = createElement("div", { className: "no-results", attributes: { role: "alert" } });

  div.appendChild(createElement("h3", { textContent: "¡Vaya! Algo ha ido mal" }));
  div.appendChild(createElement("p", { textContent: message }));

  container?.appendChild(div);
}

// =================================================================
//          6. ONBOARDING (Educación de Usuario)
// =================================================================

const ONBOARDING_FLIP_DELAY_MS = 3000;
const ONBOARDING_STORAGE_KEY = "videoclub:flip_onboarding_count";
const MAX_ONBOARDING_FLIPS = 10;

export function getFlipOnboardingCount(): number {
  try {
    if (typeof localStorage === "undefined") return MAX_ONBOARDING_FLIPS;
    const val = localStorage.getItem(ONBOARDING_STORAGE_KEY);
    return val ? parseInt(val, 10) || 0 : 0;
  } catch {
    return MAX_ONBOARDING_FLIPS;
  }
}

export function resetFlipOnboardingCount(): void {
  try {
    if (typeof localStorage !== "undefined") {
      localStorage.removeItem(ONBOARDING_STORAGE_KEY);
    }
  } catch {
    // Silencioso ante restricciones de storage
  }
}

function incrementFlipOnboardingCount(): void {
  try {
    if (typeof localStorage === "undefined") return;
    const current = getFlipOnboardingCount();
    localStorage.setItem(ONBOARDING_STORAGE_KEY, String(current + 1));
  } catch {
    // Silencioso ante restricciones de storage
  }
}

export function runFlipOnboarding(container: HTMLElement | null): void {
  if (!container) return;
  if (document.body.classList.contains(CSS_CLASSES.ROTATION_DISABLED)) return;
  if (getFlipOnboardingCount() >= MAX_ONBOARDING_FLIPS) return;

  const fOnboard = getFlipOnboardingTimeout();
  if (fOnboard) clearTimeout(fOnboard);
  const fBack = getFlipBackTimeout();
  if (fBack) clearTimeout(fBack);

  const onboardGen = getCardGeneration();
  setFlipOnboardingTimeout(setTimeout(() => {
    if (onboardGen !== getCardGeneration()) return;
    if (
      document.body.classList.contains(CSS_CLASSES.ROTATION_DISABLED) ||
      document.body.classList.contains(CSS_CLASSES.MODAL_OPEN)
    ) {
      return;
    }
    if (getFlippedCard()) return; // Si el usuario ya está interactuando, no interrumpir
    if (getFlipOnboardingCount() >= MAX_ONBOARDING_FLIPS) return;

    // Seleccionar aleatoriamente una de las 4 primeras fichas de película reales
    const movieCards = Array.from(
      container.querySelectorAll<HTMLElement>(
        `.${CSS_CLASSES.MOVIE_CARD}:not(.person-card):not(.collection-card)`
      )
    );

    const candidateCards = movieCards.slice(0, 4);
    if (candidateCards.length === 0) return;

    const targetMovieCard = candidateCards[Math.floor(Math.random() * candidateCards.length)];
    if (!targetMovieCard || !targetMovieCard.isConnected) return;

    const inner = targetMovieCard.querySelector<HTMLElement>(".flip-card-inner");
    if (inner && !inner.classList.contains("is-flipped")) {
      inner.classList.add("is-flipped");
      incrementFlipOnboardingCount();

      setFlipBackTimeout(setTimeout(() => {
        if (onboardGen !== getCardGeneration()) return;
        if (inner.isConnected && inner.classList.contains("is-flipped") && getFlippedCard() !== targetMovieCard) {
          inner.classList.remove("is-flipped");
        }
      }, 1400));
    }
  }, ONBOARDING_FLIP_DELAY_MS));
}
