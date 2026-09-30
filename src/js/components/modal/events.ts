import { appEvents } from "../../state.js";
import { updateCardUI } from "../card/index.js";
import { handleTouchStart, handleTouchMove, handleTouchEnd } from "./gestures.js";
import type { MovieCardElement } from "../../types.js";

export interface ModalEventsDom {
  modal: HTMLElement | null;
  content: HTMLElement | null;
  prevBtn: HTMLButtonElement | null;
  nextBtn: HTMLButtonElement | null;
}

export interface ModalEventsOptions {
  getDom: () => ModalEventsDom;
  navigateToSibling: (direction: number) => void;
  closeModal: (options?: { suppressHistoryBack?: boolean }) => void;
  resetModalTransform: () => void;
}

/**
 * Maneja clics en metadatos (Director/Actor/Género/Año/País) para filtrar el catálogo.
 */
export function handleMetadataClick(
  event: MouseEvent,
  closeModal: (options?: { suppressHistoryBack?: boolean }) => void
): void {
  const target = event.target as HTMLElement;
  const directorLink = target.closest<HTMLElement>(".front-director-info a[data-director-name]");
  const actorLink = target.closest<HTMLElement>('[data-template="actors"] a[data-actor-name]');
  const genreLink = target.closest<HTMLElement>('[data-template="genre"] a[data-genre-name]');
  const yearLink = target.closest<HTMLElement>("a[data-year-value]");
  const countryLink = target.closest<HTMLElement>("[data-country-name]");

  if (directorLink || actorLink || genreLink || yearLink || countryLink) {
    // Permitir comportamiento predeterminado (abrir en nueva pestaña) si se usan teclas modificadoras
    if (event.ctrlKey || event.metaKey || event.shiftKey || event.button === 1) return;

    event.preventDefault();
    closeModal({ suppressHistoryBack: true });

    if (genreLink && genreLink.dataset.genreName) {
      appEvents.emit("filter:apply", { type: "genre", value: genreLink.dataset.genreName });
      return;
    }

    if (countryLink && countryLink.dataset.countryName) {
      appEvents.emit("filter:apply", { type: "country", value: countryLink.dataset.countryName });
      return;
    }

    let filterType: "director" | "actor" | "year";
    let filterValue: string | undefined;

    if (directorLink) {
      filterType = "director";
      filterValue = directorLink.dataset.directorName;
    } else if (actorLink) {
      filterType = "actor";
      filterValue = actorLink.dataset.actorName;
    } else {
      filterType = "year";
      filterValue = yearLink?.dataset.yearValue;
    }

    // Evento global de integración
    appEvents.emit("filtersReset", {
      keepSort: true,
      newFilter: { type: filterType, value: filterValue }
    });
  }
}

export interface ModalEventListeners {
  unbind: () => void;
}

/**
 * Vincula todos los listeners de la vista rápida (quick-view) y retorna una función de desvinculación.
 */
export function bindModalEvents(options: ModalEventsOptions): ModalEventListeners {
  const { getDom, navigateToSibling, closeModal, resetModalTransform } = options;
  const { modal, content, prevBtn, nextBtn } = getDom();
  if (!modal) {
    return { unbind: () => {} };
  }

  const unsubscribers: Array<() => void> = [];

  // 1. Suscripción a eventos de aplicación
  unsubscribers.push(
    appEvents.on("userMovieDataChanged", (data) => {
      const movieId = data?.movieId;
      if (!movieId) return;
      const dom = getDom();
      if (dom.content && dom.content.dataset.movieId === String(movieId)) {
        const modalCard = dom.content.querySelector<MovieCardElement>(".movie-card");
        if (modalCard) updateCardUI(modalCard);
      }
    }),

    appEvents.on("userDataUpdated", () => {
      const dom = getDom();
      if (dom.content && dom.content.dataset.movieId) {
        const modalCard = dom.content.querySelector<MovieCardElement>(".movie-card");
        if (modalCard) updateCardUI(modalCard);
      }
    }),

    appEvents.on("filtersReset", () => {
      closeModal({ suppressHistoryBack: true });
    }),

    appEvents.on("filter:apply", () => {
      closeModal({ suppressHistoryBack: true });
    })
  );

  // 2. Delegación de eventos en contenido (Clicks, Scroll y Gestos auxiliares landscape)
  if (content) {
    const handleContentClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;

      handleMetadataClick(e, closeModal);

      // Toggle flechas al tocar póster (Móvil/Tablet/Desktop), pero NUNCA en la barra de controles
      if (target.closest(".poster-container") && !target.closest(".card-rating-block")) {
        modal.classList.toggle("hide-arrows");
      }
    };

    content.addEventListener("click", handleContentClick);
    unsubscribers.push(() => {
      content.removeEventListener("click", handleContentClick);
    });

    // Control de máscara de continuidad: detecta scroll para retirar el degradado superior en el tope
    const handleScrollMask = (e: Event) => {
      const target = e.target as HTMLElement | null;
      if (!target) return;
      if (target.classList?.contains("quick-view-details") || target.classList?.contains("quick-view-media") || target === content) {
        target.classList.toggle("is-scrolled", target.scrollTop > 4);
      }

      if (target.classList?.contains("quick-view-media")) {
        const isLandscape = typeof window.matchMedia === "function"
          ? window.matchMedia("(orientation: landscape) and (max-height: 600px)").matches
          : (window.innerWidth > window.innerHeight && window.innerHeight <= 600);

        if (isLandscape) {
          const scrollBottom = target.scrollHeight - target.clientHeight - target.scrollTop;
          // Al llegar al final del scroll tras haber iniciado desplazamiento, compactar cartel suavemente
          if (target.scrollTop > 15 && scrollBottom <= 35) {
            target.classList.add("poster-compact");
          }
        }
      }
    };
    content.addEventListener("scroll", handleScrollMask, { passive: true, capture: true });
    unsubscribers.push(() => {
      content.removeEventListener("scroll", handleScrollMask, { capture: true });
    });

    // Control táctil y de rueda para expandir cartel al hacer scroll hacia arriba en columna izquierda apaisada
    let touchStartY = 0;
    const handleTouchStartAux = (e: TouchEvent) => {
      touchStartY = e.touches[0]?.clientY ?? 0;
    };
    const handleTouchMoveAux = (e: TouchEvent) => {
      const currentY = e.touches[0]?.clientY ?? 0;
      const deltaY = currentY - touchStartY;
      const target = e.target as HTMLElement | null;
      if (deltaY > 12 && target?.closest(".quick-view-media")) {
        const compactFront = modal.querySelector<HTMLElement>(".quick-view-media.poster-compact");
        if (compactFront) {
          compactFront.classList.remove("poster-compact");
        }
      }
    };
    content.addEventListener("touchstart", handleTouchStartAux, { passive: true });
    content.addEventListener("touchmove", handleTouchMoveAux, { passive: true });
    unsubscribers.push(() => {
      content.removeEventListener("touchstart", handleTouchStartAux);
      content.removeEventListener("touchmove", handleTouchMoveAux);
    });

    const handleContentWheel = (e: WheelEvent) => {
      const target = e.target as HTMLElement | null;
      if (e.deltaY < -5 && target?.closest(".quick-view-media")) {
        const compactFront = modal.querySelector<HTMLElement>(".quick-view-media.poster-compact");
        if (compactFront) {
          compactFront.classList.remove("poster-compact");
        }
      }
    };
    content.addEventListener("wheel", handleContentWheel, { passive: true });
    unsubscribers.push(() => {
      content.removeEventListener("wheel", handleContentWheel);
    });
  }

  // 3. Atajos de teclado
  const handleKeydown = (e: KeyboardEvent) => {
    if (!modal.classList.contains("is-visible")) return;
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

    if (e.key === "Escape") {
      e.stopPropagation(); // Detener para que no cierre el sidebar u otros elementos
      closeModal();
    }
    else if (e.key === "ArrowLeft") {
      e.preventDefault();
      navigateToSibling(-1);
    }
    else if (e.key === "ArrowRight") {
      e.preventDefault();
      navigateToSibling(1);
    }
    else if (e.key === "ArrowDown") {
      e.preventDefault();
      e.stopPropagation();
      const scrollTarget = window.innerWidth > 768
        ? (modal.querySelector<HTMLElement>(".quick-view-details") || content)
        : content;
      scrollTarget?.scrollBy({ top: 70, behavior: "smooth" });
    }
    else if (e.key === "ArrowUp") {
      e.preventDefault();
      e.stopPropagation();
      const compactFront = modal.querySelector<HTMLElement>(".quick-view-media.poster-compact");
      if (compactFront) {
        compactFront.classList.remove("poster-compact");
      }
      const scrollTarget = window.innerWidth > 768
        ? (modal.querySelector<HTMLElement>(".quick-view-details") || content)
        : content;
      scrollTarget?.scrollBy({ top: -70, behavior: "smooth" });
    }
    else if (e.key === "PageDown") {
      e.preventDefault();
      e.stopPropagation();
      const scrollTarget = window.innerWidth > 768
        ? (modal.querySelector<HTMLElement>(".quick-view-details") || content)
        : content;
      scrollTarget?.scrollBy({ top: 250, behavior: "smooth" });
    }
    else if (e.key === "PageUp") {
      e.preventDefault();
      e.stopPropagation();
      const compactFront = modal.querySelector<HTMLElement>(".quick-view-media.poster-compact");
      if (compactFront) {
        compactFront.classList.remove("poster-compact");
      }
      const scrollTarget = window.innerWidth > 768
        ? (modal.querySelector<HTMLElement>(".quick-view-details") || content)
        : content;
      scrollTarget?.scrollBy({ top: -250, behavior: "smooth" });
    }
  };

  window.addEventListener("keydown", handleKeydown, { capture: true });
  unsubscribers.push(() => {
    window.removeEventListener("keydown", handleKeydown, { capture: true });
  });

  // 4. Botones de navegación
  if (prevBtn) {
    const handlePrevClick = (e: MouseEvent) => { e.stopPropagation(); navigateToSibling(-1); };
    prevBtn.addEventListener("click", handlePrevClick);
    unsubscribers.push(() => prevBtn.removeEventListener("click", handlePrevClick));
  }

  if (nextBtn) {
    const handleNextClick = (e: MouseEvent) => { e.stopPropagation(); navigateToSibling(1); };
    nextBtn.addEventListener("click", handleNextClick);
    unsubscribers.push(() => nextBtn.removeEventListener("click", handleNextClick));
  }

  // 5. Gestos táctiles en modal
  if (typeof window !== "undefined") {
    const tStart = (e: TouchEvent) => handleTouchStart(e, modal);
    const tMove = (e: TouchEvent) => handleTouchMove(e, { modal, content });
    const tEnd = (e: TouchEvent) => handleTouchEnd(e, {
      modal,
      navigateToSibling,
      closeModal: () => closeModal(),
      resetModalTransform
    });

    modal.addEventListener("touchstart", tStart, { passive: true });
    modal.addEventListener("touchmove", tMove, { passive: false });
    modal.addEventListener("touchend", tEnd, { passive: true });
    modal.addEventListener("touchcancel", tEnd, { passive: true });

    unsubscribers.push(() => {
      modal.removeEventListener("touchstart", tStart);
      modal.removeEventListener("touchmove", tMove);
      modal.removeEventListener("touchend", tEnd);
      modal.removeEventListener("touchcancel", tEnd);
    });
  }

  return {
    unbind: () => {
      unsubscribers.forEach(unsub => unsub());
      unsubscribers.length = 0;
    }
  };
}
