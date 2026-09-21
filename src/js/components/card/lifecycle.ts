import { CSS_CLASSES } from "../../constants.js";
import { appEvents } from "../../state.js";
import { areInteractionsLocked, lockGlobalInteractions } from "../../ui.js";
import type { MovieCardElement } from "../../types.js";

import {
  lazyLoadObserver,
  bumpCardGeneration,
  getHoveredCard,
  setHoveredCard,
  getHoverTimeout,
  getFlipOnboardingTimeout,
  setFlipOnboardingTimeout,
  getFlipBackTimeout,
  setFlipBackTimeout
} from "./context.js";

import {
  unflipAllCards,
  updateCardUI,
  startFlipTimer,
  resetCardBackState,
  loadAndOpenModal,
  handleSingleTap,
  INTERACTIVE_SELECTOR
} from "./cardElement.js";

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
export function handleCardVisibilityChange(): void {
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

export function cleanupLazyImages(container: HTMLElement): void {
  if (!container || !lazyLoadObserver) return;
  const observer = lazyLoadObserver;
  container.querySelectorAll<HTMLImageElement>("img[data-src]").forEach(img => observer.unobserve(img));
}
