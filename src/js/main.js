// =================================================================
//             EL DIRECTOR DE ORQUESTA (main.js)
// =================================================================
// Lee la URL, pide datos a la API, pinta resultados y vigila el scroll.
// =================================================================
import "../css/main.css";
import { CONFIG, CSS_CLASSES, SELECTORS, DEFAULTS } from "./constants.js";
import { debounce, triggerPopAnimation, getFriendlyErrorMessage, preloadLcpImage, createAbortableRequest, triggerHapticFeedback, LocalStore, normalizeText, executeViewTransition } from "./utils.js";
import { fetchMovies, getSupabase, fetchUserMovieData, fetchPersonDetails } from "./api.js";
import { dom, renderPagination, updateHeaderPaginationState, prefetchNextPage, setupAuthModal, updateTypeFilterUI, updateTotalResultsUI, clearAllSidebarAutocomplete, showToast, initThemeToggle, updateMobileStatusBar } from "./ui.js";
import { getState, getActiveFilters, getCurrentPage, setCurrentPage, setTotalMovies, setFilter, setSearchTerm, setSort, setMediaType, resetFiltersState, setUserMovieData, clearUserMovieData, syncStateWithUrlParams, stateToUrlParams, appEvents } from "./state.js";
import { updatePageTitle, updateStructuredData, updateBreadcrumbData } from "./seo.js";

// Módulos que cargamos más tarde para que la web arranque al instante
let sidebarModule = null;
let isAuthInitialized = false;

// Carga la barra lateral (filtros) bajo demanda
async function loadSidebar() {
  if (sidebarModule) return sidebarModule;
  try {
    sidebarModule = await import("./components/sidebar.js");
    sidebarModule.initSidebar(); // Inicializar listeners al cargar
    return sidebarModule;
  } catch (e) { console.error("Error loading sidebar", e); }
}

const loadCardModule = () => import("./components/card.js");

// --- 1. MOTOR PRINCIPAL (Cargar y Pintar Películas) ---
export async function loadAndRenderMovies(page = 1, { replaceHistory = false, forceSkeleton = false } = {}) {
  const signal = createAbortableRequest('movie-grid-load').signal;

  setCurrentPage(page);
  updatePageTitle();
  updateUrl({ replace: replaceHistory }); 

  document.body.classList.add(CSS_CLASSES.IS_FETCHING);
  dom.gridContainer.classList.add(CSS_CLASSES.IS_FETCHING);
  dom.gridContainer.setAttribute("aria-busy", "true");

  const cardModulePromise = loadCardModule();
  
  let skeletonTimeout;
  if (forceSkeleton) {
    const { renderSkeletons } = await cardModulePromise;
    renderSkeletons(dom.gridContainer, dom.paginationContainer);
  } else {
    const connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
    const skeletonDelay = { 'slow-2g': 0, '2g': 50, '3g': 100 }[connection?.effectiveType] || 150;

    skeletonTimeout = setTimeout(async () => {
      const { renderSkeletons } = await cardModulePromise;
      renderSkeletons(dom.gridContainer, dom.paginationContainer);
    }, skeletonDelay);
  }

  const currentKnownTotal = getState().totalMovies;
  const activeFilters = getActiveFilters();
  updateHeaderPaginationState(getCurrentPage(), currentKnownTotal);
  
  try {
    let vipData = null;
    let hasVip = false;
    
    // Si buscamos por un VIP (Tarantino), cargamos su cara grande primero
    if (!activeFilters.myList && !activeFilters.searchTerm) {
      const vipType = activeFilters.director ? 'director' : (activeFilters.actor ? 'actor' : null);
      const vipName = activeFilters.director || activeFilters.actor;

      if (vipType && vipName) {
        const personData = await fetchPersonDetails(vipType, vipName);
        if (personData) {
          const hasPhoto = personData.photo && personData.photo !== 'NOT_FOUND';
          if (hasPhoto) {
            hasVip = true;
            if (page === 1) vipData = { type: 'person', data: personData };
          }
        }
      } else if (activeFilters.selection) {
        if (page === 1) vipData = { type: 'collection', code: activeFilters.selection };
        hasVip = true;
      } else if (activeFilters.studio) {
        if (page === 1) vipData = { type: 'studio', code: activeFilters.studio };
        hasVip = true;
      }
    }

    const isWallMode = document.body.classList.contains(CSS_CLASSES.ROTATION_DISABLED);
    const basePageSize = isWallMode ? CONFIG.WALL_MODE_ITEMS_PER_PAGE : CONFIG.ITEMS_PER_PAGE;
    const firstPageLimit = isWallMode ? CONFIG.WALL_MODE_DYNAMIC_PAGE_SIZE_LIMIT : CONFIG.DYNAMIC_PAGE_SIZE_LIMIT;
    
    let fetchLimit = basePageSize;
    let fetchOffset = (page - 1) * basePageSize;

    if (hasVip) {
      if (page === 1) { fetchLimit = firstPageLimit - 1; fetchOffset = 0; } 
      else { fetchOffset = ((page - 1) * basePageSize) - 1; }
    } else {
      if (page === 1) fetchLimit = firstPageLimit; // Extender pág 1 para llenar pantallas enormes
    }
    
    const shouldRequestCount = (page === 1) || (currentKnownTotal === 0);

    const result = await fetchMovies(
      activeFilters,
      page,
      fetchLimit,
      signal,
      shouldRequestCount,
      fetchOffset
    );

    if (skeletonTimeout) clearTimeout(skeletonTimeout);

    if (result.aborted) return;

    const { items: movies, total: returnedTotal } = result;

    const effectiveTotal = returnedTotal >= 0 ? returnedTotal : currentKnownTotal;

    if (vipData && (vipData.type === 'collection' || vipData.type === 'studio')) {
      vipData.total = effectiveTotal;
    }

    if (movies && movies.length > 0) preloadLcpImage(movies[0]);
      
    const cardModule = await cardModulePromise;

    // Pinta con efecto cine
    executeViewTransition(() => {
      updateDomWithResults(movies, effectiveTotal, cardModule, vipData, hasVip);
      window.scrollTo({ top: 0, behavior: "auto" }); // Sube arriba de todo
    });

  } catch (error) {
    if (skeletonTimeout) clearTimeout(skeletonTimeout); // Asegurar limpieza en error
    if (error.name === "AbortError") return;
    
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

// Ayudante: Pone las pelis en pantalla y actualiza las miguitas de pan (SEO)
function updateDomWithResults(movies, totalMovies, cardModule, vipData = null, hasVip = false) {
  const { renderMovieGrid, renderNoResults, renderSkeletons, runFlipOnboarding } = cardModule;
  setTotalMovies(totalMovies);
  updateTotalResultsUI(totalMovies, movies);
  
  updateStructuredData(movies, totalMovies);
  updateBreadcrumbData(getActiveFilters());
  updatePageTitle(movies);

  const { currentPage } = getState();

  if (totalMovies > 0 && movies.length === 0 && currentPage === 1) {
    renderNoResults(dom.gridContainer, dom.paginationContainer, getActiveFilters());
    return;
  }

  const gridTotalItems = hasVip ? totalMovies + 1 : totalMovies;
  const isWallMode = document.body.classList.contains(CSS_CLASSES.ROTATION_DISABLED);
  const baseLimit = isWallMode ? CONFIG.WALL_MODE_ITEMS_PER_PAGE : CONFIG.ITEMS_PER_PAGE;
  const dynamicLimit = isWallMode ? CONFIG.WALL_MODE_DYNAMIC_PAGE_SIZE_LIMIT : CONFIG.DYNAMIC_PAGE_SIZE_LIMIT;
  const actualDynamicLimit = hasVip ? dynamicLimit - 1 : dynamicLimit;

  if (totalMovies === 0) {
    if (getActiveFilters().myList && !isAuthInitialized) {
      renderSkeletons(dom.gridContainer, dom.paginationContainer);
      return;
    }

    renderNoResults(dom.gridContainer, dom.paginationContainer, getActiveFilters());
    updateHeaderPaginationState(1, 0);
  } else if (totalMovies <= actualDynamicLimit && currentPage === 1) {
    renderMovieGrid(dom.gridContainer, movies, vipData);
    dom.paginationContainer.textContent = "";
    updateHeaderPaginationState(1, 1);
  } else {
    
    const currentLimit = (hasVip && currentPage === 1) ? baseLimit - 1 : baseLimit;
    
    const moviesToRender = movies.length > currentLimit ? movies.slice(0, currentLimit) : movies;
    renderMovieGrid(dom.gridContainer, moviesToRender, vipData);
    
    if (gridTotalItems > baseLimit) {
      renderPagination(dom.paginationContainer, gridTotalItems, currentPage);
    } else {
      dom.paginationContainer.textContent = "";
    }
    updateHeaderPaginationState(currentPage, gridTotalItems);
    }

  if (currentPage === 1 && totalMovies > 0) {
    runFlipOnboarding(dom.gridContainer);
  }
}

// --- 2. MANEJADORES DE UI (Clícs, Teclado) ---

async function handleSortChange(event) {
  triggerPopAnimation(event.target);
  setSort(dom.sortSelect.value);
  updateMobileStatusBar();
  await loadAndRenderMovies(1);
}

async function handleMediaTypeToggle(event) {
  triggerPopAnimation(event.currentTarget);
  appEvents.emit("uiActionTriggered");
  const currentType = getState().activeFilters.mediaType;
  const cycle = { all: "movies", movies: "series", series: "all" };
  setMediaType(cycle[currentType]);
  updateTypeFilterUI(cycle[currentType]);
  updateMobileStatusBar();
  await loadAndRenderMovies(1);
}

async function handleSearchInput() {
  const searchTerm = dom.searchInput.value.trim();
  const currentSearchTerm = getState().activeFilters.searchTerm;
  
  if (searchTerm === currentSearchTerm) return;
  
  if (searchTerm.length === 0 && currentSearchTerm.length > 0) {
    history.back();
    return;
  }
  
  if (searchTerm.length >= 3) {
    const isContinuingSearch = !!currentSearchTerm;

    const filtersCleared = setSearchTerm(searchTerm);
    if (filtersCleared) {
      showToast("Filtros limpiados para la búsqueda", "info");
    }

    appEvents.emit("updateSidebarUI");
    await loadAndRenderMovies(1, { replaceHistory: isContinuingSearch });
  }
}

// --- 3. VIGILANTE DE SCROLL (Muy optimizado) ---
let isTicking = false;
let lastScrollY = 0;
let scrollTimer = null;

function handleGlobalScroll() {
  if (scrollTimer) clearTimeout(scrollTimer);
  scrollTimer = setTimeout(() => {
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
      const currentScrollY = Math.max(0, window.scrollY);
      const docHeight = document.documentElement.scrollHeight;
      const vHeight = window.visualViewport ? window.visualViewport.height : window.innerHeight;
      
      const isMobileLayout = window.innerWidth <= 768 || window.innerHeight <= 500;
      const isSearchActive = document.activeElement === dom.searchInput;
      const isKeyboardOpen = vHeight < (window.innerHeight * 0.9);
      const isAtBottom = (window.innerHeight + currentScrollY) >= (docHeight - 50);
      const isSearchFocused = dom.mainHeader.classList.contains("is-search-focused");

      dom.mainHeader.classList.toggle(CSS_CLASSES.IS_SCROLLED, currentScrollY > 20);

      if (isMobileLayout) {
        if (isSearchActive || isSearchFocused || isKeyboardOpen) {
          dom.mainHeader.classList.remove('is-hidden-mobile');
          lastScrollY = currentScrollY; // Reset ancla
        } else {
          const scrollDifference = Math.abs(currentScrollY - lastScrollY);

          if (isAtBottom) {
            dom.mainHeader.classList.remove('is-hidden-mobile');
            lastScrollY = currentScrollY;
          } else if (scrollDifference > 12) {
            const isScrollingDown = currentScrollY > lastScrollY;
            dom.mainHeader.classList.toggle('is-hidden-mobile', isScrollingDown && currentScrollY > 60);
            lastScrollY = currentScrollY; 
          }
        }
      } else {
        lastScrollY = currentScrollY; // En desktop, mantener sincronizado
      }

      isTicking = false;
    });
    isTicking = true;
  }
}

// Limpia todo (Botón Play o Atrás completo)
function handleFiltersReset(data) {
  const { keepSort, newFilter } = data || {};
  const currentSort = keepSort ? getState().activeFilters.sort : DEFAULTS.SORT;
  
  resetFiltersState();
  setSort(currentSort);
  
  if (newFilter) setFilter(newFilter.type, newFilter.value);
  
  if (dom.searchInput) dom.searchInput.value = "";
  if (dom.sortSelect) dom.sortSelect.value = currentSort;
  updateTypeFilterUI(DEFAULTS.MEDIA_TYPE);
  updateMobileStatusBar();
  appEvents.emit("updateSidebarUI");
  
  loadAndRenderMovies(1, { forceSkeleton: true }); 
}

// --- 4. PREPARATIVOS AL ARRANCAR (Cableado) ---

function setupHeaderListeners() {
  const debouncedSearch = debounce(handleSearchInput, CONFIG.SEARCH_DEBOUNCE_DELAY);
  dom.searchInput.addEventListener("input", debouncedSearch);
  dom.searchForm.addEventListener("submit", (e) => { e.preventDefault(); handleSearchInput(); });
  
  dom.searchInput.addEventListener("focus", () => dom.mainHeader.classList.add("is-search-focused"));
  dom.searchInput.addEventListener("blur", () => dom.mainHeader.classList.remove("is-search-focused"));

  dom.searchInput.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      e.preventDefault();
      if (getState().activeFilters.searchTerm) {
        history.back();
      } else {
        dom.searchInput.blur();
      }
    }
  });

  dom.sortSelect.addEventListener("change", handleSortChange);
  dom.typeFilterToggle.addEventListener("click", handleMediaTypeToggle);

  if (dom.mobileSidebarToggle) {
    dom.mobileSidebarToggle.addEventListener('click', async () => {
      const mod = await loadSidebar();
      if (!mod) return;
      triggerHapticFeedback('light');
      const isOpen = document.body.classList.contains('sidebar-is-open');
      isOpen ? mod.closeMobileDrawer() : mod.openMobileDrawer();
    });
  }

  const navigatePage = async (direction) => {
    const currentPage = getCurrentPage();
    const isWallMode = document.body.classList.contains(CSS_CLASSES.ROTATION_DISABLED);
    const totalPages = Math.ceil(getState().totalMovies / (isWallMode ? CONFIG.WALL_MODE_ITEMS_PER_PAGE : CONFIG.ITEMS_PER_PAGE));
    const newPage = currentPage + direction;
    if (newPage > 0 && newPage <= totalPages) {
      appEvents.emit("uiActionTriggered");
      await loadAndRenderMovies(newPage);
    }
  };
  dom.headerPrevBtn.addEventListener("click", (e) => { triggerPopAnimation(e.currentTarget); navigatePage(-1); });
  dom.headerNextBtn.addEventListener("click", (e) => { triggerPopAnimation(e.currentTarget); navigatePage(1); });

  const clearSearchBtn = dom.searchForm.querySelector('.search-icon--clear');
  if (clearSearchBtn) {
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

  const updateSearchPlaceholder = () => {
    if (dom.searchInput) dom.searchInput.placeholder = window.innerWidth <= 768 ? "" : "Título";
  };
  window.addEventListener("resize", debounce(updateSearchPlaceholder, 250));
  updateSearchPlaceholder();
}

function setupGlobalListeners() {
  document.addEventListener("click", (e) => {
    if (!e.target.closest(SELECTORS.SIDEBAR_FILTER_FORM)) clearAllSidebarAutocomplete();
    if (!e.target.closest(".sidebar") && sidebarModule) sidebarModule.collapseAllSections();
  });

  dom.gridContainer.addEventListener("click", async function(e) {
    const cardElement = e.target.closest(".movie-card");
    if (cardElement) { 
      // Prevenir navegación nativa antes de cargar el módulo
      const filterLink = e.target.closest("[data-director-name], [data-actor-name]");
      if (filterLink && !(e.ctrlKey || e.metaKey || e.shiftKey || e.button === 1)) {
        e.preventDefault();
      }

      const { handleCardClick } = await loadCardModule();
      handleCardClick.call(cardElement, e); 
      return; 
    }
    
    if (e.target.closest("#clear-filters-from-empty")) {
      appEvents.emit("filtersReset");
    }
  });
  
  // Interacciones Card (Hover, Tap)
  loadCardModule().then(({ initCardInteractions }) => {
    initCardInteractions(dom.gridContainer);
  });
  
  document.getElementById("quick-view-content").addEventListener("click", async function(e) { 
    const { handleCardClick } = await loadCardModule();
    handleCardClick.call(this, e); 
  });
  
  dom.paginationContainer.addEventListener("click", async (e) => {
    const button = e.target.closest(".btn[data-page]");
    if (button) {
      appEvents.emit("uiActionTriggered");
      triggerPopAnimation(button);
      const page = parseInt(button.dataset.page, 10);
      await loadAndRenderMovies(page);
    }
  });

  lastScrollY = window.scrollY;
  window.addEventListener("scroll", handleGlobalScroll, { passive: true });
  
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && document.body.classList.contains(CSS_CLASSES.SIDEBAR_OPEN)) { 
      if (document.body.classList.contains(CSS_CLASSES.MODAL_OPEN)) return;
      if (sidebarModule) sidebarModule.closeMobileDrawer();
    }
  });

  // Eventos Personalizados de la App
  appEvents.on("card:requestUpdate", async (data) => { 
    if (data.cardElement) {
      const { updateCardUI } = await loadCardModule();
      updateCardUI(data.cardElement); 
    }
  });
  const handleDataRefresh = async () => {
    const { updateCardUI } = await loadCardModule();
    document.querySelectorAll(".movie-card").forEach(updateCardUI);
  };
  appEvents.on("userMovieDataChanged", handleDataRefresh);
  
  appEvents.on("userDataUpdated", () => {
    handleDataRefresh();
    if (getActiveFilters().myList) {
      loadAndRenderMovies(getCurrentPage());
    }
  });
  appEvents.on("filtersReset", handleFiltersReset);
}

// --- 5. ENCHUFAR LA AUTENTICACIÓN ---
function setupAuthSystem() {
  const userAvatarInitials = document.getElementById("user-avatar-initials");
  const logoutButton = document.getElementById("logout-button");
  const loginButton = document.getElementById("login-button");
  const userSessionGroup = document.getElementById("user-session-group");
  
  async function onLogin(user) {
    document.body.classList.add(CSS_CLASSES.USER_LOGGED_IN);
    if (loginButton) loginButton.hidden = true;
    if (userSessionGroup) userSessionGroup.hidden = false;

    const userEmail = user.email || "";
    userAvatarInitials.textContent = userEmail.charAt(0).toUpperCase();
    userAvatarInitials.title = `Sesión iniciada como: ${userEmail}`;
    try {
      const data = await fetchUserMovieData();
      setUserMovieData(data);
      appEvents.emit("userDataUpdated");
    } catch (error) { showToast(error.message, "error"); }
    finally { isAuthInitialized = true; }
  }
  
  function onLogout() {
    document.body.classList.remove(CSS_CLASSES.USER_LOGGED_IN);
    if (loginButton) loginButton.hidden = false;
    if (userSessionGroup) userSessionGroup.hidden = true;

    userAvatarInitials.textContent = "";
    userAvatarInitials.title = "";
    clearUserMovieData();
    appEvents.emit("userDataUpdated");
    isAuthInitialized = true;
  }
  
  async function handleLogout() {
    const supabase = await getSupabase();
    const { error } = await supabase.auth.signOut();
    if (error) { console.error("Logout error:", error); showToast("Error al cerrar sesión.", "error"); }
  }
  
  if (logoutButton) logoutButton.addEventListener("click", handleLogout);
  
  getSupabase().then(supabase => {
    supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) onLogin(session.user); else onLogout();
    });
  });
}

function readUrlAndSetState() {
  syncStateWithUrlParams(window.location.search);
  
  const activeFilters = getActiveFilters();
  if (dom.searchInput) dom.searchInput.value = activeFilters.searchTerm || "";
  dom.sortSelect.value = activeFilters.sort;
  updateTypeFilterUI(activeFilters.mediaType);
  updateMobileStatusBar();
}

function updateUrl({ replace = false } = {}) {
  const params = stateToUrlParams(getActiveFilters(), getCurrentPage());
  
  const newUrl = params.toString() ? `${window.location.pathname}?${params.toString()}` : window.location.pathname;
  if (newUrl !== `${window.location.pathname}${window.location.search}`) {
    if (replace) {
      history.replaceState({ path: newUrl }, "", newUrl);
    } else {
      history.pushState({ path: newUrl }, "", newUrl);
    }
  }
}

// --- 6. ARRANQUE GLOBAL DE LA WEB ---
function init() {
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
    const { closeModal } = await import("./components/modal.js");
    closeModal();
    
    readUrlAndSetState();
    appEvents.emit("updateSidebarUI");
    loadAndRenderMovies(getCurrentPage(), { replaceHistory: true });
  });
  
  const idleLoad = window.requestIdleCallback || ((cb) => setTimeout(cb, 1000));
  idleLoad(() => {
    loadSidebar();
    setupAuthSystem();
    setupAuthModal();
  });

  initThemeToggle();
  setupHeaderListeners();
  setupGlobalListeners();
  
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
  appEvents.emit("updateSidebarUI");
  loadAndRenderMovies(getCurrentPage(), { replaceHistory: true });
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}