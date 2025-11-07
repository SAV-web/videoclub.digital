// =================================================================
//                  SCRIPT PRINCIPAL Y ORQUESTADOR (v3.3 - AbortController)
// =================================================================
// v3.3 - Implementado AbortController para una cancelación de peticiones robusta.
//        - Se elimina el sistema de requestId.
// =================================================================

import { CONFIG } from "./config.js";
import {
  debounce,
  triggerPopAnimation,
  getFriendlyErrorMessage,
  preloadLcpImage,
} from "./utils.js";
import { fetchMovies } from "./api.js";
import {
  dom,
  renderMovieGrid,
  renderSkeletons,
  renderNoResults,
  renderErrorState,
  updateCardUI,
  renderPagination,
  updateHeaderPaginationState,
  prefetchNextPage,
  initQuickView,
  setupAuthModal,
  updateTypeFilterUI,
  updateTotalResultsUI,
  clearAllSidebarAutocomplete,
  handleCardClick,
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
import { showToast } from "./toast.js";
import { initSidebar, collapseAllSections } from "./components/sidebar.js";
import { initTouchDrawer } from "./components/touch-drawer.js";
import { supabase } from "./supabaseClient.js";
import { initAuthForms } from "./auth.js";
import { fetchUserMovieData } from "./api-user.js";

// --- MAPAS DE URL ---
const URL_PARAM_MAP = {
  q: "searchTerm",
  genre: "genre",
  year: "year",
  country: "country",
  dir: "director",
  actor: "actor",
  sel: "selection",
  sort: "sort",
  type: "mediaType",
  p: "page",
  exg: "excludedGenres",
  exc: "excludedCountries",
};
const REVERSE_URL_PARAM_MAP = Object.fromEntries(
  Object.entries(URL_PARAM_MAP).map(([key, value]) => [value, key])
);

// ▼▼▼ MEJORA 1: Variable a nivel de módulo para gestionar el AbortController. ▼▼▼
let currentRequestController;

// --- LÓGICA PRINCIPAL DE CARGA Y RENDERIZADO ---
export async function loadAndRenderMovies(page = 1) {
  // ▼▼▼ MEJORA 2: CANCELACIÓN. Si hay una petición en curso, la abortamos. ▼▼▼
  if (currentRequestController) {
    currentRequestController.abort();
  }

  // ▼▼▼ MEJORA 3: CREACIÓN. Creamos un nuevo controlador para la nueva petición. ▼▼▼
  currentRequestController = new AbortController();

  setCurrentPage(page);
  updatePageTitle();
  updateUrl();

  const supportsViewTransitions = !!document.startViewTransition;

  const renderLogic = async () => {
    try {
      const pageSize =
        page === 1 ? CONFIG.DYNAMIC_PAGE_SIZE_LIMIT : CONFIG.ITEMS_PER_PAGE;

      // ▼▼▼ MEJORA 4: SEÑAL. Pasamos la señal del controlador a la API. ▼▼▼
      const { items: movies, total: totalMovies } = await fetchMovies(
        getActiveFilters(),
        page,
        pageSize,
        currentRequestController.signal // <-- Aquí se pasa la señal
      );

      if (movies && movies.length > 0) {
        preloadLcpImage(movies[0]);
      }
      
      // La validación de requestId ya no es necesaria.
      updateDomWithResults(movies, totalMovies);
      
    } catch (error) {
      // Si el error es un 'AbortError', fue una cancelación intencionada. Lo ignoramos.
      if (error.name === "AbortError") {
        console.log("Petición de películas cancelada deliberadamente.");
        throw error; // Propagamos para que la transición de vista se detenga correctamente.
      }
      console.error("Error en el proceso de carga:", error);
      const friendlyMessage = getFriendlyErrorMessage(error);
      showToast(friendlyMessage, "error");
      renderErrorState(
        dom.gridContainer,
        dom.paginationContainer,
        friendlyMessage
      );
      throw error;
    }
  };

  if (supportsViewTransitions) {
    if (page === 1) { // Condición simplificada para mostrar esqueletos solo en la primera carga/filtro.
      renderSkeletons(dom.gridContainer, dom.paginationContainer);
    }
    await document.startViewTransition(renderLogic).ready;
  } else {
    dom.gridContainer.setAttribute("aria-busy", "true");
    renderSkeletons(dom.gridContainer, dom.paginationContainer);
    updateHeaderPaginationState(getCurrentPage(), 0);
    await renderLogic();
    dom.gridContainer.setAttribute("aria-busy", "false");
  }
}

// ... (El resto del fichero main.js no necesita cambios)

function updateDomWithResults(movies, totalMovies) {
  setTotalMovies(totalMovies);
  updateTotalResultsUI(totalMovies, hasActiveMeaningfulFilters());

  const currentState = getState();

  if (currentState.totalMovies === 0) {
    renderNoResults(
      dom.gridContainer,
      dom.paginationContainer,
      getActiveFilters()
    );
    updateHeaderPaginationState(1, 0);
  } else if (
    currentState.totalMovies <= CONFIG.DYNAMIC_PAGE_SIZE_LIMIT &&
    currentState.currentPage === 1
  ) {
    renderMovieGrid(dom.gridContainer, movies);
    dom.paginationContainer.textContent = "";
    updateHeaderPaginationState(1, 1);
  } else {
    const moviesForPage = movies.slice(0, CONFIG.ITEMS_PER_PAGE);
    renderMovieGrid(dom.gridContainer, moviesForPage);
    renderPagination(
      dom.paginationContainer,
      currentState.totalMovies,
      currentState.currentPage
    );
    updateHeaderPaginationState(
      currentState.currentPage,
      currentState.totalMovies
    );
  }

  if (currentState.totalMovies > 0) {
    prefetchNextPage(
      currentState.currentPage,
      currentState.totalMovies,
      getActiveFilters()
    );
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
  const newType = cycle[currentType];
  setMediaType(newType);
  updateTypeFilterUI(newType);
  await loadAndRenderMovies(1);
}

async function handleSearchInput() {
  const searchTerm = dom.searchInput.value.trim();
  const previousSearchTerm = getState().activeFilters.searchTerm;

  if (searchTerm === previousSearchTerm) {
    return;
  }
  
  if (searchTerm.length >= 3) {
    document.dispatchEvent(new CustomEvent("uiActionTriggered"));
    setSearchTerm(searchTerm);
    await loadAndRenderMovies(1);
  }
  else if (previousSearchTerm.length > 0) {
    document.dispatchEvent(new CustomEvent("uiActionTriggered"));
    setSearchTerm("");
    await loadAndRenderMovies(1);
  }
}

function setupHeaderListeners() {
  const debouncedSearch = debounce(
    handleSearchInput,
    CONFIG.SEARCH_DEBOUNCE_DELAY
  );
  dom.searchInput.addEventListener("input", debouncedSearch);
  dom.searchForm.addEventListener("submit", (e) => {
    e.preventDefault();
    handleSearchInput();
  });

  dom.sortSelect.addEventListener("change", handleSortChange);
  dom.typeFilterToggle.addEventListener("click", handleMediaTypeToggle);

  dom.headerPrevBtn.addEventListener("click", async (e) => {
    triggerPopAnimation(e.currentTarget);
    if (getCurrentPage() > 1) {
      document.dispatchEvent(new CustomEvent("uiActionTriggered"));
      await loadAndRenderMovies(getCurrentPage() - 1);
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  });
  dom.headerNextBtn.addEventListener("click", async (e) => {
    triggerPopAnimation(e.currentTarget);
    const totalPages = Math.ceil(
      getState().totalMovies / CONFIG.ITEMS_PER_PAGE
    );
    if (getCurrentPage() < totalPages) {
      document.dispatchEvent(new CustomEvent("uiActionTriggered"));
      await loadAndRenderMovies(getCurrentPage() + 1);
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  });
}

function setupKeyboardShortcuts() {
  document.addEventListener("keydown", (e) => {
    const activeElement = document.activeElement;
    const isTyping =
      activeElement.tagName === "INPUT" ||
      activeElement.tagName === "TEXTAREA" ||
      activeElement.isContentEditable;

    if (e.key === "Escape") {
      if (activeElement === dom.searchInput && dom.searchInput.value !== "") {
        e.preventDefault();
        dom.searchInput.value = "";
        handleSearchInput();
      } else if (isTyping) {
        activeElement.blur();
      }
    }
    if (isTyping) return;
    switch (e.key) {
      case "/":
        e.preventDefault();
        dom.searchInput.focus();
        break;
      case "k":
        if (dom.headerNextBtn && !dom.headerNextBtn.disabled)
          dom.headerNextBtn.click();
        break;
      case "j":
        if (dom.headerPrevBtn && !dom.headerPrevBtn.disabled)
          dom.headerPrevBtn.click();
        break;
    }
  });
}

function setupGlobalListeners() {
  document.addEventListener("click", (e) => {
    if (!e.target.closest(SELECTORS.SIDEBAR_FILTER_FORM))
      clearAllSidebarAutocomplete();
    if (!e.target.closest(".sidebar")) collapseAllSections();
  });

  dom.paginationContainer.addEventListener("click", async (e) => {
    const button = e.target.closest(SELECTORS.CLICKABLE_BTN);
    if (button && button.dataset.page) {
      document.dispatchEvent(new CustomEvent("uiActionTriggerred"));
      triggerPopAnimation(button);
      const page = parseInt(button.dataset.page, 10);
      if (!isNaN(page)) {
        await loadAndRenderMovies(page);
        window.scrollTo({ top: 0, behavior: "smooth" });
      }
    }
  });

  dom.gridContainer.addEventListener("click", (e) => {
    const cardElement = e.target.closest(".movie-card");
    const clearButton = e.target.closest("#clear-filters-from-empty");

    if (cardElement) {
      handleCardClick.call(cardElement, e);
    } else if (clearButton) {
      document.dispatchEvent(new CustomEvent("filtersReset"));
    }
  });

  dom.themeToggleButton.addEventListener("click", (e) => {
    triggerPopAnimation(e.currentTarget);
    document.dispatchEvent(new CustomEvent("uiActionTriggered"));
    const isDarkMode = document.documentElement.classList.toggle("dark-mode");
    localStorage.setItem("theme", isDarkMode ? "dark" : "light");
  });

  let isTicking = false;
  let isHeaderScrolled = false;
  window.addEventListener(
    "scroll",
    () => {
      if (!isTicking) {
        window.requestAnimationFrame(() => {
          const scrollY = window.scrollY;
          dom.backToTopButton.classList.toggle(CSS_CLASSES.SHOW, scrollY > 300);
          if (scrollY > 10 && !isHeaderScrolled) {
            isHeaderScrolled = true;
            dom.mainHeader.classList.add(CSS_CLASSES.IS_SCROLLED);
          } else if (scrollY < 5 && isHeaderScrolled) {
            isHeaderScrolled = false;
            dom.mainHeader.classList.remove(CSS_CLASSES.IS_SCROLLED);
          }
          isTicking = false;
        });
        isTicking = true;
      }
    },
    { passive: true }
  );

  dom.backToTopButton.addEventListener("click", () =>
    window.scrollTo({ top: 0, behavior: "smooth" })
  );

  const rewindButton = document.querySelector("#rewind-button");
  if (dom.sidebarOverlay && rewindButton) {
    dom.sidebarOverlay.addEventListener("click", () => rewindButton.click());
  }

  document.addEventListener("keydown", (e) => {
    if (
      e.key === "Escape" &&
      document.body.classList.contains(CSS_CLASSES.SIDEBAR_OPEN)
    ) {
      const rewindButton = document.querySelector("#rewind-button");
      if (rewindButton) rewindButton.click();
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
      hbo: "Series de HBO",
      criterion: "Colección Criterion",
      miluno: "1001 Películas que ver",
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
  window.addEventListener("storage", (e) => {
    if (e.key === "theme") {
      document.body.classList.toggle("dark-mode", e.newValue === "dark");
    }
  });

  if (localStorage.getItem("rotationState") === "disabled") {
    document.body.classList.add("rotation-disabled");
    const toggleBtn = document.getElementById("toggle-rotation-btn");
    if (toggleBtn) {
      toggleBtn.innerHTML = ICONS.SQUARE_STOP;
      toggleBtn.setAttribute("aria-label", "Activar rotación de tarjetas");
    }
  }

  window.addEventListener("popstate", () => {
    readUrlAndSetState();
    document.dispatchEvent(new CustomEvent("updateSidebarUI"));
    loadAndRenderMovies(getCurrentPage());
  });

  initSidebar();
  initQuickView();
  setupHeaderListeners();
  initTouchDrawer();
  setupGlobalListeners();
  setupKeyboardShortcuts();
  setupAuthSystem();
  setupAuthModal();
  initAuthForms();

  readUrlAndSetState();
  document.dispatchEvent(new CustomEvent("updateSidebarUI"));
  loadAndRenderMovies(getCurrentPage());

  document.addEventListener("userMovieDataChanged", (e) => {
    const { movieId } = e.detail;
    if (!movieId) return;

    const cardElement = document.querySelector(
      `.movie-card[data-movie-id="${movieId}"]`
    );
    if (cardElement) {
      updateCardUI(cardElement);
    }
  });

  document.addEventListener("userDataUpdated", () => {
    document.querySelectorAll(".movie-card").forEach((cardElement) => {
      updateCardUI(cardElement);
    });
  });

  document.addEventListener("filtersReset", (e) => {
    const { keepSort, newFilter } = e.detail || {};
    const currentSort = keepSort
      ? getState().activeFilters.sort
      : DEFAULTS.SORT;
    resetFiltersState();
    setSort(currentSort);
    if (newFilter) {
      setFilter(newFilter.type, newFilter.value);
    }
    dom.searchInput.value = "";
    dom.sortSelect.value = currentSort;
    updateTypeFilterUI(DEFAULTS.MEDIA_TYPE);
    document.dispatchEvent(new CustomEvent("updateSidebarUI"));
    loadAndRenderMovies(1);
  });
}

document.addEventListener("DOMContentLoaded", init);