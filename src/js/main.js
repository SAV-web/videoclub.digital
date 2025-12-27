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

const URL_PARAM_MAP = { q: "searchTerm", genre: "genre", year: "year", country: "country", dir: "director", actor: "actor", sel: "selection", stu: "studio", sort: "sort", type: "mediaType", p: "page", exg: "excludedGenres", exc: "excludedCountries" };
const REVERSE_URL_PARAM_MAP = Object.fromEntries(Object.entries(URL_PARAM_MAP).map(([key, value]) => [value, key]));

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
  
  // Usamos el total conocido para pintar paginación mientras carga (Optimistic UI)
  const currentKnownTotal = getState().totalMovies;
  updateHeaderPaginationState(getCurrentPage(), currentKnownTotal);
  
  window.scrollTo({ top: 0, behavior: "auto" });

  const supportsViewTransitions = !!document.startViewTransition;

  const renderLogic = async () => {
    try {
      const pageSize = page === 1 ? CONFIG.DYNAMIC_PAGE_SIZE_LIMIT : CONFIG.ITEMS_PER_PAGE;
      
      // LÓGICA SMART COUNT: Solo pedimos COUNT si es pág 1 o no sabemos el total
      const shouldRequestCount = (page === 1) || (currentKnownTotal === 0);

      const result = await fetchMovies(
        getActiveFilters(),
        page,
        pageSize,
        signal,
        shouldRequestCount
      );

      if (result.aborted) return;

      const { items: movies, total: returnedTotal } = result;

      if (movies && movies.length > 0) preloadLcpImage(movies[0]);
      
      const performRender = () => {
        // Si returnedTotal es -1 (no se pidió), usamos el que ya teníamos
        const effectiveTotal = returnedTotal >= 0 ? returnedTotal : currentKnownTotal;
        updateDomWithResults(movies, effectiveTotal);
        
        // FIX: En móvil, al buscar con el teclado abierto, el navegador a veces desplaza el scroll.
        // Forzamos scroll arriba de nuevo tras renderizar para asegurar que los resultados sean visibles.
        if (page === 1 && window.innerWidth <= 700) {
           window.scrollTo({ top: 0, behavior: "auto" });
        }
      };

      if (supportsViewTransitions) document.startViewTransition(performRender);
      else performRender();

    } catch (error) {
      if (error.name === "AbortError") return;
      console.error("Error en carga (Main):", error); // MIRA LA CONSOLA SI FALLA
      
      const msg = getFriendlyErrorMessage(error);
      
      // 1. Mostrar feedback visual PRIMERO (antes de romper el flujo)
      if (msg) showToast(msg, "error");
      renderErrorState(dom.gridContainer, dom.paginationContainer, msg || "Error desconocido");
      
      // 2. Ahora sí, re-lanzamos el error para que sidebar.js pueda revertir filtros
      if (msg) throw new Error(msg); 
    } finally {
      if (!signal.aborted) {
        document.body.classList.remove('is-fetching');
        dom.gridContainer.classList.remove('is-fetching');
        dom.gridContainer.setAttribute("aria-busy", "false");
      }
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
  dom.searchForm.addEventListener("submit", (e) => { e.preventDefault(); handleSearchInput(); });
  
  dom.searchInput.addEventListener("focus", () => {
    dom.mainHeader.classList.add("is-search-focused");
  });
  dom.searchInput.addEventListener("blur", () => {
    dom.mainHeader.classList.remove("is-search-focused");
  });

  dom.sortSelect.addEventListener("change", handleSortChange);
  dom.typeFilterToggle.addEventListener("click", handleMediaTypeToggle);

  const mobileSidebarToggle = document.getElementById('mobile-sidebar-toggle');
  if (mobileSidebarToggle) {
    mobileSidebarToggle.addEventListener('click', () => {
      triggerHapticFeedback('light');
      const isOpen = document.body.classList.contains('sidebar-is-open');
      if (isOpen) closeMobileDrawer();
      else openMobileDrawer();
    });
  }

  const navigatePage = async (direction) => {
    const currentPage = getCurrentPage();
    const totalPages = Math.ceil(getState().totalMovies / CONFIG.ITEMS_PER_PAGE);
    const newPage = currentPage + direction;
    if (newPage > 0 && newPage <= totalPages) {
      document.dispatchEvent(new CustomEvent("uiActionTriggered"));
      await loadAndRenderMovies(newPage);
    }
  };
  dom.headerPrevBtn.addEventListener("click", (e) => { triggerPopAnimation(e.currentTarget); navigatePage(-1); });
  dom.headerNextBtn.addEventListener("click", (e) => { triggerPopAnimation(e.currentTarget); navigatePage(1); });

  // Listener para el botón de limpiar búsqueda (Lupa con aspa)
  const clearSearchBtn = dom.searchForm.querySelector('.search-icon--clear');
  if (clearSearchBtn) {
    const performClear = (e) => {
      // Prevenir pérdida de foco y eventos duplicados
      if (e.cancelable) e.preventDefault();
      e.stopPropagation();
      
      dom.searchInput.value = '';
      dom.searchInput.focus(); // Mantener foco para seguir escribiendo
      handleSearchInput(); // Actualizar resultados (volver a mostrar todo)
    };

    // Mousedown evita el blur en desktop, Touchstart asegura respuesta en móvil
    clearSearchBtn.addEventListener('mousedown', (e) => e.preventDefault());
    clearSearchBtn.addEventListener('touchstart', performClear, { passive: false });
    clearSearchBtn.addEventListener('click', performClear);
  }

  // Placeholder responsivo: Vacío en móvil (icono), "Título" en escritorio
  const updateSearchPlaceholder = () => {
    if (dom.searchInput) dom.searchInput.placeholder = window.innerWidth <= 700 ? "" : "Título";
  };
  window.addEventListener("resize", updateSearchPlaceholder);
  updateSearchPlaceholder();
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
    if (cardElement) { handleCardClick.call(cardElement, e); return; }
    const clearButton = e.target.closest("#clear-filters-from-empty");
    if (clearButton) document.dispatchEvent(new CustomEvent("filtersReset"));
  });
  initCardInteractions(dom.gridContainer);
  document.getElementById("quick-view-content").addEventListener("click", function(e) { handleCardClick.call(this, e); });
  let isTicking = false;
  let lastScrollY = window.scrollY;

  window.addEventListener("scroll", () => {
    if (!isTicking) {
      window.requestAnimationFrame(() => {
        const currentScrollY = window.scrollY;
        
        // 1. Estado Scrolled (Sombra/Borde)
        dom.mainHeader.classList.toggle(CSS_CLASSES.IS_SCROLLED, currentScrollY > 10);

        // 2. Lógica Smart Hide para Móvil (Ocultar al bajar, Mostrar al subir)
        if (window.innerWidth <= 700) {
          const isScrollingDown = currentScrollY > lastScrollY;
          const scrollDifference = Math.abs(currentScrollY - lastScrollY);
          // Detectar si estamos cerca del final (buffer de 50px) para mostrar siempre el header
          const isAtBottom = (window.innerHeight + currentScrollY) >= (document.documentElement.scrollHeight - 50);

          if (isAtBottom) {
            dom.mainHeader.classList.remove('is-hidden-mobile');
          } else if (scrollDifference > 5) {
            // Ocultar si bajamos y ya hemos pasado el inicio (60px)
            if (isScrollingDown && currentScrollY > 60) {
              dom.mainHeader.classList.add('is-hidden-mobile');
            } else {
              dom.mainHeader.classList.remove('is-hidden-mobile');
            }
          }
        }

        lastScrollY = currentScrollY;
        isTicking = false;
      });
      isTicking = true;
    }
  }, { passive: true });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && document.body.classList.contains(CSS_CLASSES.SIDEBAR_OPEN)) { closeMobileDrawer(); }
  });
  document.addEventListener("card:requestUpdate", (e) => { if (e.detail.cardElement) updateCardUI(e.detail.cardElement); });
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
    } catch (error) { showToast(error.message, "error"); }
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
    if (error) { console.error("Error al cerrar sesión:", error); showToast("No se pudo cerrar la sesión.", "error"); }
  }
  if (logoutButton) logoutButton.addEventListener("click", handleLogout);
  supabase.auth.onAuthStateChange((_event, session) => {
    if (session && session.user) onLogin(session.user); else onLogout();
  });
}

function updatePageTitle() {
  const { searchTerm, genre, year, country, director, actor, selection, studio, mediaType } = getActiveFilters();
  
  let baseNoun = "Películas y series";
  if (mediaType === "movies") baseNoun = "Películas";
  else if (mediaType === "series") baseNoun = "Series";

  let title = baseNoun;

  const yearSuffix = (year && year !== `${CONFIG.YEAR_MIN}-${CONFIG.YEAR_MAX}`) 
    ? ` (${year.replace("-", " a ")})` 
    : "";

  if (searchTerm) title = `Resultados para "${searchTerm}"`;
  else if (selection) {
    const config = FILTER_CONFIG.selection;
    const name = config.titles?.[selection] || config.items[selection];
    if (name) title = name + yearSuffix;
  } else if (studio) {
    title = (STUDIO_DATA[studio]?.title || title) + yearSuffix;
  }
  else if (genre) title = `${baseNoun} de ${genre}`;
  else if (director) title = `${baseNoun} de ${director}`;
  else if (actor) title = `${baseNoun} con ${actor}`;
  else if (year && year !== `${CONFIG.YEAR_MIN}-${CONFIG.YEAR_MAX}`) title = `${baseNoun} de ${year.replace("-", " a ")}`;
  else if (country) title = `${baseNoun} de ${country}`;
  document.title = `${title} | videoclub.digital`;
}

function readUrlAndSetState() {
  resetFiltersState();
  const params = new URLSearchParams(window.location.search);
  Object.entries(URL_PARAM_MAP).forEach(([shortKey, stateKey]) => {
    const value = params.get(shortKey);
    if (value !== null) {
      if (stateKey === "page") setCurrentPage(parseInt(value, 10) || 1);
      else if (stateKey === "searchTerm") setSearchTerm(value);
      else if (stateKey === "sort") setSort(value);
      else if (stateKey === "mediaType") setMediaType(value);
      else if (stateKey === "excludedGenres" || stateKey === "excludedCountries") setFilter(stateKey, value.split(","));
      else setFilter(stateKey, value);
    }
  });
  if (!params.has(REVERSE_URL_PARAM_MAP.sort)) setSort(DEFAULTS.SORT);
  if (!params.has(REVERSE_URL_PARAM_MAP.mediaType)) setMediaType(DEFAULTS.MEDIA_TYPE);
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
    if (Array.isArray(value) && value.length > 0) params.set(shortKey, value.join(","));
    else if (typeof value === "string" && value.trim() !== "") {
      if (key === "mediaType" && value !== DEFAULTS.MEDIA_TYPE) params.set(shortKey, value);
      else if (key === "sort" && value !== DEFAULTS.SORT) params.set(shortKey, value);
      else if (key === "year" && value !== `${CONFIG.YEAR_MIN}-${CONFIG.YEAR_MAX}`) params.set(shortKey, value);
      else if (!["mediaType", "sort", "year"].includes(key)) params.set(shortKey, value);
    }
  });
  if (currentPage > 1) params.set(REVERSE_URL_PARAM_MAP.page, currentPage);
  const newUrl = params.toString() ? `${window.location.pathname}?${params.toString()}` : window.location.pathname;
  if (newUrl !== `${window.location.pathname}${window.location.search}`) history.pushState({ path: newUrl }, "", newUrl);
}

function init() {
  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("public/sw.js").catch(err => console.error("Fallo SW:", err));
    });
  }
  window.addEventListener("popstate", () => {
    closeModal();
    readUrlAndSetState();
    document.dispatchEvent(new CustomEvent("updateSidebarUI"));
    loadAndRenderMovies(getCurrentPage());
  });
  const handleDataRefresh = () => {
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
  initThemeToggle();
  setupHeaderListeners();
  setupGlobalListeners();
  setupAuthSystem();
  setupAuthModal();
  initAuthForms();
  readUrlAndSetState();
  document.dispatchEvent(new CustomEvent("updateSidebarUI"));
  loadAndRenderMovies(getCurrentPage());
}

document.addEventListener("DOMContentLoaded", init);