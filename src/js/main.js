// src/js/main.js
import "../css/main.css";
import { CONFIG, CSS_CLASSES, SELECTORS, DEFAULTS, STUDIO_DATA, FILTER_CONFIG } from "./constants.js";
import { debounce, triggerPopAnimation, getFriendlyErrorMessage, preloadLcpImage, createAbortableRequest, triggerHapticFeedback, LocalStore } from "./utils.js";
import { fetchMovies, supabase, fetchUserMovieData } from "./api.js";
import { dom, renderPagination, updateHeaderPaginationState, prefetchNextPage, setupAuthModal, updateTypeFilterUI, updateTotalResultsUI, clearAllSidebarAutocomplete, showToast, initThemeToggle } from "./ui.js";
import { getState, getActiveFilters, getCurrentPage, setCurrentPage, setTotalMovies, setFilter, setSearchTerm, setSort, setMediaType, resetFiltersState, hasActiveMeaningfulFilters, setUserMovieData, clearUserMovieData } from "./state.js";

// --- Lazy Modules State ---
let sidebarModule = null;
let isAuthInitialized = false;

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
  exg: "excludedGenres", exc: "excludedCountries",
  list: "myList"
};
const REVERSE_URL_PARAM_MAP = Object.fromEntries(Object.entries(URL_PARAM_MAP).map(([key, value]) => [value, key]));

// Detección de soporte View Transitions (Constante)
const SUPPORTS_VIEW_TRANSITIONS = !!document.startViewTransition;

// Helper para Code Splitting (Lazy Load de Card Component)
const loadCardModule = () => import("./components/card.js");

/**
 * Carga y renderiza la rejilla de películas.
 * Gestiona estados de carga, errores y transiciones.
 */
export async function loadAndRenderMovies(page = 1, { replaceHistory = false, forceSkeleton = false } = {}) {
  const controller = createAbortableRequest('movie-grid-load');
  const signal = controller.signal;

  setCurrentPage(page);
  updatePageTitle();
  updateUrl({ replace: replaceHistory }); // Sincronizar URL (Push o Replace según contexto)

  // Estado de carga visual
  document.body.classList.add(CSS_CLASSES.IS_FETCHING);
  dom.gridContainer.classList.add(CSS_CLASSES.IS_FETCHING);
  dom.gridContainer.setAttribute("aria-busy", "true");

  // Iniciar carga del módulo de tarjetas en paralelo (Code Splitting)
  const cardModulePromise = loadCardModule();
  
  // Renderizado de Skeletons diferido (150ms) para evitar parpadeo en cargas rápidas
  let skeletonTimeout;
  if (forceSkeleton) {
    const { renderSkeletons } = await cardModulePromise;
    renderSkeletons(dom.gridContainer, dom.paginationContainer);
  } else {
    // Detectar calidad de red para ajustar el delay (Progressive Enhancement)
    // Si es lenta, mostramos skeleton antes. Si es rápida, esperamos para evitar parpadeo.
    const connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
    const effectiveType = connection?.effectiveType || '4g';
    const skeletonDelay = {
      'slow-2g': 0, '2g': 50, '3g': 100, '4g': 150
    }[effectiveType] || 150;

    skeletonTimeout = setTimeout(async () => {
      const { renderSkeletons } = await cardModulePromise;
      renderSkeletons(dom.gridContainer, dom.paginationContainer);
    }, skeletonDelay);
  }

  const currentKnownTotal = getState().totalMovies;
  updateHeaderPaginationState(getCurrentPage(), currentKnownTotal);
  
  try {
    // Primera página carga más elementos para llenar pantallas grandes
    const isWallMode = document.body.classList.contains(CSS_CLASSES.ROTATION_DISABLED);
    const basePageSize = isWallMode ? CONFIG.WALL_MODE_ITEMS_PER_PAGE : CONFIG.ITEMS_PER_PAGE;
    const firstPageLimit = isWallMode ? CONFIG.WALL_MODE_DYNAMIC_PAGE_SIZE_LIMIT : CONFIG.DYNAMIC_PAGE_SIZE_LIMIT;
    
    const pageSize = page === 1 ? firstPageLimit : basePageSize;
    
    // Smart Count: Solo pedir total si no lo tenemos o es la primera página (para refrescar)
    const shouldRequestCount = (page === 1) || (currentKnownTotal === 0);

    const result = await fetchMovies(
      getActiveFilters(),
      page,
      pageSize,
      signal,
      shouldRequestCount
    );

    // Cancelar skeletons si la respuesta llegó rápido (antes de 150ms)
    if (skeletonTimeout) clearTimeout(skeletonTimeout);

    if (result.aborted) return;

    const { items: movies, total: returnedTotal } = result;

    // Precarga LCP (Largest Contentful Paint) para la primera imagen
    if (movies && movies.length > 0) preloadLcpImage(movies[0]);
      
    // Asegurar que el módulo de tarjetas esté listo antes de renderizar
    const cardModule = await cardModulePromise;

    const performRender = () => {
      // Backend devuelve -1 si no se pidió conteo (get_count=false)
      const effectiveTotal = returnedTotal >= 0 ? returnedTotal : currentKnownTotal;
      updateDomWithResults(movies, effectiveTotal, cardModule);
      
      // Scroll al top unificado (Paginación + Fix teclado móvil)
      window.scrollTo({ top: 0, behavior: "auto" });
    };

    // Usar View Transitions API si está disponible para suavidad nativa
    if (SUPPORTS_VIEW_TRANSITIONS) document.startViewTransition(performRender);
    else performRender();

  } catch (error) {
    if (skeletonTimeout) clearTimeout(skeletonTimeout); // Asegurar limpieza en error
    if (error.name === "AbortError") return;
    console.error("Error en carga (Main):", error);
    
    const msg = getFriendlyErrorMessage(error);
    if (msg) showToast(msg, "error");
    const { renderErrorState } = await cardModulePromise;
    renderErrorState(dom.gridContainer, dom.paginationContainer, msg || "Error desconocido");
    
    // Re-lanzar para que sidebar.js pueda revertir filtros optimistas
    if (msg) throw new Error(msg); 
  } finally {
    if (!signal.aborted) {
      document.body.classList.remove(CSS_CLASSES.IS_FETCHING);
      dom.gridContainer.classList.remove(CSS_CLASSES.IS_FETCHING);
      dom.gridContainer.setAttribute("aria-busy", "false");
    }
  }
}

/**
 * Actualiza el DOM con los resultados obtenidos.
 * Gestiona casos de vacío, paginación y precarga.
 */
function updateDomWithResults(movies, totalMovies, cardModule) {
  const { renderMovieGrid, renderNoResults, renderSkeletons, runFlipOnboarding } = cardModule;
  // Actualizar siempre el total para asegurar consistencia UI tras invalidación
  setTotalMovies(totalMovies);
  updateTotalResultsUI(totalMovies, hasActiveMeaningfulFilters());
  
  const { currentPage } = getState();

  if (totalMovies === 0) {
    // FIX: Evitar "No resultados" momentáneo al cargar "Mi Lista" antes de verificar sesión/datos
    if (getActiveFilters().myList && !isAuthInitialized) {
      renderSkeletons(dom.gridContainer, dom.paginationContainer);
      return;
    }

    renderNoResults(dom.gridContainer, dom.paginationContainer, getActiveFilters());
    updateHeaderPaginationState(1, 0);
  } else if (totalMovies <= CONFIG.DYNAMIC_PAGE_SIZE_LIMIT && currentPage === 1) {
    // Caso: Todos los resultados caben en una página
    renderMovieGrid(dom.gridContainer, movies);
    dom.paginationContainer.textContent = "";
    updateHeaderPaginationState(1, 1);
  } else {
    // Caso: Paginación necesaria
    const isWallMode = document.body.classList.contains(CSS_CLASSES.ROTATION_DISABLED);
    const limit = isWallMode ? CONFIG.WALL_MODE_ITEMS_PER_PAGE : CONFIG.ITEMS_PER_PAGE;
    // Slice optimizado: evitar copia de array si no es necesaria
    const moviesToRender = movies.length > limit ? movies.slice(0, limit) : movies;
    renderMovieGrid(dom.gridContainer, moviesToRender);
    
    if (totalMovies > limit) {
      renderPagination(dom.paginationContainer, totalMovies, currentPage);
    } else {
      dom.paginationContainer.textContent = "";
    }
    updateHeaderPaginationState(currentPage, totalMovies);
  }

  // Onboarding: Enseñar mecánica de flip en la primera visita (Página 1)
  if (currentPage === 1 && totalMovies > 0) {
    runFlipOnboarding(dom.gridContainer);
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
    // UX: Usar replaceState para búsqueda (evitar ensuciar historial al escribir)
    await loadAndRenderMovies(1, { replaceHistory: true });
  }
}

// --- Gestión Global de Scroll (Optimizado) ---
let isTicking = false;
let lastScrollY = 0;
let scrollTimer = null;

function handleGlobalScroll() {
  // 0. Scroll-aware UI: Activar modo rendimiento al empezar a scrollear
  if (!document.body.classList.contains(CSS_CLASSES.IS_SCROLLING)) {
    document.body.classList.add(CSS_CLASSES.IS_SCROLLING);
  }
  
  // Debounce: Desactivar modo rendimiento tras 250ms de inactividad
  if (scrollTimer) clearTimeout(scrollTimer);
  scrollTimer = setTimeout(() => {
    document.body.classList.remove(CSS_CLASSES.IS_SCROLLING);
    
    // Prefetch Predictivo: Si el usuario se detiene (mira) cerca del final (>70%)
    const scrollPos = window.scrollY + window.innerHeight;
    const docHeight = document.documentElement.scrollHeight;
    
    if (docHeight > 0 && scrollPos / docHeight > 0.7) {
      const { currentPage, totalMovies, activeFilters } = getState();
      prefetchNextPage(currentPage, totalMovies, activeFilters);
    }
  }, 250);

  if (!isTicking) {
    window.requestAnimationFrame(() => {
      const currentScrollY = window.scrollY;
      
      // 1. Efecto Sombra/Borde en Header
      dom.mainHeader.classList.toggle(CSS_CLASSES.IS_SCROLLED, currentScrollY > 10);

      // 2. Smart Hide (Barra inferior móvil)
      if (window.innerWidth <= 768 || window.innerHeight <= 500) {
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
  if (dom.searchInput) dom.searchInput.value = "";
  if (dom.sortSelect) dom.sortSelect.value = currentSort;
  updateTypeFilterUI(DEFAULTS.MEDIA_TYPE);
  document.dispatchEvent(new CustomEvent("updateSidebarUI"));
  
  loadAndRenderMovies(1, { forceSkeleton: true }); // Reset es una acción discreta -> PushState (default)
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
  if (dom.mobileSidebarToggle) {
    dom.mobileSidebarToggle.addEventListener('click', async () => {
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
    const isWallMode = document.body.classList.contains(CSS_CLASSES.ROTATION_DISABLED);
    const totalPages = Math.ceil(getState().totalMovies / (isWallMode ? CONFIG.WALL_MODE_ITEMS_PER_PAGE : CONFIG.ITEMS_PER_PAGE));
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
      e.preventDefault(); // Gestión manual del foco
      e.stopPropagation();
      
      if (dom.searchInput.value) {
        dom.searchInput.value = '';
        dom.searchInput.focus();
        handleSearchInput(); 
      } else {
        dom.searchInput.blur();
      }
    });
  }

  // Placeholder Responsivo
  const updateSearchPlaceholder = () => {
    if (dom.searchInput) dom.searchInput.placeholder = window.innerWidth <= 768 ? "" : "Título";
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
  dom.gridContainer.addEventListener("click", async function(e) {
    const cardElement = e.target.closest(".movie-card");
    if (cardElement) { 
      const { handleCardClick } = await loadCardModule();
      handleCardClick.call(cardElement, e); 
      return; 
    }
    
    // Botón "Limpiar Filtros" en estado vacío
    if (e.target.closest("#clear-filters-from-empty")) {
      document.dispatchEvent(new CustomEvent("filtersReset"));
    }
  });
  
  // Interacciones Card (Hover, Tap)
  loadCardModule().then(({ initCardInteractions }) => {
    initCardInteractions(dom.gridContainer);
  });
  
  // Quick View Delegation
  document.getElementById("quick-view-content").addEventListener("click", async function(e) { 
    const { handleCardClick } = await loadCardModule();
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
      if (document.body.classList.contains(CSS_CLASSES.MODAL_OPEN)) return;
      
      if (sidebarModule) sidebarModule.closeMobileDrawer();
    }
  });

  // Eventos Personalizados de la App
  document.addEventListener("card:requestUpdate", async (e) => { 
    if (e.detail.cardElement) {
      const { updateCardUI } = await loadCardModule();
      updateCardUI(e.detail.cardElement); 
    }
  });
  const handleDataRefresh = async () => {
    const { updateCardUI } = await loadCardModule();
    document.querySelectorAll(".movie-card").forEach(updateCardUI);
  };
  document.addEventListener("userMovieDataChanged", handleDataRefresh);
  
  document.addEventListener("userDataUpdated", () => {
    handleDataRefresh();
    if (getActiveFilters().myList) {
      loadAndRenderMovies(getCurrentPage());
    }
  });
  document.addEventListener("filtersReset", handleFiltersReset);
}

// --- Autenticación ---
function setupAuthSystem() {
  const userAvatarInitials = document.getElementById("user-avatar-initials");
  const logoutButton = document.getElementById("logout-button");
  const loginButton = document.getElementById("login-button");
  const userSessionGroup = document.getElementById("user-session-group");
  
  async function onLogin(user) {
    document.body.classList.add(CSS_CLASSES.USER_LOGGED_IN);
    // Gestión explícita de atributos hidden para anular estilos globales
    if (loginButton) loginButton.hidden = true;
    if (userSessionGroup) userSessionGroup.hidden = false;

    const userEmail = user.email || "";
    userAvatarInitials.textContent = userEmail.charAt(0).toUpperCase();
    userAvatarInitials.title = `Sesión iniciada como: ${userEmail}`;
    try {
      const data = await fetchUserMovieData();
      setUserMovieData(data);
      document.dispatchEvent(new CustomEvent("userDataUpdated"));
    } catch (error) { showToast(error.message, "error"); }
    finally { isAuthInitialized = true; }
  }
  
  function onLogout() {
    document.body.classList.remove(CSS_CLASSES.USER_LOGGED_IN);
    // Restaurar estado inicial
    if (loginButton) loginButton.hidden = false;
    if (userSessionGroup) userSessionGroup.hidden = true;

    userAvatarInitials.textContent = "";
    userAvatarInitials.title = "";
    clearUserMovieData();
    document.dispatchEvent(new CustomEvent("userDataUpdated"));
    isAuthInitialized = true;
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
  const { searchTerm, genre, year, country, director, actor, selection, studio, mediaType, myList } = getActiveFilters();
  
  let baseNoun = "Películas y series";
  if (mediaType === "movies") baseNoun = "Películas";
  else if (mediaType === "series") baseNoun = "Series";

  let title = baseNoun;
  const yearSuffix = (year && year !== `${CONFIG.YEAR_MIN}-${CONFIG.YEAR_MAX}`) 
    ? ` (${year.replace("-", " a ")})` : "";

  if (myList) title = `Mi Lista`;
  else if (searchTerm) title = `Resultados para "${searchTerm}"`;
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
      else if (stateKey === "myList") {
        // Compatibilidad hacia atrás: "true" -> "mixed"
        setFilter(stateKey, value === "true" ? "mixed" : value, true);
      }
      else setFilter(stateKey, value, true);
    }
  });
  
  // Defaults si no hay params
  if (!params.has(REVERSE_URL_PARAM_MAP.sort)) setSort(DEFAULTS.SORT);
  if (!params.has(REVERSE_URL_PARAM_MAP.mediaType)) setMediaType(DEFAULTS.MEDIA_TYPE);
  if (!params.has(REVERSE_URL_PARAM_MAP.page)) setCurrentPage(1);
  
  // Sincronizar UI
  const activeFilters = getActiveFilters();
  if (dom.searchInput) dom.searchInput.value = activeFilters.searchTerm || "";
  dom.sortSelect.value = activeFilters.sort;
  updateTypeFilterUI(activeFilters.mediaType);
}

function updateUrl({ replace = false } = {}) {
  const params = new URLSearchParams();
  const activeFilters = getActiveFilters();
  const currentPage = getCurrentPage();
  
  Object.entries(activeFilters).forEach(([key, value]) => {
    const shortKey = REVERSE_URL_PARAM_MAP[key];
    if (!shortKey) return;
    
    if (Array.isArray(value) && value.length > 0) params.set(shortKey, value.join(","));
    else if (key === "myList" && value) params.set(shortKey, value);
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
    if (replace) {
      history.replaceState({ path: newUrl }, "", newUrl);
    } else {
      history.pushState({ path: newUrl }, "", newUrl);
    }
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
    document.body.classList.add(CSS_CLASSES.ROTATION_DISABLED);
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
    // Al navegar por historial (Atrás/Adelante), no debemos hacer push, solo reemplazar para normalizar si es necesario
    loadAndRenderMovies(getCurrentPage(), { replaceHistory: true });
  });
  
  // Carga diferida del Sidebar (Desktop necesita filtros, Móvil no tanto)
  // Usamos requestIdleCallback para no bloquear el renderizado inicial de la grid
  const idleLoad = window.requestIdleCallback || ((cb) => setTimeout(cb, 1000));
  idleLoad(() => loadSidebar());

  // initQuickView se llama al abrir la primera ficha en card.js
  
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
  // Carga inicial: No ensuciar historial, usar replace
  loadAndRenderMovies(getCurrentPage(), { replaceHistory: true });
}

// Optimización WPO: Ejecutar inmediatamente si el DOM ya está interactivo
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}