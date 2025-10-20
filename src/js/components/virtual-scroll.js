// =================================================================
//              COMPONENTE VIRTUAL SCROLL (WINDOWING)
// =================================================================
// Este módulo implementa la virtualización de listas para renderizar
// eficientemente solo los elementos visibles en el viewport.

import { dom, renderMovieGrid, setupCardInteractions } from '../ui.js';
import { getMovies } from '../state.js';

let state = {
    itemHeight: 0,
    itemWidth: 0,
    columns: 0,
    totalHeight: 0,
    itemsToRender: [],
    isInitialized: false,
};

const spacer = document.createElement('div');
spacer.style.width = '1px';
spacer.style.position = 'relative';

/**
 * Calcula las dimensiones de la cuadrícula y la altura total.
 * Se ejecuta una vez al inicio o en redimensionamiento de ventana.
 */
function calculateGridDimensions() {
    const gridStyles = window.getComputedStyle(dom.gridContainer);
    const gridGap = parseInt(gridStyles.getPropertyValue('gap'), 10) || 16;

    // Usamos un elemento temporal para medir el ancho real de una tarjeta
    const tempCard = document.createElement('div');
    tempCard.className = 'movie-card';
    tempCard.style.visibility = 'hidden';
    dom.gridContainer.appendChild(tempCard);
    state.itemWidth = tempCard.offsetWidth;
    state.itemHeight = tempCard.offsetHeight + gridGap;
    dom.gridContainer.removeChild(tempCard);

    state.columns = Math.max(1, Math.floor(dom.gridContainer.clientWidth / (state.itemWidth + gridGap)));
    
    const totalRows = Math.ceil(getMovies().length / state.columns);
    state.totalHeight = totalRows * state.itemHeight;
    spacer.style.height = `${state.totalHeight}px`;
}

/**
 * Renderiza los elementos que deberían ser visibles en el viewport actual.
 */
function renderVisibleItems() {
    if (!state.isInitialized || state.itemHeight === 0) return;

    const scrollTop = dom.gridContainer.scrollTop;
    const viewportHeight = dom.gridContainer.clientHeight;

    // Añadimos un buffer (renderizar algunos elementos extra por encima y por debajo)
    const buffer = state.itemHeight * 2; 
    const visibleAreaStart = Math.max(0, scrollTop - buffer);
    const visibleAreaEnd = scrollTop + viewportHeight + buffer;

    const startIndex = Math.floor(visibleAreaStart / state.itemHeight) * state.columns;
    const endIndex = Math.ceil(visibleAreaEnd / state.itemHeight) * state.columns;

    const movies = getMovies();
    const itemsToRender = movies.slice(startIndex, endIndex).map((movie, i) => {
        const itemIndex = startIndex + i;
        const row = Math.floor(itemIndex / state.columns);
        const top = row * state.itemHeight;
        return { ...movie, _virtual: { top } };
    });

    renderMovieGrid(dom.gridContainer, itemsToRender, true); // true para modo virtual
    setupCardInteractions();
}

/**
 * Inicializa el sistema de scroll virtual.
 */
export function initVirtualScroll() {
    const movies = getMovies();
    if (movies.length === 0) {
        dom.gridContainer.textContent = ''; // Limpiar si no hay resultados
        return;
    }

    dom.gridContainer.textContent = '';
    dom.gridContainer.appendChild(spacer);
    dom.gridContainer.style.overflowY = 'auto';

    calculateGridDimensions();
    state.isInitialized = true;
    renderVisibleItems();

    dom.gridContainer.removeEventListener('scroll', renderVisibleItems);
    dom.gridContainer.addEventListener('scroll', renderVisibleItems, { passive: true });
}

/**
 * Limpia y resetea el estado del scroll virtual.
 */
export function destroyVirtualScroll() {
    if (state.isInitialized) {
        dom.gridContainer.removeEventListener('scroll', renderVisibleItems);
        dom.gridContainer.textContent = '';
        dom.gridContainer.style.overflowY = 'visible';
        state.isInitialized = false;
    }
}

/**
 * Re-calcula las dimensiones en caso de que la ventana cambie de tamaño.
 */
export function reinitVirtualScrollOnResize() {
    if (state.isInitialized) {
        calculateGridDimensions();
        renderVisibleItems();
    }
}