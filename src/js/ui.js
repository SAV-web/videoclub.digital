// =================================================================
//                  MÓDULO DE UI (Optimizado)
// =================================================================
// FICHERO: src/js/ui.js
// RESPONSABILIDAD: Gestión de componentes UI globales.
// =================================================================

import { CONFIG, CSS_CLASSES, SELECTORS, ICONS } from "./constants.js";
import { fetchMovies } from "./api.js";
import { triggerPopAnimation, createElement } from "./utils.js";

// --- Referencias DOM (Lazy Getter con Caché) ---
const domCache = {};
const domQueries = {
  gridContainer: () => document.querySelector(SELECTORS.GRID_CONTAINER),
  paginationContainer: () => document.querySelector(SELECTORS.PAGINATION_CONTAINER),
  searchForm: () => document.querySelector(SELECTORS.SEARCH_FORM),
  searchInput: () => document.querySelector(SELECTORS.SEARCH_INPUT),
  sortSelect: () => document.querySelector(SELECTORS.SORT_SELECT),
  themeToggleButton: () => document.querySelector(SELECTORS.THEME_TOGGLE),
  sidebarOverlay: () => document.querySelector(SELECTORS.SIDEBAR_OVERLAY),
  sidebar: () => document.querySelector(".sidebar"),
  typeFilterToggle: () => document.querySelector(SELECTORS.TYPE_FILTER_TOGGLE),
  headerPrevBtn: () => document.querySelector(SELECTORS.HEADER_PREV_BTN),
  headerNextBtn: () => document.querySelector(SELECTORS.HEADER_NEXT_BTN),
  autocompleteResults: () => document.querySelector(SELECTORS.AUTOCOMPLETE_RESULTS),
  mainHeader: () => document.querySelector(".main-header"),
  clearFiltersBtn: () => document.querySelector(SELECTORS.CLEAR_FILTERS_BTN),
  totalResultsContainer: () => document.getElementById("total-results-container"),
  totalResultsCount: () => document.getElementById("total-results-count"),
  authModal: () => document.getElementById("auth-modal"),
  authOverlay: () => document.getElementById("auth-overlay"),
  loginButton: () => document.getElementById("login-button"),
  toastContainer: () => document.querySelector(SELECTORS.TOAST_CONTAINER),
};

// Exportamos un Proxy para mantener compatibilidad con el código existente (dom.algo)
export const dom = new Proxy({}, {
  get: (_, prop) => {
    if (domCache[prop]) return domCache[prop];
    const query = domQueries[prop];
    if (query) {
      const el = query();
      if (el) domCache[prop] = el;
      return el;
    }
  }
});

// =================================================================
//          1. SISTEMA DE NOTIFICACIONES (TOAST)
// =================================================================

export function showToast(message, type = "error") {
  const { toastContainer } = getDom();
  if (!toastContainer) return;

  const toastElement = createElement("div", {
    className: `toast toast--${type}`,
    textContent: message,
    attributes: { role: "alert" }
  });

  // Limpieza automática basada en animación CSS (más preciso que setTimeout)
  toastElement.addEventListener("animationend", (e) => {
    // Solo eliminar si es la animación de salida (la última definida en CSS)
    if (e.animationName.includes("out")) {
      toastElement.remove();
    }
  });

  toastContainer.appendChild(toastElement);
}

// =================================================================
//          2. GESTIÓN DE PAGINACIÓN (UI)
// =================================================================

export function renderPagination(paginationContainer, totalMovies, currentPage) {
  if (!paginationContainer) return;

  paginationContainer.textContent = "";
  const totalPages = Math.ceil(totalMovies / CONFIG.ITEMS_PER_PAGE);
  if (totalPages <= 1) return;

  const fragment = document.createDocumentFragment();

  // Helper local para botones
  const addButton = (page, content, label, isActive = false, isArrow = false) => {
    const btn = createElement("button", {
      className: `btn btn--pagination${isActive ? " active" : ""} ${isArrow ? "pagination-arrow" : ""}`,
      dataset: { page },
      textContent: content,
      attributes: { "aria-label": label, type: "button" }
    });
    fragment.appendChild(btn);
  };

  // Helper local para separador
  const addSeparator = () => {
    fragment.appendChild(createElement("span", { 
      textContent: "...", className: "pagination-separator", attributes: { "aria-hidden": "true" } 
    }));
  };

  // Flecha Anterior
  if (currentPage > 1) {
    addButton(currentPage - 1, "<", "Página anterior", false, true);
  }

  // Lógica de elipsis (1 ... 4 5 6 ... 10)
  const range = new Set([1, totalPages, currentPage, currentPage - 1, currentPage + 1]);
  const pages = Array.from(range).filter(p => p > 0 && p <= totalPages).sort((a, b) => a - b);

  let lastPage = 0;
  for (const page of pages) {
    if (lastPage > 0 && page - lastPage > 1) addSeparator();

    if (page === currentPage) {
      fragment.appendChild(createElement("span", {
        className: "pagination-current",
        textContent: page,
        attributes: { "aria-current": "page", "aria-label": `Página actual ${page}` },
      }));
    } else {
      addButton(page, page, `Ir a página ${page}`);
    }
    lastPage = page;
  }

  // Flecha Siguiente
  if (currentPage < totalPages) {
    addButton(currentPage + 1, ">", "Página siguiente", false, true);
  }

  paginationContainer.appendChild(fragment);
}

export function updateHeaderPaginationState(currentPage, totalMovies) {
  const { headerPrevBtn, headerNextBtn } = getDom();
  if (!headerPrevBtn || !headerNextBtn) return;

  const totalPages = Math.ceil(totalMovies / CONFIG.ITEMS_PER_PAGE);
  headerPrevBtn.disabled = currentPage <= 1;
  headerNextBtn.disabled = currentPage >= totalPages || totalPages === 0;
}

export function prefetchNextPage(currentPage, totalMovies, activeFilters) {
  const totalPages = Math.ceil(totalMovies / CONFIG.ITEMS_PER_PAGE);
  if (currentPage >= totalPages) return;

  // Usar requestIdleCallback para no bloquear el hilo principal
  const idleCallback = window.requestIdleCallback || ((cb) => setTimeout(cb, 500));
  
  idleCallback(() => {
    // 1. Prefetch página siguiente (Prioridad)
    fetchMovies(activeFilters, currentPage + 1, CONFIG.ITEMS_PER_PAGE, null, false)
      .catch(() => {});

    // 2. Prefetch página subsiguiente (Estrategia agresiva post-optimización DB)
    if (currentPage + 1 < totalPages) {
      setTimeout(() => {
        fetchMovies(activeFilters, currentPage + 2, CONFIG.ITEMS_PER_PAGE, null, false)
          .catch(() => {});
      }, 1000); // Delay para no competir con recursos críticos
    }
  });
}

// =================================================================
//          3. ACCESIBILIDAD Y MODALES (Focus Trap)
// =================================================================

const FOCUSABLE_SELECTOR = 'a[href], button:not([disabled]), textarea:not([disabled]), input:not([type="hidden"]):not([disabled]), select:not([disabled]), [tabindex]:not([tabindex^="-"])';
let focusTrapListener = null;
let lastFocusedElement = null;

function isVisible(el) {
  return !!(el.offsetWidth || el.offsetHeight || el.getClientRects().length);
}

function handleTrap(e) {
  if (e.key !== "Tab") return;

  const focusables = Array.from(e.currentTarget.querySelectorAll(FOCUSABLE_SELECTOR)).filter(isVisible);
  if (focusables.length === 0) { e.preventDefault(); return; }

  const first = focusables[0];
  const last = focusables[focusables.length - 1];

  if (e.shiftKey && document.activeElement === first) {
    e.preventDefault(); last.focus();
  } else if (!e.shiftKey && document.activeElement === last) {
    e.preventDefault(); first.focus();
  }
}

export function openAccessibleModal(modal, overlay, skipFocus = false) {
  if (!modal) return;
  
  lastFocusedElement = document.activeElement;
  modal.hidden = false;
  if (overlay) overlay.hidden = false;
  
  // Prevenir scroll brusco al enfocar
  modal.focus({ preventScroll: true });

  if (!skipFocus) {
    const firstInput = modal.querySelector(FOCUSABLE_SELECTOR);
    if (firstInput) firstInput.focus();
  }

  // Activar trampa
  if (focusTrapListener) modal.removeEventListener("keydown", focusTrapListener);
  focusTrapListener = handleTrap;
  modal.addEventListener("keydown", focusTrapListener);
}

export function closeAccessibleModal(modal, overlay) {
  if (!modal) return;
  
  modal.hidden = true;
  if (overlay) overlay.hidden = true;
  
  if (focusTrapListener) {
    modal.removeEventListener("keydown", focusTrapListener);
    focusTrapListener = null;
  }
  
  if (lastFocusedElement && isVisible(lastFocusedElement)) {
    lastFocusedElement.focus();
  }
}

export const closeAuthModal = () => closeAccessibleModal(dom.authModal, dom.authOverlay);
export const openAuthModal = () => openAccessibleModal(dom.authModal, dom.authOverlay);

export function setupAuthModal() {
  const { loginButton, authModal, authOverlay } = getDom();
  if (!loginButton || !authModal) return;

  loginButton.addEventListener("click", openAuthModal);
  authOverlay?.addEventListener("click", closeAuthModal);
  
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !authModal.hidden) closeAuthModal();
  });
}

// =================================================================
//          4. HELPERS DE INTERFAZ GENERAL
// =================================================================

export function updateTypeFilterUI(mediaType) {
  const btn = dom.typeFilterToggle;
  if (!btn) return;

  const config = {
    movies: { label: "Cine", icon: ICONS.CLAPPERBOARD, class: CSS_CLASSES.TYPE_FILTER_MOVIES },
    series: { label: "TV", icon: ICONS.TV, class: CSS_CLASSES.TYPE_FILTER_SERIES },
    all: { label: "Todo", icon: ICONS.POPCORN, class: "" }
  };

  const current = config[mediaType] || config.all;
  
  btn.className = `type-filter-toggle ${current.class}`;
  btn.setAttribute("aria-label", `Filtrar por tipo: ${current.label}`);
  btn.innerHTML = `
    <span class="desktop-text">${current.label}</span>
    <span class="mobile-icon">${current.icon}</span>
  `;
}

export function updateTotalResultsUI(total, hasFilters) {
  const { totalResultsContainer, totalResultsCount } = getDom();
  if (!totalResultsContainer) return;

  if (hasFilters && total > 0) {
    totalResultsCount.textContent = total.toLocaleString("es-ES");
    totalResultsContainer.hidden = false;
  } else {
    totalResultsContainer.hidden = true;
  }
}

export function initThemeToggle() {
  const btn = dom.themeToggleButton;
  if (!btn) return;

  // Sincronización inicial
  const isDark = document.documentElement.classList.contains("dark-mode");
  btn.setAttribute("aria-pressed", isDark);

  btn.addEventListener("click", (e) => {
    triggerPopAnimation(e.currentTarget);
    document.dispatchEvent(new CustomEvent("uiActionTriggered"));
    
    const isNowDark = document.documentElement.classList.toggle("dark-mode");
    localStorage.setItem("theme", isNowDark ? "dark" : "light");
    btn.setAttribute("aria-pressed", isNowDark);
  });
}

export function clearAllSidebarAutocomplete(exceptForm = null) {
  document.querySelectorAll(SELECTORS.SIDEBAR_AUTOCOMPLETE_RESULTS).forEach((container) => {
    const parentForm = container.closest(SELECTORS.SIDEBAR_FILTER_FORM);
    if (exceptForm && parentForm === exceptForm) return;

    const input = parentForm?.querySelector(SELECTORS.SIDEBAR_FILTER_INPUT);
    if (input) input.removeAttribute("aria-expanded");
    container.remove();
  });
}