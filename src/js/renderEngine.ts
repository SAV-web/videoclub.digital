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
  runWhenIdle
} from "./utils.js";

import {
  fetchMovies,
  fetchPersonDetails,
  fetchGroupDetails
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
  hasActiveMeaningfulFilters,
  appEvents
} from "./state.js";

import { updateUrl } from "./router.js";
import type { MappedMovie, VipData, PersonDetails } from "./types.js";

export interface RenderOptions {
  replaceHistory?: boolean;
  forceSkeleton?: boolean;
  isYearFilter?: boolean;
  restoreScrollY?: number | null;
}

interface GridPaginationMetrics {
  gridTotalItems: number;
  totalPages: number;
  lastPageSlots: number;
  isOrphanPage: boolean;
  logicalGridTotalItems: number;
}

let isInitialSeoDone = false;

/**
 * Inyecta metadatos estructurados (JSON-LD ItemList y Breadcrumbs) de forma no bloqueante
 * única y exclusivamente en el arranque en frío (Initial Load) para rastreadores web,
 * desacoplándolo del hilo principal mediante runWhenIdle y omitiéndolo en navegaciones interactivas.
 */
function scheduleInitialSeo(movies: MappedMovie[], total: number): void {
  if (isInitialSeoDone) return;
  isInitialSeoDone = true;
  runWhenIdle(() => {
    updateStructuredData(movies, total);
    updateBreadcrumbData(getActiveFilters());
  });
}

export function resetInitialSeoState(): void {
  isInitialSeoDone = false;
}

/**
 * Calcula las métricas de paginación del grid, considerando tarjetas VIP y absorción de orfandad (<= 2 slots).
 */
function computeGridPaginationMetrics(
  totalMovies: number,
  baseLimit: number,
  hasVip: boolean
): GridPaginationMetrics {
  const gridTotalItems = hasVip ? (totalMovies >= 0 ? totalMovies + 1 : 1) : (totalMovies >= 0 ? totalMovies : 0);
  const totalPages = totalMovies >= 0 ? getAdjustedTotalPages(gridTotalItems, baseLimit) : 1;
  const lastPageSlots = gridTotalItems % baseLimit || baseLimit;
  const isOrphanPage = (Math.ceil(gridTotalItems / baseLimit) > 1) && lastPageSlots <= 2;
  const logicalGridTotalItems = isOrphanPage ? totalPages * baseLimit : gridTotalItems;

  return {
    gridTotalItems,
    totalPages,
    lastPageSlots,
    isOrphanPage,
    logicalGridTotalItems,
  };
}

/**
 * Si el nombre canónico de la persona en la base de datos difiere del filtro actual
 * pero coincide al normalizar (ignorando guiones y símbolos), actualiza el filtro,
 * el título de la página y el Sidebar al nombre canónico bien escrito.
 */
function syncPersonFilterName(
  personData: PersonDetails,
  vipType: "director" | "actor",
  vipName: string
): void {
  if (!personData.name || personData.name === vipName) return;
  const cleanDb = toSlug(personData.name).replace(/-/g, "");
  const cleanFilter = toSlug(vipName).replace(/-/g, "");
  if (cleanDb === cleanFilter) {
    setFilter(vipType, personData.name, true);
    updatePageTitle();
    appEvents.emit("updateSidebarUI");
  }
}

/**
 * Carga películas según el estado activo y las pinta en la cuadrícula principal.
 */
export async function loadAndRenderMovies(
  page = 1,
  { replaceHistory = false, forceSkeleton = false, isYearFilter = false, restoreScrollY = null }: RenderOptions = {}
): Promise<void> {
  const signal = createAbortableRequest("movie-grid-load").signal;

  // 1. Actualizar estado -> 2. Actualizar URL -> 3. Actualizar SEO canónico -> 4. Lanzar fetch
  setCurrentPage(page);
  updateUrl({ replace: replaceHistory });
  updatePageTitle();

  document.body.classList.add(CSS_CLASSES.IS_FETCHING);
  dom.gridContainer?.classList.add(CSS_CLASSES.IS_FETCHING);
  dom.gridContainer?.setAttribute("aria-busy", "true");

  let skeletonTimeout: ReturnType<typeof setTimeout> | null = null;

  // Diferenciar:
  // 1. Primera carga / ausencia de contenido previo / forzado explícito -> Usar skeleton normalmente.
  // 2. Navegación con contenido ya visible -> Mantener temporalmente el grid anterior (.is-fetching)
  //    sin parpadeo de skeletons hasta que la nueva respuesta lo sustituya de una sola vez.
  const hasExistingContent = Boolean(
    dom.gridContainer?.querySelector(".movie-card, .person-card, .collection-card")
  );

  if (forceSkeleton || !hasExistingContent) {
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
  }

  const currentKnownTotal = getTotalMovies();
  let activeFilters = getActiveFilters();
  updateHeaderPaginationState(getCurrentPage(), currentKnownTotal);
  updateTypeFilterUI(activeFilters.mediaType as "movies" | "series" | "all");

  try {
    let vipData: VipData | null = null;
    let confirmedHasVip = false;

    const vipType = (!activeFilters.myList && !activeFilters.searchTerm)
      ? (activeFilters.director ? "director" as const : (activeFilters.actor ? "actor" as const : null))
      : null;
    const vipName = vipType ? (activeFilters.director || activeFilters.actor) : null;
    const hasGroupVip = !activeFilters.myList && !activeFilters.searchTerm && (!!activeFilters.selection || !!activeFilters.studio);

    const isWallMode = document.body.classList.contains(CSS_CLASSES.ROTATION_DISABLED);
    const basePageSize = isWallMode ? CONFIG.WALL_MODE_ITEMS_PER_PAGE : CONFIG.ITEMS_PER_PAGE;
    const firstPageLimit = isWallMode ? CONFIG.WALL_MODE_DYNAMIC_PAGE_SIZE_LIMIT : CONFIG.DYNAMIC_PAGE_SIZE_LIMIT;

    // Promesas para entidades especiales (colecciones, estudios y personas en página 1),
    // que permiten paralelizar su obtención con el catálogo en la misma ráfaga de red
    let groupPromise: Promise<{ type: "collection" | "studio"; code: string; thumbhash_st: string | null }> | null = null;
    let personPromise: Promise<PersonDetails | null> | null = null;

    let fetchLimit: number = basePageSize;
    let fetchOffset = (page - 1) * basePageSize;

    if (hasGroupVip) {
      // 1. Grupos (Colecciones y Estudios): El VIP es determinista y estático (siempre hay tarjeta VIP en pág 1).
      confirmedHasVip = true;
      const groupType = activeFilters.selection ? "selection" : "studio";
      const groupCode = (activeFilters.selection || activeFilters.studio) as string;
      groupPromise = fetchGroupDetails(groupType, groupCode).then(data => ({
        type: groupType === "selection" ? "collection" as const : "studio" as const,
        code: groupCode,
        thumbhash_st: data?.thumbhash_st || null
      }));

      if (page === 1) {
        fetchLimit = firstPageLimit - 1;
        fetchOffset = 0;
      } else {
        fetchLimit = basePageSize + 2;
        fetchOffset = ((page - 1) * basePageSize) - 1;
      }
    } else if (vipType && vipName) {
      // 2. Personas (Directores y Actores)
      if (page === 1) {
        // En página 1, el offset es invariablemente 0. Disparamos la consulta de persona y catálogo
        // 100% en paralelo (eliminando el Waterfall de ~80-120 ms). Solicitamos la cuota completa
        // firstPageLimit (44) y, si tras responder resulta ser VIP, podamos el ítem sobrante en memoria.
        fetchLimit = firstPageLimit;
        fetchOffset = 0;
        personPromise = fetchPersonDetails(vipType, vipName);
      } else {
        // En página 2+, el offset depende estrictamente del estatus VIP (41 si es VIP, 42 si no).
        // Al haber navegado previamente por la pág 1, personCache responde síncronamente en 0 ms.
        const personData = await fetchPersonDetails(vipType, vipName);
        if (personData) {
          syncPersonFilterName(personData, vipType, vipName);
          const isVip = personData.vip === 1 || Boolean(personData.birthday);
          if (isVip) {
            confirmedHasVip = true;
            const personSlug = personData.slug || toSlug(personData.name);
            preloadLcpImage(`${CONFIG.PROFILE_BASE_URL}${personSlug}.webp`);
          }
        }
        fetchLimit = basePageSize + 2;
        fetchOffset = confirmedHasVip ? ((page - 1) * basePageSize) - 1 : (page - 1) * basePageSize;
      }
    } else {
      if (page === 1) {
        fetchLimit = firstPageLimit;
      } else {
        fetchLimit = basePageSize + 2;
      }
    }

    // En catálogo general limpio (/), mantenemos shouldRequestCount = false para no penalizar
    // el Fast-Path de ~1.5 ms de la primera página y resolvemos el conteo de forma diferida en background.
    // Cuando hay filtros activos (o filtro de año en pág > 1), solicitamos get_count = true directamente
    // en la primera llamada unificada para evitar duplicar peticiones RPC innecesarias a la base de datos.
    const hasFilters = hasActiveMeaningfulFilters() || Boolean(activeFilters.mediaType && activeFilters.mediaType !== 'all');
    const isCriticalCountNeeded = isYearFilter && page > 1;
    const shouldRequestCount = hasFilters || isCriticalCountNeeded;

    const catalogPromise = fetchMovies(
      activeFilters,
      page,
      fetchLimit,
      signal,
      shouldRequestCount,
      fetchOffset
    );

    const [groupResult, personData, catalogResult] = await Promise.all([
      groupPromise,
      personPromise,
      catalogPromise
    ]);

    if (groupResult && page === 1) {
      vipData = {
        type: groupResult.type,
        code: groupResult.code,
        thumbhash_st: groupResult.thumbhash_st
      };
    } else if (personData && page === 1) {
      if (vipName) {
        syncPersonFilterName(personData, vipType!, vipName);
      }
      const isVip = personData.vip === 1 || Boolean(personData.birthday);
      if (isVip) {
        confirmedHasVip = true;
        const personSlug = personData.slug || toSlug(personData.name);
        preloadLcpImage(`${CONFIG.PROFILE_BASE_URL}${personSlug}.webp`);
        vipData = { type: "person", data: personData };

        // Si es VIP en página 1, la tarjeta VIP consume 1 slot. Si el catálogo devolvió
        // la cuota completa (firstPageLimit = 44), podamos el ítem sobrante a 43 (firstPageLimit - 1).
        if (catalogResult.items && catalogResult.items.length > firstPageLimit - 1) {
          catalogResult.items = catalogResult.items.slice(0, firstPageLimit - 1);
        }
      }
    } else if (!personData && vipType && page === 1 && (!catalogResult.items || catalogResult.items.length === 0)) {
      setFilter(vipType, null, true);
      updatePageTitle();
      appEvents.emit("updateSidebarUI");
    }

    let result = catalogResult;

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

    // Determinamos si el total ya es conocido con certeza:
    // 1. Si la respuesta vino con total >= 0 (de caché o consulta con conteo).
    // 2. Si estamos en página 1 y devolvió menos películas que el límite, el total es exactamente movies.length.
    let effectiveTotal = returnedTotal >= 0
      ? returnedTotal
      : (page === 1 && movies.length < fetchLimit ? movies.length : -1);

    // Si aún no tenemos total exacto pero teníamos un total previamente conocido en la misma sesión y no cambió el filtro:
    if (effectiveTotal < 0 && currentKnownTotal > 0 && !isYearFilter && page > 1) {
      effectiveTotal = currentKnownTotal;
    }

    // --- OPTIMIZACIÓN FILTRO DE AÑO ---
    if (isYearFilter) {
      const metrics = computeGridPaginationMetrics(effectiveTotal, basePageSize, confirmedHasVip);

      // 1. Si el número total de películas CAMBIÓ o la página actual excede el límite de páginas (ej: estamos en pág 2 pero solo hay 1 página):
      if ((effectiveTotal >= 0 && currentKnownTotal > 0 && effectiveTotal !== currentKnownTotal) || (effectiveTotal >= 0 && page > metrics.totalPages)) {
        const p1Limit = (confirmedHasVip) ? firstPageLimit - 1 : firstPageLimit;
        const p1Result = await fetchMovies(activeFilters, 1, p1Limit, signal, false, 0);
        if (p1Result.aborted) return;

        const p1Movies = p1Result.items || [];
        setCurrentPage(1);

        updateUrl({ replace: replaceHistory });

        await updateDomWithResults(p1Movies, effectiveTotal, vipData, confirmedHasVip);
        const targetScroll = restoreScrollY !== null ? restoreScrollY : 0;
        window.scrollTo({ top: targetScroll, behavior: "auto" });
        return;
      }

      // 2. Si el total NO cambió y estamos dentro del rango de páginas, comprobamos si las películas a renderizar en la página actual son idénticas:
      if (effectiveTotal >= 0 && currentKnownTotal > 0 && effectiveTotal === currentKnownTotal) {
        let slotBudget: number = basePageSize;
        if (page === metrics.totalPages) {
          slotBudget = metrics.isOrphanPage ? basePageSize + metrics.lastPageSlots : metrics.lastPageSlots;
        }
        const currentLimit = (page === 1 && confirmedHasVip) ? slotBudget - 1 : slotBudget;
        const moviesToRender = movies.length > currentLimit ? movies.slice(0, currentLimit) : movies;

        const currentCardEls = Array.from(dom.gridContainer?.querySelectorAll<HTMLElement>('.movie-card') || []);
        const currentCardIds = currentCardEls.map((el) => el.dataset.movieId || "").filter(Boolean);
        const newCardIds = moviesToRender.map((m) => String(m.id));

        const isIdenticalPage = currentCardIds.length === newCardIds.length &&
          currentCardIds.every((id, idx) => id === newCardIds[idx]);

        if (isIdenticalPage) {
          // Ningún cambio en las fichas en pantalla: actualizamos estado y metadatos sin refrescar el grid ni hacer scroll
          applyResolvedTotal(effectiveTotal, movies, confirmedHasVip, vipData);
          updatePageTitle(movies);
          return; // Salida limpia sin refresco del grid ni scroll
        }
      }
    }

    if (vipData && (vipData.type === "collection" || vipData.type === "studio")) {
      vipData.total = effectiveTotal;
    }

    // Pinta la cuadrícula con efecto cascada (Camino crítico inmediato)
    await updateDomWithResults(movies, effectiveTotal, vipData, confirmedHasVip);
    const targetScroll = restoreScrollY !== null ? restoreScrollY : 0;
    window.scrollTo({ top: targetScroll, behavior: "auto" });

    // --- CAMINO SECUNDARIO: Conteo en segundo plano (Post-Render Asíncrono no bloqueante) ---
    // Si el total aún no ha sido resuelto (effectiveTotal < 0), lanzamos la consulta de conteo
    // en segundo plano sin await, permitiendo que loadAndRenderMovies termine de inmediato
    // y el bloque finally retire .is-fetching y aria-busy, liberando la interactividad del grid.
    if (effectiveTotal < 0 && !signal.aborted) {
      fetchMovies(
        activeFilters,
        page,
        fetchLimit,
        signal,
        true, // get_count = true
        fetchOffset
      ).then((countResult) => {
        if (!signal.aborted && countResult.total >= 0) {
          applyResolvedTotal(countResult.total, movies, confirmedHasVip, vipData);
        }
      }).catch((countError: unknown) => {
        if (!isAbortError(countError, signal)) {
          if (import.meta.env.DEV) console.error("Error en camino secundario de conteo:", countError);
        }
      });
    }

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
 * Actualiza el total de películas, paginación, metadatos y tarjetas VIP
 * de forma atómica sin reconstruir el DOM de la cuadrícula (cero flicker).
 */
function applyResolvedTotal(
  exactTotal: number,
  movies: MappedMovie[],
  hasVip: boolean,
  vipData: VipData | null
): void {
  setTotalMovies(exactTotal);
  updateTotalResultsUI(exactTotal);
  scheduleInitialSeo(movies, exactTotal);

  if (vipData && (vipData.type === "collection" || vipData.type === "studio")) {
    vipData.total = exactTotal;
  }

  const currentPage = getCurrentPage();
  const isWallMode = typeof document !== "undefined" && document.body?.classList
    ? document.body.classList.contains(CSS_CLASSES.ROTATION_DISABLED)
    : false;
  const baseLimit = isWallMode ? CONFIG.WALL_MODE_ITEMS_PER_PAGE : CONFIG.ITEMS_PER_PAGE;

  const { totalPages, logicalGridTotalItems } = computeGridPaginationMetrics(exactTotal, baseLimit, hasVip);

  if (totalPages > 1) {
    renderPagination(dom.paginationContainer, logicalGridTotalItems, currentPage);
  } else {
    if (dom.paginationContainer) dom.paginationContainer.textContent = "";
  }
  updateHeaderPaginationState(currentPage, logicalGridTotalItems);
}

/**
 * Pone las películas en pantalla, gestiona orfandad de páginas y actualiza metadatos SEO.
 */
async function updateDomWithResults(
  movies: MappedMovie[],
  totalMovies: number,
  vipData: VipData | null = null,
  hasVip = false
): Promise<void> {
  const currentPage = getCurrentPage();
  const activeFilters = getActiveFilters();
  const isWallMode = document.body.classList.contains(CSS_CLASSES.ROTATION_DISABLED);
  const baseLimit = isWallMode ? CONFIG.WALL_MODE_ITEMS_PER_PAGE : CONFIG.ITEMS_PER_PAGE;
  const firstPageLimit = isWallMode ? CONFIG.WALL_MODE_DYNAMIC_PAGE_SIZE_LIMIT : CONFIG.DYNAMIC_PAGE_SIZE_LIMIT;

  updatePageTitle(movies);

  if (movies.length === 0) {
    setTotalMovies(0);
    updateTotalResultsUI(0);
    scheduleInitialSeo([], 0);
    renderNoResults(dom.gridContainer, dom.paginationContainer, activeFilters);
    updateHeaderPaginationState(1, 0);
    return;
  }

  // Presupuesto de slots de la página actual
  let slotBudget: number = baseLimit;
  if (totalMovies > 0) {
    const metrics = computeGridPaginationMetrics(totalMovies, baseLimit, hasVip);
    if (currentPage === metrics.totalPages) {
      slotBudget = metrics.isOrphanPage ? baseLimit + metrics.lastPageSlots : metrics.lastPageSlots;
    }
  } else if (currentPage === 1) {
    const returnedItemsCount = hasVip ? movies.length + 1 : movies.length;
    slotBudget = returnedItemsCount < firstPageLimit ? returnedItemsCount : baseLimit;
  }

  // Convertimos el presupuesto de slots en número de películas a renderizar
  const currentLimit = (currentPage === 1 && hasVip) ? slotBudget - 1 : slotBudget;
  const moviesToRender = movies.length > currentLimit ? movies.slice(0, currentLimit) : movies;

  await renderMovieGrid(dom.gridContainer, moviesToRender, vipData);

  if (totalMovies >= 0) {
    applyResolvedTotal(totalMovies, movies, hasVip, vipData);
  } else {
    // Si el total aún no se conoce, mantenemos estado provisional seguro sin romper la interfaz
    setTotalMovies(-1);
    updateTotalResultsUI(-1);
    scheduleInitialSeo(movies, movies.length);
    if (dom.paginationContainer) dom.paginationContainer.textContent = "";
    if (dom.headerPrevBtn) dom.headerPrevBtn.disabled = currentPage <= 1;
    if (dom.headerNextBtn) dom.headerNextBtn.disabled = movies.length < (currentPage === 1 && hasVip ? firstPageLimit - 1 : baseLimit);
  }

  const isCleanHome = currentPage === 1 &&
    !hasActiveMeaningfulFilters() &&
    (!activeFilters.mediaType || activeFilters.mediaType === "all");

  if (isCleanHome && movies.length > 0) {
    runFlipOnboarding(dom.gridContainer);
  }
}
