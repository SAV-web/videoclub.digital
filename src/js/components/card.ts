/// <reference types="vite/client" />

// =================================================================
//          COMPONENTE: Movie Card (Ficha e Interacciones)
// =================================================================
// FICHERO: src/js/components/card.ts
// RESPONSABILIDAD: Gestión del ciclo de vida de la tarjeta de película.
// =================================================================

import { CONFIG, CSS_CLASSES, ICONS } from "../constants.js";
import { createElement } from "../utils.js";
import { hasActiveMeaningfulFilters, appEvents } from "../state.js";
import { areInteractionsLocked, lockGlobalInteractions } from "../ui.js";

import type { MappedMovie, ActiveFilters, VipData, PersonDetails, MovieCardElement } from "../types.js";
import {
  lazyLoadObserver,
  getCardGeneration,
  bumpCardGeneration,
  getHoveredCard,
  setHoveredCard,
  getHoverTimeout,
  getFlippedCard,
  getFlipOnboardingTimeout,
  setFlipOnboardingTimeout,
  getFlipBackTimeout,
  setFlipBackTimeout
} from "./card/context.js";

import {
  unflipAllCards,
  prefetchImageUrl,
  toggleWatchlist,
  handleCardClick,
  updateCardUI,
  initializeCard,
  createCardElement,
  createPersonCardElement,
  createCollectionCardElement,
  createStudioCardElement,
  startFlipTimer,
  resetCardBackState,
  loadAndOpenModal,
  handleSingleTap,
  INTERACTIVE_SELECTOR
} from "./card/cardElement.js";

// Re-exportar API pública para compatibilidad con consumidores externos hasta el paso 4
export {
  unflipAllCards,
  prefetchImageUrl,
  toggleWatchlist,
  handleCardClick,
  updateCardUI,
  initializeCard
};

// Estado de Renderizado
let currentRenderRequestId = 0;

let isCardEventsInitialized = false;
let cardUnsubscribers: Array<() => void> = [];
const initializedContainers = new Set<HTMLElement>();

export function disposeCardEvents(): void {
  bumpCardGeneration();
  cardUnsubscribers.forEach(unsub => unsub());

  cardUnsubscribers = [];
  initializedContainers.clear();
  unflipAllCards();
  const hTimeout = getHoverTimeout();
  if (hTimeout) {
    clearTimeout(hTimeout);
  }
  const fOnboard = getFlipOnboardingTimeout();
  if (fOnboard) {
    clearTimeout(fOnboard);
    setFlipOnboardingTimeout(null);
  }
  const fBack = getFlipBackTimeout();
  if (fBack) {
    clearTimeout(fBack);
    setFlipBackTimeout(null);
  }
  setHoveredCard(null);
  isCardEventsInitialized = false;
}

export function initCardInteractions(gridContainer: HTMLElement): void {
  if (!gridContainer || initializedContainers.has(gridContainer)) return;
  initializedContainers.add(gridContainer);

  // --- Hover (Desktop) ---
  const handlePointerOver = (e: PointerEvent) => {
    if (e.pointerType !== 'mouse') return;
    const target = e.target as HTMLElement;
    const card = target.closest<MovieCardElement>(".movie-card");
    if (!card || card.classList.contains('collection-card') || card.classList.contains('person-card')) return;

    const hovered = getHoveredCard();
    if (hovered !== card) {
      if (hovered) {
        const hoverT = getHoverTimeout();
        if (hoverT) clearTimeout(hoverT);
        hovered.classList.remove("is-hovered");
        resetCardBackState(hovered);
      }
      setHoveredCard(card);
      startFlipTimer(card);
    } else if (!target.closest(INTERACTIVE_SELECTOR)) {
      startFlipTimer(card);
    } else {
      const hoverT = getHoverTimeout();
      if (hoverT) clearTimeout(hoverT);
    }
  };

  const handlePointerOut = (e: PointerEvent) => {
    const hovered = getHoveredCard();
    if (e.pointerType !== 'mouse' || !hovered) return;
    const relatedTarget = e.relatedTarget as HTMLElement | null;
    if (!relatedTarget || !hovered.contains(relatedTarget)) {
      const hoverT = getHoverTimeout();
      if (hoverT) clearTimeout(hoverT);
      hovered.classList.remove("is-hovered");
      resetCardBackState(hovered);
      setHoveredCard(null);
    }
  };

  gridContainer.addEventListener("pointerover", handlePointerOver);
  gridContainer.addEventListener("pointerout", handlePointerOut);
  cardUnsubscribers.push(() => {
    gridContainer.removeEventListener("pointerover", handlePointerOver);
    gridContainer.removeEventListener("pointerout", handlePointerOut);
  });

  // --- Actualizar tarjetas del grid cuando se descarguen datos de usuario ---
  cardUnsubscribers.push(
    appEvents.on("userDataUpdated", () => {
      const grid = document.getElementById("grid-container");
      if (grid) {
        grid.querySelectorAll<MovieCardElement>(".movie-card[data-movie-id]").forEach(card => {
          updateCardUI(card);
        });
      }
    }),

    appEvents.on("userMovieDataChanged", ({ movieId }) => {
      const grid = document.getElementById("grid-container");
      if (grid && movieId) {
        const card = grid.querySelector<MovieCardElement>(`.movie-card[data-movie-id="${movieId}"]`);
        if (card) updateCardUI(card);
      }
    })
  );

  // --- Doble Click (Desktop) ---
  const handleDblClick = (e: MouseEvent) => {
    if (areInteractionsLocked() || document.body.classList.contains(CSS_CLASSES.MODAL_OPEN)) {
      e.preventDefault();
      e.stopPropagation();
      return;
    }
    const target = e.target as HTMLElement;
    const card = target.closest<MovieCardElement>(".movie-card");
    if (card && !document.body.classList.contains(CSS_CLASSES.ROTATION_DISABLED)) {
      lockGlobalInteractions(500);
      loadAndOpenModal(card);
    }
  };

  gridContainer.addEventListener("dblclick", handleDblClick);
  cardUnsubscribers.push(() => {
    gridContainer.removeEventListener("dblclick", handleDblClick);
  });

  // --- Tap / Doble Tap (Táctil) ---
  let lastTapTime = 0;
  let tapTimeout: ReturnType<typeof setTimeout> | null = null;
  let startX = 0, startY = 0;
  const DOUBLE_TAP_DELAY = 250;
  const MOVE_THRESHOLD = 10;

  const handlePointerDown = (e: PointerEvent) => {
    if (e.pointerType === 'mouse' || !e.isPrimary) return;
    startX = e.clientX;
    startY = e.clientY;
  };

  const handlePointerUp = (e: PointerEvent) => {
    if (e.pointerType === 'mouse') return;

    const target = e.target as HTMLElement;
    const card = target.closest<MovieCardElement>('.movie-card');
    if (!card) return;

    const criticalElements = '[data-action="toggle-watchlist"], [data-action^="set-rating"], a[href], .expand-content-btn, .actors-expand-btn, .actor-list-item, .genre-list-item';

    if (card.classList.contains('collection-card') || target.closest(criticalElements)) return;

    // Si la trasera de la tarjeta está ampliada (sinopsis o reparto), un tap fuera de los enlaces
    // contrae la vista y devuelve la tarjeta a su trasera normal sin voltearla al frente
    const flipBack = card.querySelector<HTMLElement>(".flip-card-back");
    if (flipBack?.classList.contains("is-expanded")) {
      if (Math.abs(e.clientX - startX) <= MOVE_THRESHOLD && Math.abs(e.clientY - startY) <= MOVE_THRESHOLD) {
        if (e.cancelable) e.preventDefault();
        resetCardBackState(card);
      }
      return;
    }

    if (document.body.classList.contains(CSS_CLASSES.ROTATION_DISABLED)) {
      if (Math.abs(e.clientX - startX) <= MOVE_THRESHOLD && Math.abs(e.clientY - startY) <= MOVE_THRESHOLD) {
        if (e.cancelable) e.preventDefault();
        loadAndOpenModal(card);
      }
      return;
    }

    // Detectar si fue un tap o un scroll
    if (Math.abs(e.clientX - startX) > MOVE_THRESHOLD || Math.abs(e.clientY - startY) > MOVE_THRESHOLD) return;

    if (e.cancelable) e.preventDefault();

    const currentTime = performance.now();
    const tapLength = currentTime - lastTapTime;

    if (lastTapTime > 0 && tapLength < DOUBLE_TAP_DELAY) {
      // Doble Tap -> Modal
      if (tapTimeout) clearTimeout(tapTimeout);
      loadAndOpenModal(card);
    } else {
      // Primer Tap -> Si es película, rotar ficha; si es persona, esperar
      if (tapTimeout) clearTimeout(tapTimeout);
      if (!card.classList.contains('person-card')) {
        tapTimeout = setTimeout(() => handleSingleTap(card), DOUBLE_TAP_DELAY);
      }
    }
    lastTapTime = currentTime;
  };

  gridContainer.addEventListener('pointerdown', handlePointerDown, { passive: true });
  gridContainer.addEventListener('pointerup', handlePointerUp);

  if (!isCardEventsInitialized && typeof document !== "undefined") {
    document.addEventListener("visibilitychange", handleCardVisibilityChange);
    cardUnsubscribers.push(() => {
      document.removeEventListener("visibilitychange", handleCardVisibilityChange);
    });
  }

  cardUnsubscribers.push(() => {
    gridContainer.removeEventListener('pointerdown', handlePointerDown);
    gridContainer.removeEventListener('pointerup', handlePointerUp);
    if (tapTimeout) clearTimeout(tapTimeout);
  });
  isCardEventsInitialized = true;
}

// Despertar de la hibernación: fuerza la carga de imágenes visibles en el viewport al volver a la pestaña
function handleCardVisibilityChange(): void {
  if (document.visibilityState === "visible") {
    const lazyImages = document.querySelectorAll<HTMLImageElement>("img[data-src]");
    lazyImages.forEach(img => {
      const rect = img.getBoundingClientRect();
      const inViewport = (
        rect.top >= -200 &&
        rect.left >= -200 &&
        rect.bottom <= (window.innerHeight || document.documentElement.clientHeight) + 200 &&
        rect.right <= (window.innerWidth || document.documentElement.clientWidth) + 200
      );
      if (inViewport && img.dataset.src) {
        img.src = img.dataset.src;
        img.onload = () => img.classList.add(CSS_CLASSES.LOADED);
        img.onerror = () => img.classList.add(CSS_CLASSES.LOADED);
        lazyLoadObserver?.unobserve(img);
      }
    });
  }
}

function cleanupLazyImages(container: HTMLElement): void {
  if (!container || !lazyLoadObserver) return;
  const observer = lazyLoadObserver;
  container.querySelectorAll<HTMLImageElement>("img[data-src]").forEach(img => observer.unobserve(img));
}

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

export function runFlipOnboarding(container: HTMLElement | null): void {
  if (!container) return;
  if (document.body.classList.contains(CSS_CLASSES.ROTATION_DISABLED)) return;

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

    // Seleccionar la primera ficha de película real (omitiendo fichas de cabecera VIP: Director, Actor, Colección o Estudio)
    const targetMovieCard = container.querySelector<HTMLElement>(
      `.${CSS_CLASSES.MOVIE_CARD}:not(.person-card):not(.collection-card):not(.studio-card)`
    );

    if (!targetMovieCard || !targetMovieCard.isConnected) return;

    const inner = targetMovieCard.querySelector<HTMLElement>(".flip-card-inner");
    if (inner && !inner.classList.contains("is-flipped")) {
      inner.classList.add("is-flipped");

      setFlipBackTimeout(setTimeout(() => {
        if (onboardGen !== getCardGeneration()) return;
        if (inner.isConnected && inner.classList.contains("is-flipped") && getFlippedCard() !== targetMovieCard) {
          inner.classList.remove("is-flipped");
        }
      }, 1400));
    }
  }, ONBOARDING_FLIP_DELAY_MS));
}
