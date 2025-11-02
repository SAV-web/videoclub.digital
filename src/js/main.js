// =================================================================
//                  SCRIPT PRINCIPAL Y ORQUESTADOR (v3.2)
// =================================================================
// v3.2 - Implementada la delegación de eventos para los clics en tarjetas.
//        - Se elimina la llamada a setupCardInteractions.
//        - Se añade un listener único y delegado en el gridContainer.

import { CONFIG } from './config.js';
import { debounce, triggerPopAnimation, getFriendlyErrorMessage, preloadLcpImage } from './utils.js';
import { fetchMovies } from './api.js';
import {
    // DOM elements
    dom,
    // Card and Grid rendering
    renderMovieGrid, renderSkeletons, renderNoResults, renderErrorState, updateCardUI,
    // Pagination
    renderPagination, updateHeaderPaginationState, prefetchNextPage,
    // Quick View and Auth Modals
    initQuickView, setupAuthModal,
    // Other UI updates
    updateTypeFilterUI, updateTotalResultsUI, clearAllSidebarAutocomplete,
    // Import card-specific handlers for delegation
    handleCardClick
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

// --- MAPAS DE URL ---
const URL_PARAM_MAP = {
    q: 'searchTerm', genre: 'genre', year: 'year', country: 'country',
    dir: 'director', actor: 'actor', sel: 'selection', sort: 'sort',
    type: 'mediaType', p: 'page'
};
const REVERSE_URL_PARAM_MAP = Object.fromEntries(
    Object.entries(URL_PARAM_MAP).map(([key, value]) => [value, key])
);

// --- LÓGICA PRINCIPAL DE CARGA Y RENDERIZADO ---
export async function loadAndRenderMovies(page = 1) {
    const requestId = incrementRequestId();
    setCurrentPage(page);
    updatePageTitle();
    updateUrl();

    const supportsViewTransitions = !!document.startViewTransition;

    const renderLogic = async () => {
        try {
            const pageSize = page === 1 ? CONFIG.DYNAMIC_PAGE_SIZE_LIMIT : CONFIG.ITEMS_PER_PAGE;
            const { items: movies, total: totalMovies } = await fetchMovies(getActiveFilters(), page, pageSize);

            if (movies && movies.length > 0) {
                preloadLcpImage(movies[0]);
            }
            
            if (requestId !== getLatestRequestId()) {
                const abortError = new DOMException('Request aborted by newer request', 'AbortError');
                throw abortError;
            }

            updateDomWithResults(movies, totalMovies);

        } catch (error) {
            if (error.name === 'AbortError') {
                console.log('Petición de películas cancelada deliberadamente.');
                throw error;
            }
            console.error('Error en el proceso de carga:', error);
            const friendlyMessage = getFriendlyErrorMessage(error);
            showToast(friendlyMessage, 'error');
            renderErrorState(dom.gridContainer, dom.paginationContainer, friendlyMessage);
            throw error;
        }
    };
    
    if (supportsViewTransitions) {
        if (requestId === 1) {
            renderSkeletons(dom.gridContainer, dom.paginationContainer);
        }
        await document.startViewTransition(renderLogic).ready;
    } else {
        dom.gridContainer.setAttribute('aria-busy', 'true');
        renderSkeletons(dom.gridContainer, dom.paginationContainer);
        updateHeaderPaginationState(getCurrentPage(), 0);
        await renderLogic();
        dom.gridContainer.setAttribute('aria-busy', 'false');
    }
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
        dom.paginationContainer.textContent = '';
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

// --- CONFIGURACIÓN DE LISTENERS ---
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
        const isTyping = activeElement.tagName === 'INPUT' || activeElement.tagName === 'TEXTAREA' || activeElement.isContentEditable;

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
            case 'k': if (dom.headerNextBtn && !dom.headerNextBtn.disabled) dom.headerNextBtn.click(); break;
            case 'j': if (dom.headerPrevBtn && !dom.headerPrevBtn.disabled) dom.headerPrevBtn.click(); break;
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
        if (button && button.dataset.page) {
            triggerHapticFeedback('light');
            document.dispatchEvent(new CustomEvent('uiActionTriggerred'));
            triggerPopAnimation(button);
            const page = parseInt(button.dataset.page, 10);
            if (!isNaN(page)) {
                await loadAndRenderMovies(page);
                window.scrollTo({ top: 0, behavior: 'smooth' });
            }
        }
    });

    // ▼▼▼ LISTENER DELEGADO PARA TARJETAS Y LIMPIEZA DE FILTROS ▼▼▼
    dom.gridContainer.addEventListener('click', (e) => {
        const cardElement = e.target.closest('.movie-card');
        const clearButton = e.target.closest('#clear-filters-from-empty');
        
        if (cardElement) {
            // Delega el manejo del clic a la función importada
            handleCardClick.call(cardElement, e);
        } else if (clearButton) {
            // Maneja el clic en el botón de limpiar filtros desde el estado vacío
            document.dispatchEvent(new CustomEvent('filtersReset'));
        }
    });

    dom.themeToggleButton.addEventListener('click', (e) => {
        triggerHapticFeedback('light');
        triggerPopAnimation(e.currentTarget);
        document.dispatchEvent(new CustomEvent('uiActionTriggered'));
        document.body.classList.toggle('dark-mode');
        localStorage.setItem('theme', document.body.classList.contains('dark-mode') ? 'dark' : 'light');
    });

    let isTicking = false;
    let isHeaderScrolled = false;
    window.addEventListener('scroll', () => {
        if (!isTicking) {
            window.requestAnimationFrame(() => {
                const scrollY = window.scrollY;
                dom.backToTopButton.classList.toggle(CSS_CLASSES.SHOW, scrollY > 300);
                if (scrollY > 10 && !isHeaderScrolled) {
                    isHeaderScrolled = true;
                    dom.mainHeader.classList.add(CSS_CLASSES.IS_SCROLLED);
                } else if (scrollY < 5 && isHeaderScrolled) {
                    isHeaderScrolled = false;
                    dom.mainHeader.classList.remove(CSS_CLASSES.IS_SCROLLED);
                }
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
            const rewindButton = document.querySelector('#rewind-button');
            if (rewindButton) rewindButton.click();
        }
    });
}

// --- SISTEMA DE AUTENTICACIÓN Y DATOS DE USUARIO ---
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

    async function handleLogout() {
        const { error } = await supabase.auth.signOut();
        if (error) {
            console.error('Error al cerrar sesión:', error);
            showToast('No se pudo cerrar la sesión.', 'error');
        }
    }

    if (logoutButton) {
        logoutButton.addEventListener('click', handleLogout);
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
    const { searchTerm, genre, year, country, director, actor, selection } = getActiveFilters();
    let title = "Tu brújula cinéfila y seriéfila inteligente";
    if (searchTerm) { title = `Resultados para "${searchTerm}"`; } 
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
            if (stateKey === 'page') setCurrentPage(parseInt(value, 10) || 1);
            else if (stateKey === 'searchTerm') setSearchTerm(value);
            else if (stateKey === 'sort') setSort(value);
            else if (stateKey === 'mediaType') setMediaType(value);
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
        if (value && typeof value === 'string' && value.trim() !== '') {
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

// --- FUNCIÓN DE INICIALIZACIÓN ---
function init() {
    window.addEventListener('storage', (e) => {
        if (e.key === 'theme') {
            document.body.classList.toggle('dark-mode', e.newValue === 'dark');
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

    // Inicialización de módulos
    initSidebar();
    initQuickView();
    setupHeaderListeners();
    initTouchDrawer();
    setupGlobalListeners();
    setupKeyboardShortcuts();
    setupAuthSystem();
    setupAuthModal();
    initAuthForms();
    
    // Carga inicial de datos
    readUrlAndSetState();
    document.dispatchEvent(new CustomEvent('updateSidebarUI'));
    loadAndRenderMovies(getCurrentPage());

    // Listeners para actualizaciones de datos de usuario
    document.addEventListener('userMovieDataChanged', (e) => {
        const { movieId } = e.detail;
        if (!movieId) return;
        
        const cardElement = document.querySelector(`.movie-card[data-movie-id="${movieId}"]`);
        if (cardElement) {
            updateCardUI(cardElement);
        }
    });

    document.addEventListener('userDataUpdated', () => {
        document.querySelectorAll('.movie-card').forEach(cardElement => {
            updateCardUI(cardElement);
        });
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