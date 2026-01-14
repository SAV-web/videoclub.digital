// src/js/main.js
import { CONFIG, CSS_CLASSES, SELECTORS, DEFAULTS, STUDIO_DATA, FILTER_CONFIG } from "./constants.js";
import { debounce, triggerPopAnimation, getFriendlyErrorMessage, preloadLcpImage, createAbortableRequest, triggerHapticFeedback, LocalStore } from "./utils.js";
import { fetchMovies, supabase, fetchUserMovieData } from "./api.js";
import { dom, renderPagination, updateHeaderPaginationState, prefetchNextPage, setupAuthModal, updateTypeFilterUI, updateTotalResultsUI, clearAllSidebarAutocomplete, showToast, initThemeToggle } from "./ui.js";
import { getState, getActiveFilters, getCurrentPage, setCurrentPage, setTotalMovies, setFilter, setSearchTerm, setSort, setMediaType, resetFiltersState, hasActiveMeaningfulFilters, setUserMovieData, clearUserMovieData } from "./state.js";
import { renderMovieGrid, updateCardUI, handleCardClick, initCardInteractions, renderSkeletons, renderNoResults, renderErrorState } from "./components/card.js";

// --- Lazy Modules State ---
let sidebarModule = null;

async function loadSidebar() {
  if (sidebarModule) return sidebarModule;
  try {
    sidebarModule = await import("./components/sidebar.js");
    sidebarModule.initSidebar(); // Inicializar listeners al cargar
    return sidebarModule;
  } catch (e) { console.error("Error loading sidebar", e); }
}

// Mapeo de parámetros URL a Estado interno
const URL_PARAM_MAP = { 
  q: "searchTerm", genre: "genre", year: "year", country: "country", 
  dir: "director", actor: "actor", sel: "selection", stu: "studio", 
  sort: "sort", type: "mediaType", p: "page", 
  exg: "excludedGenres", exc: "excludedCountries" 
};
const REVERSE_URL_PARAM_MAP = Object.fromEntries(Object.entries(URL_PARAM_MAP).map(([key, value]) => [value, key]));

/**
 * Carga y renderiza la rejilla de películas.
 * Gestiona estados de carga, errores y transiciones.
 */
export async function loadAndRenderMovies(page = 1) {
  const controller = createAbortableRequest('movie-grid-load');
  const signal = controller.signal;

  setCurrentPage(page);
  updatePageTitle();
  updateUrl(); // Sincronizar URL antes de cargar

  // Estado de carga visual
  document.body.classList.add('is-fetching');
  dom.gridContainer.classList.add('is-fetching');
  dom.gridContainer.setAttribute("aria-busy", "true");
  
  // Renderizado optimista: Esqueletos + Paginación conocida
  renderSkeletons(dom.gridContainer, dom.paginationContainer);
  const currentKnownTotal = getState().totalMovies;
  updateHeaderPaginationState(getCurrentPage(), currentKnownTotal);
  
  // Scroll al inicio siempre al cambiar de página
  window.scrollTo({ top: 0, behavior: "auto" });

  const supportsViewTransitions = !!document.startViewTransition;

  const renderLogic = async () => {
    try {
      // Primera página carga más elementos para llenar pantallas grandes
      const pageSize = page === 1 ? CONFIG.DYNAMIC_PAGE_SIZE_LIMIT : CONFIG.ITEMS_PER_PAGE;
      
      // Smart Count: Solo pedir total si no lo tenemos o es la primera página (para refrescar)
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

      // Precarga LCP (Largest Contentful Paint) para la primera imagen
      if (movies && movies.length > 0) preloadLcpImage(movies[0]);
      
      const performRender = () => {
        // Usar total retornado o mantener el conocido si no se pidió actualización
        // NOTA: El backend devuelve -1 cuando get_count=false para optimizar rendimiento.
        // En ese caso, confiamos en el estado local (currentKnownTotal).
        const effectiveTotal = returnedTotal >= 0 ? returnedTotal : currentKnownTotal;
        updateDomWithResults(movies, effectiveTotal);
        
        // FIX MÓVIL: Forzar scroll arriba tras renderizar si el teclado desplazó la vista
        if (page === 1 && window.innerWidth <= 700) {
           window.scrollTo({ top: 0, behavior: "auto" });
        }
      };

      // Usar View Transitions API si está disponible para suavidad nativa
      if (supportsViewTransitions) document.startViewTransition(performRender);
      else performRender();

    } catch (error) {
      if (error.name === "AbortError") return;
      console.error("Error en carga (Main):", error);
      
      const msg = getFriendlyErrorMessage(error);
      if (msg) showToast(msg, "error");
      renderErrorState(dom.gridContainer, dom.paginationContainer, msg || "Error desconocido");
      
      // Re-lanzar para que sidebar.js pueda revertir filtros optimistas
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

/**
 * Actualiza el DOM con los resultados obtenidos.
 * Gestiona casos de vacío, paginación y precarga.
 */
function updateDomWithResults(movies, totalMovies) {
  // Actualizar siempre el total para asegurar consistencia UI tras invalidación
  setTotalMovies(totalMovies);
  updateTotalResultsUI(totalMovies, hasActiveMeaningfulFilters());
  
  const currentState = getState();

  if (currentState.totalMovies === 0) {
    renderNoResults(dom.gridContainer, dom.paginationContainer, getActiveFilters());
    updateHeaderPaginationState(1, 0);
  } else if (currentState.totalMovies <= CONFIG.DYNAMIC_PAGE_SIZE_LIMIT && currentState.currentPage === 1) {
    // Caso: Todos los resultados caben en una página
    renderMovieGrid(dom.gridContainer, movies);
    dom.paginationContainer.textContent = "";
    updateHeaderPaginationState(1, 1);
  } else {
    // Caso: Paginación necesaria
    const limit = CONFIG.ITEMS_PER_PAGE; 
    const moviesToRender = movies.slice(0, limit); // Recortar exceso de "fetch" dinámico
    renderMovieGrid(dom.gridContainer, moviesToRender);
    
    if (currentState.totalMovies > limit) {
      renderPagination(dom.paginationContainer, currentState.totalMovies, currentState.currentPage);
    } else {
      dom.paginationContainer.textContent = "";
    }
    updateHeaderPaginationState(currentState.currentPage, currentState.totalMovies);
  }

  // Precarga inteligente de la siguiente página
  if (currentState.totalMovies > 0) {
    prefetchNextPage(currentState.currentPage, currentState.totalMovies, getActiveFilters());
  }
}

// --- Manejadores de Eventos de UI ---

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
  
  // Buscar solo si hay 3+ caracteres o se borró todo
  if (searchTerm.length >= 3 || searchTerm.length === 0) {
    document.dispatchEvent(new CustomEvent("uiActionTriggered"));
    
    const filtersCleared = setSearchTerm(searchTerm);
    if (filtersCleared) {
      showToast("Filtros de Actor/Director limpiados", "info");
    }

    document.dispatchEvent(new CustomEvent("updateSidebarUI"));
    await loadAndRenderMovies(1);
  }
}

// --- Gestión Global de Scroll (Optimizado) ---
let isTicking = false;
let lastScrollY = 0;

function handleGlobalScroll() {
  if (!isTicking) {
    window.requestAnimationFrame(() => {
      const currentScrollY = window.scrollY;
      
      // 1. Efecto Sombra/Borde en Header
      dom.mainHeader.classList.toggle(CSS_CLASSES.IS_SCROLLED, currentScrollY > 10);

      // 2. Smart Hide (Barra inferior móvil)
      if (window.innerWidth <= 700) {
        const isSearchActive = document.activeElement === dom.searchInput;
        // Detectar teclado: si el viewport visual es significativamente menor que la ventana (iOS style)
        const isKeyboardOpen = window.visualViewport && (window.visualViewport.height < window.innerHeight * 0.9);

        if (isSearchActive || dom.mainHeader.classList.contains("is-search-focused") || isKeyboardOpen) {
          dom.mainHeader.classList.remove('is-hidden-mobile');
        } else {
          const isScrollingDown = currentScrollY > lastScrollY;
          const scrollDifference = Math.abs(currentScrollY - lastScrollY);
          const isAtBottom = (window.innerHeight + currentScrollY) >= (document.documentElement.scrollHeight - 50);

          if (isAtBottom) {
            // Siempre mostrar al llegar al final
            dom.mainHeader.classList.remove('is-hidden-mobile');
          } else if (scrollDifference > 5) {
            // Ocultar al bajar, mostrar al subir
            dom.mainHeader.classList.toggle('is-hidden-mobile', isScrollingDown && currentScrollY > 60);
          }
        }
      }

      lastScrollY = currentScrollY;
      isTicking = false;
    });
    isTicking = true;
  }
}

// --- Reset de Filtros ---
function handleFiltersReset(e) {
  const { keepSort, newFilter } = e.detail || {};
  const currentSort = keepSort ? getState().activeFilters.sort : DEFAULTS.SORT;
  
  resetFiltersState();
  setSort(currentSort);
  
  // Aplicar nuevo filtro si viene en el evento (ej: click en director)
  if (newFilter) setFilter(newFilter.type, newFilter.value);
  
  // Actualizar UI
  dom.searchInput.value = "";
  dom.sortSelect.value = currentSort;
  updateTypeFilterUI(DEFAULTS.MEDIA_TYPE);
  document.dispatchEvent(new CustomEvent("updateSidebarUI"));
  
  loadAndRenderMovies(1);
}

// --- Configuración de Listeners ---

function setupHeaderListeners() {
  const debouncedSearch = debounce(handleSearchInput, CONFIG.SEARCH_DEBOUNCE_DELAY);
  dom.searchInput.addEventListener("input", debouncedSearch);
  dom.searchForm.addEventListener("submit", (e) => { e.preventDefault(); handleSearchInput(); });
  
  // UX Búsqueda Móvil (Expandir/Colapsar)
  dom.searchInput.addEventListener("focus", () => dom.mainHeader.classList.add("is-search-focused"));
  dom.searchInput.addEventListener("blur", () => dom.mainHeader.classList.remove("is-search-focused"));

  dom.sortSelect.addEventListener("change", handleSortChange);
  dom.typeFilterToggle.addEventListener("click", handleMediaTypeToggle);

  // Toggle Sidebar Móvil (Lazy Load)
  const mobileSidebarToggle = document.getElementById('mobile-sidebar-toggle');
  if (mobileSidebarToggle) {
    mobileSidebarToggle.addEventListener('click', async () => {
      // Cargar módulo si no existe
      const mod = await loadSidebar();
      if (!mod) return;
      triggerHapticFeedback('light');
      const isOpen = document.body.classList.contains('sidebar-is-open');
      isOpen ? mod.closeMobileDrawer() : mod.openMobileDrawer();
    });
  }

  // Navegación Paginación Header
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

  // Botón "X" Limpiar Búsqueda
  const clearSearchBtn = dom.searchForm.querySelector('.search-icon--clear');
  if (clearSearchBtn) {
    // FIX: Usar pointerdown para unificar mouse/touch y prevenir blur de forma robusta en Android
    clearSearchBtn.addEventListener('pointerdown', (e) => {
      e.preventDefault(); // Evita que el input pierda el foco
      e.stopPropagation();
      dom.searchInput.value = '';
      dom.searchInput.focus();
      handleSearchInput(); 
    });
  }

  // Placeholder Responsivo
  const updateSearchPlaceholder = () => {
    if (dom.searchInput) dom.searchInput.placeholder = window.innerWidth <= 700 ? "" : "Título";
  };
  window.addEventListener("resize", updateSearchPlaceholder);
  updateSearchPlaceholder();
}

function setupGlobalListeners() {
  // Cierres al hacer click fuera
  document.addEventListener("click", (e) => {
    if (!e.target.closest(SELECTORS.SIDEBAR_FILTER_FORM)) clearAllSidebarAutocomplete();
    if (!e.target.closest(".sidebar") && sidebarModule) sidebarModule.collapseAllSections();
  });

  // Delegación de eventos Grid (Cards)
  dom.gridContainer.addEventListener("click", function(e) {
    const cardElement = e.target.closest(".movie-card");
    if (cardElement) { handleCardClick.call(cardElement, e); return; }
    
    // Botón "Limpiar Filtros" en estado vacío
    if (e.target.closest("#clear-filters-from-empty")) {
      document.dispatchEvent(new CustomEvent("filtersReset"));
    }
  });
  
  // Interacciones Card (Hover, Tap)
  initCardInteractions(dom.gridContainer);
  
  // Quick View Delegation
  document.getElementById("quick-view-content").addEventListener("click", function(e) { 
    handleCardClick.call(this, e); 
  });
  
  // Paginación Footer
  dom.paginationContainer.addEventListener("click", async (e) => {
    const button = e.target.closest(".btn[data-page]");
    if (button) {
      document.dispatchEvent(new CustomEvent("uiActionTriggered"));
      triggerPopAnimation(button);
      const page = parseInt(button.dataset.page, 10);
      await loadAndRenderMovies(page);
    }
  });

  // Scroll Global Unificado
  lastScrollY = window.scrollY;
  window.addEventListener("scroll", handleGlobalScroll, { passive: true });
  
  // Teclado
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && document.body.classList.contains(CSS_CLASSES.SIDEBAR_OPEN)) { 
      // Prioridad: Si hay un modal abierto, el sidebar no debe cerrarse (el modal lo hará)
      if (document.body.classList.contains("modal-open")) return;
      
      if (sidebarModule) sidebarModule.closeMobileDrawer();
    }
  });

  // Eventos Personalizados de la App
  document.addEventListener("card:requestUpdate", (e) => { if (e.detail.cardElement) updateCardUI(e.detail.cardElement); });
  const handleDataRefresh = () => document.querySelectorAll(".movie-card").forEach(updateCardUI);
  document.addEventListener("userMovieDataChanged", handleDataRefresh);
  document.addEventListener("userDataUpdated", handleDataRefresh);
  document.addEventListener("filtersReset", handleFiltersReset);
}

// --- Autenticación ---
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
    if (error) { console.error("Logout error:", error); showToast("Error al cerrar sesión.", "error"); }
  }
  
  if (logoutButton) logoutButton.addEventListener("click", handleLogout);
  supabase.auth.onAuthStateChange((_event, session) => {
    if (session?.user) onLogin(session.user); else onLogout();
  });
}

// --- Gestión de URL y Título ---
function updatePageTitle() {
  const { searchTerm, genre, year, country, director, actor, selection, studio, mediaType } = getActiveFilters();
  
  let baseNoun = "Películas y series";
  if (mediaType === "movies") baseNoun = "Películas";
  else if (mediaType === "series") baseNoun = "Series";

  let title = baseNoun;
  const yearSuffix = (year && year !== `${CONFIG.YEAR_MIN}-${CONFIG.YEAR_MAX}`) 
    ? ` (${year.replace("-", " a ")})` : "";

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
      else if (stateKey === "excludedGenres" || stateKey === "excludedCountries") setFilter(stateKey, value.split(","), true);
      else setFilter(stateKey, value, true);
    }
  });
  
  // Defaults si no hay params
  if (!params.has(REVERSE_URL_PARAM_MAP.sort)) setSort(DEFAULTS.SORT);
  if (!params.has(REVERSE_URL_PARAM_MAP.mediaType)) setMediaType(DEFAULTS.MEDIA_TYPE);
  if (!params.has(REVERSE_URL_PARAM_MAP.page)) setCurrentPage(1);
  
  // Sincronizar UI
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
      // Ignorar valores por defecto
      if (key === "mediaType" && value === DEFAULTS.MEDIA_TYPE) return;
      if (key === "sort" && value === DEFAULTS.SORT) return;
      if (key === "year" && value === `${CONFIG.YEAR_MIN}-${CONFIG.YEAR_MAX}`) return;
      
      params.set(shortKey, value);
    }
  });
  
  if (currentPage > 1) params.set(REVERSE_URL_PARAM_MAP.page, currentPage);
  
  const newUrl = params.toString() ? `${window.location.pathname}?${params.toString()}` : window.location.pathname;
  if (newUrl !== `${window.location.pathname}${window.location.search}`) {
    history.pushState({ path: newUrl }, "", newUrl);
  }
}

// --- Inicialización ---
function init() {
  // GESTIÓN ANTI-FOUC GENÉRICA
  // Elimina atributo data-loading para activar transiciones CSS
  requestAnimationFrame(() => {
    document.querySelectorAll('[data-loading]').forEach(el => {
      el.removeAttribute('data-loading');
    });
  });

  // Restaurar estado de rotación (Modo Muro) antes de renderizar para evitar saltos visuales
  if (LocalStore.get("rotationState") === "disabled") {
    document.body.classList.add("rotation-disabled");
  }

  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("sw.js").catch(err => console.error("Fallo SW:", err));
    });
  }
  
  window.addEventListener("popstate", async () => {
    // Import dinámico para cerrar modal (si está cargado es instantáneo)
    const { closeModal } = await import("./components/modal.js");
    closeModal();
    
    readUrlAndSetState();
    document.dispatchEvent(new CustomEvent("updateSidebarUI"));
    loadAndRenderMovies(getCurrentPage());
  });
  
  // Carga diferida del Sidebar (Desktop necesita filtros, Móvil no tanto)
  // Usamos requestIdleCallback para no bloquear el renderizado inicial de la grid
  const idleLoad = window.requestIdleCallback || ((cb) => setTimeout(cb, 1000));
  idleLoad(() => loadSidebar());

  // initQuickView se elimina de aquí, se llama al abrir la primera ficha en card.js
  
  initThemeToggle();
  setupHeaderListeners();
  setupGlobalListeners();
  setupAuthSystem();
  setupAuthModal();
  
  // Carga diferida de lógica de autenticación (Solo si el usuario intenta entrar)
  const loginBtn = document.getElementById("login-button");
  if (loginBtn) {
    loginBtn.addEventListener("click", async () => {
      try {
        const { initAuthForms } = await import("./auth.js");
        initAuthForms();
      } catch (e) { console.error("Error loading auth module", e); }
    }, { once: true });
  }
  
  readUrlAndSetState();
  document.dispatchEvent(new CustomEvent("updateSidebarUI"));
  loadAndRenderMovies(getCurrentPage());
}

document.addEventListener("DOMContentLoaded", init);