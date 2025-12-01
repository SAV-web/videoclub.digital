// =================================================================
//          SCRIPT PRINCIPAL (v6.2 - Fix Imports)
// =================================================================
// FICHERO: src/js/main.js
// CORRECCIÓN: Eliminada referencia a archivo borrado (requestManager).
// =================================================================

import "../css/main.css";
import "flag-icons/css/flag-icons.min.css";
import { CONFIG } from "./config.js";

// 1. Imports de Utilidades (Incluye createAbortableRequest)
import { 
  debounce, 
  triggerPopAnimation, 
  getFriendlyErrorMessage, 
  preloadLcpImage, 
  createAbortableRequest // ✅ Viene de utils.js
} from "./utils.js";

// 2. Imports de API (Incluye supabase y fetchUserMovieData unificados)
import { 
  fetchMovies, 
  queryCache, 
  supabase, 
  fetchUserMovieData 
} from "./api.js";

// 3. Imports de UI (Incluye showToast unificado)
import {
  dom,
  renderPagination,     // Viene de ui.js
  updateHeaderPaginationState, // Viene de ui.js
  prefetchNextPage,     // Viene de ui.js
  setupAuthModal,       // Viene de ui.js
  updateTypeFilterUI,   // Viene de ui.js
  updateTotalResultsUI, // Viene de ui.js
  clearAllSidebarAutocomplete, // Viene de ui.js
  // handleCardClick,   <-- ESTE YA NO ESTÁ EN UI.JS, SE IMPORTA DE CARD.JS
} from "./ui.js";

import { CSS_CLASSES, SELECTORS, DEFAULTS, ICONS } from "./constants.js";
import {
  getState,
  getActiveFilters,
  getCurrentPage,
  setCurrentPage,
  setTotalMovies,
  setFilter,
  setSearchTerm,
  setSort,
  setMediaType,
  resetFiltersState,
  hasActiveMeaningfulFilters,
  setUserMovieData,
  clearUserMovieData,
} from "./state.js";

import { initSidebar, collapseAllSections } from "./components/sidebar.js";
import { initTouchDrawer } from "./components/touch-drawer.js";
import { initAuthForms } from "./auth.js";
import { 
  renderMovieGrid, 
  updateCardUI, 
  handleCardClick, 
  initGridHoverSystem,
  renderSkeletons,
  renderNoResults,
  renderErrorState,
} from "./components/card.js";

import { 
  initQuickView 
} from "./components/quick-view.js";
// ❌ ELIMINADO: import { createAbortableRequest } from './components/requestManager.js'; 

const URL_PARAM_MAP = {
  q: "searchTerm", genre: "genre", year: "year", country: "country",
  dir: "director", actor: "actor", sel: "selection", stu: "studio",
  sort: "sort", type: "mediaType", p: "page",
  exg: "excludedGenres", exc: "excludedCountries",
};
const REVERSE_URL_PARAM_MAP = Object.fromEntries(
  Object.entries(URL_PARAM_MAP).map(([key, value]) => [value, key])
);

export async function loadAndRenderMovies(page = 1) {
  const controller = createAbortableRequest('movie-grid-load');
  const signal = controller.signal;

  setCurrentPage(page);
  updatePageTitle();
  updateUrl();

  document.body.classList.add('is-fetching');
  dom.gridContainer.classList.add('is-fetching');
  
  dom.gridContainer.setAttribute("aria-busy", "true");
  renderSkeletons(dom.gridContainer, dom.paginationContainer);
  updateHeaderPaginationState(getCurrentPage(), 0);
  
  window.scrollTo({ top: 0, behavior: "instant" });

  const supportsViewTransitions = !!document.startViewTransition;

  const renderLogic = async () => {
    try {
      const pageSize = page === 1 ? CONFIG.DYNAMIC_PAGE_SIZE_LIMIT : CONFIG.ITEMS_PER_PAGE;
      
      const result = await fetchMovies(
        getActiveFilters(),
        page,
        pageSize,
        signal
      );

      if (result.aborted) return;

      const { items: movies, total: totalMovies } = result;

      if (movies && movies.length > 0) {
        preloadLcpImage(movies[0]);
      }
      
      const performRender = () => {
        updateDomWithResults(movies, totalMovies);
        document.body.classList.remove('is-fetching');
        dom.gridContainer.classList.remove('is-fetching');
        dom.gridContainer.setAttribute("aria-busy", "false");
      };

      if (supportsViewTransitions) {
        document.startViewTransition(performRender);
      } else {
        performRender();
      }

    } catch (error) {
      if (error.name === "AbortError") return;

      document.body.classList.remove('is-fetching');
      dom.gridContainer.classList.remove('is-fetching');
      dom.gridContainer.setAttribute("aria-busy", "false");
      
      console.error("Error en carga:", error);
      const msg = getFriendlyErrorMessage(error);
      showToast(msg, "error");
      renderErrorState(dom.gridContainer, dom.paginationContainer, msg);
    }
  };

  await renderLogic();
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
  setMediaType(cycle[currentType]);
  updateTypeFilterUI(cycle[currentType]);
  await loadAndRenderMovies(1);
}

async function handleSearchInput() {
  const searchTerm = dom.searchInput.value.trim();
  if (searchTerm === getState().activeFilters.searchTerm) return;
  
  if (searchTerm.length >= 3 || searchTerm.length === 0) {
    document.dispatchEvent(new CustomEvent("uiActionTriggered"));
    setSearchTerm(searchTerm);
    await loadAndRenderMovies(1);
  }
}

function setupHeaderListeners() {
  const debouncedSearch = debounce(handleSearchInput, CONFIG.SEARCH_DEBOUNCE_DELAY);
  dom.searchInput.addEventListener("input", debouncedSearch);
  dom.searchForm.addEventListener("submit", (e) => {
    e.preventDefault();
    handleSearchInput();
  });

  dom.sortSelect.addEventListener("change", handleSortChange);
  dom.typeFilterToggle.addEventListener("click", handleMediaTypeToggle);

  const navigatePage = async (direction) => {
    const currentPage = getCurrentPage();
    const totalPages = Math.ceil(getState().totalMovies / CONFIG.ITEMS_PER_PAGE);
    const newPage = currentPage + direction;
    if (newPage > 0 && newPage <= totalPages) {
      document.dispatchEvent(new CustomEvent("uiActionTriggered"));
      await loadAndRenderMovies(newPage);
    }
  };

  dom.headerPrevBtn.addEventListener("click", (e) => {
    triggerPopAnimation(e.currentTarget);
    navigatePage(-1);
  });
  dom.headerNextBtn.addEventListener("click", (e) => {
    triggerPopAnimation(e.currentTarget);
    navigatePage(1);
  });
}

function setupGlobalListeners() {
  document.addEventListener("click", (e) => {
    if (!e.target.closest(SELECTORS.SIDEBAR_FILTER_FORM)) clearAllSidebarAutocomplete();
    if (!e.target.closest(".sidebar")) collapseAllSections();
  });

  dom.paginationContainer.addEventListener("click", async (e) => {
    const button = e.target.closest(".btn[data-page]");
    if (button) {
      document.dispatchEvent(new CustomEvent("uiActionTriggered"));
      triggerPopAnimation(button);
      const page = parseInt(button.dataset.page, 10);
      await loadAndRenderMovies(page);
    }
  });

  dom.gridContainer.addEventListener("click", function(e) {
    const cardElement = e.target.closest(".movie-card");
    if (cardElement) {
      handleCardClick.call(cardElement, e);
      return;
    }
    const clearButton = e.target.closest("#clear-filters-from-empty");
    if (clearButton) {
      document.dispatchEvent(new CustomEvent("filtersReset"));
    }
  });

  initGridHoverSystem(dom.gridContainer);

  document.getElementById("quick-view-content").addEventListener("click", function(e) {
    handleCardClick.call(this, e);
  });
  
  dom.themeToggleButton.addEventListener("click", (e) => {
    triggerPopAnimation(e.currentTarget);
    document.dispatchEvent(new CustomEvent("uiActionTriggered"));
    const isDarkMode = document.documentElement.classList.toggle("dark-mode");
    localStorage.setItem("theme", isDarkMode ? "dark" : "light");
  });
  
  let isTicking = false;
  window.addEventListener("scroll", () => {
    if (!isTicking) {
      window.requestAnimationFrame(() => {
        const scrollY = window.scrollY;
        dom.backToTopButton.classList.toggle(CSS_CLASSES.SHOW, scrollY > 300);
        dom.mainHeader.classList.toggle(CSS_CLASSES.IS_SCROLLED, scrollY > 10);
        isTicking = false;
      });
      isTicking = true;
    }
  }, { passive: true });

  dom.backToTopButton.addEventListener("click", () => window.scrollTo({ top: 0, behavior: "smooth" }));

  const rewindButton = document.querySelector("#rewind-button");
  if (dom.sidebarOverlay && rewindButton) {
    dom.sidebarOverlay.addEventListener("click", () => rewindButton.click());
  }

  document.addEventListener("keydown", (e) => {
    if (
      e.key === "Escape" &&
      document.body.classList.contains(CSS_CLASSES.SIDEBAR_OPEN)
    ) {
      if (rewindButton) rewindButton.click();
    }
  });

  document.addEventListener("card:requestUpdate", (e) => {
    const { cardElement } = e.detail;
    if (cardElement) {
      updateCardUI(cardElement);
    }
  });
}

function setupAuthSystem() {
  const userAvatarInitials = document.getElementById("user-avatar-initials");
  const logoutButton = document.getElementById("logout-button");

  async function onLogin(user) {
    document.body.classList.add("user-logged-in");
    const userEmail = user.email || "";
    userAvatarInitials.textContent = userEmail.charAt(0).toUpperCase();
    userAvatarInitials.title = `Sesión iniciada como: ${userEmail}`;
    try {
      const data = await fetchUserMovieData();
      setUserMovieData(data);
      document.dispatchEvent(new CustomEvent("userDataUpdated"));
    } catch (error) {
      showToast(error.message, "error");
    }
  }

  function onLogout() {
    document.body.classList.remove("user-logged-in");
    userAvatarInitials.textContent = "";
    userAvatarInitials.title = "";
    clearUserMovieData();
    document.dispatchEvent(new CustomEvent("userDataUpdated"));
  }

  async function handleLogout() {
    const { error } = await supabase.auth.signOut();
    if (error) {
      console.error("Error al cerrar sesión:", error);
      showToast("No se pudo cerrar la sesión.", "error");
    }
  }

  if (logoutButton) {
    logoutButton.addEventListener("click", handleLogout);
  }

  supabase.auth.onAuthStateChange((_event, session) => {
    if (session && session.user) {
      onLogin(session.user);
    } else {
      onLogout();
    }
  });
}

function updatePageTitle() {
  const { searchTerm, genre, year, country, director, actor, selection } =
    getActiveFilters();
  let title = "Tu brújula cinéfila y seriéfila inteligente";
  if (searchTerm) {
    title = `Resultados para "${searchTerm}"`;
  } else if (genre) {
    title = `Películas de ${genre}`;
  } else if (director) {
    title = `Películas de ${director}`;
  } else if (actor) {
    title = `Películas con ${actor}`;
  } else if (year && year !== `${CONFIG.YEAR_MIN}-${CONFIG.YEAR_MAX}`) {
    title = `Películas de ${year.replace("-", " a ")}`;
  } else if (country) {
    title = `Películas de ${country}`;
  } else if (selection) {
    const names = {
      C: "Colección Criterion",
      M: "1001 Películas que ver",
      A: "Arrow Video",
      K: "Kino Lorber",
      E: "Eureka",
      H: "Series de HBO",
      N: "Originales de Netflix",
    };
    title = names[selection] || title;
  }
  document.title = `${title} | videoclub.digital`;
}

function readUrlAndSetState() {
  resetFiltersState();
  const params = new URLSearchParams(window.location.search);

  Object.entries(URL_PARAM_MAP).forEach(([shortKey, stateKey]) => {
    const value = params.get(shortKey);
    if (value !== null) {
      if (stateKey === "page") {
        setCurrentPage(parseInt(value, 10) || 1);
      } else if (stateKey === "searchTerm") {
        setSearchTerm(value);
      } else if (stateKey === "sort") {
        setSort(value);
      } else if (stateKey === "mediaType") {
        setMediaType(value);
      } else if (
        stateKey === "excludedGenres" ||
        stateKey === "excludedCountries"
      ) {
        setFilter(stateKey, value.split(","));
      } else {
        setFilter(stateKey, value);
      }
    }
  });

  if (!params.has(REVERSE_URL_PARAM_MAP.sort)) setSort(DEFAULTS.SORT);
  if (!params.has(REVERSE_URL_PARAM_MAP.mediaType))
    setMediaType(DEFAULTS.MEDIA_TYPE);
  if (!params.has(REVERSE_URL_PARAM_MAP.page)) setCurrentPage(1);

  const activeFilters = getActiveFilters();
  dom.searchInput.value = activeFilters.searchTerm;
  dom.sortSelect.value = activeFilters.sort;
  updateTypeFilterUI(activeFilters.mediaType);
}

function updateUrl() {
  const params = new URLSearchParams();
  const activeFilters = getActiveFilters();
  const currentPage = getCurrentPage();

  Object.entries(activeFilters).forEach(([key, value]) => {
    const shortKey = REVERSE_URL_PARAM_MAP[key];
    if (!shortKey) return;

    if (Array.isArray(value) && value.length > 0) {
      params.set(shortKey, value.join(","));
    } else if (typeof value === "string" && value.trim() !== "") {
      if (key === "mediaType" && value !== DEFAULTS.MEDIA_TYPE)
        params.set(shortKey, value);
      else if (key === "sort" && value !== DEFAULTS.SORT)
        params.set(shortKey, value);
      else if (
        key === "year" &&
        value !== `${CONFIG.YEAR_MIN}-${CONFIG.YEAR_MAX}`
      )
        params.set(shortKey, value);
      else if (!["mediaType", "sort", "year"].includes(key))
        params.set(shortKey, value);
    }
  });

  if (currentPage > 1) {
    params.set(REVERSE_URL_PARAM_MAP.page, currentPage);
  }

  const newUrl = params.toString()
    ? `${window.location.pathname}?${params.toString()}`
    : window.location.pathname;
  const currentStateUrl = window.location.search;

  if (newUrl !== `${window.location.pathname}${currentStateUrl}`) {
    history.pushState({ path: newUrl }, "", newUrl);
  }
}

function init() {
  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("/sw.js")
        .then(reg => console.log("Service Worker registrado.", reg))
        .catch(err => console.error("Fallo en registro de Service Worker:", err));
    });
  }

  window.addEventListener("popstate", () => {
    readUrlAndSetState();
    document.dispatchEvent(new CustomEvent("updateSidebarUI"));
    loadAndRenderMovies(getCurrentPage());
  });

  const handleDataRefresh = () => {
    console.log("%c[CACHE] Datos/Sesión cambiaron. Vaciando caché.", "color: #f57c00");
    queryCache.clear();
    document.querySelectorAll(".movie-card").forEach(updateCardUI);
  };

  document.addEventListener("userMovieDataChanged", handleDataRefresh);
  document.addEventListener("userDataUpdated", handleDataRefresh);

  document.addEventListener("filtersReset", (e) => {
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
  });

  initSidebar();
  initQuickView();
  setupHeaderListeners();
  initTouchDrawer();
  setupGlobalListeners();
  setupAuthSystem();
  setupAuthModal();
  initAuthForms();

  readUrlAndSetState();
  document.dispatchEvent(new CustomEvent("updateSidebarUI"));
  loadAndRenderMovies(getCurrentPage());
}

document.addEventListener("DOMContentLoaded", init);