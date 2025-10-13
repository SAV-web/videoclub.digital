// =================================================================
//                      COMPONENTE AUTOCOMPLETE
// =================================================================
// Este módulo gestiona la creación y visualización de las listas de sugerencias
// que aparecen debajo de los campos de búsqueda en la barra lateral.

import { createElement, highlightAccentInsensitive } from '../utils.js';
import { CSS_CLASSES, SELECTORS } from '../constants.js';

/**
 * Renderiza una lista de sugerencias dentro de un contenedor de autocompletado en la sidebar.
 * @param {HTMLFormElement} formElement - El formulario que contiene el input y donde se renderizarán los resultados.
 * @param {string[]} suggestions - Un array de strings con las sugerencias a mostrar.
 * @param {string} searchTerm - El término de búsqueda actual, para poder resaltarlo en los resultados.
 */
export function renderSidebarAutocomplete(formElement, suggestions, searchTerm) {
    const input = formElement.querySelector(SELECTORS.SIDEBAR_FILTER_INPUT);
    let resultsContainer = formElement.querySelector(SELECTORS.SIDEBAR_AUTOCOMPLETE_RESULTS);

    if (!resultsContainer) {
        resultsContainer = createElement('div', { className: 'sidebar-autocomplete-results' });
        formElement.appendChild(resultsContainer);
    }

    resultsContainer.textContent = '';

    if (suggestions.length === 0) {
        input.removeAttribute('aria-expanded');
        resultsContainer.remove();
        return;
    }
    
    // ✨ MEJORA DE ACCESIBILIDAD: Se añaden roles ARIA.
    resultsContainer.id = `autocomplete-results-${formElement.dataset.filterType}`;
    resultsContainer.setAttribute('role', 'listbox');
    input.setAttribute('aria-expanded', 'true');
    input.setAttribute('aria-controls', resultsContainer.id);


    const fragment = document.createDocumentFragment();
    suggestions.forEach((suggestion, index) => {
        const item = createElement('div', {
            className: CSS_CLASSES.SIDEBAR_AUTOCOMPLETE_ITEM,
            dataset: { value: suggestion },
            innerHTML: highlightAccentInsensitive(suggestion, searchTerm),
            // ✨ MEJORA DE ACCESIBILIDAD: Se añade el rol y un ID único a cada opción.
            id: `suggestion-item-${formElement.dataset.filterType}-${index}`,
            attributes: { role: 'option' }
        });
        fragment.appendChild(item);
    });

    resultsContainer.appendChild(fragment);
}

/**
 * Cierra y elimina todos los contenedores de autocompletado de la sidebar.
 * @param {HTMLFormElement|null} exceptForm - Si se proporciona, no se cerrará el autocompletado de este formulario.
 */
export function clearAllSidebarAutocomplete(exceptForm = null) {
    document.querySelectorAll(SELECTORS.SIDEBAR_AUTOCOMPLETE_RESULTS).forEach(container => {
        if (!exceptForm || container.closest(SELECTORS.SIDEBAR_FILTER_FORM) !== exceptForm) {
            const input = container.parentElement.querySelector(SELECTORS.SIDEBAR_FILTER_INPUT);
            if(input) input.removeAttribute('aria-expanded');
            container.remove();
        }
    });
}