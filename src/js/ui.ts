// =================================================================
//                  MÓDULO DE UI (Optimizado y Tipado)
// =================================================================
// FICHERO: src/js/ui.ts
// RESPONSABILIDAD: Gestión de componentes UI globales en TypeScript.
// =================================================================

import { CONFIG, CSS_CLASSES, SELECTORS, ICONS, DEFAULTS } from "./constants.js";
import { fetchMovies } from "./api.js";
import { triggerPopAnimation, createElement } from "./utils.js";
import { getActiveFilters, getState, hasActiveMeaningfulFilters, appEvents } from "./state.js";
import { ActiveFilters, MappedMovie } from "./types.js";

// --- Referencias DOM (Lazy Getter con Caché) ---
const domCache: Record<string, HTMLElement> = {};

export interface DomElements {
  gridContainer: HTMLElement | null;
  paginationContainer: HTMLElement | null;
  searchForm: HTMLFormElement | null;
  searchInput: HTMLInputElement | null;
  sortSelect: HTMLSelectElement | null;
  themeToggleButton: HTMLButtonElement | null;
  sidebarOverlay: HTMLElement | null;
  sidebar: HTMLElement | null;
  typeFilterToggle: HTMLButtonElement | null;
  headerPrevBtn: HTMLButtonElement | null;
  headerNextBtn: HTMLButtonElement | null;
  autocompleteResults: HTMLElement | null;
  mainHeader: HTMLElement | null;
  clearFiltersBtn: HTMLButtonElement | null;
  authModal: HTMLElement | null;
  authOverlay: HTMLElement | null;
  loginButton: HTMLButtonElement | null;
  toastContainer: HTMLElement | null;
  mobileSidebarToggle: HTMLButtonElement | null;
  mobileStatusBar: HTMLElement | null;
}

/**
 * Mapa de selectores para el Proxy del DOM.
 * Almacena strings en lugar de funciones para ahorrar memoria (sin closures).
 */
const domSelectors: Record<keyof DomElements, string> = {
  gridContainer: SELECTORS.GRID_CONTAINER,
  paginationContainer: SELECTORS.PAGINATION_CONTAINER,
  searchForm: SELECTORS.SEARCH_FORM,
  searchInput: SELECTORS.SEARCH_INPUT,
  sortSelect: SELECTORS.SORT_SELECT,
  themeToggleButton: SELECTORS.THEME_TOGGLE,
  sidebarOverlay: SELECTORS.SIDEBAR_OVERLAY,
  sidebar: "#sidebar",
  typeFilterToggle: SELECTORS.TYPE_FILTER_TOGGLE,
  headerPrevBtn: SELECTORS.HEADER_PREV_BTN,
  headerNextBtn: SELECTORS.HEADER_NEXT_BTN,
  autocompleteResults: SELECTORS.AUTOCOMPLETE_RESULTS,
  mainHeader: ".main-header",
  clearFiltersBtn: SELECTORS.CLEAR_FILTERS_BTN,
  authModal: "#auth-modal",
  authOverlay: "#auth-overlay",
  loginButton: "#login-button",
  toastContainer: SELECTORS.TOAST_CONTAINER,
  mobileSidebarToggle: "#mobile-sidebar-toggle",
  mobileStatusBar: "#mobile-status-bar",
};

// Exportamos un Proxy para mantener compatibilidad con el código existente (dom.algo)
export const dom = new Proxy({} as DomElements, {
  get: (target, prop) => {
    // Seguridad: Ignorar símbolos internos de JS o propiedades que no existan en nuestro mapa
    if (typeof prop !== "string" || !domSelectors[prop as keyof DomElements]) {
      return Reflect.get(target, prop);
    }

    const key = prop as keyof DomElements;

    // 1. Auto-Invalidación: Reutiliza caché solo si el nodo sigue conectado; si no, reconsulta.
    if (domCache[key] && domCache[key].isConnected) {
      return domCache[key] as DomElements[keyof DomElements];
    }

    // 2. Búsqueda (Lazy) y "Fast-Path" para IDs
    const selector = domSelectors[key];
    const isSimpleId = selector.startsWith("#") && !selector.includes(" ") && !selector.includes(".");
    
    const el = isSimpleId 
      ? document.getElementById(selector.slice(1)) 
      : document.querySelector(selector);

    if (el) {
      domCache[key] = el as HTMLElement; 
    } else {
      delete domCache[key];
    }
    
    return el as DomElements[keyof DomElements];
  }
});

// Estado para debounce de notificaciones
let lastToastMessage = "";
let lastToastTime = 0;
let toastFallbackTimer: ReturnType<typeof setTimeout> | null = null;

// Helper para obtener el tamaño de página actual según el modo
function getCurrentPageSize(): number {
  const isWallMode = document.body.classList.contains(CSS_CLASSES.ROTATION_DISABLED);
  return isWallMode ? CONFIG.WALL_MODE_ITEMS_PER_PAGE : CONFIG.ITEMS_PER_PAGE;
}

// =================================================================
//          1. SISTEMA DE NOTIFICACIONES (TOAST)
// =================================================================

export function showToast(message: string, type: "error" | "info" | "success" = "error"): void {
  const { toastContainer } = dom;
  if (!toastContainer) return;

  // Evitar repetición del mismo mensaje en corto tiempo
  const now = Date.now();
  const isSameMessage = message === lastToastMessage;
  const isRecent = (now - lastToastTime) < 2000; // 2 segundos

  if (isSameMessage && isRecent) return;

  lastToastMessage = message;
  lastToastTime = now;

  // Limpiar el temporizador fantasma del toast anterior si existía
  if (toastFallbackTimer) clearTimeout(toastFallbackTimer);

  // Limpiar contenedor para mostrar solo uno a la vez
  toastContainer.replaceChildren();

  // Accesibilidad dinámica: Alertas para errores, Status para información
  const isError = type === "error";

  const toastElement = createElement("div", {
    className: `toast toast--${type}`,
    textContent: message,
    attributes: { 
      role: isError ? "alert" : "status",
      "aria-live": isError ? "assertive" : "polite"
    }
  });

  // Limpieza automática basada en animación CSS (más preciso que setTimeout)
  toastElement.addEventListener("animationend", (e: AnimationEvent) => {
    // Solo eliminar si es la animación de salida (la última definida en CSS)
    if (e.animationName.includes("out")) {
      toastElement.remove();
    }
  });

  // Fallback: Eliminar tras 8s si falla la animación
  toastFallbackTimer = setTimeout(() => {
    if (toastElement.isConnected) toastElement.remove();
  }, 8000);

  // Clic para cerrar inmediatamente
  toastElement.addEventListener("click", () => {
    toastElement.remove();
    if (toastFallbackTimer) clearTimeout(toastFallbackTimer);
  });

  toastContainer.appendChild(toastElement);
}

// =================================================================
//          2. GESTIÓN DE PAGINACIÓN (UI)
// =================================================================

export function renderPagination(
  paginationContainer: HTMLElement | null,
  totalMovies: number,
  currentPage: number
): void {
  if (!paginationContainer) return;

  paginationContainer.textContent = "";
  const totalPages = Math.ceil(totalMovies / getCurrentPageSize());
  if (totalPages <= 1) return;

  const fragment = document.createDocumentFragment();

  // Helper local para botones
  const addButton = (page: number, content: string | number, label: string, isArrow = false): void => {
    const btn = createElement("button", {
      className: `btn btn--pagination${isArrow ? " pagination-arrow" : ""}`,
      dataset: { page: String(page) },
      textContent: String(content),
      attributes: { "aria-label": label, type: "button" }
    });
    fragment.appendChild(btn);
  };

  // Helper local para separador
  const addSeparator = (): void => {
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
        textContent: String(page),
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

export function updateHeaderPaginationState(currentPage: number, totalMovies: number): void {
  const { headerPrevBtn, headerNextBtn } = dom;
  if (!headerPrevBtn || !headerNextBtn) return;

  const totalPages = Math.ceil(totalMovies / getCurrentPageSize());
  headerPrevBtn.disabled = currentPage <= 1;
  headerNextBtn.disabled = currentPage >= totalPages || totalPages === 0;
}

export function prefetchNextPage(
  currentPage: number,
  totalMovies: number,
  activeFilters: ActiveFilters
): void {
  const pageSize = getCurrentPageSize();
  const totalPages = Math.ceil(totalMovies / pageSize);
  if (currentPage >= totalPages) return;

  // Usar requestIdleCallback para no bloquear el hilo principal
  const idleCallback = (window as Window & { requestIdleCallback?: typeof requestIdleCallback }).requestIdleCallback || ((cb: () => void) => setTimeout(cb, 500));
  
  idleCallback(() => {
    // 1. Prefetch página siguiente (Prioridad)
    fetchMovies(activeFilters, currentPage + 1, pageSize, null, false)
      .catch(() => {});

    // 2. Prefetch página subsiguiente (Condicional)
    // Simplificación: Solo en Desktop (pointer: fine) para evitar consumo excesivo en móvil
    const isDesktop = window.matchMedia('(pointer: fine)').matches;

    if (isDesktop && currentPage + 1 < totalPages) {
      setTimeout(() => {
        fetchMovies(activeFilters, currentPage + 2, pageSize, null, false)
          .catch(() => {});
      }, 1500); // Delay aumentado para asegurar prioridad a la página inmediata
    }
  });
}

// =================================================================
//          3. ACCESIBILIDAD Y MODALES (Focus Trap)
// =================================================================

const FOCUSABLE_SELECTOR = 'a[href], button:not([disabled]), textarea:not([disabled]), input:not([type="hidden"]):not([disabled]), select:not([disabled]), [tabindex]:not([tabindex^="-"])';
let focusTrapListener: ((e: KeyboardEvent) => void) | null = null;
let lastFocusedElement: HTMLElement | null = null;

function isVisible(el: HTMLElement): boolean {
  // OPTIMIZACIÓN: checkVisibility es una API moderna ultrarrápida. 
  // offsetWidth es el fallback, pero su uso fuerza un Reflow en el DOM.
  if (el.checkVisibility) return el.checkVisibility();
  return !!(el.offsetWidth || el.offsetHeight || el.getClientRects().length);
}

function handleTrap(e: KeyboardEvent): void {
  if (e.key !== "Tab") return;

  const currentTarget = e.currentTarget as HTMLElement;
  const focusables = Array.from(currentTarget.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(isVisible);
  if (focusables.length === 0) { e.preventDefault(); return; }

  const first = focusables[0];
  const last = focusables[focusables.length - 1];

  if (e.shiftKey && document.activeElement === first) {
    e.preventDefault(); last.focus();
  } else if (!e.shiftKey && document.activeElement === last) {
    e.preventDefault(); first.focus();
  }
}

export function openAccessibleModal(
  modal: HTMLElement | null,
  overlay: HTMLElement | null,
  focusContent = true
): void {
  if (!modal) return;
  
  // Accesibilidad: Garantizar atributos críticos si faltan en HTML
  if (!modal.hasAttribute("role")) modal.setAttribute("role", "dialog");
  if (!modal.hasAttribute("aria-modal")) modal.setAttribute("aria-modal", "true");

  lastFocusedElement = document.activeElement as HTMLElement | null;
  modal.hidden = false;
  if (overlay) overlay.hidden = false;
  
  // Prevenir scroll brusco al enfocar
  modal.focus({ preventScroll: true });

  if (focusContent) {
    const firstInput = modal.querySelector<HTMLElement>(FOCUSABLE_SELECTOR);
    if (firstInput) firstInput.focus();
  }

  // Activar trampa
  if (focusTrapListener) modal.removeEventListener("keydown", focusTrapListener as EventListener);
  focusTrapListener = handleTrap;
  modal.addEventListener("keydown", focusTrapListener as EventListener);
}

export function closeAccessibleModal(modal: HTMLElement | null, overlay: HTMLElement | null): void {
  if (!modal) return;
  
  modal.hidden = true;
  if (overlay) overlay.hidden = true;
  
  if (focusTrapListener) {
    modal.removeEventListener("keydown", focusTrapListener as EventListener);
    focusTrapListener = null;
  }
  
  if (lastFocusedElement && isVisible(lastFocusedElement)) {
    lastFocusedElement.focus();
  }
}

export const closeAuthModal = (): void => closeAccessibleModal(dom.authModal, dom.authOverlay);
export const openAuthModal = (): void => openAccessibleModal(dom.authModal, dom.authOverlay);

let authModalInitialized = false;

export function setupAuthModal(): void {
  if (authModalInitialized) return;
  const { loginButton, authModal, authOverlay } = dom;
  if (!loginButton || !authModal) return;

  loginButton.addEventListener("click", openAuthModal);
  authOverlay?.addEventListener("click", closeAuthModal);
  
  document.addEventListener("keydown", (e: KeyboardEvent) => {
    if (e.key === "Escape" && !authModal.hidden) closeAuthModal();
  });

  authModalInitialized = true;
}

// =================================================================
//          4. HELPERS DE INTERFAZ GENERAL
// =================================================================

export function updateTypeFilterUI(mediaType: "movies" | "series" | "all"): void {
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

// Helper para determinar si se debe mostrar el contador total
function shouldShowTotalCount(): boolean {
  const { totalMovies } = getState();
  if (totalMovies <= 0) return false;
  if (!hasActiveMeaningfulFilters()) return false;

  const filters = getActiveFilters();
  
  // 1. Búsqueda o Listas: Siempre mostrar
  if ((filters.searchTerm && filters.searchTerm.trim()) || filters.myList) return true;

  // 2. Otros filtros específicos: Siempre mostrar
  const hasOtherFilters = [
    filters.genre, filters.country, filters.director, filters.actor, 
    filters.selection, filters.studio
  ].some(v => v) || (filters.excludedGenres && filters.excludedGenres.length > 0) || (filters.excludedCountries && filters.excludedCountries.length > 0);

  if (hasOtherFilters) return true;

  // 3. Solo filtro de año: Verificar rango
  if (filters.year) {
    const parts = filters.year.split('-').map(Number);
    const start = parts[0];
    const end = parts.length > 1 ? parts[1] : parts[0];
    if (!isNaN(start) && !isNaN(end)) {
      // Ocultar si el rango es de 10 años o más
      return (end - start) < 10;
    }
  }

  return true;
}

export function updateTotalResultsUI(total: number, movies: MappedMovie[] | null = null): void {
  const containers = document.querySelectorAll<HTMLElement>(".total-results-container");
  const counts = document.querySelectorAll<HTMLElement>(".total-results-count");

  if (shouldShowTotalCount()) {
    const text = total.toLocaleString("es-ES");
    counts.forEach(el => el.textContent = text);
    containers.forEach(el => el.hidden = false);
  } else {
    containers.forEach(el => el.hidden = true);
  }

  // Actualizar barra de estado móvil con el nuevo total
  updateMobileStatusBar(movies);
}

export function initThemeToggle(): void {
  const btn = dom.themeToggleButton;
  if (!btn) return;

  const updateState = (isDark: boolean): void => {
    btn.setAttribute("aria-pressed", String(isDark));
    const label = isDark ? "Modo claro" : "Modo oscuro";
    btn.setAttribute("aria-label", label);
    btn.title = label;
  };

  // Sincronización inicial
  const isDark = document.documentElement.classList.contains(CSS_CLASSES.DARK_MODE);
  updateState(isDark);

  btn.addEventListener("click", (e: MouseEvent) => {
    triggerPopAnimation(e.currentTarget as HTMLElement);
    appEvents.emit("uiActionTriggered");
    
    const isNowDark = document.documentElement.classList.toggle(CSS_CLASSES.DARK_MODE);
    localStorage.setItem("theme", isNowDark ? "dark" : "light");
    updateState(isNowDark);
  });
}

/**
 * Limpia las sugerencias de autocompletado del sidebar.
 * @param {HTMLElement|null} exceptForm - Si se proporciona, no limpia las sugerencias de este formulario.
 */
export function clearAllSidebarAutocomplete(exceptForm: HTMLFormElement | null = null): void {
  document.querySelectorAll<HTMLElement>(SELECTORS.SIDEBAR_AUTOCOMPLETE_RESULTS).forEach((container) => {
    const parentForm = container.closest<HTMLFormElement>(SELECTORS.SIDEBAR_FILTER_FORM);
    if (exceptForm && parentForm === exceptForm) return;

    const input = parentForm?.querySelector<HTMLInputElement>(SELECTORS.SIDEBAR_FILTER_INPUT);
    if (input) input.removeAttribute("aria-expanded");
    container.remove();
  });
}

export function updateMobileStatusBar(movies: MappedMovie[] | null = null): void {
  const { mobileStatusBar } = dom;
  if (!mobileStatusBar) return;

  const filters = getActiveFilters();
  const { totalMovies } = getState();
  
  // 1. Tipo dinámico basado en resultados
  let typeText = totalMovies === 1 ? "peli o serie" : "pelis y series";

  if (filters.mediaType === "movies") {
    typeText = totalMovies === 1 ? "película" : "películas";
  } else if (filters.mediaType === "series") {
    typeText = totalMovies === 1 ? "serie" : "series";
  } else if (movies && movies.length > 0) {
    // Analizar la muestra actual de resultados si el filtro es "all"
    const hasMovies = movies.some(m => !m.isSeries);
    const hasSeries = movies.some(m => m.isSeries);
    
    if (hasMovies && !hasSeries) typeText = totalMovies === 1 ? "película" : "películas";
    else if (hasSeries && !hasMovies) typeText = totalMovies === 1 ? "serie" : "series";
  }

  // 2. Orden (Si no es el default 'relevance')
  let text = typeText;
  if (filters.sort !== DEFAULTS.SORT) {
    const sortMap: Record<string, string> = {
      "year,desc": "más recientes",
      "year,asc": "más antiguas",
      "fa_rating,desc": "nota FA",
      "fa_votes,desc": "votos FA",
      "imdb_rating,desc": "nota IMDb",
      "imdb_votes,desc": "votos IMDb"
    };
    
    const sortLabel = sortMap[filters.sort];
    if (sortLabel) {
      text += `, orden: ${sortLabel}`;
    }
  }

  // 3. Total (Usando la lógica unificada de rango de años)
  if (shouldShowTotalCount()) {
    text = `${totalMovies.toLocaleString("es-ES")} ${text}`;
  } else {
    text = text.charAt(0).toUpperCase() + text.slice(1);
  }

  mobileStatusBar.textContent = text;
}

// =================================================================
//          5. GESTIÓN DE INTERACCIONES GLOBALES (UX STATE)
// =================================================================

let interactionsLocked = false;
let interactionLockTimer: ReturnType<typeof setTimeout> | null = null;

/**
 * Bloquea temporalmente las interacciones globales (clics, taps).
 * Útil durante gestos complejos (como pinch-to-zoom) para evitar clics accidentales.
 */
export function lockGlobalInteractions(duration = 800): void {
  interactionsLocked = true;
  if (interactionLockTimer) clearTimeout(interactionLockTimer);
  interactionLockTimer = setTimeout(() => {
    interactionsLocked = false;
    interactionLockTimer = null;
  }, duration);
}

export function areInteractionsLocked(): boolean {
  return interactionsLocked;
}
