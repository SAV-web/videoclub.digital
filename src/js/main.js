// =================================================================
//
//              SCRIPT PRINCIPAL Y ORQUESTADOR (v4.0)
//
// =================================================================
//
//  FICHERO:  src/js/main.js
//  AUTOR:    Tu Mentor Experto
//  VERSIÓN:  4.0
//
//  RESPONSABILIDADES:
//    - Orquestar la inicialización de todos los módulos de la aplicación.
//    - Gestionar el flujo principal de carga y renderizado de películas.
//    - Centralizar y delegar los eventos de UI más importantes.
//    - Sincronizar el estado de la aplicación con la URL del navegador.
//    - Manejar el ciclo de vida de la autenticación de usuario y sus datos.
//
//  HISTORIAL DE CAMBIOS:
//    v4.0 - REFACTOR ARQUITECTÓNICO: Se adopta el nuevo `requestManager` para una
//           gestión de peticiones cancelables declarativa, centralizada y robusta,
//           eliminando la gestión de estado manual del AbortController.
//    v3.3 - Integrada la invalidación de caché al cambiar datos de usuario.
//    v3.2 - Implementada la delegación de eventos para clics en tarjetas.
//
// =================================================================

import "../css/main.css"; // Importación de CSS manejada por Vite
import "flag-icons/css/flag-icons.min.css";
import { CONFIG } from "./config.js";
import { debounce, triggerPopAnimation, getFriendlyErrorMessage, preloadLcpImage } from "./utils.js";
import { fetchMovies, queryCache } from "./api.js";
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
// ✨ NUEVA IMPORTACIÓN: El gestor de peticiones cancelables.
import { createAbortableRequest } from './utils/requestManager.js';

// --- GESTIÓN DE PETICIONES ---
// ❌ ELIMINADO: La variable global `currentRequestController` ya no es necesaria.

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

/**
 * Orquesta todo el proceso de carga y renderizado de la parrilla de películas.
 * Es la función más importante de la aplicación.
 * @param {number} [page=1] - La página de resultados a cargar.
 */
export async function loadAndRenderMovies(page = 1) {
  // ✨ LÓGICA REFACTORIZADA: De forma declarativa, creamos una nueva petición
  // cancelable para la carga de la parrilla. Nuestro gestor se encarga
  // automáticamente de cancelar cualquier petición 'movie-grid-load' anterior.
  const controller = createAbortableRequest('movie-grid-load');
  const signal = controller.signal;

  setCurrentPage(page);
  updatePageTitle();
  updateUrl();

  const supportsViewTransitions = !!document.startViewTransition;

  const renderLogic = async () => {
    try {
      const pageSize = page === 1 ? CONFIG.DYNAMIC_PAGE_SIZE_LIMIT : CONFIG.ITEMS_PER_PAGE;
      
      // Pasamos la señal de cancelación a la función de fetch.
      const { items: movies, total: totalMovies } = await fetchMovies(
        getActiveFilters(),
        page,
        pageSize,
        signal
      );

      // Si la petición no fue cancelada, procedemos a renderizar.
      if (!signal.aborted) {
        if (movies && movies.length > 0) {
          preloadLcpImage(movies[0]);
        }
        updateDomWithResults(movies, totalMovies);
      }
    } catch (error) {
      // Si el error es de cancelación, es un comportamiento esperado y no hacemos nada.
      if (error.name === "AbortError") {
        console.log("Petición de películas cancelada deliberadamente.");
        return; // Detenemos la ejecución de forma segura.
      }
      // Para cualquier otro error, lo manejamos y lo mostramos al usuario.
      console.error("Error en el proceso de carga:", error);
      const friendlyMessage = getFriendlyErrorMessage(error);
      showToast(friendlyMessage, "error");
      renderErrorState(dom.gridContainer, dom.paginationContainer, friendlyMessage);
    }
  };

  if (supportsViewTransitions && !signal.aborted) {
    renderSkeletons(dom.gridContainer, dom.paginationContainer);
    document.startViewTransition(renderLogic);
  } else {
    dom.gridContainer.setAttribute("aria-busy", "true");
    renderSkeletons(dom.gridContainer, dom.paginationContainer);
    updateHeaderPaginationState(getCurrentPage(), 0);
    await renderLogic();
    dom.gridContainer.setAttribute("aria-busy", "false");
  }
}

/**
 * Actualiza el DOM con los resultados obtenidos de la API.
 * @param {Array} movies - El array de películas.
 * @param {number} totalMovies - El número total de resultados.
 */
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
    const moviesForPage = movies.slice(0, CONFIG.ITEMS_PER_PAGE);
    renderMovieGrid(dom.gridContainer, moviesForPage);
    renderPagination(dom.paginationContainer, currentState.totalMovies, currentState.currentPage);
    updateHeaderPaginationState(currentState.currentPage, currentState.totalMovies);
  }

  if (currentState.totalMovies > 0) {
    prefetchNextPage(currentState.currentPage, currentState.totalMovies, getActiveFilters());
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

// --- CONFIGURACIÓN DE LISTENERS ---

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
      window.scrollTo({ top: 0, behavior: "smooth" });
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
  // Listener delegado para clics fuera de elementos activos (sidebar, autocomplete).
  document.addEventListener("click", (e) => {
    if (!e.target.closest(SELECTORS.SIDEBAR_FILTER_FORM)) clearAllSidebarAutocomplete();
    if (!e.target.closest(".sidebar")) collapseAllSections();
  });

  // Listener delegado para la paginación inferior.
  dom.paginationContainer.addEventListener("click", async (e) => {
    const button = e.target.closest(".btn[data-page]");
    if (button) {
      document.dispatchEvent(new CustomEvent("uiActionTriggered"));
      triggerPopAnimation(button);
      const page = parseInt(button.dataset.page, 10);
      await loadAndRenderMovies(page);
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  });

  // ✨ ARQUITECTURA LIMPIA: Un único listener delegado para toda la parrilla.
  // Es mucho más performante que añadir un listener a cada tarjeta.
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

  // Reutilizamos la misma lógica para la modal de vista rápida.
  document.getElementById("quick-view-content").addEventListener("click", function(e) {
    handleCardClick.call(this, e);
  });
  
    // Este listener se encarga de la funcionalidad del botón de cambio de tema.
  dom.themeToggleButton.addEventListener("click", (e) => {
    triggerPopAnimation(e.currentTarget);
    document.dispatchEvent(new CustomEvent("uiActionTriggered"));
    // Alterna la clase en `documentElement` (la etiqueta <html>)
    const isDarkMode = document.documentElement.classList.toggle("dark-mode");
    // Guarda la preferencia en el almacenamiento local para persistencia.
    localStorage.setItem("theme", isDarkMode ? "dark" : "light");
  });
  
  // Listener de scroll optimizado con `requestAnimationFrame`.
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

  // ✨ ARQUITECTURA BASADA EN EVENTOS (Event Bus)
  // Escuchamos eventos personalizados para desacoplar los módulos.
  document.addEventListener("card:requestUpdate", (e) => {
    if (e.detail.cardElement) updateCardUI(e.detail.cardElement);
  });

  // ✨ OPTIMIZACIÓN: Unificamos la lógica de refresco de UI por cambios de datos
  const handleDataRefresh = () => {
    console.log("%c[CACHE] Datos/Sesión cambiaron. Vaciando caché.", "color: #f57c00");
    queryCache.clear(); // Invalida búsquedas previas porque el estado de 'visto/nota' ha cambiado
    document.querySelectorAll(".movie-card").forEach(updateCardUI); // Actualiza visualmente lo que ya está en pantalla
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

  // Inicialización de todos los módulos.
  initSidebar();
  initQuickView();
  setupHeaderListeners();
  initTouchDrawer();
  setupGlobalListeners();
  // setupKeyboardShortcuts(); // Descomentar si se implementa
  setupAuthSystem();
  setupAuthModal();
  initAuthForms();

  // Carga inicial de la aplicación.
  readUrlAndSetState();
  document.dispatchEvent(new CustomEvent("updateSidebarUI"));
  loadAndRenderMovies(getCurrentPage());
}

document.addEventListener("DOMContentLoaded", init);
