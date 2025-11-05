// =================================================================
//                  SCRIPT PRINCIPAL Y ORQUESTADOR (v4.0 - UI Optimista)
// =================================================================
// v4.0 - Implementada la carga de datos optimista con cancelación de peticiones.
//        - La UI responde instantáneamente a la interacción del usuario.
//        - Se utiliza AbortController para cancelar peticiones de red obsoletas.
//        - Se añade un estado de carga visual global (barra de progreso y botones).
// =================================================================

import { CONFIG } from './config.js';
import { debounce, triggerPopAnimation, getFriendlyErrorMessage, preloadLcpImage } from './utils.js';
import { fetchMovies } from './api.js';
import {
    dom, renderMovieGrid, renderSkeletons, renderNoResults, renderErrorState,
    updateCardUI, renderPagination, updateHeaderPaginationState, prefetchNextPage,
    initQuickView, setupAuthModal, updateTypeFilterUI, updateTotalResultsUI,
    clearAllSidebarAutocomplete, handleCardClick
} from './ui.js';
import { CSS_CLASSES, SELECTORS, DEFAULTS, ICONS } from './constants.js';
import {
    getState, getActiveFilters, getCurrentPage, setCurrentPage, setTotalMovies,
    setFilter, setSearchTerm, setSort, setMediaType, incrementRequestId,
    getLatestRequestId, resetFiltersState, hasActiveMeaningfulFilters,
    setUserMovieData, clearUserMovieData
} from './state.js';
import { showToast } from './toast.js';
import { initSidebar, collapseAllSections } from './components/sidebar.js';
import { initTouchDrawer } from './components/touch-drawer.js';
import { supabase } from './supabaseClient.js';
import { initAuthForms } from './auth.js';
import { fetchUserMovieData } from './api-user.js';

// --- GESTIÓN DE ESTADO DE CARGA Y PETICIONES ---
let moviesAbortController = null;

// --- MAPAS DE URL ---
const URL_PARAM_MAP = {
    q: 'searchTerm', genre: 'genre', year: 'year', country: 'country',
    dir: 'director', actor: 'actor', sel: 'selection', sort: 'sort',
    type: 'mediaType', p: 'page', exg: 'excludedGenres', exc: 'excludedCountries'
};
const REVERSE_URL_PARAM_MAP = Object.fromEntries(
    Object.entries(URL_PARAM_MAP).map(([key, value]) => [value, key])
);

// =================================================================
//          LÓGICA PRINCIPAL DE CARGA Y RENDERIZADO (OPTIMISTA)
// =================================================================

/**
 * Orquesta la carga y renderizado de películas con una UI optimista y cancelación de peticiones.
 * @param {number} [page=1] - El número de página a cargar.
 */
export async function loadAndRenderMovies(page = 1) {
    if (moviesAbortController) {
        moviesAbortController.abort("Nueva petición iniciada");
    }
    moviesAbortController = new AbortController();
    const { signal } = moviesAbortController;
    
    const requestId = incrementRequestId();
    
    setLoadingState(true);
    setCurrentPage(page);
    updatePageTitle();
    updateUrl();

    const renderLogic = async () => {
        try {
            renderSkeletons(dom.gridContainer, dom.paginationContainer);
            updateHeaderPaginationState(getCurrentPage(), 0);

            const pageSize = page === 1 ? CONFIG.DYNAMIC_PAGE_SIZE_LIMIT : CONFIG.ITEMS_PER_PAGE;
            
            const { items: movies, total: totalMovies } = await fetchMovies(
                getActiveFilters(), page, pageSize, signal
            );
            
            if (requestId === getLatestRequestId()) {
                updateDomWithResults(movies, totalMovies);
            }
        } catch (error) {
            if (error.name !== 'AbortError') {
                console.error('Error en el proceso de carga:', error);
                if (requestId === getLatestRequestId()) {
                    const friendlyMessage = getFriendlyErrorMessage(error);
                    showToast(friendlyMessage, 'error');
                    renderErrorState(dom.gridContainer, dom.paginationContainer, friendlyMessage);
                }
            }
        } finally {
            if (requestId === getLatestRequestId()) {
                setLoadingState(false);
                moviesAbortController = null;
            }
        }
    };
    
    if (document.startViewTransition) {
        document.startViewTransition(renderLogic);
    } else {
        await renderLogic();
    }
}

/**
 * Actualiza el DOM con los resultados de la búsqueda de películas.
 */
function updateDomWithResults(movies, totalMovies) {
    setTotalMovies(totalMovies);
    updateTotalResultsUI(totalMovies, hasActiveMeaningfulFilters());
    const currentState = getState();

    if (!movies || movies.length === 0) {
        renderNoResults(dom.gridContainer, dom.paginationContainer, getActiveFilters());
        updateHeaderPaginationState(1, 0);
        return;
    }
    
    preloadLcpImage(movies[0]);

    if (totalMovies <= CONFIG.DYNAMIC_PAGE_SIZE_LIMIT && currentState.currentPage === 1) {
        renderMovieGrid(dom.gridContainer, movies);
        dom.paginationContainer.textContent = '';
        updateHeaderPaginationState(1, 1);
    } else {
        const moviesForPage = movies.slice(0, CONFIG.ITEMS_PER_PAGE);
        renderMovieGrid(dom.gridContainer, moviesForPage);
        renderPagination(dom.paginationContainer, totalMovies, currentState.currentPage);
        updateHeaderPaginationState(currentState.currentPage, totalMovies);
    }

    if (totalMovies > 0) {
        prefetchNextPage(currentState.currentPage, totalMovies, getActiveFilters());
    }
}

/**
 * Gestiona el estado visual de carga de la aplicación.
 * @param {boolean} isLoading - True si la carga está activa.
 */
function setLoadingState(isLoading) {
    const loadingBar = document.getElementById('loading-bar');
    const interactiveElements = [
        dom.headerPrevBtn,
        dom.headerNextBtn,
        ...document.querySelectorAll('.pagination-container .btn')
    ];

    if (isLoading) {
        interactiveElements.forEach(el => el?.classList.add('is-loading'));
        document.body.style.cursor = 'wait';
        if (loadingBar) {
            loadingBar.hidden = false;
            loadingBar.classList.remove('is-loading');
            void loadingBar.offsetWidth;
            loadingBar.classList.add('is-loading');
        }
    } else {
        interactiveElements.forEach(el => el?.classList.remove('is-loading'));
        document.body.style.cursor = '';
        if (loadingBar) {
            loadingBar.classList.remove('is-loading');
            setTimeout(() => {
                if (!loadingBar.classList.contains('is-loading')) {
                    loadingBar.hidden = true;
                }
            }, 500);
        }
    }
}

// =================================================================
//          MANEJADORES DE EVENTOS Y LISTENERS
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

function setupKeyboardShortcuts() {
    document.addEventListener('keydown', (e) => {
        const activeElement = document.activeElement;
        const isTyping = ['INPUT', 'TEXTAREA'].includes(activeElement.tagName) || activeElement.isContentEditable;

        if (e.key === 'Escape') {
            if (activeElement === dom.searchInput && dom.searchInput.value !== '') {
                e.preventDefault();
                dom.searchInput.value = '';
                handleSearchInput();
            } else if (isTyping) {
                activeElement.blur();
            }
        }
        if (isTyping) return;
        switch (e.key) {
            case '/': e.preventDefault(); dom.searchInput.focus(); break;
            case 'k': dom.headerNextBtn?.click(); break;
            case 'j': dom.headerPrevBtn?.click(); break;
        }
    });
}

function setupGlobalListeners() {
    document.addEventListener('click', (e) => {
        if (!e.target.closest(SELECTORS.SIDEBAR_FILTER_FORM)) clearAllSidebarAutocomplete();
        if (!e.target.closest('.sidebar')) collapseAllSections();
    });

    dom.paginationContainer.addEventListener('click', async (e) => {
        const button = e.target.closest(SELECTORS.CLICKABLE_BTN);
        if (button?.dataset.page) {
            document.dispatchEvent(new CustomEvent('uiActionTriggered'));
            triggerPopAnimation(button);
            const page = parseInt(button.dataset.page, 10);
            if (!isNaN(page)) {
                await loadAndRenderMovies(page);
                window.scrollTo({ top: 0, behavior: 'smooth' });
            }
        }
    });

    dom.gridContainer.addEventListener('click', (e) => {
        const cardElement = e.target.closest('.movie-card');
        const clearButton = e.target.closest('#clear-filters-from-empty');
        
        if (cardElement) {
            handleCardClick.call(cardElement, e);
        } else if (clearButton) {
            document.dispatchEvent(new CustomEvent('filtersReset'));
        }
    });

    dom.themeToggleButton.addEventListener('click', (e) => {
        triggerPopAnimation(e.currentTarget);
        document.dispatchEvent(new CustomEvent('uiActionTriggered'));
        const isDark = document.documentElement.classList.toggle('dark-mode');
        document.body.classList.toggle('dark-mode', isDark);
        localStorage.setItem('theme', isDark ? 'dark' : 'light');
    });

    let isTicking = false;
    window.addEventListener('scroll', () => {
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

    dom.backToTopButton.addEventListener('click', () => window.scrollTo({ top: 0, behavior: 'smooth' }));

    const rewindButton = document.querySelector('#rewind-button');
    if (dom.sidebarOverlay && rewindButton) {
        dom.sidebarOverlay.addEventListener('click', () => rewindButton.click());
    }

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && document.body.classList.contains(CSS_CLASSES.SIDEBAR_OPEN)) {
            rewindButton?.click();
        }
    });
}

// =================================================================
//          SISTEMA DE AUTENTICACIÓN Y DATOS DE USUARIO
// =================================================================

function setupAuthSystem() {
    const userAvatarInitials = document.getElementById('user-avatar-initials');
    const logoutButton = document.getElementById('logout-button');

    async function onLogin(user) {
        document.body.classList.add('user-logged-in');
        const userEmail = user.email || '';
        userAvatarInitials.textContent = userEmail.charAt(0).toUpperCase();
        userAvatarInitials.title = `Sesión iniciada como: ${userEmail}`;
        try {
            const data = await fetchUserMovieData();
            setUserMovieData(data);
            document.dispatchEvent(new CustomEvent('userDataUpdated'));
        } catch (error) {
            showToast(error.message, 'error');
        }
    }

    function onLogout() {
        document.body.classList.remove('user-logged-in');
        userAvatarInitials.textContent = '';
        userAvatarInitials.title = '';
        clearUserMovieData();
        document.dispatchEvent(new CustomEvent('userDataUpdated'));
    }

    logoutButton?.addEventListener('click', async () => {
        const { error } = await supabase.auth.signOut();
        if (error) showToast('No se pudo cerrar la sesión.', 'error');
    });
    
    supabase.auth.onAuthStateChange((_event, session) => {
        session?.user ? onLogin(session.user) : onLogout();
    });
}

// =================================================================
//          GESTIÓN DE URL Y ESTADO
// =================================================================

function updatePageTitle() {
    const { searchTerm, genre, year, country, director, actor, selection } = getActiveFilters();
    let title = "Tu brújula cinéfila y seriéfila inteligente";
    if (searchTerm) title = `Resultados para "${searchTerm}"`; 
    else if (genre) title = `Películas de ${genre}`;
    else if (director) title = `Películas de ${director}`;
    else if (actor) title = `Películas con ${actor}`;
    else if (year && year !== `${CONFIG.YEAR_MIN}-${CONFIG.YEAR_MAX}`) title = `Películas de ${year.replace('-', ' a ')}`;
    else if (country) title = `Películas de ${country}`;
    else if (selection) {
        const names = {H: 'Series de HBO', C: 'Colección Criterion', M: '1001 Películas que ver'};
        title = names[selection] || `Selección ${selection}`;
    }
    document.title = `${title} | videoclub.digital`;
}

function readUrlAndSetState() {
    resetFiltersState();
    const params = new URLSearchParams(window.location.search);
    
    Object.entries(URL_PARAM_MAP).forEach(([shortKey, stateKey]) => {
        const value = params.get(shortKey);
        if (value !== null) {
            if (stateKey === 'page') setCurrentPage(parseInt(value, 10) || 1);
            else if (stateKey.startsWith('excluded')) setFilter(stateKey, value.split(','));
            else setFilter(stateKey, value);
        }
    });

    if (!params.has('sort')) setSort(DEFAULTS.SORT);
    if (!params.has('type')) setMediaType(DEFAULTS.MEDIA_TYPE);

    const activeFilters = getActiveFilters();
    dom.searchInput.value = activeFilters.searchTerm || '';
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
            params.set(shortKey, value.join(','));
        } else if (typeof value === 'string' && value.trim() !== '') {
            const isDefault = (key === 'mediaType' && value === DEFAULTS.MEDIA_TYPE) ||
                              (key === 'sort' && value === DEFAULTS.SORT) ||
                              (key === 'year' && value === `${CONFIG.YEAR_MIN}-${CONFIG.YEAR_MAX}`);
            if (!isDefault) params.set(shortKey, value);
        }
    });

    if (currentPage > 1) {
        params.set('p', currentPage);
    }

    const newUrl = params.toString() ? `${window.location.pathname}?${params}` : window.location.pathname;
    if (newUrl !== `${window.location.pathname}${window.location.search}`) {
        history.pushState({ path: newUrl }, '', newUrl);
    }
}

// =================================================================
//          INICIALIZACIÓN DE LA APLICACIÓN
// =================================================================

function init() {
    window.addEventListener('storage', (e) => {
        if (e.key === 'theme') {
            const isDark = e.newValue === 'dark';
            document.documentElement.classList.toggle('dark-mode', isDark);
            document.body.classList.toggle('dark-mode', isDark);
        }
    });

    if (localStorage.getItem('rotationState') === 'disabled') {
        document.body.classList.add('rotation-disabled');
        const toggleBtn = document.getElementById('toggle-rotation-btn');
        if (toggleBtn) {
            toggleBtn.innerHTML = ICONS.SQUARE_STOP;
            toggleBtn.setAttribute('aria-label', 'Activar rotación de tarjetas');
        }
    }

    window.addEventListener('popstate', () => {
        readUrlAndSetState();
        document.dispatchEvent(new CustomEvent('updateSidebarUI'));
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
    document.dispatchEvent(new CustomEvent('updateSidebarUI'));
    loadAndRenderMovies(getCurrentPage());

    document.addEventListener('userMovieDataChanged', (e) => {
        const { movieId } = e.detail;
        if (!movieId) return;
        const cardElement = document.querySelector(`.movie-card[data-movie-id="${movieId}"]`);
        if (cardElement) updateCardUI(cardElement);
    });

    document.addEventListener('userDataUpdated', () => {
        document.querySelectorAll('.movie-card').forEach(updateCardUI);
    });
    
    document.addEventListener('filtersReset', (e) => {
        const { keepSort, newFilter } = e.detail || {};
        const currentSort = keepSort ? getState().activeFilters.sort : DEFAULTS.SORT;
        resetFiltersState();
        setSort(currentSort);
        if (newFilter) {
            setFilter(newFilter.type, newFilter.value);
        }
        dom.searchInput.value = '';
        dom.sortSelect.value = currentSort;
        updateTypeFilterUI(DEFAULTS.MEDIA_TYPE);
        document.dispatchEvent(new CustomEvent('updateSidebarUI'));
        loadAndRenderMovies(1);
    });
}

document.addEventListener('DOMContentLoaded', init);