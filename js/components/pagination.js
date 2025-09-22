// =================================================================
//                      COMPONENTE PAGINATION
// =================================================================

import { CONFIG } from '../config.js';
import { createElement } from '../utils.js';
import { CSS_CLASSES, SELECTORS } from '../constants.js';
// ✨ MEJORA: Importamos fetchMovies para poder llamarlo desde nuestra función de prefetch.
import { fetchMovies } from '../api.js';

/**
 * Renderiza los botones de paginación en la parte inferior de la página.
 * (Esta función no cambia)
 */
export function renderPagination(paginationContainer, totalMovies, currentPage) {
    if (!paginationContainer) return;

    paginationContainer.innerHTML = '';
    const totalPages = Math.ceil(totalMovies / CONFIG.ITEMS_PER_PAGE);

    if (totalPages <= 1) return;

    const createButton = (page, text = page, isActive = false, ariaLabel = `Ir a página ${page}`) => {
        return createElement('button', {
            className: `${CSS_CLASSES.PAGINATION_BUTTON}${isActive ? ` ${CSS_CLASSES.ACTIVE}` : ''}`,
            dataset: { page },
            textContent: text,
            attributes: { 'aria-label': ariaLabel, 'type': 'button' }
        });
    };

    const createSeparator = () => createElement('span', {
        textContent: '...',
        className: 'pagination-separator',
        attributes: { 'aria-hidden': 'true' }
    });

    if (currentPage > 1) {
        paginationContainer.appendChild(createButton(currentPage - 1, '<', false, 'Ir a la página anterior'));
    }

    const pages = new Set([1, totalPages, currentPage, currentPage - 1, currentPage + 1]);
    const sortedPages = Array.from(pages).filter(p => p > 0 && p <= totalPages).sort((a, b) => a - b);

    let lastPage = 0;
    for (const page of sortedPages) {
        if (lastPage > 0 && page - lastPage > 1) {
            paginationContainer.appendChild(createSeparator());
        }
        paginationContainer.appendChild(createButton(page, page, page === currentPage));
        lastPage = page;
    }

    if (currentPage < totalPages) {
        paginationContainer.appendChild(createButton(currentPage + 1, '>', false, 'Ir a la página siguiente'));
    }
}

/**
 * Actualiza el estado (activado/desactivado) de los botones de paginación de la cabecera.
 * (Esta función no cambia)
 */
export function updateHeaderPaginationState(currentPage, totalMovies) {
    const headerPrevBtn = document.querySelector(SELECTORS.HEADER_PREV_BTN);
    const headerNextBtn = document.querySelector(SELECTORS.HEADER_NEXT_BTN);
    if (!headerPrevBtn || !headerNextBtn) return;
    
    const totalPages = Math.ceil(totalMovies / CONFIG.ITEMS_PER_PAGE);

    headerPrevBtn.disabled = (currentPage <= 1);
    headerNextBtn.disabled = (currentPage >= totalPages || totalPages === 0);
}

/**
 * ✨ NUEVA FUNCIÓN: Precarga los datos de la siguiente página durante el tiempo de inactividad del navegador.
 * @param {number} currentPage - La página que se acaba de renderizar.
 * @param {number} totalMovies - El número total de resultados de la búsqueda.
 * @param {object} activeFilters - El objeto de filtros activos para la búsqueda actual.
 */
export function prefetchNextPage(currentPage, totalMovies, activeFilters) {
    const totalPages = Math.ceil(totalMovies / CONFIG.ITEMS_PER_PAGE);

    // Condición de seguridad: si ya estamos en la última página o no hay más páginas, no hacemos nada.
    if (currentPage >= totalPages) {
        return;
    }

    const nextPage = currentPage + 1;

    // Usamos requestIdleCallback para ejecutar nuestro código solo cuando el navegador esté libre.
    // Esto asegura que el prefetch no interfiera con tareas más importantes como animaciones o la respuesta a la entrada del usuario.
    if ('requestIdleCallback' in window) {
        requestIdleCallback(async () => {
            console.log(`%c[PREFETCH] Inactivo, precargando página ${nextPage}...`, 'color: #007bff');
            try {
                // Simplemente llamamos a fetchMovies. La lógica de caché que ya tenemos en api.js
                // se encargará de almacenar el resultado automáticamente. No necesitamos hacer nada con la respuesta.
                await fetchMovies(activeFilters, nextPage, CONFIG.ITEMS_PER_PAGE);
            } catch (error) {
                // Si el prefetch falla (p.ej. el usuario se desconecta), no es un problema crítico.
                // Simplemente lo registramos en la consola sin molestar al usuario.
                if (error.name !== 'AbortError') {
                    console.warn(`El prefetch de la página ${nextPage} falló:`, error.message);
                }
            }
        });
    }
    // Si el navegador es muy antiguo y no soporta requestIdleCallback, podríamos usar un setTimeout como alternativa.
    // else {
    //     setTimeout(() => { /* ... misma lógica ... */ }, 1000);
    // }
}