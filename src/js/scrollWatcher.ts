/// <reference types="vite/client" />

// =================================================================
//          VIGILANTE DE SCROLL (scrollWatcher.ts)
// =================================================================
// FICHERO: src/js/scrollWatcher.ts
// RESPONSABILIDAD: Monitorización optimizada de scroll mediante rAF,
// control de visibilidad del header móvil (hide/show on scroll),
// prefetch predictivo de páginas y guardado desacoplado de posición.
// =================================================================

import { CSS_CLASSES } from "./constants.js";
import { saveCurrentScrollPosition } from "./router.js";
import { dom, prefetchNextPage } from "./ui.js";
import { getCurrentPage, getTotalMovies, getActiveFilters } from "./state.js";

let isTicking = false;
let lastScrollY = 0;
let scrollTimer: ReturnType<typeof setTimeout> | null = null;
let scrollSaveTimer: ReturnType<typeof setTimeout> | null = null;
let scrollRafId: number | null = null;
let scrollLifecycleGen = 0;
let isScrollWatcherActive = false;

/**
 * Manejador principal de scroll pasivo y desacoplado del hilo principal.
 */
function handleGlobalScroll(): void {
  if (scrollSaveTimer) {
    clearTimeout(scrollSaveTimer);
  }
  scrollSaveTimer = setTimeout(() => {
    saveCurrentScrollPosition();
  }, 100);

  if (scrollTimer) {
    clearTimeout(scrollTimer);
    scrollTimer = null;
  }
  const currentGen = scrollLifecycleGen;
  scrollTimer = setTimeout(() => {
    if (currentGen !== scrollLifecycleGen) return;
    // Prefetch Predictivo: Si el usuario se detiene (mira) cerca del final (>70%)
    const scrollPos = window.scrollY + window.innerHeight;
    const docHeight = document.documentElement.scrollHeight;

    if (docHeight > 0 && scrollPos / docHeight > 0.7) {
      prefetchNextPage(getCurrentPage(), getTotalMovies(), getActiveFilters());
    }
  }, 250);

  if (!isTicking) {
    isTicking = true;
    scrollRafId = window.requestAnimationFrame(() => {
      scrollRafId = null;
      isTicking = false;
      if (currentGen !== scrollLifecycleGen) return;
      const currentScrollY = Math.max(0, window.scrollY);
      const docHeight = document.documentElement.scrollHeight;
      const vHeight = window.visualViewport ? window.visualViewport.height : window.innerHeight;

      const isMobileLayout = window.innerWidth <= 768 || window.innerHeight <= 500;
      const isSearchActive = document.activeElement === dom.searchInput;
      const isKeyboardOpen = vHeight < (window.innerHeight * 0.9);
      const isAtBottom = (window.innerHeight + currentScrollY) >= (docHeight - 50);
      const isSearchFocused = dom.mainHeader?.classList.contains("is-search-focused");

      dom.mainHeader?.classList.toggle(CSS_CLASSES.IS_SCROLLED, currentScrollY > 20);

      if (isMobileLayout && dom.mainHeader) {
        if (isSearchActive || isSearchFocused || isKeyboardOpen) {
          dom.mainHeader.classList.remove("is-hidden-mobile");
          lastScrollY = currentScrollY; // Reset ancla
        } else {
          const scrollDifference = Math.abs(currentScrollY - lastScrollY);

          if (isAtBottom) {
            dom.mainHeader.classList.remove("is-hidden-mobile");
            lastScrollY = currentScrollY;
          } else if (scrollDifference > 12) {
            const isScrollingDown = currentScrollY > lastScrollY;
            dom.mainHeader.classList.toggle("is-hidden-mobile", isScrollingDown && currentScrollY > 60);
            lastScrollY = currentScrollY;
          }
        }
      } else {
        lastScrollY = currentScrollY; // En desktop, mantener sincronizado
      }
    });
  }
}

/**
 * Inicializa los escuchadores de scroll y el estado ancla.
 * Devuelve una función de desmontaje para limpiar el observador.
 */
export function initScrollWatcher(): () => void {
  if (typeof window === "undefined") return () => {};

  lastScrollY = Math.max(0, window.scrollY);

  if (!isScrollWatcherActive) {
    window.addEventListener("scroll", handleGlobalScroll, { passive: true });
    isScrollWatcherActive = true;
  }

  return () => disposeScrollWatcher();
}

/**
 * Desmonta escuchadores de scroll y cancela animaciones/temporizadores pendientes.
 */
export function disposeScrollWatcher(): void {
  scrollLifecycleGen++;

  if (typeof window !== "undefined" && isScrollWatcherActive) {
    window.removeEventListener("scroll", handleGlobalScroll);
    isScrollWatcherActive = false;
  }

  if (scrollSaveTimer) {
    clearTimeout(scrollSaveTimer);
    scrollSaveTimer = null;
  }

  if (scrollTimer) {
    clearTimeout(scrollTimer);
    scrollTimer = null;
  }

  if (scrollRafId !== null && typeof cancelAnimationFrame === "function") {
    cancelAnimationFrame(scrollRafId);
    scrollRafId = null;
  }

  isTicking = false;
}
