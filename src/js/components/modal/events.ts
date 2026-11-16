import { appEvents, getUserDataForMovie, updateUserDataForMovie } from "../../state.js";
import { updateCardUI, handleCardClick, adjustQuickViewNoteHeight } from "../card/index.js";
import { CSS_CLASSES } from "../../constants.js";
import { initRatingInteractions } from "../rating.js";
import { handleTouchStart, handleTouchMove, handleTouchEnd, isLandscapeCompactViewport } from "./gestures.js";
import { saveLocalEntryWithMovie } from "../../localStore.js";
import { scheduleSync } from "../../syncManager.js";
import { normalizeMovieId } from "../../contracts.js";
import { triggerHapticFeedback } from "../../utils.js";
import type { MovieCardElement } from "../../types.js";
import type { MovieContentElement } from "./renderer.js";

interface ModalEventsDom {
  modal: HTMLElement | null;
  content: HTMLElement | null;
  prevBtn: HTMLButtonElement | null;
  nextBtn: HTMLButtonElement | null;
}

interface ModalEventsOptions {
  getDom: () => ModalEventsDom;
  navigateToSibling: (direction: number) => void;
  closeModal: (options?: { suppressHistoryBack?: boolean }) => void;
  resetModalTransform: () => void;
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

  // 2. Delegación de eventos en contenido (Clicks, Scroll, Notas y Gestos auxiliares landscape)
  if (content) {
    let noteDebounceTimer: ReturnType<typeof setTimeout> | null = null;

    const saveModalNote = async (noteOverride?: string | null): Promise<void> => {
      const movieId = normalizeMovieId(content.dataset.movieId);
      if (!movieId || !document.body.classList.contains(CSS_CLASSES.USER_LOGGED_IN)) return;

      const textarea = content.querySelector<HTMLTextAreaElement>('[data-template="note-textarea"]');
      const noteWrapper = content.querySelector<HTMLElement>('[data-template="note-wrapper"]');
      const noteBtn = content.querySelector<HTMLElement>('[data-template="note-toggle-btn"]');
      const counter = content.querySelector<HTMLElement>('[data-template="note-counter"]');
      if (!textarea) return;

      const noteValue = noteOverride !== undefined
        ? noteOverride
        : (textarea.value.trim().slice(0, 280) || null);

      const currentUserData = getUserDataForMovie(movieId);
      const noteChanged = (currentUserData?.note || null) !== noteValue;

      if (noteChanged) {
        triggerHapticFeedback("light");
        updateUserDataForMovie(movieId, { note: noteValue });

        const movieData = (content as MovieContentElement).movieData || null;
        await saveLocalEntryWithMovie(movieId, { note: noteValue }, movieData);
        triggerHapticFeedback("success");

        scheduleSync(200);
      }

      if (noteWrapper) {
        noteWrapper.classList.remove("is-editing");
        noteWrapper.hidden = !noteValue;
      }
      if (noteBtn) {
        noteBtn.hidden = Boolean(noteValue);
      }
      if (counter) {
        counter.textContent = `${(noteValue || "").length}/280`;
      }
      if (textarea) {
        textarea.value = noteValue || "";
      }
      adjustQuickViewNoteHeight(content);
    };

    const handleContentClick = async (e: MouseEvent) => {
      const target = e.target as HTMLElement;

      // Si pulsa el icono de nota (cuando aún no hay nota escrita): abrir editor (Imagen 2)
      const noteToggleBtn = target.closest<HTMLElement>('[data-action="toggle-note"]');
      if (noteToggleBtn) {
        e.preventDefault();
        e.stopPropagation();
        if (!document.body.classList.contains(CSS_CLASSES.USER_LOGGED_IN)) return;
        const noteWrapper = content.querySelector<HTMLElement>('[data-template="note-wrapper"]');
        const textarea = content.querySelector<HTMLTextAreaElement>('[data-template="note-textarea"]');
        const counter = content.querySelector<HTMLElement>('[data-template="note-counter"]');
        if (noteWrapper && textarea) {
          noteWrapper.hidden = false;
          noteWrapper.classList.add("is-editing");
          noteToggleBtn.hidden = true;
          if (counter) counter.textContent = `${textarea.value.length}/280`;
          textarea.focus();
          textarea.setSelectionRange(textarea.value.length, textarea.value.length);
          adjustQuickViewNoteHeight(content);
        }
        return;
      }

      // Si pulsa en el botón Guardar del editor
      const saveBtn = target.closest<HTMLElement>('[data-action="save-note"]');
      if (saveBtn) {
        e.preventDefault();
        e.stopPropagation();
        if (noteDebounceTimer) clearTimeout(noteDebounceTimer);
        await saveModalNote();
        return;
      }

      // Si pulsa en el botón Borrar del editor
      const deleteBtn = target.closest<HTMLElement>('[data-action="delete-note"]');
      if (deleteBtn) {
        e.preventDefault();
        e.stopPropagation();
        if (noteDebounceTimer) clearTimeout(noteDebounceTimer);
        const textarea = content.querySelector<HTMLTextAreaElement>('[data-template="note-textarea"]');
        if (textarea) textarea.value = "";
        await saveModalNote(null);
        return;
      }

      // Si pulsa en el cuadro de texto mientras está en modo visualización (Imagen 3 -> Imagen 2)
      const textarea = target.closest<HTMLTextAreaElement>('[data-template="note-textarea"]');
      if (textarea) {
        const noteWrapper = content.querySelector<HTMLElement>('[data-template="note-wrapper"]');
        const noteBtn = content.querySelector<HTMLElement>('[data-template="note-toggle-btn"]');
        const counter = content.querySelector<HTMLElement>('[data-template="note-counter"]');
        if (noteWrapper && !noteWrapper.classList.contains("is-editing")) {
          noteWrapper.classList.add("is-editing");
          if (noteBtn) noteBtn.hidden = true;
          if (counter) counter.textContent = `${textarea.value.length}/280`;
          textarea.focus();
          adjustQuickViewNoteHeight(content);
        }
        return;
      }

      // Toggle flechas al tocar póster (Móvil/Tablet/Desktop), pero NUNCA en la barra de controles
      if (target.closest(".poster-container") && !target.closest(".card-rating-block")) {
        modal.classList.toggle("hide-arrows");
      }

      const card = target.closest<MovieCardElement>(`.${CSS_CLASSES.MOVIE_CARD}`);
      if (card && content.contains(card)) {
        handleCardClick.call(card, e);
      }
    };

    content.addEventListener("click", handleContentClick);
    unsubscribers.push(() => {
      content.removeEventListener("click", handleContentClick);
    });

    // Auto-expansión de altura y actualización del contador en tiempo real mientras el usuario escribe
    const handleContentInput = (e: Event) => {
      const target = e.target as HTMLElement;
      if (target?.matches?.('[data-template="note-textarea"]')) {
        const textarea = target as HTMLTextAreaElement;
        const counter = content.querySelector<HTMLElement>('[data-template="note-counter"]');
        if (counter) {
          counter.textContent = `${textarea.value.length}/280`;
        }

        // Auto-expansión dinámica de altura conforme se escribe
        adjustQuickViewNoteHeight(content);

        if (noteDebounceTimer) clearTimeout(noteDebounceTimer);
        noteDebounceTimer = setTimeout(() => {
          const movieId = normalizeMovieId(content.dataset.movieId);
          if (!movieId || !document.body.classList.contains(CSS_CLASSES.USER_LOGGED_IN)) return;
          const trimmed = textarea.value.trim().slice(0, 280);
          const noteValue = trimmed.length > 0 ? trimmed : null;
          updateUserDataForMovie(movieId, { note: noteValue });
          const movieData = (content as MovieContentElement).movieData || null;
          saveLocalEntryWithMovie(movieId, { note: noteValue }, movieData);
          scheduleSync(200);
        }, 1000);
      }
    };
    content.addEventListener("input", handleContentInput);
    unsubscribers.push(() => {
      if (noteDebounceTimer) clearTimeout(noteDebounceTimer);
      content.removeEventListener("input", handleContentInput);
    });

    // Ajustar altura de la nota ante cambios de orientación o tamaño de pantalla
    const handleWindowResize = () => {
      adjustQuickViewNoteHeight(content);
    };
    window.addEventListener("resize", handleWindowResize, { passive: true });
    unsubscribers.push(() => {
      window.removeEventListener("resize", handleWindowResize);
    });

    // Atajos de teclado en el editor (Ctrl+Enter guarda; Escape cancela)
    const handleContentKeydown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target?.matches?.('[data-template="note-textarea"]')) {
        const textarea = target as HTMLTextAreaElement;
        if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
          e.preventDefault();
          if (noteDebounceTimer) clearTimeout(noteDebounceTimer);
          saveModalNote();
        } else if (e.key === "Escape") {
          e.preventDefault();
          const movieId = normalizeMovieId(content.dataset.movieId);
          const current = movieId ? getUserDataForMovie(movieId)?.note || "" : "";
          textarea.value = current;
          const noteWrapper = content.querySelector<HTMLElement>('[data-template="note-wrapper"]');
          const noteBtn = content.querySelector<HTMLElement>('[data-template="note-toggle-btn"]');
          if (noteWrapper) {
            noteWrapper.classList.remove("is-editing");
            noteWrapper.hidden = !current;
          }
          if (noteBtn) {
            noteBtn.hidden = Boolean(current);
          }
          textarea.blur();
        }
      }
    };
    content.addEventListener("keydown", handleContentKeydown);
    unsubscribers.push(() => {
      content.removeEventListener("keydown", handleContentKeydown);
    });

    // Guardado al desenfocar el cuadro de texto (si el clic no fue en botones del editor)
    const handleContentFocusOut = (e: FocusEvent) => {
      const target = e.target as HTMLElement;
      if (target?.matches?.('[data-template="note-textarea"]')) {
        const relatedTarget = e.relatedTarget as HTMLElement | null;
        const noteWrapper = content.querySelector<HTMLElement>('[data-template="note-wrapper"]');
        if (noteWrapper && relatedTarget && noteWrapper.contains(relatedTarget)) {
          return;
        }
        if (noteDebounceTimer) clearTimeout(noteDebounceTimer);
        saveModalNote();
      }
    };
    content.addEventListener("focusout", handleContentFocusOut);
    unsubscribers.push(() => {
      content.removeEventListener("focusout", handleContentFocusOut);
    });

    const cleanupRating = initRatingInteractions(content);
    unsubscribers.push(cleanupRating);

    // En pantallas apaisadas compactas, detecta scroll para compactar cartel suavemente
    const handleLandscapePosterScroll = (e: Event) => {
      const target = e.target as HTMLElement | null;
      if (!target) return;

      if (target.classList?.contains("quick-view-media")) {
        if (isLandscapeCompactViewport()) {
          const scrollBottom = target.scrollHeight - target.clientHeight - target.scrollTop;
          if (target.scrollTop > 15 && scrollBottom <= 35) {
            target.classList.add("poster-compact");
          }
        }
      }
    };
    content.addEventListener("scroll", handleLandscapePosterScroll, { passive: true, capture: true });
    unsubscribers.push(() => {
      content.removeEventListener("scroll", handleLandscapePosterScroll, { capture: true });
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
  const SCROLL_KEY_DELTAS: Record<string, number> = {
    ArrowDown: 70,
    ArrowUp: -70,
    PageDown: 250,
    PageUp: -250
  };

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
    else if (e.key in SCROLL_KEY_DELTAS) {
      e.preventDefault();
      e.stopPropagation();
      const delta = SCROLL_KEY_DELTAS[e.key];
      if (delta < 0) {
        const compactFront = modal.querySelector<HTMLElement>(".quick-view-media.poster-compact");
        if (compactFront) {
          compactFront.classList.remove("poster-compact");
        }
      }
      const scrollTarget = window.innerWidth > 768
        ? (modal.querySelector<HTMLElement>(".quick-view-details") || content)
        : content;
      scrollTarget?.scrollBy({ top: delta, behavior: "smooth" });
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
