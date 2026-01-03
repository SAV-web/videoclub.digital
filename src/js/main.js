// src/js/main.js
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
//          GESTIÓN DE URL (Routing Básico)
// =================================================================

const URL_PARAM_MAP = { 
  q: "searchTerm", genre: "genre", year: "year", country: "country", 
  dir: "director", actor: "actor", sel: "selection", stu: "studio", 
  sort: "sort", type: "mediaType", p: "page", 
  exg: "excludedGenres", exc: "excludedCountries" 
};
const REVERSE_URL_PARAM_MAP = Object.fromEntries(Object.entries(URL_PARAM_MAP).map(([k, v]) => [v, k]));

const UrlManager = {
  syncStateFromUrl() {
    resetFiltersState();
    const params = new URLSearchParams(window.location.search);
    
    Object.entries(URL_PARAM_MAP).forEach(([shortKey, stateKey]) => {
      const value = params.get(shortKey);
      if (value !== null) {
        if (stateKey === "page") setCurrentPage(parseInt(value, 10) || 1);
        else if (stateKey === "searchTerm") setSearchTerm(value);
        else if (stateKey === "sort") setSort(value);
        else if (stateKey === "mediaType") setMediaType(value);
        else if (stateKey === "excludedGenres" || stateKey === "excludedCountries") setFilter(stateKey, value.split(","), true);
        else setFilter(stateKey, value, true);
      }
    });
    
    // Defaults
    if (!params.has("sort")) setSort(DEFAULTS.SORT);
    if (!params.has("type")) setMediaType(DEFAULTS.MEDIA_TYPE);
    if (!params.has("p")) setCurrentPage(1);
    
    // Sincronizar UI Header
    const activeFilters = getActiveFilters();
    dom.searchInput.value = activeFilters.searchTerm;
    dom.sortSelect.value = activeFilters.sort;
    updateTypeFilterUI(activeFilters.mediaType);
  },

  updateUrlFromState() {
    const params = new URLSearchParams();
    const activeFilters = getActiveFilters();
    const currentPage = getCurrentPage();
    
    Object.entries(activeFilters).forEach(([key, value]) => {
      const shortKey = REVERSE_URL_PARAM_MAP[key];
      if (!shortKey) return;
      
      if (Array.isArray(value) && value.length > 0) params.set(shortKey, value.join(","));
      else if (typeof value === "string" && value.trim() !== "") {
        // Ignorar defaults para URL limpia
        if (key === "mediaType" && value === DEFAULTS.MEDIA_TYPE) return;
        if (key === "sort" && value === DEFAULTS.SORT) return;
        if (key === "year" && value === `${CONFIG.YEAR_MIN}-${CONFIG.YEAR_MAX}`) return;
        
        params.set(shortKey, value);
      }
    });
    
    if (currentPage > 1) params.set("p", currentPage);
    
    const newUrl = params.toString() ? `${window.location.pathname}?${params.toString()}` : window.location.pathname;
    if (newUrl !== `${window.location.pathname}${window.location.search}`) {
      history.pushState({ path: newUrl }, "", newUrl);
    }
  }
};

// =================================================================
//          CORE: CARGA Y RENDERIZADO
// =================================================================

export async function loadAndRenderMovies(page = 1) {
  const controller = createAbortableRequest('movie-grid-load');
  const signal = controller.signal;

  setCurrentPage(page);
  updatePageTitle();
  UrlManager.updateUrlFromState();

  // Estado de carga UI
  document.body.classList.add('is-fetching');
  dom.gridContainer.classList.add('is-fetching');
  dom.gridContainer.setAttribute("aria-busy", "true");
  
  // Renderizado optimista
  renderSkeletons(dom.gridContainer, dom.paginationContainer);
  const currentKnownTotal = getState().totalMovies;
  updateHeaderPaginationState(getCurrentPage(), currentKnownTotal);
  
  window.scrollTo({ top: 0, behavior: "auto" });

  try {
    const pageSize = page === 1 ? CONFIG.DYNAMIC_PAGE_SIZE_LIMIT : CONFIG.ITEMS_PER_PAGE;
    
    // Smart Count: Pedir total solo si no lo tenemos o es primera página (refresco)
    const shouldRequestCount = (page === 1) || (currentKnownTotal === 0);

    const result = await fetchMovies(getActiveFilters(), page, pageSize, signal, shouldRequestCount);

    if (result.aborted) return;

    const { items: movies, total: returnedTotal } = result;

    // Precarga LCP
    if (movies && movies.length > 0) preloadLcpImage(movies[0]);
    
    const performRender = () => {
      const effectiveTotal = returnedTotal >= 0 ? returnedTotal : currentKnownTotal;
      updateDomWithResults(movies, effectiveTotal);
      
      // Fix scroll en móvil tras renderizado
      if (page === 1 && window.innerWidth <= 700) {
         window.scrollTo({ top: 0, behavior: "auto" });
      }
    };

    if (document.startViewTransition) document.startViewTransition(performRender);
    else performRender();

  } catch (error) {
    if (error.name === "AbortError") return;
    console.error("Main Load Error:", error);
    
    const msg = getFriendlyErrorMessage(error);
    if (msg) showToast(msg, "error");
    renderErrorState(dom.gridContainer, dom.paginationContainer, msg || "Error desconocido");
    
    // Propagar error para manejo en UI lateral (rollback filtros)
    if (msg) throw new Error(msg); 
  } finally {
    if (!signal.aborted) {
      document.body.classList.remove('is-fetching');
      dom.gridContainer.classList.remove('is-fetching');
      dom.gridContainer.setAttribute("aria-busy", "false");
    }
  }
}

function updateDomWithResults(movies, totalMovies) {
  setTotalMovies(totalMovies);
  updateTotalResultsUI(totalMovies, hasActiveMeaningfulFilters());
  const currentState = getState();

  if (currentState.totalMovies === 0) {
    renderNoResults(dom.gridContainer, dom.paginationContainer, getActiveFilters());
    updateHeaderPaginationState(1, 0);
  } else if (currentState.totalMovies <= CONFIG.DYNAMIC_PAGE_SIZE_LIMIT && currentState.currentPage === 1) {
    renderMovieGrid(dom.gridContainer, movies);
    dom.paginationContainer.textContent = "";
    updateHeaderPaginationState(1, 1);
  } else {
    const limit = CONFIG.ITEMS_PER_PAGE; 
    const moviesToRender = movies.slice(0, limit);
    renderMovieGrid(dom.gridContainer, moviesToRender);
    
    if (currentState.totalMovies > limit) {
      renderPagination(dom.paginationContainer, currentState.totalMovies, currentState.currentPage);
    } else {
      dom.paginationContainer.textContent = "";
    }
    updateHeaderPaginationState(currentState.currentPage, currentState.totalMovies);
  }

  if (currentState.totalMovies > 0) {
    prefetchNextPage(currentState.currentPage, currentState.totalMovies, getActiveFilters());
  }
}

// =================================================================
//          MANEJADORES DE EVENTOS UI
// =================================================================

function handleSortChange(event) {
  triggerPopAnimation(event.target);
  document.dispatchEvent(new CustomEvent("uiActionTriggered"));
  setSort(dom.sortSelect.value);
  loadAndRenderMovies(1);
}

function handleMediaTypeToggle(event) {
  triggerPopAnimation(event.currentTarget);
  document.dispatchEvent(new CustomEvent("uiActionTriggered"));
  const current = getState().activeFilters.mediaType;
  const cycle = { all: "movies", movies: "series", series: "all" };
  setMediaType(cycle[current]);
  updateTypeFilterUI(cycle[current]);
  loadAndRenderMovies(1);
}

const handleSearchInput = debounce(() => {
  const searchTerm = dom.searchInput.value.trim();
  if (searchTerm === getState().activeFilters.searchTerm) return;
  
  if (searchTerm.length >= 3 || searchTerm.length === 0) {
    document.dispatchEvent(new CustomEvent("uiActionTriggered"));
    setSearchTerm(searchTerm);
    loadAndRenderMovies(1);
  }
}, CONFIG.SEARCH_DEBOUNCE_DELAY);

// --- Scroll Global (Throttled) ---
let isTicking = false;
let lastScrollY = 0;

function handleGlobalScroll() {
  if (!isTicking) {
    window.requestAnimationFrame(() => {
      const currentScrollY = window.scrollY;
      dom.mainHeader.classList.toggle(CSS_CLASSES.IS_SCROLLED, currentScrollY > 10);

      if (window.innerWidth <= 700) {
        const isScrollingDown = currentScrollY > lastScrollY;
        const scrollDifference = Math.abs(currentScrollY - lastScrollY);
        const isAtBottom = (window.innerHeight + currentScrollY) >= (document.documentElement.scrollHeight - 50);

        if (isAtBottom) {
          dom.mainHeader.classList.remove('is-hidden-mobile');
        } else if (scrollDifference > 5) {
          dom.mainHeader.classList.toggle('is-hidden-mobile', isScrollingDown && currentScrollY > 60);
        }
      }
      lastScrollY = currentScrollY;
      isTicking = false;
    });
    isTicking = true;
  }
}

function handleFiltersReset(e) {
  const { keepSort, newFilter } = e.detail || {};
  const currentSort = keepSort ? getState().activeFilters.sort : DEFAULTS.SORT;
  
  resetFiltersState();
  setSort(currentSort);
  
  if (newFilter) setFilter(newFilter.type, newFilter.value);
  
  dom.searchInput.value = "";
  dom.sortSelect.value = currentSort;
  updateTypeFilterUI(DEFAULTS.MEDIA_TYPE);
  document.dispatchEvent(new CustomEvent("updateSidebarUI"));
  
  loadAndRenderMovies(1);
}

// =================================================================
//          SETUP & INIT
// =================================================================

function setupListeners() {
  // --- Header ---
  dom.searchInput.addEventListener("input", handleSearchInput);
  dom.searchForm.addEventListener("submit", (e) => { e.preventDefault(); handleSearchInput(); });
  dom.searchInput.addEventListener("focus", () => dom.mainHeader.classList.add("is-search-focused"));
  dom.searchInput.addEventListener("blur", () => dom.mainHeader.classList.remove("is-search-focused"));
  
  dom.sortSelect.addEventListener("change", handleSortChange);
  dom.typeFilterToggle.addEventListener("click", handleMediaTypeToggle);

  const mobileSidebarToggle = document.getElementById('mobile-sidebar-toggle');
  if (mobileSidebarToggle) {
    mobileSidebarToggle.addEventListener('click', () => {
      triggerHapticFeedback('light');
      const isOpen = document.body.classList.contains('sidebar-is-open');
      isOpen ? closeMobileDrawer() : openMobileDrawer();
    });
  }

  // Navegación Páginas
  const navigatePage = (dir) => {
    const curr = getCurrentPage();
    const totalPages = Math.ceil(getState().totalMovies / CONFIG.ITEMS_PER_PAGE);
    if (curr + dir > 0 && curr + dir <= totalPages) {
      document.dispatchEvent(new CustomEvent("uiActionTriggered"));
      loadAndRenderMovies(curr + dir);
    }
  };
  dom.headerPrevBtn.addEventListener("click", (e) => { triggerPopAnimation(e.currentTarget); navigatePage(-1); });
  dom.headerNextBtn.addEventListener("click", (e) => { triggerPopAnimation(e.currentTarget); navigatePage(1); });

  // Clear Search
  const clearSearchBtn = dom.searchForm.querySelector('.search-icon--clear');
  if (clearSearchBtn) {
    const performClear = (e) => {
      if (e.cancelable) e.preventDefault(); e.stopPropagation();
      dom.searchInput.value = ''; dom.searchInput.focus(); handleSearchInput(); 
    };
    clearSearchBtn.addEventListener('mousedown', (e) => e.preventDefault());
    clearSearchBtn.addEventListener('touchstart', performClear, { passive: false });
    clearSearchBtn.addEventListener('click', performClear);
  }

  // --- Global ---
  document.addEventListener("click", (e) => {
    if (!e.target.closest(SELECTORS.SIDEBAR_FILTER_FORM)) clearAllSidebarAutocomplete();
    if (!e.target.closest(".sidebar")) collapseAllSections();
  });

  dom.gridContainer.addEventListener("click", (e) => {
    const card = e.target.closest(".movie-card");
    if (card) return handleCardClick.call(card, e);
    if (e.target.closest("#clear-filters-from-empty")) document.dispatchEvent(new CustomEvent("filtersReset"));
  });

  initCardInteractions(dom.gridContainer);
  document.getElementById("quick-view-content").addEventListener("click", function(e) { handleCardClick.call(this, e); });
  
  dom.paginationContainer.addEventListener("click", (e) => {
    const btn = e.target.closest(".btn[data-page]");
    if (btn) {
      triggerPopAnimation(btn);
      document.dispatchEvent(new CustomEvent("uiActionTriggered"));
      loadAndRenderMovies(parseInt(btn.dataset.page, 10));
    }
  });

  lastScrollY = window.scrollY;
  window.addEventListener("scroll", handleGlobalScroll, { passive: true });
  
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && document.body.classList.contains(CSS_CLASSES.SIDEBAR_OPEN)) closeMobileDrawer();
  });

  // Eventos Custom
  const refreshUI = () => document.querySelectorAll(".movie-card").forEach(updateCardUI);
  document.addEventListener("card:requestUpdate", (e) => updateCardUI(e.detail.cardElement));
  document.addEventListener("userMovieDataChanged", refreshUI);
  document.addEventListener("userDataUpdated", refreshUI);
  document.addEventListener("filtersReset", handleFiltersReset);
  
  window.addEventListener("resize", () => {
    if (dom.searchInput) dom.searchInput.placeholder = window.innerWidth <= 700 ? "" : "Título";
  });
}

function updatePageTitle() {
  const f = getActiveFilters();
  let title = f.mediaType === "movies" ? "Películas" : f.mediaType === "series" ? "Series" : "Películas y series";
  const yearSuffix = (f.year && f.year !== `${CONFIG.YEAR_MIN}-${CONFIG.YEAR_MAX}`) ? ` (${f.year.replace("-", " a ")})` : "";

  if (f.searchTerm) title = `Resultados para "${f.searchTerm}"`;
  else if (f.selection) title = (FILTER_CONFIG.selection.titles?.[f.selection] || FILTER_CONFIG.selection.items[f.selection]) + yearSuffix;
  else if (f.studio) title = (STUDIO_DATA[f.studio]?.title || title) + yearSuffix;
  else if (f.genre) title = `${title} de ${f.genre}`;
  else if (f.director) title = `${title} de ${f.director}`;
  else if (f.actor) title = `${title} con ${f.actor}`;
  else if (f.country) title = `${title} de ${f.country}`;
  
  document.title = `${title} | videoclub.digital`;
}

function setupAuthSystem() {
  const avatar = document.getElementById("user-avatar-initials");
  const logoutBtn = document.getElementById("logout-button");
  
  supabase.auth.onAuthStateChange(async (e, session) => {
    if (session?.user) {
      document.body.classList.add("user-logged-in");
      avatar.textContent = session.user.email.charAt(0).toUpperCase();
      avatar.title = `Sesión: ${session.user.email}`;
      try {
        const data = await fetchUserMovieData();
        setUserMovieData(data);
        document.dispatchEvent(new CustomEvent("userDataUpdated"));
      } catch (err) { showToast(err.message, "error"); }
    } else {
      document.body.classList.remove("user-logged-in");
      clearUserMovieData();
      document.dispatchEvent(new CustomEvent("userDataUpdated"));
    }
  });

  logoutBtn?.addEventListener("click", async () => {
    const { error } = await supabase.auth.signOut();
    if (error) showToast("Error al cerrar sesión.", "error");
  });
}

function init() {
  // Anti-FOUC
  requestAnimationFrame(() => document.querySelectorAll('[data-loading]').forEach(el => el.removeAttribute('data-loading')));

  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => navigator.serviceWorker.register("sw.js").catch(console.error));
  }
  
  window.addEventListener("popstate", () => {
    closeModal();
    UrlManager.syncStateFromUrl();
    document.dispatchEvent(new CustomEvent("updateSidebarUI"));
    loadAndRenderMovies(getCurrentPage());
  });
  
  initSidebar();
  initQuickView();
  initThemeToggle();
  setupListeners();
  setupAuthSystem();
  setupAuthModal();
  initAuthForms();
  
  UrlManager.syncStateFromUrl();
  document.dispatchEvent(new CustomEvent("updateSidebarUI"));
  loadAndRenderMovies(getCurrentPage());
}

document.addEventListener("DOMContentLoaded", init);