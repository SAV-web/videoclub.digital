// =================================================================
//                      COMPONENTE PAGINATION
// =================================================================

import { CONFIG } from '../config.js';
import { createElement } from '../utils.js';
import { CSS_CLASSES } from '../constants.js';
import { fetchMovies } from '../api.js';

/**
 * Renderiza los botones de paginación en la parte inferior de la página.
 */
export function renderPagination(paginationContainer, totalMovies, currentPage) {
    if (!paginationContainer) return;

    paginationContainer.textContent = '';
    const totalPages = Math.ceil(totalMovies / CONFIG.ITEMS_PER_PAGE);

    if (totalPages <= 1) return;

    const createButton = (page, text = page, isActive = false, ariaLabel = `Ir a página ${page}`) => {
        // ✨ CAMBIO APLICADO: 
        // Se reemplaza la clase específica 'pagination-button' por la clase base 'btn'.
        // La clase 'active' se usa como modificador, lo cual es compatible con la nueva regla '.btn--active'.
        return createElement('button', {
            className: `btn${isActive ? ' active' : ''}`,
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

        if (page === currentPage) {
            // ✨ CAMBIO: Para la página actual, crea un <span> no interactivo.
            const currentPageElement = createElement('span', {
                className: 'pagination-current',
                textContent: page,
                attributes: { 'aria-current': 'page', 'aria-label': `Página actual, página ${page}` }
            });
            paginationContainer.appendChild(currentPageElement);
        } else {
            paginationContainer.appendChild(createButton(page, page, false));
        }
        lastPage = page;
    }

    if (currentPage < totalPages) {
        paginationContainer.appendChild(createButton(currentPage + 1, '>', false, 'Ir a la página siguiente'));
    }
}

/**
 * Actualiza el estado (activado/desactivado) de los botones de paginación de la cabecera.
 * (Esta función no requiere cambios ya que opera sobre el atributo 'disabled', no sobre clases).
 */
export function updateHeaderPaginationState(currentPage, totalMovies) {
    const headerPrevBtn = document.querySelector('#header-prev-btn');
    const headerNextBtn = document.querySelector('#header-next-btn');
    if (!headerPrevBtn || !headerNextBtn) return;
    
    const totalPages = Math.ceil(totalMovies / CONFIG.ITEMS_PER_PAGE);

    headerPrevBtn.disabled = (currentPage <= 1);
    headerNextBtn.disabled = (currentPage >= totalPages || totalPages === 0);
}

/**
 * Precarga los datos de la siguiente página durante el tiempo de inactividad del navegador.
 * (Esta función no requiere cambios).
 */
export function prefetchNextPage(currentPage, totalMovies, activeFilters) {
    const totalPages = Math.ceil(totalMovies / CONFIG.ITEMS_PER_PAGE);

    if (currentPage >= totalPages) {
        return;
    }

    const nextPage = currentPage + 1;

    if ('requestIdleCallback' in window) {
        requestIdleCallback(async () => {
            console.log(`%c[PREFETCH] Inactivo, precargando página ${nextPage}...`, 'color: #007bff');
            try {
                await fetchMovies(activeFilters, nextPage, CONFIG.ITEMS_PER_PAGE);
            } catch (error) {
                if (error.name !== 'AbortError') {
                    console.warn(`El prefetch de la página ${nextPage} falló:`, error.message);
                }
            }
        });
    }
}