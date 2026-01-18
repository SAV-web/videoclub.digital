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
  sidebar: () => document.getElementById("sidebar"),
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
  mobileSidebarToggle: () => document.getElementById("mobile-sidebar-toggle"),
};

// Exportamos un Proxy para mantener compatibilidad con el código existente (dom.algo)
export const dom = new Proxy({}, {
  get: (_, prop) => {
    // 1. Auto-Invalidación: Reutiliza caché solo si el nodo sigue conectado; si no, reconsulta.
    if (domCache[prop] && domCache[prop].isConnected) {
      return domCache[prop];
    }

    // 2. Búsqueda (Lazy)
    const query = domQueries[prop];
    if (query) {
      const el = query();
      if (el) domCache[prop] = el; // Solo cacheamos si existe
      else delete domCache[prop];  // Limpiamos referencia si dejó de existir
      return el;
    }
  }
});

// Estado para debounce de notificaciones
let lastToastMessage = "";
let lastToastTime = 0;

// =================================================================
//          1. SISTEMA DE NOTIFICACIONES (TOAST)
// =================================================================

export function showToast(message, type = "error") {
  const { toastContainer } = dom;
  if (!toastContainer) return;

  // 1. Anti-Spam (Debounce): Evitar repetición del mismo mensaje en corto tiempo
  const now = Date.now();
  const isSameMessage = message === lastToastMessage;
  const isRecent = (now - lastToastTime) < 2000; // 2 segundos

  if (isSameMessage && isRecent) return;

  lastToastMessage = message;
  lastToastTime = now;

  // 2. Anti-Apilamiento: Limpiar contenedor para mostrar solo uno
  toastContainer.replaceChildren();

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

  // Fallback de seguridad: Si la animación falla o el CSS cambia, eliminar tras 8s
  setTimeout(() => {
    if (toastElement.isConnected) toastElement.remove();
  }, 8000);

  // Clic para cerrar inmediatamente
  toastElement.addEventListener("click", () => toastElement.remove());

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
  const addButton = (page, content, label, isArrow = false) => {
    const btn = createElement("button", {
      className: `btn btn--pagination${isArrow ? " pagination-arrow" : ""}`,
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
    addButton(currentPage - 1, "‹", "Página anterior", true);
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
    addButton(currentPage + 1, "›", "Página siguiente", true);
  }

  paginationContainer.appendChild(fragment);
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

  // Usar requestIdleCallback para no bloquear el hilo principal
  const idleCallback = window.requestIdleCallback || ((cb) => setTimeout(cb, 500));
  
  idleCallback(() => {
    // 1. Prefetch página siguiente (Prioridad)
    fetchMovies(activeFilters, currentPage + 1, CONFIG.ITEMS_PER_PAGE, null, false)
      .catch(() => {});

    // 2. Prefetch página subsiguiente (Condicional)
    // Simplificación: Solo en Desktop (pointer: fine) para evitar consumo excesivo en móvil
    const isDesktop = window.matchMedia('(pointer: fine)').matches;

    if (isDesktop && currentPage + 1 < totalPages) {
      setTimeout(() => {
        fetchMovies(activeFilters, currentPage + 2, CONFIG.ITEMS_PER_PAGE, null, false)
          .catch(() => {});
      }, 1500); // Delay aumentado para asegurar prioridad a la página inmediata
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

export function openAccessibleModal(modal, overlay, focusContent = true) {
  if (!modal) return;
  
  // Accesibilidad: Garantizar atributos críticos si faltan en HTML
  if (!modal.hasAttribute("role")) modal.setAttribute("role", "dialog");
  if (!modal.hasAttribute("aria-modal")) modal.setAttribute("aria-modal", "true");

  lastFocusedElement = document.activeElement;
  modal.hidden = false;
  if (overlay) overlay.hidden = false;
  
  // Prevenir scroll brusco al enfocar
  modal.focus({ preventScroll: true });

  if (focusContent) {
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

let authModalInitialized = false;

export function setupAuthModal() {
  if (authModalInitialized) return;
  const { loginButton, authModal, authOverlay } = dom;
  if (!loginButton || !authModal) return;

  loginButton.addEventListener("click", openAuthModal);
  authOverlay?.addEventListener("click", closeAuthModal);
  
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !authModal.hidden) closeAuthModal();
  });

  authModalInitialized = true;
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
  
  const desktopText = createElement("span", { className: "desktop-text", textContent: current.label });
  const mobileIcon = createElement("span", { className: "mobile-icon", innerHTML: current.icon });

  btn.replaceChildren(desktopText, mobileIcon);
}

export function updateTotalResultsUI(total, hasFilters) {
  const { totalResultsContainer, totalResultsCount } = dom;
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

  const updateState = (isDark) => {
    btn.setAttribute("aria-pressed", isDark);
    const label = isDark ? "Modo claro" : "Modo oscuro";
    btn.setAttribute("aria-label", label);
    btn.title = label;
  };

  // Sincronización inicial
  const isDark = document.documentElement.classList.contains(CSS_CLASSES.DARK_MODE);
  updateState(isDark);

  btn.addEventListener("click", (e) => {
    triggerPopAnimation(e.currentTarget);
    document.dispatchEvent(new CustomEvent("uiActionTriggered"));
    
    const isNowDark = document.documentElement.classList.toggle(CSS_CLASSES.DARK_MODE);
    localStorage.setItem("theme", isNowDark ? "dark" : "light");
    updateState(isNowDark);
  });
}

/**
 * Limpia las sugerencias de autocompletado del sidebar.
 * @param {HTMLElement|null} exceptForm - Si se proporciona, no limpia las sugerencias de este formulario.
 */
export function clearAllSidebarAutocomplete(exceptForm = null) {
  document.querySelectorAll(SELECTORS.SIDEBAR_AUTOCOMPLETE_RESULTS).forEach((container) => {
    const parentForm = container.closest(SELECTORS.SIDEBAR_FILTER_FORM);
    if (exceptForm && parentForm === exceptForm) return;

    const input = parentForm?.querySelector(SELECTORS.SIDEBAR_FILTER_INPUT);
    if (input) input.removeAttribute("aria-expanded");
    container.remove();
  });
}