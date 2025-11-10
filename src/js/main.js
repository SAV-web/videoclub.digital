// =================================================================
//                  SCRIPT PRINCIPAL Y ORQUESTADOR (v3.3)
// =================================================================
// v3.3 - Integra la invalidación de caché al cambiar los datos de usuario.
// v3.2 - Implementada la delegación de eventos para los clics en tarjetas.
// v3.1 - Implementada la cancelación de peticiones con AbortController.

import { CONFIG } from "./config.js";
import {
  debounce,
  triggerPopAnimation,
  getFriendlyErrorMessage,
  preloadLcpImage,
} from "./utils.js";
import { fetchMovies, queryCache } from "./api.js";
import {
  // DOM elements
  dom,
  // Card and Grid rendering
  renderMovieGrid,
  renderSkeletons,
  renderNoResults,
  renderErrorState,
  updateCardUI,
  // Pagination
  renderPagination,
  updateHeaderPaginationState,
  prefetchNextPage,
  // Quick View and Auth Modals
  initQuickView,
  setupAuthModal,
  // Other UI updates
  updateTypeFilterUI,
  updateTotalResultsUI,
  clearAllSidebarAutocomplete,
  // Import card-specific handlers for delegation
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

// Variable para gestionar el AbortController de las peticiones.
let currentRequestController;

// --- MAPAS DE URL ---
const URL_PARAM_MAP = {
  q: "searchTerm",
  genre: "genre",
  year: "year",
  country: "country",
  dir: "director",
  actor: "actor",
  sel: "selection",
  stu: "studio",
  sort: "sort",
  type: "mediaType",
  p: "page",
  exg: "excludedGenres",
  exc: "excludedCountries",
};
const REVERSE_URL_PARAM_MAP = Object.fromEntries(
  Object.entries(URL_PARAM_MAP).map(([key, value]) => [value, key])
);

// --- LÓGICA PRINCIPAL DE CARGA Y RENDERIZADO ---
export async function loadAndRenderMovies(page = 1) {
  if (currentRequestController) {
    currentRequestController.abort();
  }
  currentRequestController = new AbortController();

  setCurrentPage(page);
  updatePageTitle();
  updateUrl();

  const supportsViewTransitions = !!document.startViewTransition;

  const renderLogic = async () => {
    try {
      const pageSize =
        page === 1 ? CONFIG.DYNAMIC_PAGE_SIZE_LIMIT : CONFIG.ITEMS_PER_PAGE;
      const { items: movies, total: totalMovies } = await fetchMovies(
        getActiveFilters(),
        page,
        pageSize,
        currentRequestController.signal
      );

      if (movies && movies.length > 0) {
        preloadLcpImage(movies[0]);
      }

      updateDomWithResults(movies, totalMovies);
    } catch (error) {
      if (error.name === "AbortError") {
        console.log("Petición de películas cancelada deliberadamente.");
        throw error;
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
    if (!currentRequestController.signal.aborted) {
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

// --- MANEJADORES DE EVENTOS ---
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
  } else if (previousSearchTerm.length > 0) {
    document.dispatchEvent(new CustomEvent("uiActionTriggered"));
    setSearchTerm("");
    await loadAndRenderMovies(1);
  }
}

// --- CONFIGURACIÓN DE LISTENERS ---
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
  /**
   * Listener delegado para clics en todo el documento.
   * - Cierra los autocompletados y las secciones del sidebar si se hace clic fuera.
   */
  document.addEventListener("click", (e) => {
    // Si el clic no fue dentro de un formulario de filtro del sidebar, cierra todos los autocompletados.
    if (!e.target.closest(SELECTORS.SIDEBAR_FILTER_FORM)) {
      clearAllSidebarAutocomplete();
    }
    // Si el clic no fue dentro del sidebar, contrae todas las secciones.
    if (!e.target.closest(".sidebar")) {
      collapseAllSections();
    }
  });

  /**
   * Listener delegado para la paginación inferior.
   * Detecta clics en los botones de página y carga la página correspondiente.
   */
  dom.paginationContainer.addEventListener("click", async (e) => {
    const button = e.target.closest(SELECTORS.CLICKABLE_BTN);
    if (button && button.dataset.page) {
      document.dispatchEvent(new CustomEvent("uiActionTriggered"));
      triggerPopAnimation(button);
      const page = parseInt(button.dataset.page, 10);
      if (!isNaN(page)) {
        await loadAndRenderMovies(page);
        window.scrollTo({ top: 0, behavior: "smooth" });
      }
    }
  });

  /**
   * Listener delegado principal para toda el área de contenido.
   * Utiliza el patrón de "Event Delegation" para manejar todos los clics
   * en las tarjetas de películas y en la vista de "Sin Resultados" con un solo listener.
   * Es mucho más eficiente que añadir un listener a cada una de las 42 tarjetas.
   */
  dom.gridContainer.addEventListener("click", (e) => {
    // Busca si el clic ocurrió dentro de una tarjeta de película.
    const cardElement = e.target.closest(".movie-card");
    if (cardElement) {
      // Si es así, llama a la función `handleCardClick` pasando la tarjeta
      // como el contexto (`this`) y el evento.
      handleCardClick.call(cardElement, e);
      return; // Salimos para evitar otras comprobaciones.
    }

    // Busca si el clic ocurrió en el botón de "Limpiar filtros" de la vista de "Sin Resultados".
    const clearButton = e.target.closest("#clear-filters-from-empty");
    if (clearButton) {
      document.dispatchEvent(new CustomEvent("filtersReset"));
    }
  });

  // Se añade el mismo listener delegado al contenido de la modal de vista rápida.
  // Esto reutiliza toda la lógica de `handleCardClick` para los botones de la modal.
  document
    .getElementById("quick-view-content")
    .addEventListener("click", (e) => {
      const cardElement = e.currentTarget; // En este caso, el contenedor es el "cardElement"
      handleCardClick.call(cardElement, e);
    });

  /**
   * Listener para el botón de cambio de tema.
   */
  dom.themeToggleButton.addEventListener("click", (e) => {
    triggerPopAnimation(e.currentTarget);
    document.dispatchEvent(new CustomEvent("uiActionTriggered"));
    const isDarkMode = document.documentElement.classList.toggle("dark-mode");
    localStorage.setItem("theme", isDarkMode ? "dark" : "light");
  });

  /**
   * Listener de scroll optimizado con `requestAnimationFrame` para
   * gestionar la visibilidad del botón "Volver Arriba" y el estado "scrolled" del header.
   */
  let isTicking = false;
  let isHeaderScrolled = false;
  window.addEventListener(
    "scroll",
    () => {
      if (!isTicking) {
        window.requestAnimationFrame(() => {
          const scrollY = window.scrollY;
          // Muestra u oculta el botón "Back to Top".
          dom.backToTopButton.classList.toggle(CSS_CLASSES.SHOW, scrollY > 300);

          // Añade o quita la clase de "scrolled" al header para efectos visuales.
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

  /**
   * Listener para el botón de "Volver Arriba".
   */
  dom.backToTopButton.addEventListener("click", () =>
    window.scrollTo({ top: 0, behavior: "smooth" })
  );

  /**
   * Listeners para el overlay y la tecla Escape para cerrar el sidebar en móvil.
   */
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

  // =================================================================
  //  ▼▼▼ NUEVO LISTENER (PATRÓN EVENT BUS) ▼▼▼
  // =================================================================
  /**
   * Listener global para el evento personalizado 'card:requestUpdate'.
   * Desacopla el módulo `rating-stars` de `card`, permitiendo que cualquier
   * componente solicite una actualización de UI para una tarjeta específica.
   */
  document.addEventListener("card:requestUpdate", (e) => {
    // El elemento de la tarjeta que necesita ser actualizado viene en la propiedad 'detail' del evento.
    const { cardElement } = e.detail;
    if (cardElement) {
      // Llamamos a la función de actualización correspondiente.
      updateCardUI(cardElement);
    }
  });
}

// --- SISTEMA DE AUTENTICACIÓN Y DATOS DE USUARIO ---
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

// --- GESTIÓN DE URL Y TÍTULO DE PÁGINA ---
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

// --- FUNCIÓN DE INICIALIZACIÓN ---
function init() {
  // ==========================================================
  //  ▼▼▼ MEJORA: Registro del Service Worker ▼▼▼
  // ==========================================================
  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
      navigator.serviceWorker
        .register("/sw.js")
        .then((registration) => {
          console.log("Service Worker registrado con éxito:", registration);
        })
        .catch((error) => {
          console.log("Fallo en el registro del Service Worker:", error);
        });
    });
  }
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

  // Listener para invalidación de caché cuando un dato de usuario cambia
  document.addEventListener("userMovieDataChanged", (e) => {
    console.log(
      "%c[CACHE INVALIDATION] Datos de usuario cambiaron. Vaciando caché.",
      "color: #f57c00"
    );
    queryCache.clear();

    // Actualiza solo la tarjeta afectada para una respuesta visual instantánea
    const { movieId } = e.detail;
    if (!movieId) return;
    const cardElement = document.querySelector(
      `.movie-card[data-movie-id="${movieId}"]`
    );
    if (cardElement) {
      updateCardUI(cardElement);
    }
  });

  // Listener para invalidación de caché y actualización masiva de UI en login/logout
  document.addEventListener("userDataUpdated", () => {
    console.log(
      "%c[CACHE INVALIDATION] Sesión de usuario cambió. Vaciando caché.",
      "color: #f57c00"
    );
    queryCache.clear();

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
