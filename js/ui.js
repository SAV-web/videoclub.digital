// =================================================================
//                  MÓDULO DE MANIPULACIÓN DE UI (DOM)
// =================================================================
// Este archivo actúa como un punto central para la gestión de la interfaz de usuario.
// Agrupa y re-exporta las funciones de todos los componentes de UI.

export * from './components/card.js';
export * from './components/pagination.js';
export * from './components/autocomplete.js';
export * from './components/quick-view.js';

import { CSS_CLASSES, SELECTORS } from './constants.js';

/**
 * Objeto que contiene referencias cacheadas a los elementos del DOM más utilizados.
 */
export const dom = {
    gridContainer: document.querySelector(SELECTORS.GRID_CONTAINER),
    paginationContainer: document.querySelector(SELECTORS.PAGINATION_CONTAINER),
    searchForm: document.querySelector(SELECTORS.SEARCH_FORM),
    searchInput: document.querySelector(SELECTORS.SEARCH_INPUT),
    sortSelect: document.querySelector(SELECTORS.SORT_SELECT),
    themeToggleButton: document.querySelector(SELECTORS.THEME_TOGGLE),
    backToTopButton: document.querySelector(SELECTORS.BACK_TO_TOP),
    sidebarOverlay: document.querySelector(SELECTORS.SIDEBAR_OVERLAY),
    sidebar: document.querySelector('.sidebar'),
    typeFilterToggle: document.querySelector(SELECTORS.TYPE_FILTER_TOGGLE),
    headerPrevBtn: document.querySelector(SELECTORS.HEADER_PREV_BTN),
    headerNextBtn: document.querySelector(SELECTORS.HEADER_NEXT_BTN),
    autocompleteResults: document.querySelector(SELECTORS.AUTOCOMPLETE_RESULTS),
    mainHeader: document.querySelector('.main-header'),
    clearFiltersBtn: document.querySelector(SELECTORS.CLEAR_FILTERS_BTN)
};

/**
 * Actualiza la apariencia y el texto del botón de filtro por tipo de medio (Todo/Cine/TV).
 * @param {string} mediaType - El tipo de medio actual ('all', 'movies', 'series').
 */
export function updateTypeFilterUI(mediaType) {
    const button = dom.typeFilterToggle;
    if (!button) return;
    
    button.classList.remove(CSS_CLASSES.TYPE_FILTER_MOVIES, CSS_CLASSES.TYPE_FILTER_SERIES);

    switch (mediaType) {
        case 'movies':
            button.textContent = 'Cine';
            button.classList.add(CSS_CLASSES.TYPE_FILTER_MOVIES);
            break;
        case 'series':
            button.textContent = 'TV';
            button.classList.add(CSS_CLASSES.TYPE_FILTER_SERIES);
            break;
        default:
            button.textContent = 'Todo';
            break;
    }
}