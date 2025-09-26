// =================================================================
//                      COMPONENTE SIDEBAR (MODIFICADO)
// =================================================================
// Este módulo encapsula toda la funcionalidad de la barra lateral.
// Es uno de los componentes más complejos, ya que gestiona:
// - El renderizado de filtros estáticos y dinámicos.
// - El funcionamiento del slider de años (noUiSlider).
// - La lógica de autocompletado para los campos de búsqueda (incluyendo accesibilidad y teclado).
// - La visualización y eliminación de los filtros activos ("pills").
// - El comportamiento de las secciones desplegables (acordeón). 

import { CONFIG } from '../config.js';
import { debounce, capitalizeWords, triggerPopAnimation, createElement } from '../utils.js';
import {
    fetchDirectorSuggestions,
    fetchActorSuggestions,
    fetchCountrySuggestions,
    fetchGenreSuggestions
} from '../api.js';
import {
    renderSidebarAutocomplete,
    clearAllSidebarAutocomplete
} from './autocomplete.js';
import {
    getActiveFilters,
    setFilter,
    toggleExcludedFilter, // ✨ NUEVO: Importamos la función para gestionar exclusiones
} from '../state.js';
import { CSS_CLASSES, SELECTORS } from '../constants.js';

// Referencias cacheadas a los elementos del DOM específicos de la sidebar.
const dom = {
    sidebarInnerWrapper: document.querySelector('.sidebar-inner-wrapper'),
    rewindButton: document.querySelector('#rewind-button'),
    toggleRotationBtn: document.querySelector('#toggle-rotation-btn'),
    collapsibleSections: document.querySelectorAll('.collapsible-section'),
    sidebarFilterForms: document.querySelectorAll(SELECTORS.SIDEBAR_FILTER_FORM),
    yearSlider: document.querySelector(SELECTORS.YEAR_SLIDER),
    yearStartInput: document.querySelector(SELECTORS.YEAR_START_INPUT),
    yearEndInput: document.querySelector(SELECTORS.YEAR_END_INPUT),
};

// ✨ NUEVO: Mapeo para mostrar nombres más amigables en las píldoras.
const SELECTION_FRIENDLY_NAMES = new Map([
    ['C', 'Criterion'], ['M', '1001 Pelis'], ['A', 'Arrow'],
    ['K', 'Kino Lorber'], ['E', 'Eureka'], ['H', 'Series HBO'], ['N', 'Netflix']
]);

// --- Lógica de renderizado de la UI --- 

function renderFilterPills() {
    const activeFilters = getActiveFilters();

    // Limpiamos todos los contenedores de píldoras antes de volver a dibujar.
    document.querySelectorAll('.active-filters-list').forEach(container => container.innerHTML = '');

    const createPill = (type, value, isExcluded = false) => {
        const pill = createElement('div', {
            className: `filter-pill ${isExcluded ? 'filter-pill--exclude' : ''}`,
            // ✨ MEJORA: Añadimos los datos para la eliminación directamente a la píldora.
            dataset: { filterType: type, filterValue: value }
        });
        const text = (type === 'selection') ? SELECTION_FRIENDLY_NAMES.get(value) || value : value;
        const textSpan = createElement('span', { textContent: text });
        pill.appendChild(textSpan);

        // ✨ MEJORA: El aspa de eliminación solo se añade a las píldoras de exclusión.
        if (isExcluded) {
            const removeButton = createElement('span', { className: 'remove-filter-btn', innerHTML: '⏸︎', attributes: { 'aria-hidden': 'true' } });
            pill.appendChild(removeButton);
        }
        return pill;
    };

    const renderPillsForSection = (filterType, values, isExcluded = false) => {
        const section = document.querySelector(`.sidebar-filter-form[data-filter-type="${filterType}"]`)?.closest('.collapsible-section') ||
                        document.querySelector(`.filter-link[data-filter-type="${filterType}"]`)?.closest('.collapsible-section');
        if (!section) return;

        const container = section.querySelector('.active-filters-list');
        if (!container) return;

        const valuesArray = Array.isArray(values) ? values : [values];
        valuesArray.forEach(value => {
            if (value) {
                const pill = createPill(filterType, value, isExcluded);
                container.appendChild(pill);
            }
        });
    };

    // Renderizar píldoras de inclusión (azules)
    renderPillsForSection('selection', activeFilters.selection);
    renderPillsForSection('genre', activeFilters.genre);
    renderPillsForSection('country', activeFilters.country);
    renderPillsForSection('director', activeFilters.director);
    renderPillsForSection('actor', activeFilters.actor);

    // Renderizar píldoras de exclusión (rojas)
    renderPillsForSection('genre', activeFilters.excludedGenres, true);
    renderPillsForSection('country', activeFilters.excludedCountries, true);

    updateFilterLinksUI();
}

function updateFilterLinksUI() {
    const activeFilters = getActiveFilters();

    document.querySelectorAll('.filter-link').forEach(link => {
        const type = link.dataset.filterType;
        const value = link.dataset.filterValue;

        // Reseteamos los estilos antes de aplicar el correcto.
        link.style.display = ''; // Aseguramos que el link sea visible por defecto.
        link.classList.remove(CSS_CLASSES.ACTIVE, 'is-excluded');

        const isExcluded = (type === 'genre' && activeFilters.excludedGenres?.includes(value)) ||
                           (type === 'country' && activeFilters.excludedCountries?.includes(value));
        const isActive = activeFilters[type] === value;

        if (isActive || isExcluded) {
            // ✨ CORRECCIÓN: Si el filtro está activo (píldora azul) O excluido (píldora roja),
            // ocultamos el enlace del menú para evitar duplicidad.
            link.style.display = 'none';
        }
    });
}

// --- Lógica de eventos ---

async function handleFilterChange(type, value) {
    const activeFilters = getActiveFilters();
    const isActivating = activeFilters[type] !== value;

    // ✨ LÓGICA DE LÍMITES RESTAURADA
    const inclusionFilters = ['genre', 'country', 'director', 'actor', 'selection'];
    const currentInclusionFilters = inclusionFilters.filter(key => activeFilters[key]).length;
    const isNewInclusionFilter = isActivating && !activeFilters[type];
    const MAX_INCLUSION_FILTERS = 2;

    if (isNewInclusionFilter && currentInclusionFilters >= MAX_INCLUSION_FILTERS) {
        console.warn(`Límite de ${MAX_INCLUSION_FILTERS} filtros de inclusión alcanzado.`);
        // Aquí podrías mostrar un toast de advertencia al usuario.
        return;
    }

    setFilter(type, isActivating ? value : null);
    renderFilterPills();
    document.dispatchEvent(new CustomEvent('filtersChanged'));
}

function resetFilters() {
    const playButton = document.querySelector('#play-button');
    if (playButton) triggerPopAnimation(playButton);
    document.dispatchEvent(new CustomEvent('filtersReset'));
}

export function collapseAllSections() {
    dom.collapsibleSections.forEach(section => section.classList.remove(CSS_CLASSES.ACTIVE));
    if (dom.sidebarInnerWrapper) {
        dom.sidebarInnerWrapper.classList.remove('is-compact');
    }
}

function initYearSlider() {
    if (!dom.yearSlider || !dom.yearStartInput || !dom.yearEndInput) return;

    const yearInputs = [dom.yearStartInput, dom.yearEndInput];

    noUiSlider.create(dom.yearSlider, {
        start: [CONFIG.YEAR_MIN, CONFIG.YEAR_MAX],
        connect: true,
        step: 1,
        range: { 'min': CONFIG.YEAR_MIN, 'max': CONFIG.YEAR_MAX },
        format: { to: value => Math.round(value), from: value => Number(value) }
    });

    const sliderInstance = dom.yearSlider.noUiSlider;

    sliderInstance.on('update', (values, handle) => {
        yearInputs[handle].value = values[handle];
    });

    const debouncedUpdate = debounce(values => {
        const yearFilter = `${values[0]}-${values[1]}`;
        if (getActiveFilters().year !== yearFilter) {
            setFilter('year', yearFilter);
            document.dispatchEvent(new CustomEvent('filtersChanged'));
        }
    }, 500);
    sliderInstance.on('set', debouncedUpdate);

    yearInputs.forEach((input, index) => {
        input.addEventListener('change', (e) => {
            const values = [null, null];
            values[index] = e.target.value;
            sliderInstance.set(values);
        });
    });
}

const suggestionFetchers = {
    genre: fetchGenreSuggestions,
    director: fetchDirectorSuggestions,
    actor: fetchActorSuggestions,
    country: fetchCountrySuggestions
};

function setupAutocompleteHandlers() {
    dom.sidebarFilterForms.forEach(form => {
        const input = form.querySelector(SELECTORS.SIDEBAR_FILTER_INPUT);
        const filterType = form.dataset.filterType;
        const fetcher = suggestionFetchers[filterType];
        if (!input || !fetcher) return;

        input.setAttribute('role', 'combobox');
        input.setAttribute('aria-autocomplete', 'list');
        input.setAttribute('aria-expanded', 'false');

        let activeIndex = -1;

        const debouncedFetch = debounce(async () => {
            const searchTerm = input.value;
            activeIndex = -1;
            if (searchTerm.length < 3) {
                clearAllSidebarAutocomplete(form);
                return;
            }
            const suggestions = await fetcher(searchTerm);
            renderSidebarAutocomplete(form, suggestions, searchTerm);
        }, CONFIG.SEARCH_DEBOUNCE_DELAY);

        input.addEventListener('input', debouncedFetch);
        
        input.addEventListener('keydown', (e) => {
            const resultsContainer = form.querySelector(SELECTORS.SIDEBAR_AUTOCOMPLETE_RESULTS);
            if (!resultsContainer || resultsContainer.children.length === 0) return;

            const items = Array.from(resultsContainer.children);

            const updateActiveSuggestion = (index) => {
                items.forEach(item => item.classList.remove('is-active'));
                if (index >= 0 && items[index]) {
                    items[index].classList.add('is-active');
                    input.setAttribute('aria-activedescendant', items[index].id);
                } else {
                    input.removeAttribute('aria-activedescendant');
                }
            };
            
            switch (e.key) {
                case 'ArrowDown':
                    e.preventDefault();
                    activeIndex = Math.min(activeIndex + 1, items.length - 1);
                    updateActiveSuggestion(activeIndex);
                    break;
                case 'ArrowUp':
                    e.preventDefault();
                    activeIndex = Math.max(activeIndex - 1, -1);
                    updateActiveSuggestion(activeIndex);
                    break;
                case 'Enter':
                    e.preventDefault();
                    if (activeIndex >= 0 && items[activeIndex]) {
                        items[activeIndex].click();
                    }
                    break;
                case 'Escape':
                    e.preventDefault();
                    clearAllSidebarAutocomplete();
                    break;
            }
        });

        form.addEventListener('click', (e) => {
            const suggestionItem = e.target.closest(`.${CSS_CLASSES.SIDEBAR_AUTOCOMPLETE_ITEM}`);
            if (suggestionItem) {
                const value = suggestionItem.dataset.value;
                // ✨ CORRECCIÓN: Eliminamos la llamada a capitalizeWords().
                // Usamos el valor directamente de la base de datos, que ya tiene la capitalización correcta.
                handleFilterChange(filterType, value);
                input.value = '';
                clearAllSidebarAutocomplete();
            }
        });
    });
}

function handlePillClick(e) {
    // ✨ MEJORA: Ahora el evento se dispara al hacer clic en toda la píldora.
    const pill = e.target.closest('.filter-pill');
    if (!pill) return;

    const { filterType, filterValue } = pill.dataset;

    pill.classList.add('is-removing');
    pill.addEventListener('animationend', () => {
        // Si la píldora es de exclusión
        if (pill.classList.contains('filter-pill--exclude')) {
            if (toggleExcludedFilter(filterType, filterValue)) {
                renderFilterPills();
                document.dispatchEvent(new CustomEvent('filtersChanged'));
            }
        } else { // Si es una píldora de inclusión normal
            // Desactiva el filtro
            handleFilterChange(filterType, null);
        }
    }, { once: true });
}



function setupEventListeners() {
    if (dom.rewindButton) {
        // ✨ REFACTORIZACIÓN: Este botón ahora controla tanto el colapso en escritorio
        // como la apertura/cierre en móvil, unificando la lógica.
        dom.rewindButton.addEventListener('click', (e) => {
            const isMobile = window.innerWidth <= 768;
            let isOpening;

            if (isMobile) {
                document.body.classList.toggle('sidebar-is-open');
                isOpening = document.body.classList.contains('sidebar-is-open');
            } else {
                document.body.classList.toggle('sidebar-collapsed');
                isOpening = !document.body.classList.contains('sidebar-collapsed');
            }

            e.currentTarget.textContent = isOpening ? '⏮︎' : '⏭︎';
            e.currentTarget.setAttribute('aria-label', isOpening ? 'Contraer sidebar' : 'Expandir sidebar');
        });
    }

    if (dom.toggleRotationBtn) {
        dom.toggleRotationBtn.addEventListener('click', (e) => {
            document.body.classList.toggle('rotation-disabled');
            const isRotationDisabled = document.body.classList.contains('rotation-disabled');
            
            e.currentTarget.textContent = isRotationDisabled ? '⏺︎' : '⏸︎';
            e.currentTarget.setAttribute('aria-label', isRotationDisabled ? 'Activar rotación de tarjetas' : 'Pausar rotación de tarjetas');
            
            // ✨ MEJORA: Guardamos la preferencia en localStorage.
            localStorage.setItem('rotationState', isRotationDisabled ? 'disabled' : 'enabled');
            
            triggerPopAnimation(e.currentTarget);
        });
    }

    // ✨ REFACTORIZACIÓN: Se elimina la lógica de los botones móviles duplicados.

    const sidebarOverlay = document.querySelector('#sidebar-overlay');
    if (sidebarOverlay) {
        sidebarOverlay.addEventListener('click', () => dom.rewindButton.click());
    }
    const sidebarScrollable = document.querySelector('.sidebar-scrollable-filters');
    if (sidebarScrollable) {
        sidebarScrollable.addEventListener('click', (e) => {
            // ✨ MEJORA: Delegación de eventos para el clic en píldoras.
            handlePillClick(e);

            // Gestionamos el clic en el botón de excluir
            const excludeBtn = e.target.closest('.exclude-filter-btn');
            if (excludeBtn) {
                e.stopPropagation(); // Evitamos que se active el filtro normal
                const value = excludeBtn.dataset.value;
                const type = excludeBtn.dataset.type;

                // ✨ CORRECCIÓN: Si el género que vamos a excluir está actualmente
                // activo como filtro de inclusión, lo eliminamos de ahí primero.
                if (getActiveFilters()[type] === value) {
                    setFilter(type, null);
                }

                // ✨ CORRECCIÓN: Solo actualizamos la UI si la operación de estado tuvo éxito.
                if (toggleExcludedFilter(type, value)) {
                    renderFilterPills(); // Redibujamos píldoras y enlaces.
                    document.dispatchEvent(new CustomEvent('filtersChanged'));
                    triggerPopAnimation(excludeBtn);
                }
                return;
            }

            const link = e.target.closest('.filter-link');
            if (link) {
                triggerPopAnimation(link);
                const { filterType, filterValue } = link.dataset;

                // ✨ CORRECCIÓN: Lógica para manejar el clic en un género.
                // Si el género está "pausado" (excluido), lo reactivamos.
                // Si no, aplicamos el filtro de inclusión normal.
                const activeFilters = getActiveFilters();
                if ((filterType === 'genre' && activeFilters.excludedGenres?.includes(filterValue)) ||
                    (filterType === 'country' && activeFilters.excludedCountries?.includes(filterValue))) {
                    if (toggleExcludedFilter(filterType, filterValue)) {
                        renderFilterPills();
                        document.dispatchEvent(new CustomEvent('filtersChanged'));
                    }
                } else {
                    handleFilterChange(filterType, filterValue);
                }
            }
        });
    }

    const playButton = document.querySelector('#play-button');
    if (playButton) {
        playButton.addEventListener('click', resetFilters);
    }

    dom.collapsibleSections.forEach(clickedSection => {
        const header = clickedSection.querySelector('.section-header');
        if (header) {
            header.addEventListener('click', () => {
                const wasActive = clickedSection.classList.contains(CSS_CLASSES.ACTIVE);
                dom.collapsibleSections.forEach(section => section.classList.remove(CSS_CLASSES.ACTIVE));
                if (!wasActive) {
                    clickedSection.classList.add(CSS_CLASSES.ACTIVE);
                }
                const isAnySectionActive = Array.from(dom.collapsibleSections).some(section => section.classList.contains(CSS_CLASSES.ACTIVE));
                if (dom.sidebarInnerWrapper) {
                    dom.sidebarInnerWrapper.classList.toggle('is-compact', isAnySectionActive);
                }
            });
        }
    });
}

/**
 * Función pública que se llama desde main.js para inicializar todo el componente.
 */
export function initSidebar() {
    // ✨ REFACTORIZACIÓN: En móvil, el sidebar empieza colapsado.
    // El botón #rewind-button debe mostrar el icono de expandir (⏭︎).
    if (window.innerWidth <= 768) {
        if (dom.rewindButton) {
            dom.rewindButton.textContent = '⏭︎';
            dom.rewindButton.setAttribute('aria-label', 'Expandir sidebar');
        }
    }
    // ✨ MEJORA: Añadimos botones de exclusión solo a géneros específicos.
    const EXCLUDABLE_GENRES = ['Animación', 'Documental'];

    document.querySelectorAll('#genres-list-container .filter-link').forEach(link => {
        const genreName = link.dataset.filterValue;
        const textWrapper = createElement('span', { textContent: link.textContent });
        link.innerHTML = '';
        link.append(textWrapper);

        if (EXCLUDABLE_GENRES.includes(genreName)) {
            const excludeBtn = createElement('button', {
                className: 'exclude-filter-btn',
                dataset: { value: genreName, type: 'genre' },
                attributes: { 'aria-label': `Excluir género ${genreName}`, 'type': 'button' },
                innerHTML: '⏸︎'
            });
            link.append(excludeBtn);
        }
    });

    const EXCLUDABLE_COUNTRIES = ['EEUU'];
    document.querySelectorAll('#countries-list-container .filter-link').forEach(link => {
        const countryName = link.dataset.filterValue;
        const textWrapper = createElement('span', { textContent: link.textContent });
        link.innerHTML = '';
        link.append(textWrapper);

        if (EXCLUDABLE_COUNTRIES.includes(countryName)) {
            const excludeBtn = createElement('button', {
                className: 'exclude-filter-btn',
                dataset: { value: countryName, type: 'country' },
                attributes: { 'aria-label': `Excluir país ${countryName}`, 'type': 'button' },
                innerHTML: '⏸︎'
            });
            link.append(excludeBtn);
        }
    });

    initYearSlider();
    setupEventListeners();
    setupAutocompleteHandlers();

    document.addEventListener('updateSidebarUI', () => {
        dom.sidebarFilterForms.forEach(form => {
            const input = form.querySelector(SELECTORS.SIDEBAR_FILTER_INPUT);
            if (input) input.value = '';
        });

        const currentFilters = getActiveFilters();
        const years = (currentFilters.year || `${CONFIG.YEAR_MIN}-${CONFIG.YEAR_MAX}`).split('-').map(Number);
        if (dom.yearSlider && dom.yearSlider.noUiSlider) {
            dom.yearSlider.noUiSlider.set(years, false);
        }

        renderFilterPills();
    });
    
    document.addEventListener('filtersReset', collapseAllSections);
    document.addEventListener('uiActionTriggered', collapseAllSections);
}