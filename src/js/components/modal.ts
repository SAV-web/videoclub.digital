/// <reference types="vite/client" />

// =================================================================
//          COMPONENTE: Quick View (Modal & Bottom Sheet)
// =================================================================
//  FICHERO: src/js/components/modal.ts
//  RESPONSABILIDAD: Orquestación del modal, ciclo de vida y API pública.
// =================================================================

import { openAccessibleModal, closeAccessibleModal, setIsClosingModalViaHistory, lockGlobalInteractions, areInteractionsLocked } from "../ui.js";
import { unflipAllCards } from "./card/index.js";
import { executeViewTransition, mapMoviePayload } from "../utils.js";
import { CSS_CLASSES } from "../constants.js";
import type { Movie, MappedMovie, MovieCardElement } from "../types.js";

import { populateModalContent, type ExtendedMovie, type MovieContentElement } from "./modal/renderer.js";
import { navigateToSibling, updateNavButtons, prefetchAdjacentModalImages } from "./modal/navigation.js";
import { bindModalEvents, type ModalEventListeners } from "./modal/events.js";

export type { ExtendedMovie };

interface ModalDom {
  overlay: HTMLElement | null;
  modal: HTMLElement | null;
  content: MovieContentElement | null;
  template: DocumentFragment | undefined;
  prevBtn: HTMLButtonElement | null;
  nextBtn: HTMLButtonElement | null;
}

// --- Referencias DOM (Caché con Lazy Getter para máxima eficiencia) ---
let cachedModalDom: ModalDom | null = null;
const getDom = (): ModalDom => {
  if (cachedModalDom?.modal && cachedModalDom?.content) return cachedModalDom;
  const templateEl = document.getElementById("quick-view-template") as HTMLTemplateElement | null;
  return (cachedModalDom = {
    overlay: document.getElementById("quick-view-overlay"),
    modal: document.getElementById("quick-view-modal"),
    content: document.getElementById("quick-view-content") as MovieContentElement | null,
    template: templateEl?.content,
    prevBtn: document.getElementById("modal-prev-btn") as HTMLButtonElement | null,
    nextBtn: document.getElementById("modal-next-btn") as HTMLButtonElement | null,
  });
};

/**
 * Resetea las transformaciones CSS aplicadas por gestos táctiles.
 */
const resetModalTransform = (): void => {
  const { modal } = getDom();
  if (modal) modal.style.transform = "";
};

// Estado para la transición Hero (Card -> Modal)
let activeHeroCard: HTMLElement | null = null;
const MODAL_TRANSITION_MS = 400;

// Contador para evitar race conditions al modificar el view-transition del header
let modalTransitionCount = 0;
let modalLifecycleGen = 0;
let modalTimeouts: Array<ReturnType<typeof setTimeout>> = [];
let modalAnimationFrames: Array<number> = [];

const scheduleModalTimeout = (fn: () => void, delay: number): ReturnType<typeof setTimeout> => {
  const gen = modalLifecycleGen;
  const tid = setTimeout(() => {
    modalTimeouts = modalTimeouts.filter(t => t !== tid);
    if (gen !== modalLifecycleGen) return;
    fn();
  }, delay);
  modalTimeouts.push(tid);
  return tid;
};

const scheduleModalRAF = (fn: () => void): number => {
  const gen = modalLifecycleGen;
  const rafId = requestAnimationFrame(() => {
    modalAnimationFrames = modalAnimationFrames.filter(id => id !== rafId);
    if (gen !== modalLifecycleGen) return;
    fn();
  });
  modalAnimationFrames.push(rafId);
  return rafId;
};

/**
 * Cierra el modal si se hace clic fuera del contenido.
 */
function handleOutsideClick(event: MouseEvent): void {
  if (areInteractionsLocked()) return;
  const { modal } = getDom();
  if (!modal) return;

  const target = event.target as HTMLElement;
  // No cerramos si se hace click en una card del grid para permitir navegación directa.
  const isClickInsideCard = target.closest(".movie-card");

  if (modal.classList.contains("is-visible") && !modal.contains(target) && !isClickInsideCard) {
    closeModal();
  }
}

/**
 * Enlaza navegación de tarjetas adyacentes delegando en el submódulo de navegación.
 */
function handleNavigateToSibling(direction: number): void {
  const { content, modal } = getDom();
  navigateToSibling(direction, {
    content,
    modal,
    openModal: (card, cards) => openModal(card, cards)
  });
}

/**
 * Puebla el contenido del modal delegando en el submódulo de renderizado.
 */
function populateModal(cardElement: MovieCardElement, contextCards: HTMLElement[] | null = null): void {
  const { template, content, modal } = getDom();
  if (!template || !content || !modal) return;

  populateModalContent({
    cardElement,
    contextCards,
    template,
    content,
    modal,
    scheduleModalRAF,
    getLifecycleGen: () => modalLifecycleGen,
    updateNavButtons: (id, cards) => {
      const { prevBtn, nextBtn } = getDom();
      updateNavButtons(id, cards, { prevBtn, nextBtn });
    }
  });
}

// =================================================================
//          API PÚBLICA Y GESTIÓN DE CICLO DE VIDA
// =================================================================

let isClosingModalInProgress = false;

/**
 * Comprueba si la modal está actualmente visible y no está en proceso de cierre.
 */
export function isModalOpen(): boolean {
  const { modal } = getDom();
  return Boolean(modal && modal.classList.contains("is-visible") && !isClosingModalInProgress);
}

/**
 * Cierra el modal con animación y limpieza.
 */
export function closeModal(options?: { fromPopstate?: boolean; suppressHistoryBack?: boolean; skipHistory?: boolean } | Event): void {
  if (isClosingModalInProgress) return;

  const isPopstate = Boolean(options && "fromPopstate" in options && options.fromPopstate);
  const suppressHistoryBack = Boolean(
    options && (
      ("suppressHistoryBack" in options && options.suppressHistoryBack) ||
      ("skipHistory" in options && options.skipHistory)
    )
  );
  const { modal, overlay } = getDom();
  if (!modal || !overlay || !modal.classList.contains("is-visible")) return;

  isClosingModalInProgress = true;

  // Si se cierra manualmente (botón, click fuera, ESC o swipe) y se había creado entrada de historial, hacer back
  if (!isPopstate && !suppressHistoryBack && window.history.state?.modalOpen) {
    setIsClosingModalViaHistory();
    window.history.back();
  }

  // Excluir el header de la View Transition para que el overlay se oscurezca sobre él suavemente
  const header = document.querySelector<HTMLElement>(".main-header");
  modalTransitionCount++;
  if (header) header.style.viewTransitionName = "none";

  const performClose = (): void => {
    isClosingModalInProgress = false;
    modal.classList.remove("is-visible");
    modal.classList.remove("hide-arrows");
    overlay.classList.remove("is-visible");
    document.body.classList.remove(CSS_CLASSES.MODAL_OPEN);
    modal.querySelectorAll<HTMLElement>(".quick-view-media.poster-compact").forEach(cf => {
      cf.classList.remove("poster-compact");
    });
    modal.style.viewTransitionName = "";

    // Limpieza
    scheduleModalTimeout(resetModalTransform, MODAL_TRANSITION_MS);
    closeAccessibleModal(modal, overlay);
  };

  // View Transition (Hero Reverso: Modal -> Card). El helper maneja el fallback y el a11y.
  const hasHeroCard = Boolean(activeHeroCard && typeof document !== "undefined" && typeof document.body?.contains === "function" && document.body.contains(activeHeroCard));
  if (hasHeroCard && activeHeroCard) {
    const cardToTarget = activeHeroCard;
    // Solo el modal tiene hero-expansion en el snapshot inicial
    modal.style.viewTransitionName = "hero-expansion";
    cardToTarget.style.viewTransitionName = "";

    const transition = executeViewTransition(() => {
      modal.style.viewTransitionName = "";
      cardToTarget.style.viewTransitionName = "hero-expansion";
      performClose();
    });

    transition.finished.catch(() => {}).finally(() => {
      isClosingModalInProgress = false;
      cardToTarget.style.viewTransitionName = "";
      modal.style.viewTransitionName = "";
      activeHeroCard = null;

      modalTransitionCount--;
      if (modalTransitionCount === 0 && header && !document.body.classList.contains(CSS_CLASSES.MODAL_OPEN)) {
        header.style.viewTransitionName = "";
      }
    });
  } else {
    if (activeHeroCard) activeHeroCard.style.viewTransitionName = "";
    activeHeroCard = null;
    modal.style.viewTransitionName = "";

    executeViewTransition(performClose).finished.catch(() => {}).finally(() => {
      isClosingModalInProgress = false;
      modal.style.viewTransitionName = "";
      modalTransitionCount--;
      if (modalTransitionCount === 0 && header && !document.body.classList.contains(CSS_CLASSES.MODAL_OPEN)) {
        header.style.viewTransitionName = "";
      }
    });
  }

  document.removeEventListener("click", handleOutsideClick);
}

/**
 * Abre el modal directamente a partir de un objeto de película (MappedMovie o Movie).
 * Útil para la apertura automática desde URLs ?movie={id}.
 */
export function openModalForMovie(movie: MappedMovie | Movie): void {
  if ((movie as unknown as { isPerson?: boolean })?.isPerson) {
    const person = movie as unknown as { biography?: string | null };
    if (!person.biography || !person.biography.trim()) return;
  }
  const dummyCard = document.createElement("div") as MovieCardElement;
  dummyCard.className = "movie-card";
  dummyCard.movieData = "posterUrl" in movie ? movie : mapMoviePayload(movie);
  openModal(dummyCard);
}

/**
 * Abre el modal para una tarjeta específica.
 */
export function openModal(cardElement: MovieCardElement, contextCards: HTMLElement[] | null = null): void {
  if (!cardElement) return;
  lockGlobalInteractions(500);

  if (!isQuickViewInitialized) {
    initQuickView();
  }

  const isPerson = cardElement.classList.contains('person-card') || Boolean((cardElement.movieData as { isPerson?: boolean } | undefined)?.isPerson);
  if (isPerson) {
    const personData = cardElement.movieData as { biography?: string | null } | undefined;
    if (!personData?.biography || !personData.biography.trim()) return;
  }

  const { modal, overlay, content } = getDom();
  if (!modal || !overlay) return;

  // Integración con el botón "Atrás" del navegador: crear entrada en el historial
  if (!window.history.state?.modalOpen) {
    window.history.pushState({ modalOpen: true }, "", window.location.href);
  }

  modal.classList.remove("modal-is-loading");

  const isAlreadyOpen = modal.classList.contains("is-visible");

  // Si la modal ya está abierta (navegación prev/next/swipe), actualizar síncronamente sin ViewTransition
  if (isAlreadyOpen) {
    unflipAllCards();
    populateModal(cardElement, contextCards);
    if (content) content.scrollTop = 0;
    prefetchAdjacentModalImages(cardElement, contextCards);
    return;
  }

  // Apertura inicial (Transición Hero desde la tarjeta del Grid)
  lockGlobalInteractions(500);

  // Excluir el header de la View Transition para que el overlay se oscurezca sobre él suavemente
  const header = document.querySelector<HTMLElement>(".main-header");
  modalTransitionCount++;
  if (header) header.style.viewTransitionName = "none";

  const hasHeroCard = Boolean(cardElement && typeof document !== "undefined" && typeof document.body?.contains === "function" && document.body.contains(cardElement));
  activeHeroCard = hasHeroCard ? cardElement : null;

  unflipAllCards();
  populateModal(cardElement, contextCards);

  const performOpen = (): void => {
    document.body.classList.add(CSS_CLASSES.MODAL_OPEN);
    scheduleModalRAF(() => {
      modal.classList.add("is-visible");
      overlay.classList.add("is-visible");
      openAccessibleModal(modal, overlay, false);
      if (content) content.scrollTop = 0;
      scheduleModalTimeout(() => document.addEventListener("click", handleOutsideClick), 350);
      prefetchAdjacentModalImages(cardElement, contextCards);
    });
  };

  if (hasHeroCard) {
    modal.style.viewTransitionName = "";
    cardElement.style.viewTransitionName = "hero-expansion";

    const transition = executeViewTransition(() => {
      performOpen();
      modal.style.viewTransitionName = "hero-expansion";
      cardElement.style.viewTransitionName = "";
    });

    transition.finished.catch(() => {}).finally(() => {
      modal.style.viewTransitionName = "";
      cardElement.style.viewTransitionName = "";
      modalTransitionCount--;
      if (modalTransitionCount === 0 && header && !document.body.classList.contains(CSS_CLASSES.MODAL_OPEN)) {
        header.style.viewTransitionName = "";
      }
    });
  } else {
    modal.style.viewTransitionName = "";
    executeViewTransition(performOpen).finished.catch(() => {}).finally(() => {
      modal.style.viewTransitionName = "";
      modalTransitionCount--;
      if (modalTransitionCount === 0 && header && !document.body.classList.contains(CSS_CLASSES.MODAL_OPEN)) {
        header.style.viewTransitionName = "";
      }
    });
  }
}

let isQuickViewInitialized = false;
let modalEventListeners: ModalEventListeners | null = null;

export function disposeModalEvents(): void {
  modalLifecycleGen++;
  isClosingModalInProgress = false;

  try {
    closeModal({ suppressHistoryBack: true, skipHistory: true, fromPopstate: true });
  } catch (e) { }

  const { modal } = getDom();
  if (modal) modal.style.viewTransitionName = "";
  if (activeHeroCard) activeHeroCard.style.viewTransitionName = "";
  activeHeroCard = null;

  modalTimeouts.forEach(t => clearTimeout(t));
  modalTimeouts = [];
  modalAnimationFrames.forEach(raf => cancelAnimationFrame(raf));
  modalAnimationFrames = [];

  document.removeEventListener("click", handleOutsideClick);

  if (modalEventListeners) {
    modalEventListeners.unbind();
    modalEventListeners = null;
  }

  cachedModalDom = null;
  isQuickViewInitialized = false;
  if (typeof window !== "undefined") {
    delete (window as unknown as Record<string, unknown>)._quickViewInitialized;
  }
}

export function initQuickView(): void {
  if (isQuickViewInitialized) return;
  const { modal } = getDom();
  if (!modal) return;

  isQuickViewInitialized = true;

  modalEventListeners = bindModalEvents({
    getDom,
    navigateToSibling: handleNavigateToSibling,
    closeModal: (opts) => closeModal(opts),
    resetModalTransform
  });
}
