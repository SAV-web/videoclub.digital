/// <reference types="vite/client" />

// =================================================================
//          MOTOR DE CATÁLOGO Y RENDERIZADO (renderEngine.ts)
// =================================================================
// FICHERO: src/js/renderEngine.ts
// RESPONSABILIDAD: Petición de películas y VIPs a la capa API, cálculo
// de paginación y orfandad, renderizado del grid/skeletons/estados vacíos,
// sincronización de datos de usuario y actualización de metadatos SEO.
// =================================================================

import { CONFIG, CSS_CLASSES } from "./constants.js";
import {
  getFriendlyErrorMessage,
  preloadLcpImage,
  createAbortableRequest,
  getAdjustedTotalPages,
  normalizeText
} from "./utils.js";

import {
  fetchMovies,
  fetchPersonDetails,
  fetchGroupDetails,
  fetchUserMovieDataForIds
} from "./api.js";

import { isAbortError, toSlug } from "./contracts.js";
import { updatePageTitle, updateStructuredData, updateBreadcrumbData } from "./seo.js";
import {
  dom,
  renderPagination,
  updateHeaderPaginationState,
  updateTypeFilterUI,
  updateTotalResultsUI,
  showToast
} from "./ui.js";

import {
  renderMovieGrid,
  renderSkeletons,
  renderNoResults,
  renderErrorState,
  runFlipOnboarding
} from "./components/card/index.js";

import {
  getActiveFilters,
  getCurrentPage,
  setCurrentPage,
  getTotalMovies,
  setTotalMovies,
  setFilter,
  updateUserDataForMovie,
  appEvents
} from "./state.js";

import { updateUrl } from "./router.js";
import type { MappedMovie, VipData } from "./types.js";

export interface RenderOptions {
  replaceHistory?: boolean;
  forceSkeleton?: boolean;
  isYearFilter?: boolean;
  restoreScrollY?: number | null;
}

/**
 * Carga películas según el estado activo y las pinta en la cuadrícula principal.
 */
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
  let activeFilters = getActiveFilters();
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
              activeFilters = getActiveFilters();
              updatePageTitle();
              updateBreadcrumbData(activeFilters);
            }
          }

          const isVip = personData.vip === 1 || Boolean(personData.birthday);
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

    let result = await fetchMovies(
      activeFilters,
      page,
      fetchLimit,
      signal,
      shouldRequestCount,
      fetchOffset
    );

    if (skeletonTimeout) clearTimeout(skeletonTimeout);

    if (result.aborted) {
      if (signal.aborted) return;
      // Si la petición fue abortada externamente pero este signal sigue activo,
      // reintentamos de forma transparente una vez antes de desistir
      const retryResult = await fetchMovies(
        activeFilters,
        page,
        fetchLimit,
        signal,
        shouldRequestCount,
        fetchOffset
      );
      if (retryResult.aborted || signal.aborted) return;
      result = retryResult;
    }

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

/**
 * Pone las películas en pantalla, gestiona orfandad de páginas y actualiza metadatos SEO.
 */
export async function updateDomWithResults(
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
