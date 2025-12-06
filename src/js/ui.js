// =================================================================
//                  MÓDULO DE UI (Centralizado)
// =================================================================
// FICHERO: src/js/ui.js
// RESPONSABILIDAD:
// - Caché de referencias DOM.
// - Gestión de componentes UI globales (Toasts, Modales, Paginación).
// - Utilidades de Accesibilidad (Focus Trap).
// - Re-exportación de componentes complejos (Card, QuickView).
// =================================================================

import { CSS_CLASSES, SELECTORS, CONFIG } from "./constants.js";
import { fetchMovies } from "./api.js"; // Necesario para prefetch
import { triggerPopAnimation, createElement } from "./utils.js";

// --- Referencias DOM Cacheadas ---
export const dom = {
  gridContainer: document.querySelector(SELECTORS.GRID_CONTAINER),
  paginationContainer: document.querySelector(SELECTORS.PAGINATION_CONTAINER),
  searchForm: document.querySelector(SELECTORS.SEARCH_FORM),
  searchInput: document.querySelector(SELECTORS.SEARCH_INPUT),
  sortSelect: document.querySelector(SELECTORS.SORT_SELECT),
  themeToggleButton: document.querySelector(SELECTORS.THEME_TOGGLE),
  backToTopButton: document.querySelector(SELECTORS.BACK_TO_TOP),
  sidebarOverlay: document.querySelector(SELECTORS.SIDEBAR_OVERLAY),
  sidebar: document.querySelector(".sidebar"),
  typeFilterToggle: document.querySelector(SELECTORS.TYPE_FILTER_TOGGLE),
  headerPrevBtn: document.querySelector(SELECTORS.HEADER_PREV_BTN),
  headerNextBtn: document.querySelector(SELECTORS.HEADER_NEXT_BTN),
  autocompleteResults: document.querySelector(SELECTORS.AUTOCOMPLETE_RESULTS),
  mainHeader: document.querySelector(".main-header"),
  clearFiltersBtn: document.querySelector(SELECTORS.CLEAR_FILTERS_BTN),
  totalResultsContainer: document.getElementById("total-results-container"),
  totalResultsCount: document.getElementById("total-results-count"),
  authModal: document.getElementById("auth-modal"),
  authOverlay: document.getElementById("auth-overlay"),
  loginButton: document.getElementById("login-button"),
};

// =================================================================
//          1. SISTEMA DE NOTIFICACIONES (TOAST)
// =================================================================
const TOAST_DURATION = 5000;

export function showToast(message, type = "error") {
  const container = document.querySelector(SELECTORS.TOAST_CONTAINER);
  if (!container) return;

  const toastElement = createElement("div", {
    className: `toast toast--${type}`,
    textContent: message,
    attributes: { role: "alert" }
  });

  container.appendChild(toastElement);
  setTimeout(() => toastElement.remove(), TOAST_DURATION);
}

// =================================================================
//          2. GESTIÓN DE PAGINACIÓN (UI)
// =================================================================
// (Antes en pagination.js)

/**
 * Renderiza los botones de paginación numerada.
 */
export function renderPagination(paginationContainer, totalMovies, currentPage) {
  if (!paginationContainer) return;

  paginationContainer.textContent = "";
  const totalPages = Math.ceil(totalMovies / CONFIG.ITEMS_PER_PAGE);
  if (totalPages <= 1) return;

  const createButton = (page, text = page, isActive = false, ariaLabel = `Ir a página ${page}`) => {
    return createElement("button", {
      className: `btn${isActive ? " active" : ""}`,
      dataset: { page },
      textContent: text,
      attributes: { "aria-label": ariaLabel, type: "button" },
    });
  };

  const createSeparator = () => createElement("span", { 
    textContent: "...", className: "pagination-separator", attributes: { "aria-hidden": "true" } 
  });

  // Botón Anterior
  if (currentPage > 1) {
    paginationContainer.appendChild(createButton(currentPage - 1, "<", false, "Página anterior"));
  }

  // Algoritmo de visualización de páginas (1, ..., actual-1, actual, actual+1, ..., final)
  const pages = new Set([1, totalPages, currentPage, currentPage - 1, currentPage + 1]);
  const sortedPages = Array.from(pages).filter((p) => p > 0 && p <= totalPages).sort((a, b) => a - b);

  let lastPage = 0;
  for (const page of sortedPages) {
    if (lastPage > 0 && page - lastPage > 1) {
      paginationContainer.appendChild(createSeparator());
    }

    if (page === currentPage) {
      paginationContainer.appendChild(createElement("span", {
        className: "pagination-current",
        textContent: page,
        attributes: { "aria-current": "page", "aria-label": `Página actual ${page}` },
      }));
    } else {
      paginationContainer.appendChild(createButton(page, page, false));
    }
    lastPage = page;
  }

  // Botón Siguiente
  if (currentPage < totalPages) {
    paginationContainer.appendChild(createButton(currentPage + 1, ">", false, "Página siguiente"));
  }
}

export function updateHeaderPaginationState(currentPage, totalMovies) {
  const { headerPrevBtn, headerNextBtn } = dom;
  if (!headerPrevBtn || !headerNextBtn) return;

  const totalPages = Math.ceil(totalMovies / CONFIG.ITEMS_PER_PAGE);
  headerPrevBtn.disabled = currentPage <= 1;
  headerNextBtn.disabled = currentPage >= totalPages || totalPages === 0;
}

export function prefetchNextPage(currentPage, totalMovies, activeFilters) {
  const totalPages = Math.ceil(totalMovies / CONFIG.ITEMS_PER_PAGE);
  if (currentPage >= totalPages) return;
  const nextPage = currentPage + 1;

  if ("requestIdleCallback" in window) {
    requestIdleCallback(async () => {
      try { await fetchMovies(activeFilters, nextPage, CONFIG.ITEMS_PER_PAGE); } 
      catch (e) { /* Ignorar errores de prefetch */ }
    });
  }
}

// =================================================================
//          3. ACCESIBILIDAD Y MODALES (Focus Trap)
// =================================================================
// (Antes en modal-manager.js)

let focusTrapCleanup = null;
let previouslyFocusedElement = null;
const FOCUSABLE_SELECTOR = 'a[href], button:not([disabled]), textarea:not([disabled]), input:not([type="hidden"]):not([disabled]), select:not([disabled]), [tabindex]:not([tabindex^="-"])';

function isVisible(element) { return element.offsetParent !== null; }

function handleTrapKeyDown(e) {
  if (e.key !== "Tab") return;

  const allPotentials = Array.from(e.currentTarget.querySelectorAll(FOCUSABLE_SELECTOR));
  const focusableElements = allPotentials.filter(isVisible);

  if (focusableElements.length === 0) {
    e.preventDefault(); return;
  }

  const first = focusableElements[0];
  const last = focusableElements[focusableElements.length - 1];

  if (e.shiftKey) {
    if (document.activeElement === first) { e.preventDefault(); last.focus(); }
  } else {
    if (document.activeElement === last) { e.preventDefault(); first.focus(); }
  }
}

function activateTrap(element) {
  previouslyFocusedElement = document.activeElement;
  element.addEventListener("keydown", handleTrapKeyDown);
  
  const firstFocusable = Array.from(element.querySelectorAll(FOCUSABLE_SELECTOR)).find(isVisible);
  setTimeout(() => { if (firstFocusable) firstFocusable.focus(); }, 0);

  focusTrapCleanup = () => {
    element.removeEventListener("keydown", handleTrapKeyDown);
    if (previouslyFocusedElement) setTimeout(() => previouslyFocusedElement.focus(), 0);
    focusTrapCleanup = null;
    previouslyFocusedElement = null;
  };
}

export function openAccessibleModal(modalElement, overlayElement) {
  if (!modalElement) return;
  modalElement.hidden = false;
  if (overlayElement) overlayElement.hidden = false;
  modalElement.setAttribute("aria-hidden", "false");
  activateTrap(modalElement);
}

export function closeAccessibleModal(modalElement, overlayElement) {
  if (!modalElement) return;
  modalElement.hidden = true;
  if (overlayElement) overlayElement.hidden = true;
  modalElement.setAttribute("aria-hidden", "true");
  if (typeof focusTrapCleanup === "function") focusTrapCleanup();
}

// --- Wrappers Específicos para Auth ---
export function closeAuthModal() { closeAccessibleModal(dom.authModal, dom.authOverlay); }
export function openAuthModal() { openAccessibleModal(dom.authModal, dom.authOverlay); }
export function setupAuthModal() {
  if (!dom.loginButton || !dom.authModal || !dom.authOverlay) return;
  dom.loginButton.addEventListener("click", openAuthModal);
  dom.authOverlay.addEventListener("click", closeAuthModal);
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !dom.authModal.hidden) closeAuthModal();
  });
}

// =================================================================
//          4. HELPERS DE INTERFAZ GENERAL
// =================================================================

export function updateTypeFilterUI(mediaType) {
  const button = dom.typeFilterToggle;
  if (!button) return;
  button.classList.remove(CSS_CLASSES.TYPE_FILTER_MOVIES, CSS_CLASSES.TYPE_FILTER_SERIES);
  switch (mediaType) {
    case "movies": button.textContent = "Cine"; button.classList.add(CSS_CLASSES.TYPE_FILTER_MOVIES); break;
    case "series": button.textContent = "TV"; button.classList.add(CSS_CLASSES.TYPE_FILTER_SERIES); break;
    default: button.textContent = "Todo"; break;
  }
}

export function updateTotalResultsUI(total, hasFilters) {
  const { totalResultsContainer, totalResultsCount } = dom;
  if (!totalResultsContainer || !totalResultsCount) return;
  if (hasFilters && total > 0) {
    totalResultsCount.textContent = total.toLocaleString("es-ES");
    totalResultsContainer.hidden = false;
  } else {
    totalResultsContainer.hidden = true;
  }
}

export function initThemeToggle() {
  if (dom.themeToggleButton) {
    dom.themeToggleButton.addEventListener("click", (e) => {
      triggerPopAnimation(e.currentTarget);
      document.dispatchEvent(new CustomEvent("uiActionTriggered"));
      const isDarkMode = document.documentElement.classList.toggle("dark-mode");
      localStorage.setItem("theme", isDarkMode ? "dark" : "light");
    });
  }
}

// --- Helper para Autocomplete (Usado en sidebar.js y main.js) ---
export function clearAllSidebarAutocomplete(exceptForm = null) {
  document.querySelectorAll(SELECTORS.SIDEBAR_AUTOCOMPLETE_RESULTS).forEach((container) => {
    if (!exceptForm || container.closest(SELECTORS.SIDEBAR_FILTER_FORM) !== exceptForm) {
      const input = container.parentElement.querySelector(SELECTORS.SIDEBAR_FILTER_INPUT);
      if (input) input.removeAttribute("aria-expanded");
      container.remove();
    }
  });
}