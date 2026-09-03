// =================================================================
//             EL DIRECTOR DE ORQUESTA (main.ts)
// =================================================================
// Lee la URL, pide datos a la API, pinta resultados y vigila el scroll.
// =================================================================
import "../css/main.css";
import { CONFIG, CSS_CLASSES, SELECTORS, DEFAULTS } from "./constants.js";
import {
  debounce,
  triggerPopAnimation,
  getFriendlyErrorMessage,
  preloadLcpImage,
  createAbortableRequest,
  triggerHapticFeedback,
  LocalStore,
  executeViewTransition,
  getAdjustedTotalPages,
  runWhenIdle,
  normalizeText
} from "./utils.js";

import {
  fetchMovies,
  getSupabase,
  fetchUserMovieDataForIds,
  fetchPersonDetails,
  fetchGroupDetails,
  fetchAllUserMovieData,
  fetchMovieById
} from "./api.js";
import { clearCheckedUserMovieIds } from "./checkedIds.js";
import { isAbortError, getAppBasePath, toSlug } from "./contracts.js";
import { getAllLocalEntries } from "./localStore.js";
import { mergeOnLogin, initSyncListeners, scheduleSync } from "./syncManager.js";
import {
  dom,
  renderPagination,
  updateHeaderPaginationState,
  prefetchNextPage,
  setupAuthModal,
  setupLegalModal,
  updateTypeFilterUI,
  updateTotalResultsUI,
  clearAllSidebarAutocomplete,
  showToast,
  clearToast,
  initThemeToggle,
  updateMobileStatusBar,
  notifyRemovedPersonIncompatibleFilters,
  isAuthModalOpen,
  closeAuthModal,
  isLegalModalOpen,
  closeLegalModal,
  consumeIsClosingModalViaHistory,
  updateAppBadge,
  clearAppBadge
} from "./ui.js";


import {
  getState,
  getActiveFilters,
  getCurrentPage,
  getTotalMovies,
  setCurrentPage,
  setTotalMovies,
  setFilter,
  setSearchTerm,
  setSort,
  setMediaType,
  resetFiltersState,
  setUserMovieData,
  clearUserMovieData,
  syncStateWithUrl,
  syncStateWithUrlParams,
  canonicalizeCurrentUrl,
  stateToPrettyUrl,
  stateToUrlParams,
  appEvents,
  updateUserDataForMovie
} from "./state.js";
import { updatePageTitle, updateStructuredData, updateBreadcrumbData } from "./seo.js";
import { MappedMovie, ActiveFilters, VipData, MovieCardElement } from "./types.js";
import type { User } from "@supabase/supabase-js";
import {
  renderMovieGrid,
  renderNoResults,
  renderSkeletons,
  renderErrorState,
  runFlipOnboarding,
  handleCardClick,
  initCardInteractions,
  updateCardUI,
  disposeCardEvents
} from "./components/card.js";


// Interfaces para carga dinámica de módulos
interface SidebarModule {
  initSidebar(): void;
  closeMobileDrawer(): void;
  openMobileDrawer(): void;
  collapseAllSections(): void;
}

// Módulos que cargamos más tarde para que la web arranque al instante
let sidebarModule: SidebarModule | null = null;
let isAuthInitialized = false;

// Carga la barra lateral (filtros) bajo demanda
async function loadSidebar(): Promise<SidebarModule | null> {
  const loadGen = mainLifecycleGen;
  if (sidebarModule) {
    sidebarModule.initSidebar();
    return sidebarModule;
  }
  try {
    const mod = await import("./components/sidebar.js") as unknown as SidebarModule;
    if (loadGen !== mainLifecycleGen) return null;
    sidebarModule = mod;
    sidebarModule.initSidebar(); // Inicializar listeners al cargar
    return sidebarModule;
  } catch (e) {
    if (import.meta.env.DEV) console.error("Error loading sidebar", e);
    return null;
  }
}



export interface RenderOptions {
  replaceHistory?: boolean;
  forceSkeleton?: boolean;
  isYearFilter?: boolean;
  restoreScrollY?: number | null;
}

const scrollPositionsCache = new Map<string, number>();

export function saveCurrentScrollPosition(): void {
  if (typeof window === "undefined") return;
  const currentKey = `${window.location.pathname}${window.location.search}`;
  const scrollY = Math.max(0, window.scrollY);
  scrollPositionsCache.set(currentKey, scrollY);

  try {
    const currentState = window.history.state || {};
    if (currentState.scrollY !== scrollY) {
      window.history.replaceState({ ...currentState, scrollY }, "", window.location.href);
    }
  } catch {}
}

// --- 1. MOTOR PRINCIPAL (Cargar y Pintar Películas) ---
export async function loadAndRenderMovies(
  page = 1,
  { replaceHistory = false, forceSkeleton = false, isYearFilter = false, restoreScrollY = null }: RenderOptions = {}
): Promise<void> {
  const signal = createAbortableRequest("movie-grid-load").signal;

  // 1. Actualizar estado -> 2. Actualizar URL -> 3. Actualizar SEO -> 4. Lanzar fetch
  setCurrentPage(page);
  updateUrl({ replace: replaceHistory });
  updatePageTitle();
  updateBreadcrumbData(getActiveFilters());

  document.body.classList.add(CSS_CLASSES.IS_FETCHING);
  dom.gridContainer?.classList.add(CSS_CLASSES.IS_FETCHING);
  dom.gridContainer?.setAttribute("aria-busy", "true");

  let skeletonTimeout: ReturnType<typeof setTimeout> | null = null;
  if (forceSkeleton) {
    renderSkeletons(dom.gridContainer, dom.paginationContainer);
  } else {
    interface NetworkInfo {
      effectiveType?: "slow-2g" | "2g" | "3g" | "4g";
    }
    const nav = navigator as Navigator & {
      connection?: NetworkInfo;
      mozConnection?: NetworkInfo;
      webkitConnection?: NetworkInfo;
    };
    const connection = nav.connection || nav.mozConnection || nav.webkitConnection;
    const effType = connection?.effectiveType;
    const skeletonDelay = isYearFilter ? 300 : (effType === "slow-2g" ? 0 : effType === "2g" ? 50 : effType === "3g" ? 100 : 150);

    skeletonTimeout = setTimeout(() => {
      renderSkeletons(dom.gridContainer, dom.paginationContainer);
    }, skeletonDelay);
  }

  const currentKnownTotal = getTotalMovies();
  const activeFilters = getActiveFilters();
  updateHeaderPaginationState(getCurrentPage(), currentKnownTotal);
  updateTypeFilterUI(activeFilters.mediaType as "movies" | "series" | "all");

  try {
    let vipData: VipData | null = null;
    let hasVip = false;

    // Si buscamos por un VIP (Tarantino), cargamos su cara grande primero
    if (!activeFilters.myList && !activeFilters.searchTerm) {
      const vipType = activeFilters.director ? "director" : (activeFilters.actor ? "actor" : null);
      const vipName = activeFilters.director || activeFilters.actor;

      if (vipType && vipName) {
        const personData = await fetchPersonDetails(vipType, vipName);
        if (personData) {
          // Si el nombre canónico de la BD difiere del filtro reconstruido desde URL (ej. guiones o mayúsculas),
          // restauramos el nombre canónico en el estado activo solo si representan la misma persona (mismo slug/normalización).
          if (personData.name && personData.name !== vipName) {
            if (toSlug(personData.name) === toSlug(vipName) || normalizeText(personData.name) === normalizeText(vipName)) {
              setFilter(vipType, personData.name, true);
              updatePageTitle();
              updateBreadcrumbData(getActiveFilters());
            }
          }

          const isVip = Boolean(personData.birthday);
          if (isVip) {
            const personSlug = personData.slug || toSlug(personData.name);
            preloadLcpImage(`${CONFIG.PROFILE_BASE_URL}${personSlug}.webp`);
            hasVip = true;
            if (page === 1) vipData = { type: "person", data: personData };
          }
        }
      } else if (activeFilters.selection) {
        const groupDetails = await fetchGroupDetails("selection", activeFilters.selection);
        if (page === 1) {
          vipData = {
            type: "collection",
            code: activeFilters.selection,
            thumbhash_st: groupDetails?.thumbhash_st || null
          };
        }
        hasVip = true;
      } else if (activeFilters.studio) {
        const groupDetails = await fetchGroupDetails("studio", activeFilters.studio);
        if (page === 1) {
          vipData = {
            type: "studio",
            code: activeFilters.studio,
            thumbhash_st: groupDetails?.thumbhash_st || null
          };
        }
        hasVip = true;
      }
    }

    const isWallMode = document.body.classList.contains(CSS_CLASSES.ROTATION_DISABLED);
    const basePageSize = isWallMode ? CONFIG.WALL_MODE_ITEMS_PER_PAGE : CONFIG.ITEMS_PER_PAGE;
    const firstPageLimit = isWallMode ? CONFIG.WALL_MODE_DYNAMIC_PAGE_SIZE_LIMIT : CONFIG.DYNAMIC_PAGE_SIZE_LIMIT;

    let fetchLimit: number = basePageSize;
    let fetchOffset = (page - 1) * basePageSize;

    if (hasVip) {
      if (page === 1) {
        fetchLimit = firstPageLimit - 1;
        fetchOffset = 0;
      } else {
        fetchLimit = basePageSize + 2; // Traer margen extra de +2 por si es la última página tras absorber huérfanos
        fetchOffset = ((page - 1) * basePageSize) - 1;
      }
    } else {
      if (page === 1) {
        fetchLimit = firstPageLimit;
      } else {
        fetchLimit = basePageSize + 2; // Traer margen extra de +2 por si es la última página tras absorber huérfanos
      }
    }

    const shouldRequestCount = isYearFilter || (page === 1) || (currentKnownTotal === 0);

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

    // --- OPTIMIZACIÓN FILTRO DE AÑO ---
    if (isYearFilter) {
      const gridTotalItems = hasVip ? effectiveTotal + 1 : effectiveTotal;
      const totalPages = getAdjustedTotalPages(gridTotalItems, basePageSize);

      // 1. Si el número total de películas CAMBIÓ o la página actual excede el límite de páginas (ej: estamos en pág 2 pero solo hay 1 página):
      if ((currentKnownTotal > 0 && effectiveTotal !== currentKnownTotal) || page > totalPages) {
        const p1Limit = (hasVip) ? firstPageLimit - 1 : firstPageLimit;
        const p1Result = await fetchMovies(activeFilters, 1, p1Limit, signal, false, 0);
        if (p1Result.aborted) return;

        const p1Movies = p1Result.items || [];
        setCurrentPage(1);

        updateUrl({ replace: replaceHistory });

        await updateDomWithResults(p1Movies, effectiveTotal, vipData, hasVip);
        const targetScroll = restoreScrollY !== null ? restoreScrollY : 0;
        window.scrollTo({ top: targetScroll, behavior: "auto" });
        return;
      }

      // 2. Si el total NO cambió y estamos dentro del rango de páginas, comprobamos si las películas a renderizar en la página actual son idénticas:
      const lastPageSlots = gridTotalItems % basePageSize || basePageSize;
      const isOrphanPage = (Math.ceil(gridTotalItems / basePageSize) > 1) && lastPageSlots <= 2;
      let slotBudget: number = basePageSize;
      if (page === totalPages) {
        slotBudget = isOrphanPage ? basePageSize + lastPageSlots : lastPageSlots;
      }
      const currentLimit = (page === 1 && hasVip) ? slotBudget - 1 : slotBudget;
      const moviesToRender = movies.length > currentLimit ? movies.slice(0, currentLimit) : movies;

      const currentCardEls = Array.from(dom.gridContainer?.querySelectorAll<HTMLElement>('.movie-card') || []);
      const currentCardIds = currentCardEls.map((el) => el.dataset.movieId || "").filter(Boolean);
      const newCardIds = moviesToRender.map((m) => String(m.id));

      const isIdenticalPage = currentCardIds.length === newCardIds.length &&
        currentCardIds.every((id, idx) => id === newCardIds[idx]);

      if (isIdenticalPage) {
        // Ningún cambio en las fichas en pantalla: actualizamos estado y metadatos sin refrescar el grid ni hacer scroll
        setTotalMovies(effectiveTotal);
        updateTotalResultsUI(effectiveTotal, movies);
        updateStructuredData(movies, effectiveTotal);
        updateBreadcrumbData(getActiveFilters());
        updatePageTitle(movies);

        const logicalGridTotalItems = isOrphanPage ? totalPages * basePageSize : gridTotalItems;
        if (totalPages > 1) {
          renderPagination(dom.paginationContainer, logicalGridTotalItems, page);
        } else {
          if (dom.paginationContainer) dom.paginationContainer.textContent = "";
        }
        updateHeaderPaginationState(page, logicalGridTotalItems);

        return; // Salida limpia sin refresco del grid ni scroll
      }
    }

    if (vipData && (vipData.type === "collection" || vipData.type === "studio")) {
      vipData.total = effectiveTotal;
    }

    if (movies && movies.length > 0) {
      preloadLcpImage(movies[0]);
      if (document.body.classList.contains(CSS_CLASSES.USER_LOGGED_IN)) {
        const movieIds = movies.map((m) => m.id);
        fetchUserMovieDataForIds(movieIds).then((userEntries) => {
          if (Object.keys(userEntries).length > 0) {
            for (const [id, entry] of Object.entries(userEntries)) {
              updateUserDataForMovie(id, entry);
            }
            appEvents.emit("userDataUpdated");
          }
        }).catch((err) => {
          if (import.meta.env.DEV) console.error("Error syncing page user data", err);
        });
      }
    }

    // Pinta la cuadrícula con efecto cascada
    await updateDomWithResults(movies, effectiveTotal, vipData, hasVip);
    const targetScroll = restoreScrollY !== null ? restoreScrollY : 0;
    window.scrollTo({ top: targetScroll, behavior: "auto" });

  } catch (error: unknown) {
    if (skeletonTimeout) clearTimeout(skeletonTimeout); // Asegurar limpieza en error
    if (isAbortError(error, signal)) return;

    const msg = getFriendlyErrorMessage(error);
    if (msg) showToast(msg, "error");
    renderErrorState(dom.gridContainer, dom.paginationContainer, msg || "Error desconocido");

    // Re-lanzar para que sidebar.js pueda revertir filtros optimistas
    if (msg) throw new Error(msg);
  } finally {
    if (!signal.aborted) {
      document.body.classList.remove(CSS_CLASSES.IS_FETCHING);
      dom.gridContainer?.classList.remove(CSS_CLASSES.IS_FETCHING);
      dom.gridContainer?.setAttribute("aria-busy", "false");
    }
  }
}

// Ayudante: Pone las pelis en pantalla y actualiza las miguitas de pan (SEO)
async function updateDomWithResults(
  movies: MappedMovie[],
  totalMovies: number,
  vipData: VipData | null = null,
  hasVip = false
): Promise<void> {
  setTotalMovies(totalMovies);
  updateTotalResultsUI(totalMovies, movies);

  updateStructuredData(movies, totalMovies);
  updateBreadcrumbData(getActiveFilters());
  updatePageTitle(movies);

  const currentPage = getCurrentPage();
  const activeFilters = getActiveFilters();
  const isWallMode = document.body.classList.contains(CSS_CLASSES.ROTATION_DISABLED);
  const baseLimit = isWallMode ? CONFIG.WALL_MODE_ITEMS_PER_PAGE : CONFIG.ITEMS_PER_PAGE;
  const firstPageLimit = isWallMode ? CONFIG.WALL_MODE_DYNAMIC_PAGE_SIZE_LIMIT : CONFIG.DYNAMIC_PAGE_SIZE_LIMIT;

  const gridTotalItems = hasVip ? totalMovies + 1 : totalMovies;

  if (totalMovies <= 0) {
    renderNoResults(dom.gridContainer, dom.paginationContainer, activeFilters);
    updateHeaderPaginationState(1, 0);
    return;
  } else {
    // Calculamos el número de páginas real ajustado por la orfandad
    const totalPages = getAdjustedTotalPages(gridTotalItems, baseLimit);

    // Determinamos el presupuesto de slots de la página actual
    const lastPageSlots = gridTotalItems % baseLimit || baseLimit;
    const isOrphanPage = (Math.ceil(gridTotalItems / baseLimit) > 1) && lastPageSlots <= 2;

    let slotBudget: number = baseLimit;
    if (currentPage === totalPages) {
      slotBudget = isOrphanPage ? baseLimit + lastPageSlots : lastPageSlots;
    }

    // Convertimos el presupuesto de slots en número de películas a renderizar
    const currentLimit = (currentPage === 1 && hasVip) ? slotBudget - 1 : slotBudget;
    const moviesToRender = movies.length > currentLimit ? movies.slice(0, currentLimit) : movies;

    await renderMovieGrid(dom.gridContainer, moviesToRender, vipData);

    const logicalGridTotalItems = isOrphanPage ? totalPages * baseLimit : gridTotalItems;
    if (totalPages > 1) {
      renderPagination(dom.paginationContainer, logicalGridTotalItems, currentPage);
    } else {
      if (dom.paginationContainer) dom.paginationContainer.textContent = "";
    }
    updateHeaderPaginationState(currentPage, logicalGridTotalItems);
  }

  if (currentPage === 1 && totalMovies > 0) {
    runFlipOnboarding(dom.gridContainer);
  }
}

// --- 2. MANEJADORES DE UI (Clícs, Teclado) ---

async function handleSortChange(event: Event): Promise<void> {
  clearToast();
  const select = event.target as HTMLSelectElement;
  triggerPopAnimation(select);
  setSort(select.value);
  updateMobileStatusBar();
  await loadAndRenderMovies(1);
}

async function handleMediaTypeToggle(event: Event): Promise<void> {
  clearToast();
  const btn = event.currentTarget as HTMLElement;
  triggerPopAnimation(btn);
  appEvents.emit("uiActionTriggered");
  const currentType = getActiveFilters().mediaType as "all" | "movies" | "series";
  const cycle = { all: "movies", movies: "series", series: "all" } as const;
  const nextType = cycle[currentType];
  setMediaType(nextType);
  updateTypeFilterUI(nextType);
  updateMobileStatusBar();
  await loadAndRenderMovies(1);
}

async function handleSearchInput(): Promise<void> {
  clearToast();
  if (!dom.searchInput) return;
  const searchTerm = dom.searchInput.value.trim();
  const currentSearchTerm = getActiveFilters().searchTerm;

  if (searchTerm === currentSearchTerm) return;

  if (searchTerm.length === 0 && currentSearchTerm && currentSearchTerm.length > 0) {
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
let scrollTimer: ReturnType<typeof setTimeout> | null = null;
let scrollSaveTimer: ReturnType<typeof setTimeout> | null = null;
let scrollRafId: number | null = null;

function handleGlobalScroll(): void {
  if (scrollSaveTimer) {
    clearTimeout(scrollSaveTimer);
  }
  scrollSaveTimer = setTimeout(() => {
    saveCurrentScrollPosition();
  }, 100);

  if (scrollTimer) {
    clearTimeout(scrollTimer);
    scrollTimer = null;
  }
  const scrollGen = mainLifecycleGen;
  scrollTimer = setTimeout(() => {
    if (scrollGen !== mainLifecycleGen) return;
    // Prefetch Predictivo: Si el usuario se detiene (mira) cerca del final (>70%)
    const scrollPos = window.scrollY + window.innerHeight;
    const docHeight = document.documentElement.scrollHeight;

    if (docHeight > 0 && scrollPos / docHeight > 0.7) {
      prefetchNextPage(getCurrentPage(), getTotalMovies(), getActiveFilters());
    }
  }, 250);

  if (!isTicking) {
    isTicking = true;
    scrollRafId = window.requestAnimationFrame(() => {
      scrollRafId = null;
      isTicking = false;
      if (scrollGen !== mainLifecycleGen) return;
      const currentScrollY = Math.max(0, window.scrollY);
      const docHeight = document.documentElement.scrollHeight;
      const vHeight = window.visualViewport ? window.visualViewport.height : window.innerHeight;

      const isMobileLayout = window.innerWidth <= 768 || window.innerHeight <= 500;
      const isSearchActive = document.activeElement === dom.searchInput;
      const isKeyboardOpen = vHeight < (window.innerHeight * 0.9);
      const isAtBottom = (window.innerHeight + currentScrollY) >= (docHeight - 50);
      const isSearchFocused = dom.mainHeader?.classList.contains("is-search-focused");

      dom.mainHeader?.classList.toggle(CSS_CLASSES.IS_SCROLLED, currentScrollY > 20);

      if (isMobileLayout && dom.mainHeader) {
        if (isSearchActive || isSearchFocused || isKeyboardOpen) {
          dom.mainHeader.classList.remove("is-hidden-mobile");
          lastScrollY = currentScrollY; // Reset ancla
        } else {
          const scrollDifference = Math.abs(currentScrollY - lastScrollY);

          if (isAtBottom) {
            dom.mainHeader.classList.remove("is-hidden-mobile");
            lastScrollY = currentScrollY;
          } else if (scrollDifference > 12) {
            const isScrollingDown = currentScrollY > lastScrollY;
            dom.mainHeader.classList.toggle("is-hidden-mobile", isScrollingDown && currentScrollY > 60);
            lastScrollY = currentScrollY;
          }
        }
      } else {
        lastScrollY = currentScrollY; // En desktop, mantener sincronizado
      }
    });
  }
}

// Limpia todo (Botón Play o Atrás completo)
function handleFiltersReset(data?: { keepSort?: boolean; newFilter?: { type: string; value: unknown } }): void {
  clearToast();
  const { keepSort, newFilter } = data || {};
  const currentFilters = getActiveFilters();
  if (newFilter && (newFilter.type === 'director' || newFilter.type === 'actor')) {
    notifyRemovedPersonIncompatibleFilters(currentFilters);
  }
  const currentSort = keepSort ? currentFilters.sort : DEFAULTS.SORT;

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

// Aplica un filtro específico preservando las categorías activas (Años, Selección, Estudio, País)
// pero respetando la exclusividad de Director/Actor (las personas son incompatibles con cualquier otra categoría)
function handleFilterApply(data: { type: string; value: unknown; force?: boolean }): void {
  clearToast();
  const { type, value, force = true } = data;
  if (!type || value === undefined) return;

  const currentFilters = getActiveFilters();

  if (currentFilters.searchTerm) {
    setSearchTerm("");
    if (dom.searchInput) dom.searchInput.value = "";
  }

  if (currentFilters.myList) {
    setFilter('myList', null);
  }

  // Regla de Exclusividad: Si hay un actor o director activo y se pulsa una categoría (género, etc.), se desactiva la persona
  if (type !== 'actor' && type !== 'director') {
    if (currentFilters.actor) setFilter('actor', null);
    if (currentFilters.director) setFilter('director', null);
  } else {
    // Si se activa una persona (o se alterna D <-> A), se limpian las categorías incompatibles y el tipo de medio, preservando el orden
    notifyRemovedPersonIncompatibleFilters(currentFilters);
    const currentSort = currentFilters.sort;
    resetFiltersState();
    setSort(currentSort);
    updateTypeFilterUI(DEFAULTS.MEDIA_TYPE);
  }

  if (!setFilter(type, value, force)) {
    showToast(`Límite de ${CONFIG.MAX_ACTIVE_FILTERS} filtros alcanzado.`, "error");
    return;
  }

  updateMobileStatusBar();
  appEvents.emit("updateSidebarUI");
  loadAndRenderMovies(1, { forceSkeleton: true });
}

// --- 4. PREPARATIVOS AL ARRANCAR (Cableado) ---

function setupHeaderListeners(): void {
  const debouncedSearch = debounce(handleSearchInput, CONFIG.SEARCH_DEBOUNCE_DELAY);

  if (dom.searchInput) {
    const onSearchFocus = () => dom.mainHeader?.classList.add("is-search-focused");
    const onSearchBlur = () => dom.mainHeader?.classList.remove("is-search-focused");
    const onSearchKeydown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        if (getActiveFilters().searchTerm) {
          history.back();
        } else {
          dom.searchInput?.blur();
        }
      }
    };

    dom.searchInput.addEventListener("input", debouncedSearch);
    dom.searchInput.addEventListener("focus", onSearchFocus);
    dom.searchInput.addEventListener("blur", onSearchBlur);
    dom.searchInput.addEventListener("keydown", onSearchKeydown);

    mainUnsubscribers.push(() => {
      dom.searchInput?.removeEventListener("input", debouncedSearch);
      dom.searchInput?.removeEventListener("focus", onSearchFocus);
      dom.searchInput?.removeEventListener("blur", onSearchBlur);
      dom.searchInput?.removeEventListener("keydown", onSearchKeydown);
    });
  }

  if (dom.searchForm) {
    const onSearchSubmit = (e: Event) => { e.preventDefault(); handleSearchInput(); };
    dom.searchForm.addEventListener("submit", onSearchSubmit);
    mainUnsubscribers.push(() => dom.searchForm?.removeEventListener("submit", onSearchSubmit));
  }

  if (dom.sortSelect) {
    dom.sortSelect.addEventListener("change", handleSortChange);
    mainUnsubscribers.push(() => dom.sortSelect?.removeEventListener("change", handleSortChange));
  }

  if (dom.typeFilterToggle) {
    dom.typeFilterToggle.addEventListener("click", handleMediaTypeToggle);
    mainUnsubscribers.push(() => dom.typeFilterToggle?.removeEventListener("click", handleMediaTypeToggle));
  }

  if (dom.mobileSidebarToggle) {
    const onToggleClick = async () => {
      const mod = await loadSidebar();
      if (!mod) return;
      triggerHapticFeedback("light");
      const isOpen = document.body.classList.contains("sidebar-is-open");
      isOpen ? mod.closeMobileDrawer() : mod.openMobileDrawer();
    };
    dom.mobileSidebarToggle.addEventListener("click", onToggleClick);
    mainUnsubscribers.push(() => dom.mobileSidebarToggle?.removeEventListener("click", onToggleClick));
  }

  const navigatePage = async (direction: number) => {
    const currentPage = getCurrentPage();
    const isWallMode = document.body.classList.contains(CSS_CLASSES.ROTATION_DISABLED);
    const totalPages = Math.ceil(getTotalMovies() / (isWallMode ? CONFIG.WALL_MODE_ITEMS_PER_PAGE : CONFIG.ITEMS_PER_PAGE));
    const newPage = currentPage + direction;
    if (newPage > 0 && newPage <= totalPages) {
      appEvents.emit("uiActionTriggered");
      await loadAndRenderMovies(newPage);
    }
  };

  if (dom.headerPrevBtn) {
    const onPrevClick = (e: MouseEvent) => {
      triggerPopAnimation(e.currentTarget as HTMLElement);
      navigatePage(-1);
    };
    dom.headerPrevBtn.addEventListener("click", onPrevClick);
    mainUnsubscribers.push(() => dom.headerPrevBtn?.removeEventListener("click", onPrevClick));
  }

  if (dom.headerNextBtn) {
    const onNextClick = (e: MouseEvent) => {
      triggerPopAnimation(e.currentTarget as HTMLElement);
      navigatePage(1);
    };
    dom.headerNextBtn.addEventListener("click", onNextClick);
    mainUnsubscribers.push(() => dom.headerNextBtn?.removeEventListener("click", onNextClick));
  }

  const clearSearchBtn = dom.searchForm?.querySelector(".search-icon--clear");
  if (clearSearchBtn) {
    const onClearPointerDown = (e: Event) => {
      e.preventDefault();
      e.stopPropagation();

      if (dom.searchInput && dom.searchInput.value) {
        dom.searchInput.value = "";
        dom.searchInput.focus();
        handleSearchInput();
      } else {
        dom.searchInput?.blur();
      }
    };
    clearSearchBtn.addEventListener("pointerdown", onClearPointerDown);
    mainUnsubscribers.push(() => clearSearchBtn.removeEventListener("pointerdown", onClearPointerDown));
  }

  const updateSearchPlaceholder = () => {
    if (dom.searchInput) dom.searchInput.placeholder = window.innerWidth <= 768 ? "" : "Título";
  };
  const debouncedResize = debounce(updateSearchPlaceholder, 250);
  window.addEventListener("resize", debouncedResize);
  mainUnsubscribers.push(() => window.removeEventListener("resize", debouncedResize));
  updateSearchPlaceholder();
}

let isMainEventsInitialized = false;
let isMainInitialized = false;
let mainLifecycleGen = 0;
let mainUnsubscribers: Array<() => void> = [];

export function disposeMainEvents(): void {
  mainLifecycleGen++;
  mainUnsubscribers.forEach(unsub => unsub());
  mainUnsubscribers = [];
  if (scrollTimer) {
    clearTimeout(scrollTimer);
    scrollTimer = null;
  }
  if (scrollRafId !== null && typeof cancelAnimationFrame === "function") {
    cancelAnimationFrame(scrollRafId);
    scrollRafId = null;
  }
  isTicking = false;
  sidebarModule = null;
  isMainEventsInitialized = false;
  isMainInitialized = false;
  isAuthInitialized = false;
}

export async function disposeApp(): Promise<void> {
  disposeMainEvents();

  try {
    const { disposeModalEvents } = await import("./components/modal.js");
    disposeModalEvents();
  } catch (e) { }

  try {
    disposeCardEvents();
  } catch (e) { }

  try {
    const { disposeSidebarEvents } = await import("./components/sidebar.js");
    disposeSidebarEvents();
  } catch (e) { }

  sidebarModule = null;
}




function setupGlobalListeners(): void {
  if (isMainEventsInitialized) return;
  isMainEventsInitialized = true;

  // Protección integral de imágenes (evita menú contextual, descarga y arrastre)
  const handleContextMenu = (e: MouseEvent) => {
    const target = e.target as HTMLElement;
    if (target.tagName === "IMG" || target.closest(".poster-container") || target.classList.contains("poster-overlay-guard")) {
      e.preventDefault();
    }
  };

  const handleDragStart = (e: DragEvent) => {
    const target = e.target as HTMLElement;
    if (target.tagName === "IMG" || target.closest(".poster-container") || target.classList.contains("poster-overlay-guard")) {
      e.preventDefault();
    }
  };

  const handleDocClick = (e: MouseEvent) => {
    const target = e.target as HTMLElement;
    if (!target.closest(SELECTORS.SIDEBAR_FILTER_FORM)) clearAllSidebarAutocomplete();
    if (!target.closest(".sidebar") && sidebarModule) sidebarModule.collapseAllSections();
  };

  document.addEventListener("contextmenu", handleContextMenu);
  document.addEventListener("dragstart", handleDragStart);
  document.addEventListener("click", handleDocClick);

  mainUnsubscribers.push(() => {
    document.removeEventListener("contextmenu", handleContextMenu);
    document.removeEventListener("dragstart", handleDragStart);
    document.removeEventListener("click", handleDocClick);
  });

  if (dom.gridContainer) {
    const handleGridClick = async function (e: Event) {
      const target = e.target as HTMLElement;
      const cardElement = target.closest(".movie-card") as HTMLElement | null;
      if (cardElement) {
        // Prevenir navegación nativa antes de cargar el módulo
        const filterLink = target.closest("[data-director-name], [data-actor-name]");
        if (filterLink && !(e as MouseEvent).ctrlKey && !(e as MouseEvent).metaKey && !(e as MouseEvent).shiftKey && (e as MouseEvent).button !== 1) {
          e.preventDefault();
        }

        handleCardClick.call(cardElement, e as MouseEvent);
        return;
      }

      if (target.closest("#clear-filters-from-empty")) {
        appEvents.emit("filtersReset");
      }
    };

    dom.gridContainer.addEventListener("click", handleGridClick);
    mainUnsubscribers.push(() => dom.gridContainer?.removeEventListener("click", handleGridClick));
  }

  // Interacciones Card (Hover, Tap)
  if (dom.gridContainer) {
    initCardInteractions(dom.gridContainer);
  }

  const quickViewContent = document.getElementById("quick-view-content");
  if (quickViewContent) {
    const handleQuickViewClick = function (this: HTMLElement, e: Event) {
      handleCardClick.call(this, e as MouseEvent);
    };

    quickViewContent.addEventListener("click", handleQuickViewClick);
    mainUnsubscribers.push(() => quickViewContent.removeEventListener("click", handleQuickViewClick));
  }

  if (dom.paginationContainer) {
    const handlePaginationClick = async (e: Event) => {
      const target = e.target as HTMLElement;
      const button = target.closest(".btn[data-page]") as HTMLElement | null;
      if (button && button.dataset.page) {
        appEvents.emit("uiActionTriggered");
        triggerPopAnimation(button);
        const page = parseInt(button.dataset.page, 10);
        await loadAndRenderMovies(page);
      }
    };

    dom.paginationContainer.addEventListener("click", handlePaginationClick);
    mainUnsubscribers.push(() => dom.paginationContainer?.removeEventListener("click", handlePaginationClick));
  }

  lastScrollY = window.scrollY;
  window.addEventListener("scroll", handleGlobalScroll, { passive: true });
  mainUnsubscribers.push(() => window.removeEventListener("scroll", handleGlobalScroll));

  const handleEscKey = (e: KeyboardEvent) => {
    if (e.key === "Escape" && document.body.classList.contains(CSS_CLASSES.SIDEBAR_OPEN)) {
      if (document.body.classList.contains(CSS_CLASSES.MODAL_OPEN)) return;
      if (sidebarModule) sidebarModule.closeMobileDrawer();
    }
  };

  document.addEventListener("keydown", handleEscKey);
  mainUnsubscribers.push(() => document.removeEventListener("keydown", handleEscKey));

  const handleDataRefresh = () => {
    document.querySelectorAll(".movie-card").forEach((el) => updateCardUI(el as HTMLElement));
    updateAppBadge();
  };

  // Eventos Personalizados de la App
  mainUnsubscribers.push(
    appEvents.on("card:requestUpdate", (data: { cardElement: HTMLElement }) => {
      if (data && data.cardElement) {
        updateCardUI(data.cardElement);
      }
    }),

    appEvents.on("userMovieDataChanged", () => {
      handleDataRefresh();
      if (getActiveFilters().myList) {
        loadAndRenderMovies(getCurrentPage());
      }
    }),

    appEvents.on("userDataUpdated", () => {
      handleDataRefresh();
    }),

    appEvents.on("uiActionTriggered", clearToast),
    appEvents.on("filtersReset", handleFiltersReset),
    appEvents.on("filter:apply", handleFilterApply),

    appEvents.on("page:requestChange", async (data: { direction: number; target: 'first' | 'last' }) => {
      const { direction, target } = data;
      const currentPage = getCurrentPage();
      const isWallMode = document.body.classList.contains(CSS_CLASSES.ROTATION_DISABLED);
      const totalPages = Math.ceil(getTotalMovies() / (isWallMode ? CONFIG.WALL_MODE_ITEMS_PER_PAGE : CONFIG.ITEMS_PER_PAGE));
      const newPage = currentPage + direction;

      if (newPage > 0 && newPage <= totalPages) {
        appEvents.emit("uiActionTriggered");
        await loadAndRenderMovies(newPage);

        const grid = document.getElementById("grid-container");
        if (grid) {
          const cards = Array.from(grid.querySelectorAll<HTMLElement>(".movie-card[data-movie-id]"));
          if (cards.length > 0) {
            const targetCard = target === "first" ? cards[0] : cards[cards.length - 1];
            const { openModal } = await import("./components/modal.js");
            openModal(targetCard as any, cards);
          }
        }
      }
    })
  );
}




// --- 5. ENCHUFAR LA AUTENTICACIÓN ---
function setupAuthSystem(): void {
  const userAvatarInitials = document.getElementById("user-avatar-initials");
  const logoutButton = document.getElementById("logout-button");
  const loginButton = document.getElementById("login-button");
  const userSessionGroup = document.getElementById("user-session-group");
  let lastUserId: string | null | undefined = undefined;

  async function onLogin(user: User) {
    document.body.classList.add(CSS_CLASSES.USER_LOGGED_IN);
    if (loginButton) loginButton.hidden = true;
    if (userSessionGroup) userSessionGroup.hidden = false;

    const userEmail = user.email || "";
    if (userAvatarInitials) {
      userAvatarInitials.textContent = userEmail.charAt(0).toUpperCase();
      userAvatarInitials.title = `Sesión iniciada como: ${userEmail}`;
    }
    isAuthInitialized = true;
    clearCheckedUserMovieIds();

    // Sincronización Local-First (Merge on Login): fusiona catálogo remoto con el local
    try {
      await mergeOnLogin(user.id);
    } catch (err) {
      if (import.meta.env.DEV) console.error("Error al sincronizar catálogo del usuario:", err);
    }

    appEvents.emit("userDataUpdated");
  }

  function onLogout() {
    document.body.classList.remove(CSS_CLASSES.USER_LOGGED_IN);
    if (loginButton) loginButton.hidden = false;
    if (userSessionGroup) userSessionGroup.hidden = true;

    if (userAvatarInitials) {
      userAvatarInitials.textContent = "";
      userAvatarInitials.title = "";
    }
    clearUserMovieData();
    clearAppBadge();
    appEvents.emit("userDataUpdated");
    isAuthInitialized = true;
  }

  async function handleLogout() {
    const supabase = await getSupabase();
    const { error } = await supabase.auth.signOut();
    if (error) {
      if (import.meta.env.DEV) console.error("Logout error:", error);
      showToast("Error al cerrar sesión.", "error");
    }
  }

  const userProfileButton = document.getElementById("user-profile-button");

  if (userProfileButton) {
    const onProfileClick = async () => {
      const { openProfileModal } = await import("./components/profile.js");
      openProfileModal();
    };
    userProfileButton.addEventListener("click", onProfileClick);
    mainUnsubscribers.push(() => userProfileButton.removeEventListener("click", onProfileClick));
  }

  if (logoutButton) {
    logoutButton.addEventListener("click", handleLogout);
    mainUnsubscribers.push(() => logoutButton.removeEventListener("click", handleLogout));
  }

  let authSubscription: { unsubscribe: () => void } | null = null;
  const authGen = mainLifecycleGen;

  // Inicializar listeners del panel de perfil de usuario
  import("./components/profile.js").then(({ setupProfileModal }) => {
    if (authGen !== mainLifecycleGen) return;
    const cleanupProfile = setupProfileModal();
    mainUnsubscribers.push(cleanupProfile);
  }).catch(() => {});

  getSupabase().then(supabase => {
    if (authGen !== mainLifecycleGen) return;
    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      if (authGen !== mainLifecycleGen) return;
      const currentUser = session?.user || null;
      const currentUserId = currentUser?.id || null;

      if (event === "PASSWORD_RECOVERY") {
        import("./auth.js").then(({ showResetPasswordView }) => {
          if (authGen !== mainLifecycleGen) return;
          showResetPasswordView();
        });
      }

      if (currentUser) {
        onLogin(currentUser);
      } else {
        onLogout();
      }

      // Limpieza preventiva del hash de redirección para todos los casos de retorno OTP/Magic Link
      const hasAuthHash = window.location.hash.includes("access_token=") ||
        window.location.hash.includes("error_code=") ||
        window.location.hash.includes("error=");

      if (hasAuthHash && !window.location.hash.includes("type=recovery")) {
        window.history.replaceState(null, "", window.location.pathname + window.location.search);
      }

      // Si el usuario cambia realmente (login o logout manual) tras la carga inicial, refrescar grid
      if (lastUserId !== undefined && currentUserId !== lastUserId) {
        lastUserId = currentUserId;
        loadAndRenderMovies(getCurrentPage());
      } else {
        lastUserId = currentUserId;
      }
    });

    if (data?.subscription) {
      authSubscription = data.subscription;
    }

    // Control preventivo de carrera: si la página cargó con el hash de recuperación,
    // forzar la vista de restablecimiento por si el evento inicial ya se disparó.
    if (window.location.hash.includes("type=recovery")) {
      import("./auth.js").then(({ showResetPasswordView }) => {
        if (authGen !== mainLifecycleGen) return;
        showResetPasswordView();
      });
    } else if (window.location.hash.includes("error_code=") || window.location.hash.includes("error=")) {
      if (window.location.hash.includes("error_code=otp_expired") || window.location.hash.includes("expired")) {
        showToast("El enlace de recuperación ha expirado. Solicita uno nuevo.", "error");
      } else {
        showToast("El enlace de autenticación no es válido o ha expirado.", "error");
      }
      window.history.replaceState(null, "", window.location.pathname + window.location.search);
    }
  });

  mainUnsubscribers.push(() => {
    if (authSubscription) {
      authSubscription.unsubscribe();
      authSubscription = null;
    }
  });
}



function readUrlAndSetState(): void {
  syncStateWithUrl(window.location.pathname, window.location.search);
  // Canonicalizar la URL después de normalizar el estado (sin añadir entrada al historial)
  canonicalizeCurrentUrl();

  const activeFilters = getActiveFilters();
  if (dom.searchInput) dom.searchInput.value = activeFilters.searchTerm || "";
  if (dom.sortSelect) dom.sortSelect.value = activeFilters.sort;
  updateTypeFilterUI(activeFilters.mediaType as "movies" | "series" | "all");
  updateMobileStatusBar();
}

function updateUrl({ replace = false }: { replace?: boolean } = {}): void {
  const basePrefix = getAppBasePath();
  const { pathname, search } = stateToPrettyUrl(getActiveFilters(), getCurrentPage());
  const cleanPath = search ? `${pathname}?${search}` : pathname;
  const newUrl = `${basePrefix}${cleanPath}`;
  const currentFullUrl = `${window.location.pathname}${window.location.search}`;

  if (newUrl !== currentFullUrl) {
    saveCurrentScrollPosition();
    if (typeof window !== "undefined" && window.history) {
      if (replace) {
        window.history.replaceState({ ...window.history.state, path: newUrl }, "", newUrl);
      } else {
        window.history.pushState({ path: newUrl, scrollY: 0 }, "", newUrl);
      }
    }
  }
}


export function init(): void {
  if (isMainInitialized) return;
  isMainInitialized = true;

  if (typeof window !== "undefined" && window.history && "scrollRestoration" in window.history) {
    window.history.scrollRestoration = "manual";
  }

  requestAnimationFrame(() => {
    document.querySelectorAll("[data-loading]").forEach(el => {
      el.removeAttribute("data-loading");
    });
  });


  // Restaurar estado de rotación (Modo Muro) antes de renderizar para evitar saltos visuales
  if (LocalStore.get("rotationState") === "disabled") {
    document.body.classList.add(CSS_CLASSES.ROTATION_DISABLED);
  }

  // Hidratación inmediata Local-First desde IndexedDB (0 ms de latencia inicial)
  getAllLocalEntries().then(localEntries => {
    if (Object.keys(localEntries).length > 0) {
      setUserMovieData(localEntries);
      appEvents.emit("userDataUpdated");
    }
  }).catch(() => {});

  // Registrar listeners de sincronización de fondo (online, visibilitychange)
  const cleanupSync = initSyncListeners();
  mainUnsubscribers.push(cleanupSync);

  if ("serviceWorker" in navigator) {
    const notifySwUpdate = (worker: ServiceWorker) => {
      showToast(
        "Nueva versión disponible",
        "info",
        {
          label: "Actualizar",
          onClick: () => {
            worker.postMessage({ type: "SKIP_WAITING" });
          }
        }
      );
    };

    const onSwLoad = () => {
      const basePrefix = getAppBasePath();
      const swPath = basePrefix ? `${basePrefix}/sw.js` : "/sw.js";
      navigator.serviceWorker.register(swPath).then((registration) => {
        // 1. Si ya hay un worker en espera (ej. otra pestaña instaló la actualización)
        if (registration.waiting && navigator.serviceWorker.controller) {
          notifySwUpdate(registration.waiting);
        }

        // 2. Escuchar cuando un nuevo worker termina de instalarse
        registration.addEventListener("updatefound", () => {
          const installingWorker = registration.installing;
          if (!installingWorker) return;

          installingWorker.addEventListener("statechange", () => {
            if (installingWorker.state === "installed" && navigator.serviceWorker.controller) {
              notifySwUpdate(installingWorker);
            }
          });
        });
      }).catch(err => {
        if (import.meta.env.DEV) console.error("Fallo SW:", err);
      });

      let refreshing = false;
      navigator.serviceWorker.addEventListener("controllerchange", () => {
        if (refreshing) return;
        refreshing = true;
        window.location.reload();
      });
    };

    window.addEventListener("load", onSwLoad);
    mainUnsubscribers.push(() => window.removeEventListener("load", onSwLoad));
  }

  const handlePopState = async () => {
    const { isModalOpen, closeModal } = await import("./components/modal.js");

    let modalWasOpen = false;

    if (isModalOpen()) {
      closeModal({ fromPopstate: true });
      modalWasOpen = true;
    }

    if (isAuthModalOpen()) {
      closeAuthModal({ fromPopstate: true });
      modalWasOpen = true;
    }

    if (isLegalModalOpen()) {
      closeLegalModal({ fromPopstate: true });
      modalWasOpen = true;
    }

    const { isProfileModalOpen, closeProfileModal } = await import("./components/profile.js");
    if (isProfileModalOpen()) {
      closeProfileModal(true);
      modalWasOpen = true;
    }

    // Si había una modal abierta o el popstate fue originado por un cierre de modal previo
    if (modalWasOpen || consumeIsClosingModalViaHistory()) {
      return;
    }

    // Comprobar si la URL canónica actual difiere de la URL a la que navegó el usuario
    const basePrefix = getAppBasePath();
    const { pathname: canonPath, search: canonSearch } = stateToPrettyUrl(getActiveFilters(), getCurrentPage());
    const canonFull = `${basePrefix}${canonPath}${canonSearch ? `?${canonSearch}` : ""}`;

    const incomingPath = window.location.pathname;
    const incomingParams = new URLSearchParams(window.location.search);
    const normalizedIncomingQuery = incomingParams.toString();
    const incomingFull = `${incomingPath}${normalizedIncomingQuery ? `?${normalizedIncomingQuery}` : ""}`;

    // Si los filtros, ruta y página son exactamente los mismos, no recargar el grid
    if (canonFull === incomingFull) {
      return;
    }

    const historyState = window.history.state as { scrollY?: number } | null;
    const targetScrollY = (typeof historyState?.scrollY === "number")
      ? historyState.scrollY
      : (scrollPositionsCache.get(incomingFull) ?? 0);

    readUrlAndSetState(); // sincroniza estado con la nueva URL e invoca canonicalizeCurrentUrl()
    appEvents.emit("updateSidebarUI");
    loadAndRenderMovies(getCurrentPage(), { replaceHistory: true, restoreScrollY: targetScrollY });
  };


  window.addEventListener("popstate", handlePopState);
  mainUnsubscribers.push(() => window.removeEventListener("popstate", handlePopState));

  setupAuthSystem(); // Iniciar sesión de inmediato para resolver la carga limpia de la landing page

  const idleGen = mainLifecycleGen;
  mainUnsubscribers.push(
    runWhenIdle(() => {
      if (idleGen !== mainLifecycleGen) return;
      loadSidebar();
      setupAuthModal();
      setupLegalModal();
    }, 1000)
  );


  initThemeToggle();
  setupHeaderListeners();
  setupGlobalListeners();

  const loginBtn = document.getElementById("login-button");
  if (loginBtn) {
    const onLoginClick = async () => {
      try {
        const { initAuthForms } = await import("./auth.js") as unknown as { initAuthForms(): void };
        initAuthForms();
      } catch (e) {
        if (import.meta.env.DEV) console.error("Error loading auth module", e);
      }
    };
    loginBtn.addEventListener("click", onLoginClick, { once: true });
    mainUnsubscribers.push(() => loginBtn.removeEventListener("click", onLoginClick));
  }

  // Recuperar peticiones de red atascadas y sincronizar datos de usuario al recuperar el foco de la pestaña
  const handleMainVisibilityChange = () => {
    if (document.visibilityState === "visible") {
      scheduleSync(300);
      if (document.body.classList.contains(CSS_CLASSES.IS_FETCHING)) {
        loadAndRenderMovies(getCurrentPage());
      }
    }
  };

  document.addEventListener("visibilitychange", handleMainVisibilityChange);
  mainUnsubscribers.push(() => document.removeEventListener("visibilitychange", handleMainVisibilityChange));

  const initialUrlParams = new URLSearchParams(window.location.search);
  const targetMovieId = initialUrlParams.get("movie") || initialUrlParams.get("peli");
  const initialScrollY = typeof window.history.state?.scrollY === "number" ? window.history.state.scrollY : null;

  readUrlAndSetState();
  appEvents.emit("updateSidebarUI");

  // Iniciar la carga y renderizado del catálogo INMEDIATAMENTE
  loadAndRenderMovies(getCurrentPage(), { replaceHistory: true, forceSkeleton: true, restoreScrollY: initialScrollY })
    .then(async () => {
      if (targetMovieId) {
        const grid = dom.gridContainer || document.getElementById("grid-container");
        const cards = grid ? Array.from(grid.querySelectorAll<HTMLElement>(".movie-card[data-movie-id]")) : [];
        const card = grid?.querySelector<MovieCardElement>(`.movie-card[data-movie-id="${targetMovieId}"]`);
        const { openModal, openModalForMovie } = await import("./components/modal.js");
        if (card && card.movieData) {
          openModal(card, cards);
        } else {
          const movie = await fetchMovieById(targetMovieId);
          if (movie) {
            openModalForMovie(movie);
          }
        }
      }
    })
    .catch(err => {
      if (import.meta.env.DEV) console.error("Error en carga inicial del catálogo:", err);
    });
}


if (typeof document !== "undefined" && !import.meta.env?.SSR && !Boolean((window as unknown as Record<string, unknown>)?._isTestEnv)) {
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
}


