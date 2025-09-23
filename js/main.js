// =================================================================
//                  SCRIPT PRINCIPAL Y ORQUESTADOR
// =================================================================
// Este archivo es el cerebro de la aplicación. Se encarga de:
// 1. Importar todos los módulos necesarios.
// 2. Orquestar el flujo de datos principal (pedir datos y pintarlos).
// 3. Configurar todos los event listeners (clicks, cambios en selectores, etc.).
// 4. Gestionar el estado de la URL para permitir compartir y guardar búsquedas.
// 5. Inicializar la aplicación completa.

import { CONFIG } from './config.js';
import { debounce, triggerPopAnimation, getFriendlyErrorMessage, preloadLcpImage } from './utils.js';
import { fetchMovies } from './api.js';
import {
    dom, renderMovieGrid, renderSkeletons, renderNoResults, renderErrorState,
    renderPagination, updateTypeFilterUI,
    updateHeaderPaginationState,
    clearAllSidebarAutocomplete,
    setupCardInteractions,
    prefetchNextPage
} from './ui.js';
import { CSS_CLASSES, SELECTORS, DEFAULTS } from './constants.js';
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
    incrementRequestId,
    getLatestRequestId,
    resetFiltersState
} from './state.js';
import { showToast } from './toast.js';
import { initSidebar } from './components/sidebar.js';

// Mapa para compactar los parámetros de la URL.
const URL_PARAM_MAP = {
    q: 'searchTerm',
    genre: 'genre',
    year: 'year',
    country: 'country',
    dir: 'director',
    actor: 'actor',
    sel: 'selection',
    sort: 'sort',
    type: 'mediaType',
    p: 'page'
};

const REVERSE_URL_PARAM_MAP = Object.fromEntries(
    Object.entries(URL_PARAM_MAP).map(([key, value]) => [value, key])
);

// =================================================================
//                      LÓGICA PRINCIPAL DE DATOS
// =================================================================

async function loadAndRenderMovies(page = 1) {
    const requestId = incrementRequestId();
    setCurrentPage(page);
    updatePageTitle();
    updateUrl();
    dom.gridContainer.setAttribute('aria-busy', 'true');
    renderSkeletons(dom.gridContainer, dom.paginationContainer);
    updateHeaderPaginationState(getCurrentPage(), 0);

    try {
        const pageSize = page === 1 ? CONFIG.DYNAMIC_PAGE_SIZE_LIMIT : CONFIG.ITEMS_PER_PAGE;
        const { items: movies, total: totalMovies } = await fetchMovies(getActiveFilters(), page, pageSize);

        if (movies && movies.length > 0) {
            preloadLcpImage(movies[0]);
        }
        
        if (requestId !== getLatestRequestId()) return;

        setTotalMovies(totalMovies);
        const currentState = getState();

        if (currentState.totalMovies === 0) {
            renderNoResults(dom.gridContainer, dom.paginationContainer, getActiveFilters());
            updateHeaderPaginationState(1, 0);
        }
        else if (currentState.totalMovies <= CONFIG.DYNAMIC_PAGE_SIZE_LIMIT) {
            renderMovieGrid(dom.gridContainer, movies);
            setupCardInteractions();
            dom.paginationContainer.innerHTML = '';
            updateHeaderPaginationState(1, 1);
        }
        else {
            const moviesForPage = movies.slice(0, CONFIG.ITEMS_PER_PAGE);

            if (document.startViewTransition) {
                document.startViewTransition(() => {
                    renderMovieGrid(dom.gridContainer, moviesForPage);
                    setupCardInteractions();
                });
            } else {
                renderMovieGrid(dom.gridContainer, moviesForPage);
                setupCardInteractions();
            }

            renderPagination(dom.paginationContainer, currentState.totalMovies, currentState.currentPage);
            updateHeaderPaginationState(currentState.currentPage, currentState.totalMovies);
        }

        if (currentState.totalMovies > 0) {
             prefetchNextPage(currentState.currentPage, currentState.totalMovies, getActiveFilters());
        }

    } catch (error) {
        if (error.name === 'AbortError') {
            console.log('Petición de películas cancelada deliberadamente. Comportamiento esperado.');
            return;
        }
        console.error('Error en el proceso de carga:', error);
        const friendlyMessage = getFriendlyErrorMessage(error);
        showToast(friendlyMessage, 'error');
        renderErrorState(dom.gridContainer, dom.paginationContainer, friendlyMessage);
        updateHeaderPaginationState(1, 0);
    } finally {
        dom.gridContainer.setAttribute('aria-busy', 'false');
    }
}

// =================================================================
//          MANEJADORES DE EVENTOS (EVENT HANDLERS)
// =================================================================

async function handleSortChange(event) {
    triggerPopAnimation(event.target);
    document.dispatchEvent(new CustomEvent('uiActionTriggered'));
    setSort(dom.sortSelect.value);
    await loadAndRenderMovies(1);
}

async function handleMediaTypeToggle(event) {
    triggerPopAnimation(event.currentTarget);
    document.dispatchEvent(new CustomEvent('uiActionTriggered'));
    const currentType = getState().activeFilters.mediaType;
    const cycle = {'all': 'movies', 'movies': 'series', 'series': 'all'};
    const newType = cycle[currentType];
    setMediaType(newType);
    updateTypeFilterUI(newType);
    await loadAndRenderMovies(1);
}

async function handleSearchInput() {
    const searchTerm = dom.searchInput.value.trim();
    if (getState().activeFilters.searchTerm !== searchTerm) {
        document.dispatchEvent(new CustomEvent('uiActionTriggered'));
        setSearchTerm(searchTerm);
        await loadAndRenderMovies(1);
    }
}

// =================================================================
//          CONFIGURACIÓN DE EVENT LISTENERS
// =================================================================

function setupHeaderListeners() {
    const debouncedSearch = debounce(handleSearchInput, CONFIG.SEARCH_DEBOUNCE_DELAY);
    dom.searchInput.addEventListener('input', debouncedSearch);
    dom.searchForm.addEventListener('submit', (e) => { e.preventDefault(); handleSearchInput(); });

    dom.sortSelect.addEventListener('change', handleSortChange);
    dom.typeFilterToggle.addEventListener('click', handleMediaTypeToggle);

    dom.headerPrevBtn.addEventListener('click', async (e) => {
        triggerPopAnimation(e.currentTarget);
        if (getCurrentPage() > 1) {
            document.dispatchEvent(new CustomEvent('uiActionTriggered'));
            await loadAndRenderMovies(getCurrentPage() - 1);
            window.scrollTo({ top: 0, behavior: 'smooth' });
        }
    });
    dom.headerNextBtn.addEventListener('click', async (e) => {
        triggerPopAnimation(e.currentTarget);
        const totalPages = Math.ceil(getState().totalMovies / CONFIG.ITEMS_PER_PAGE);
        if (getCurrentPage() < totalPages) {
            document.dispatchEvent(new CustomEvent('uiActionTriggered'));
            await loadAndRenderMovies(getCurrentPage() + 1);
            window.scrollTo({ top: 0, behavior: 'smooth' });
        }
    });
}

/**
 * ✨ NUEVA FUNCIÓN: Configura los atajos de teclado globales para la aplicación.
 */
function setupKeyboardShortcuts() {
    document.addEventListener('keydown', (e) => {
        // Para evitar que los atajos se disparen mientras se escribe en un input.
        const activeElement = document.activeElement;
        const isTyping = activeElement.tagName === 'INPUT' || activeElement.tagName === 'TEXTAREA' || activeElement.isContentEditable;

        // Atajo para ESCAPE (limpiar autocompletado o desenfocar)
        if (e.key === 'Escape') {
            // La lógica de cerrar el autocompletado ya está en sidebar.js,
            // pero podemos añadir un desenfoque general como extra.
            if (isTyping) {
                activeElement.blur();
            }
        }
        
        // Si el usuario está escribiendo, no activamos el resto de los atajos.
        if (isTyping) {
            return;
        }

        switch (e.key) {
            // Atajo '/' para enfocar la barra de búsqueda.
            case '/':
                e.preventDefault(); // Evita que se escriba "/" en el campo.
                dom.searchInput.focus();
                break;

            // Atajo 'k' para ir a la página siguiente.
            case 'k':
                // Simulamos un clic en el botón "siguiente" si no está deshabilitado.
                if (dom.headerNextBtn && !dom.headerNextBtn.disabled) {
                    dom.headerNextBtn.click();
                }
                break;

            // Atajo 'j' para ir a la página anterior.
            case 'j':
                // Simulamos un clic en el botón "anterior" si no está deshabilitado.
                if (dom.headerPrevBtn && !dom.headerPrevBtn.disabled) {
                    dom.headerPrevBtn.click();
                }
                break;
        }
    });
}

function setupGlobalListeners() {
    document.addEventListener('click', (e) => {
        if (!e.target.closest(SELECTORS.SIDEBAR_FILTER_FORM)) {
            clearAllSidebarAutocomplete();
        }
    });

    dom.paginationContainer.addEventListener('click', async (e) => {
        const button = e.target.closest(SELECTORS.PAGINATION_BUTTON_ACTIVE);
        if (button) {
            document.dispatchEvent(new CustomEvent('uiActionTriggered'));
            triggerPopAnimation(button);
            const page = parseInt(button.dataset.page, 10);
            if (!isNaN(page)) {
                await loadAndRenderMovies(page);
                window.scrollTo({ top: 0, behavior: 'smooth' });
            }
        }
    });

    dom.gridContainer.addEventListener('click', async (e) => {
        if (e.target.id === 'clear-filters-from-empty') {
            document.dispatchEvent(new CustomEvent('filtersReset'));
        }
    });

    dom.themeToggleButton.addEventListener('click', (e) => {
        triggerPopAnimation(e.currentTarget);
        document.dispatchEvent(new CustomEvent('uiActionTriggered'));
        document.body.classList.toggle('dark-mode');
        localStorage.setItem('theme', document.body.classList.contains('dark-mode') ? 'dark' : 'light');
    });

    window.addEventListener('scroll', () => {
        const isScrolled = window.scrollY > 10;
        dom.backToTopButton.classList.toggle(CSS_CLASSES.SHOW, window.scrollY > 300);
        dom.mainHeader.classList.toggle(CSS_CLASSES.IS_SCROLLED, isScrolled);
    });

    dom.backToTopButton.addEventListener('click', () => window.scrollTo({ top: 0, behavior: 'smooth' }));

    let sidebarTriggerElement = null;

    function openSidebar(triggerElement) {
        document.body.classList.add(CSS_CLASSES.SIDEBAR_OPEN);
        sidebarTriggerElement = triggerElement;
        setTimeout(() => {
            dom.clearFiltersBtn?.focus();
        }, 150);
    }

    function closeSidebar() {
        document.body.classList.remove(CSS_CLASSES.SIDEBAR_OPEN);
        if (sidebarTriggerElement) {
            sidebarTriggerElement.focus();
            sidebarTriggerElement = null;
        }
    }

    dom.sidebarToggleBtn.addEventListener('click', (e) => {
        triggerPopAnimation(e.currentTarget);
        const isSidebarOpen = document.body.classList.contains(CSS_CLASSES.SIDEBAR_OPEN);
        isSidebarOpen ? closeSidebar() : openSidebar(e.currentTarget);
    });

    dom.sidebarOverlay.addEventListener('click', closeSidebar);

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && document.body.classList.contains(CSS_CLASSES.SIDEBAR_OPEN)) {
            closeSidebar();
        }
    });
}

// =================================================================
//          INICIALIZACIÓN Y MANEJO DE URL
// =================================================================

function updatePageTitle() {
    const { searchTerm, genre, year, country, director, actor, selection } = getActiveFilters();
    let title = "Tu brújula cinéfila y seriéfila inteligente";
    if (searchTerm) { title = `Resultados para \"${searchTerm}\"`; }
    else if (genre) { title = `Películas de ${genre}`}
    else if (director) { title = `Películas de ${director}`}
    else if (actor) { title = `Películas con ${actor}`}
    else if (year && year !== `${CONFIG.YEAR_MIN}-${CONFIG.YEAR_MAX}`) { title = `Películas de ${year.replace('-', ' a ')}`}
    else if (country) { title = `Películas de ${country}`}
    else if (selection) {
        const names = {hbo: 'Series de HBO', criterion: 'Colección Criterion', miluno: '1001 Películas que ver'};
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
            if (stateKey === 'page') {
                setCurrentPage(parseInt(value, 10) || 1);
            } else if (stateKey === 'searchTerm') {
                setSearchTerm(value);
            } else if (stateKey === 'sort') {
                setSort(value);
            } else if (stateKey === 'mediaType') {
                setMediaType(value);
            } else {
                setFilter(stateKey, value);
            }
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
        if (value) {
            const shortKey = REVERSE_URL_PARAM_MAP[key];
            if (!shortKey) return;
            
            if (key === 'mediaType' && value !== DEFAULTS.MEDIA_TYPE) params.set(shortKey, value);
            else if (key === 'sort' && value !== DEFAULTS.SORT) params.set(shortKey, value);
            else if (key === 'year' && value !== `${CONFIG.YEAR_MIN}-${CONFIG.YEAR_MAX}`) params.set(shortKey, value);
            else if (!['mediaType', 'sort', 'year'].includes(key)) params.set(shortKey, value);
        }
    });

    if (currentPage > 1) {
        params.set(REVERSE_URL_PARAM_MAP.page, currentPage);
    }

    const newUrl = params.toString() ? `${window.location.pathname}?${params.toString()}` : window.location.pathname;
    const currentStateUrl = window.location.search;

    if (newUrl !== `${window.location.pathname}${currentStateUrl}`) {
        history.pushState({ path: newUrl }, '', newUrl);
    }
}

function init() {
    if (localStorage.getItem('theme') === 'dark') {
        document.body.classList.add('dark-mode');
    }

    if (localStorage.getItem('rotationState') === 'disabled') {
        document.body.classList.add('rotation-disabled');
        const toggleBtn = document.getElementById('toggle-rotation-btn');
        if (toggleBtn) {
            toggleBtn.textContent = '⏺︎';
            toggleBtn.setAttribute('aria-label', 'Activar rotación de tarjetas');
        }
    }

    window.addEventListener('popstate', () => {
        readUrlAndSetState();
        document.dispatchEvent(new CustomEvent('updateSidebarUI'));
        loadAndRenderMovies(getCurrentPage());
    });

    initSidebar();
    setupHeaderListeners();
    setupGlobalListeners();
    setupKeyboardShortcuts();
    
    readUrlAndSetState();
    document.dispatchEvent(new CustomEvent('updateSidebarUI'));
    loadAndRenderMovies(getCurrentPage());

    document.addEventListener('filtersChanged', () => loadAndRenderMovies(1));

    // ✨ MEJORA: El listener de 'filtersReset' ahora preserva el orden de clasificación.
    document.addEventListener('filtersReset', () => {
        // 1. Guardamos el criterio de ordenación actual antes de resetear.
        const currentSort = getState().activeFilters.sort;
        
        // 2. Reseteamos el estado de todos los filtros a sus valores por defecto.
        resetFiltersState();
        
        // 3. Restauramos el criterio de ordenación que el usuario había elegido.
        setSort(currentSort);
        
        // 4. Sincronizamos la UI con el nuevo estado.
        dom.searchInput.value = '';
        dom.sortSelect.value = currentSort; // Nos aseguramos de que el <select> muestre el valor correcto.
        updateTypeFilterUI(DEFAULTS.MEDIA_TYPE);
        document.dispatchEvent(new CustomEvent('updateSidebarUI'));
        
        // 5. Recargamos las películas con los filtros limpios pero manteniendo el orden.
        loadAndRenderMovies(1);
    });
}

document.addEventListener('DOMContentLoaded', init);