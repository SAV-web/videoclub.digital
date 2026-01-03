// src/js/main.js
// Orquestador principal de la aplicación.
// Coordina Estado, API, UI y Eventos.

import "../css/main.css";
import { CONFIG, CSS_CLASSES, SELECTORS, DEFAULTS, STUDIO_DATA, FILTER_CONFIG } from "./constants.js";
import { debounce, triggerPopAnimation, getFriendlyErrorMessage, preloadLcpImage, createAbortableRequest, triggerHapticFeedback } from "./utils.js";
import { fetchMovies, supabase, fetchUserMovieData } from "./api.js";
import { dom, renderPagination, updateHeaderPaginationState, prefetchNextPage, setupAuthModal, updateTypeFilterUI, updateTotalResultsUI, clearAllSidebarAutocomplete, showToast, initThemeToggle } from "./ui.js";
import { getState, getActiveFilters, getCurrentPage, setCurrentPage, setTotalMovies, setFilter, setSearchTerm, setSort, setMediaType, resetFiltersState, hasActiveMeaningfulFilters, setUserMovieData, clearUserMovieData } from "./state.js";
import { initSidebar, collapseAllSections, openMobileDrawer, closeMobileDrawer } from "./components/sidebar.js";
import { initAuthForms } from "./auth.js";
import { renderMovieGrid, updateCardUI, handleCardClick, initCardInteractions, renderSkeletons, renderNoResults, renderErrorState } from "./components/card.js";
import { initQuickView, closeModal } from "./components/modal.js";

// =================================================================
//          CONFIGURACIÓN Y MAPEO DE URL
// =================================================================

const URL_PARAM_MAP = { 
  q: "searchTerm", genre: "genre", year: "year", country: "country", 
  dir: "director", actor: "actor", sel: "selection", stu: "studio", 
  sort: "sort", type: "mediaType", p: "page", 
  exg: "excludedGenres", exc: "excludedCountries" 
};

// Invertimos el mapa para escritura rápida en URL
const REVERSE_URL_PARAM_MAP = Object.fromEntries(
  Object.entries(URL_PARAM_MAP).map(([k, v]) => [v, k])
);

// =================================================================
//          LÓGICA PRINCIPAL DE CARGA
// =================================================================

/**
 * Carga y renderiza la rejilla de películas basándose en el estado actual.
 * @param {number} page - Número de página a cargar.
 */
export async function loadAndRenderMovies(page = 1) {
  // 1. Gestión de concurrencia (Cancelar peticiones anteriores)
  const controller = createAbortableRequest('movie-grid-load');
  const signal = controller.signal;

  // 2. Actualización de Estado y UI
  setCurrentPage(page);
  updatePageTitle();
  updateUrl(); // Sincroniza la URL antes de cargar para reflejar el estado actual

  // Indicadores de carga visual
  document.body.classList.add('is-fetching');
  dom.gridContainer.classList.add('is-fetching');
  dom.gridContainer.setAttribute("aria-busy", "true");
  
  // Renderizado optimista (Skeleton Screen)
  renderSkeletons(dom.gridContainer, dom.paginationContainer);
  
  // Mantener paginación visible si ya conocemos el total (UX mejorada)
  const currentKnownTotal = getState().totalMovies;
  updateHeaderPaginationState(getCurrentPage(), currentKnownTotal);
  
  // Reset de scroll
  window.scrollTo({ top: 0, behavior: "auto" });

  // Detección de View Transitions (Navegadores modernos)
  const supportsViewTransitions = !!document.startViewTransition;

  try {
    // 3. Estrategia de Carga Inteligente
    // Primera página carga más ítems para llenar pantallas grandes
    const pageSize = page === 1 ? CONFIG.DYNAMIC_PAGE_SIZE_LIMIT : CONFIG.ITEMS_PER_PAGE;
    
    // Solo pedimos el conteo total (COUNT(*)) si no lo tenemos o es la primera página.
    // Esto ahorra recursos significativos en base de datos.
    const shouldRequestCount = (page === 1) || (currentKnownTotal === 0);

    const result = await fetchMovies(
      getActiveFilters(),
      page,
      pageSize,
      signal,
      shouldRequestCount
    );

    if (result.aborted) return; // Salida silenciosa si se canceló

    const { items: movies, total: returnedTotal } = result;

    // Precarga LCP: Acelera la carga visual de la primera imagen
    if (movies && movies.length > 0) preloadLcpImage(movies[0]);
    
    // 4. Renderizado Final
    const performRender = () => {
      // Usar total retornado o mantener el conocido
      const effectiveTotal = returnedTotal >= 0 ? returnedTotal : currentKnownTotal;
      
      updateDomWithResults(movies, effectiveTotal);
      
      // Fix Móvil: Asegurar scroll arriba tras renderizar si el teclado desplazó el viewport
      if (page === 1 && window.innerWidth <= 700) {
         window.scrollTo({ top: 0, behavior: "auto" });
      }
    };

    if (supportsViewTransitions) document.startViewTransition(performRender);
    else performRender();

  } catch (error) {
    if (error.name === "AbortError") return;
    console.error("Error crítico en carga:", error);
    
    const msg = getFriendlyErrorMessage(error);
    if (msg) showToast(msg, "error");
    renderErrorState(dom.gridContainer, dom.paginationContainer, msg || "Error desconocido");
    
    // Re-lanzar para permitir rollback en componentes optimistas (sidebar)
    if (msg) throw new Error(msg); 

  } finally {
    if (!signal.aborted) {
      document.body.classList.remove('is-fetching');
      dom.gridContainer.classList.remove('is-fetching');
      dom.gridContainer.setAttribute("aria-busy", "false");
    }
  }
}

/**
 * Actualiza el DOM con los resultados.
 * Maneja estados vacíos y paginación.
 */
function updateDomWithResults(movies, totalMovies) {
  setTotalMovies(totalMovies);
  updateTotalResultsUI(totalMovies, hasActiveMeaningfulFilters());
  
  const currentState = getState();

  // Caso 1: Sin resultados
  if (currentState.totalMovies === 0) {
    renderNoResults(dom.gridContainer, dom.paginationContainer, getActiveFilters());
    updateHeaderPaginationState(1, 0);
    return;
  } 
  
  // Caso 2: Todo cabe en una página (sin paginación)
  if (currentState.totalMovies <= CONFIG.DYNAMIC_PAGE_SIZE_LIMIT && currentState.currentPage === 1) {
    renderMovieGrid(dom.gridContainer, movies);
    dom.paginationContainer.textContent = "";
    updateHeaderPaginationState(1, 1);
    return;
  }
  
  // Caso 3: Paginación necesaria
  const limit = CONFIG.ITEMS_PER_PAGE; 
  // Recortamos el exceso de items traídos por la estrategia dinámica
  const moviesToRender = movies.slice(0, limit);
  
  renderMovieGrid(dom.gridContainer, moviesToRender);
  
  if (currentState.totalMovies > limit) {
    renderPagination(dom.paginationContainer, currentState.totalMovies, currentState.currentPage);
  } else {
    dom.paginationContainer.textContent = "";
  }
  updateHeaderPaginationState(currentState.currentPage, currentState.totalMovies);

  // 5. Precarga Inteligente (Siguiente Página)
  if (currentState.totalMovies > 0) {
    prefetchNextPage(currentState.currentPage, currentState.totalMovies, getActiveFilters());
  }
}

// =================================================================
//          MANEJADORES DE INTERACCIÓN (Header & Filtros)
// =================================================================

async function handleSortChange(event) {
  triggerPopAnimation(event.target);
  document.dispatchEvent(new CustomEvent("uiActionTriggered"));
  setSort(dom.sortSelect.value);
  await loadAndRenderMovies(1);
}

async function handleMediaTypeToggle(event) {
  triggerPopAnimation(event.currentTarget);
  document.dispatchEvent(new CustomEvent("uiActionTriggered"));
  
  const currentType = getState().activeFilters.mediaType;
  const cycle = { all: "movies", movies: "series", series: "all" };
  const nextType = cycle[currentType] || "movies"; // Fallback seguro
  
  setMediaType(nextType);
  updateTypeFilterUI(nextType);
  await loadAndRenderMovies(1);
}

async function handleSearchInput() {
  const searchTerm = dom.searchInput.value.trim();
  const currentTerm = getState().activeFilters.searchTerm;
  
  if (searchTerm === currentTerm) return;
  
  // Evitar búsquedas muy cortas a menos que se esté borrando
  if (searchTerm.length >= 3 || searchTerm.length === 0) {
    document.dispatchEvent(new CustomEvent("uiActionTriggered"));
    setSearchTerm(searchTerm);
    await loadAndRenderMovies(1);
  }
}

function handleFiltersReset(e) {
  const { keepSort, newFilter } = e.detail || {};
  
  // Preservar ordenación si se solicita, sino volver a defecto
  const currentSort = keepSort ? getState().activeFilters.sort : DEFAULTS.SORT;
  
  resetFiltersState();
  setSort(currentSort);
  
  // Aplicar nuevo filtro específico (ej: clic en actor)
  if (newFilter) {
    setFilter(newFilter.type, newFilter.value, true); // true = bypass limits
  }
  
  // Sincronizar UI
  dom.searchInput.value = "";
  dom.sortSelect.value = currentSort;
  updateTypeFilterUI(DEFAULTS.MEDIA_TYPE);
  
  document.dispatchEvent(new CustomEvent("updateSidebarUI"));
  loadAndRenderMovies(1);
}

// =================================================================
//          SCROLL GLOBAL (Optimizado con rAF)
// =================================================================

let isScrollTicking = false;
let lastScrollY = 0;

function handleGlobalScroll() {
  if (!isScrollTicking) {
    window.requestAnimationFrame(() => {
      const currentScrollY = window.scrollY;
      
      // 1. Estilo Header (Sombra)
      dom.mainHeader.classList.toggle(CSS_CLASSES.IS_SCROLLED, currentScrollY > 10);

      // 2. Comportamiento Móvil (Smart Hide)
      if (window.innerWidth <= 700) {
        const isScrollingDown = currentScrollY > lastScrollY;
        const scrollDifference = Math.abs(currentScrollY - lastScrollY);
        const docHeight = document.documentElement.scrollHeight;
        const winHeight = window.innerHeight;
        
        // Detectar si estamos cerca del final para mostrar siempre la barra
        const isAtBottom = (winHeight + currentScrollY) >= (docHeight - 50);

        if (isAtBottom) {
          dom.mainHeader.classList.remove('is-hidden-mobile');
        } else if (scrollDifference > 5) {
          // Ocultar solo si bajamos y ya pasamos el tope superior
          dom.mainHeader.classList.toggle('is-hidden-mobile', isScrollingDown && currentScrollY > 60);
        }
      }

      lastScrollY = currentScrollY;
      isScrollTicking = false;
    });
    isScrollTicking = true;
  }
}

// =================================================================
//          CONFIGURACIÓN DE EVENTOS (Setup)
// =================================================================

function setupHeaderListeners() {
  // Búsqueda con Debounce
  const debouncedSearch = debounce(handleSearchInput, CONFIG.SEARCH_DEBOUNCE_DELAY);
  dom.searchInput.addEventListener("input", debouncedSearch);
  dom.searchForm.addEventListener("submit", (e) => { e.preventDefault(); handleSearchInput(); });
  
  // Foco Búsqueda (UX Móvil)
  dom.searchInput.addEventListener("focus", () => dom.mainHeader.classList.add("is-search-focused"));
  dom.searchInput.addEventListener("blur", () => dom.mainHeader.classList.remove("is-search-focused"));

  // Controles Header
  dom.sortSelect.addEventListener("change", handleSortChange);
  dom.typeFilterToggle.addEventListener("click", handleMediaTypeToggle);

  // Botón Sidebar Móvil
  const mobileSidebarToggle = document.getElementById('mobile-sidebar-toggle');
  if (mobileSidebarToggle) {
    mobileSidebarToggle.addEventListener('click', () => {
      triggerHapticFeedback('light');
      const isOpen = document.body.classList.contains('sidebar-is-open');
      isOpen ? closeMobileDrawer() : openMobileDrawer();
    });
  }

  // Paginación Header (Flechas)
  const navigatePage = async (dir) => {
    const page = getCurrentPage() + dir;
    if (page > 0) {
      triggerPopAnimation(dir > 0 ? dom.headerNextBtn : dom.headerPrevBtn);
      await loadAndRenderMovies(page);
    }
  };
  dom.headerPrevBtn.addEventListener("click", () => navigatePage(-1));
  dom.headerNextBtn.addEventListener("click", () => navigatePage(1));

  // Botón "X" Búsqueda
  const clearSearchBtn = dom.searchForm.querySelector('.search-icon--clear');
  if (clearSearchBtn) {
    const performClear = (e) => {
      if (e.cancelable) e.preventDefault(); // Prevenir pérdida de foco
      dom.searchInput.value = '';
      dom.searchInput.focus();
      handleSearchInput();
    };
    // Soporte táctil y ratón robusto
    clearSearchBtn.addEventListener('mousedown', (e) => e.preventDefault());
    clearSearchBtn.addEventListener('click', performClear);
  }

  // Placeholder Adaptable
  const updateSearchPlaceholder = () => {
    if (dom.searchInput) dom.searchInput.placeholder = window.innerWidth <= 700 ? "" : "Título";
  };
  window.addEventListener("resize", updateSearchPlaceholder);
  updateSearchPlaceholder();
}

function setupGlobalListeners() {
  // Cierre de paneles al hacer click fuera
  document.addEventListener("click", (e) => {
    if (!e.target.closest(SELECTORS.SIDEBAR_FILTER_FORM)) clearAllSidebarAutocomplete();
    if (!e.target.closest(".sidebar") && !e.target.closest("#mobile-sidebar-toggle")) collapseAllSections();
  });

  // Delegación de Eventos Grid (Mejora rendimiento vs listeners individuales)
  dom.gridContainer.addEventListener("click", function(e) {
    const cardElement = e.target.closest(".movie-card");
    if (cardElement) { 
      handleCardClick.call(cardElement, e); 
      return; 
    }
    
    // Botón "Limpiar Filtros" en estado vacío
    if (e.target.closest("#clear-filters-from-empty")) {
      document.dispatchEvent(new CustomEvent("filtersReset"));
    }
  });
  
  // Inicialización de interacciones complejas (Pointer Events)
  initCardInteractions(dom.gridContainer);
  
  // Delegación Quick View
  const qvContent = document.getElementById("quick-view-content");
  if (qvContent) {
    qvContent.addEventListener("click", function(e) { handleCardClick.call(this, e); });
  }
  
  // Paginación Footer
  dom.paginationContainer.addEventListener("click", (e) => {
    const button = e.target.closest(".btn[data-page]");
    if (button) {
      triggerPopAnimation(button);
      loadAndRenderMovies(parseInt(button.dataset.page, 10));
    }
  });

  // Scroll Global
  lastScrollY = window.scrollY;
  window.addEventListener("scroll", handleGlobalScroll, { passive: true });
  
  // Teclado (Accesibilidad)
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && document.body.classList.contains(CSS_CLASSES.SIDEBAR_OPEN)) {
      closeMobileDrawer();
    }
  });

  // Bus Eventos de la Aplicación
  document.addEventListener("card:requestUpdate", (e) => { if (e.detail.cardElement) updateCardUI(e.detail.cardElement); });
  
  const refreshUI = () => document.querySelectorAll(".movie-card").forEach(updateCardUI);
  document.addEventListener("userMovieDataChanged", refreshUI);
  document.addEventListener("userDataUpdated", refreshUI);
  
  document.addEventListener("filtersReset", handleFiltersReset);
}

// =================================================================
//          SISTEMA DE USUARIO Y URL
// =================================================================

function setupAuthSystem() {
  const userAvatarInitials = document.getElementById("user-avatar-initials");
  const logoutButton = document.getElementById("logout-button");
  
  const onLogin = async (user) => {
    document.body.classList.add("user-logged-in");
    userAvatarInitials.textContent = (user.email || "U").charAt(0).toUpperCase();
    userAvatarInitials.title = `Sesión: ${user.email}`;
    try {
      const data = await fetchUserMovieData();
      setUserMovieData(data);
      document.dispatchEvent(new CustomEvent("userDataUpdated"));
    } catch (e) { showToast(e.message, "error"); }
  };
  
  const onLogout = () => {
    document.body.classList.remove("user-logged-in");
    clearUserMovieData();
    document.dispatchEvent(new CustomEvent("userDataUpdated"));
  };
  
  logoutButton?.addEventListener("click", async () => {
    const { error } = await supabase.auth.signOut();
    if (error) showToast("Error al salir", "error");
  });
  
  supabase.auth.onAuthStateChange((_, session) => {
    session?.user ? onLogin(session.user) : onLogout();
  });
}

function updatePageTitle() {
  const filters = getActiveFilters();
  let title = filters.mediaType === "series" ? "Series" : "Películas";
  
  if (filters.searchTerm) title = `Resultados: "${filters.searchTerm}"`;
  else if (filters.genre) title = `${title} de ${filters.genre}`;
  // ... (otros casos básicos)
  
  document.title = `${title} | videoclub.digital`;
}

function readUrlAndSetState() {
  resetFiltersState();
  const params = new URLSearchParams(window.location.search);
  
  Object.entries(URL_PARAM_MAP).forEach(([shortKey, stateKey]) => {
    const val = params.get(shortKey);
    if (val !== null) {
      if (stateKey === "page") setCurrentPage(parseInt(val, 10) || 1);
      else if (stateKey === "sort" || stateKey === "mediaType" || stateKey === "searchTerm") {
        if (stateKey === "sort") setSort(val);
        else if (stateKey === "mediaType") setMediaType(val);
        else setSearchTerm(val);
      } else {
        // Filtros complejos (arrays)
        const isArray = ["excludedGenres", "excludedCountries"].includes(stateKey);
        setFilter(stateKey, isArray ? val.split(",") : val, true);
      }
    }
  });
  
  // Defaults
  if (!params.has("sort")) setSort(DEFAULTS.SORT);
  if (!params.has("type")) setMediaType(DEFAULTS.MEDIA_TYPE);
  
  // Sincronizar Inputs UI
  const current = getActiveFilters();
  dom.searchInput.value = current.searchTerm;
  dom.sortSelect.value = current.sort;
  updateTypeFilterUI(current.mediaType);
}

function updateUrl() {
  const params = new URLSearchParams();
  const filters = getActiveFilters();
  
  Object.entries(filters).forEach(([key, val]) => {
    const shortKey = REVERSE_URL_PARAM_MAP[key];
    if (!shortKey) return;
    
    if (Array.isArray(val) && val.length > 0) params.set(shortKey, val.join(","));
    else if (typeof val === "string" && val.trim()) {
      if (key === "mediaType" && val === DEFAULTS.MEDIA_TYPE) return;
      if (key === "sort" && val === DEFAULTS.SORT) return;
      if (key === "year" && val.includes(CONFIG.YEAR_MIN) && val.includes(CONFIG.YEAR_MAX)) return;
      params.set(shortKey, val);
    }
  });
  
  if (getCurrentPage() > 1) params.set("p", getCurrentPage());
  
  const newUrl = `${window.location.pathname}?${params.toString()}`;
  if (newUrl !== window.location.href) history.pushState({ path: newUrl }, "", newUrl);
}

// =================================================================
//          INICIALIZACIÓN (Entry Point)
// =================================================================

function init() {
  // Anti-FOUC (Flash of Unstyled Content)
  // Eliminamos el atributo data-loading para que el CSS active la visibilidad
  requestAnimationFrame(() => {
    document.querySelectorAll('[data-loading]').forEach(el => el.removeAttribute('data-loading'));
  });

  // Service Worker
  if ("serviceWorker" in navigator && !import.meta.env.DEV) {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    });
  }
  
  // Navegación Historial (Atrás/Adelante)
  window.addEventListener("popstate", () => {
    closeModal();
    readUrlAndSetState();
    document.dispatchEvent(new CustomEvent("updateSidebarUI"));
    loadAndRenderMovies(getCurrentPage());
  });
  
  // Inicialización de Módulos
  initSidebar();
  initQuickView();
  initThemeToggle();
  setupHeaderListeners();
  setupGlobalListeners();
  setupAuthSystem();
  setupAuthModal();
  initAuthForms();
  
  // Carga Inicial
  readUrlAndSetState();
  document.dispatchEvent(new CustomEvent("updateSidebarUI"));
  loadAndRenderMovies(getCurrentPage());
}

// Arranque seguro
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}