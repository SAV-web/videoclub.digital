// =================================================================
//                      COMPONENTE SIDEBAR
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
    activeFiltersContainer: document.querySelector(SELECTORS.ACTIVE_FILTERS_CONTAINER),
    playButton: document.querySelector('#play-button'),
    rewindButton: document.querySelector('#rewind-button'),
    toggleRotationBtn: document.querySelector('#toggle-rotation-btn'),
    collapsibleSections: document.querySelectorAll('.collapsible-section'),
    sidebarFilterForms: document.querySelectorAll(SELECTORS.SIDEBAR_FILTER_FORM),
    yearSlider: document.querySelector(SELECTORS.YEAR_SLIDER),
    yearStartInput: document.querySelector(SELECTORS.YEAR_START_INPUT),
    yearEndInput: document.querySelector(SELECTORS.YEAR_END_INPUT),
};

// Mapeo para mostrar nombres más amigables en las "pills" de los filtros de selección.
const SELECTION_FRIENDLY_NAMES = new Map([
    ['C', 'Criterion'],
    ['M', '1001 Pelis'],
    ['A', 'Arrow'],
    ['K', 'Kino Lorber'],
    ['E', 'Eureka'],
    ['H', 'Series HBO'],
    ['N', 'Netflix']
]);

// --- Lógica de renderizado de la UI --- 

function renderDefaultPill(type, value) {
    const textSpan = createElement('span', {
        textContent: SELECTION_FRIENDLY_NAMES.get(value) || value
    });

    const removeButton = createElement('button', {
        className: CSS_CLASSES.FILTER_PILL_REMOVE_BTN,
        dataset: { filterType: type },
        attributes: { 'aria-label': `Eliminar filtro ${value}` },
        innerHTML: '&times;'
    });

    const pill = createElement('div', {
        className: 'filter-pill'
    });

    pill.append(textSpan, removeButton);
    return pill;
}

function renderFilterPills() {
    const activeFilters = getActiveFilters();
    if (!dom.activeFiltersContainer) return;

    dom.activeFiltersContainer.innerHTML = '';
    const fragment = document.createDocumentFragment();

    // Renderizar filtros inclusivos (azules)
    Object.entries(activeFilters).forEach(([type, value]) => {
        // ✨ CORRECCIÓN: Añadimos 'excludedGenres' a la lista de ignorados
        // para evitar que se renderice una píldora azul vacía.
        const ignoredPillTypes = ['sort', 'mediaType', 'year', 'searchTerm', 'excludedGenres', 'excludedCountries'];
        if (!value || (Array.isArray(value) && value.length === 0) || ignoredPillTypes.includes(type)) return;
        const pillElement = renderDefaultPill(type, value);
        fragment.appendChild(pillElement);
    });

    // Renderizar filtros de exclusión (rojos)
    const renderExcludedPills = (filterType, values) => {
        if (!values || values.length === 0) return;
        values.forEach(value => {
            const pill = createElement('div', {
                className: 'filter-pill filter-pill--exclude'
            });
            const textSpan = createElement('span', { textContent: value });
            const removeButton = createElement('button', {
                className: CSS_CLASSES.FILTER_PILL_REMOVE_BTN,
                dataset: { filterType: filterType, filterValue: value },
                attributes: { 'aria-label': `Eliminar exclusión de ${value}` },
                innerHTML: '&times;'
            });
            pill.append(textSpan, removeButton);
            fragment.appendChild(pill);
        });
    };

    renderExcludedPills('excludedGenres', activeFilters.excludedGenres);
    renderExcludedPills('excludedCountries', activeFilters.excludedCountries);

    dom.activeFiltersContainer.appendChild(fragment);
    updateFilterLinksUI();
}

function updateFilterLinksUI() {
    const activeFilters = getActiveFilters();
    document.querySelectorAll('.filter-link').forEach(link => {
        const type = link.dataset.filterType;
        const value = link.dataset.filterValue;

        // Reseteamos los estilos antes de aplicar el correcto.
        link.classList.remove(CSS_CLASSES.ACTIVE, 'is-excluded');

        if ((type === 'genre' && activeFilters.excludedGenres?.includes(value)) ||
            (type === 'country' && activeFilters.excludedCountries?.includes(value))) {
            link.classList.add('is-excluded');
        } else if (activeFilters[type] === value) {
            // Si es un filtro activo normal, se pinta de azul.
            link.classList.add(CSS_CLASSES.ACTIVE);
        }
    });
}

// --- Lógica de eventos ---

async function handleFilterChange(type, value) {
    const activeFilters = getActiveFilters();
    const isActivating = activeFilters[type] !== value;

    // ✨ CORRECCIÓN: Contamos solo los filtros "azules" (inclusivos), ignorando los de exclusión.
    // Esto asegura que los límites de píldoras azules y rojas sean independientes.
    const ignoredPillTypes = ['sort', 'mediaType', 'year', 'searchTerm', 'excludedGenres', 'excludedCountries'];
    const currentBluePillFilters = Object.entries(activeFilters)
        .filter(([key, val]) => val && !ignoredPillTypes.includes(key))
        .length;

    const isNewFilterType = !activeFilters[type];
    const MAX_BLUE_PILL_FILTERS = 2; // Límite de filtros de inclusión (píldoras azules)

    if (isActivating && isNewFilterType && currentBluePillFilters >= MAX_BLUE_PILL_FILTERS) {
        console.warn(`Límite de ${MAX_BLUE_PILL_FILTERS} filtros de inclusión alcanzado.`);
        return;
    }

    setFilter(type, isActivating ? value : null);
    renderFilterPills();
    document.dispatchEvent(new CustomEvent('filtersChanged'));
}

function resetFilters() {
    if (dom.playButton) {
        triggerPopAnimation(dom.playButton);
    }
    document.dispatchEvent(new CustomEvent('filtersReset'));
}

function collapseAllSections() {
    if (dom.collapsibleSections) {
        dom.collapsibleSections.forEach(section => {
            section.classList.remove(CSS_CLASSES.ACTIVE);
        });
    }
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

function setupEventListeners() {
    if (dom.rewindButton) {
        dom.rewindButton.addEventListener('click', (e) => {
            document.body.classList.toggle('sidebar-collapsed');
            const isCollapsed = document.body.classList.contains('sidebar-collapsed');
            e.currentTarget.textContent = isCollapsed ? '⏭︎' : '⏮︎';
            e.currentTarget.setAttribute('aria-label', isCollapsed ? 'Expandir sidebar' : 'Contraer sidebar');
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

    if (dom.activeFiltersContainer) {
        dom.activeFiltersContainer.addEventListener('click', (e) => {
            const removeBtn = e.target.closest(`.${CSS_CLASSES.FILTER_PILL_REMOVE_BTN}`);
            if (removeBtn) {
                const pill = removeBtn.parentElement;
                const { filterType, filterValue } = removeBtn.dataset;
                pill.classList.add('is-removing');
                pill.addEventListener('animationend', () => {
                    // ✨ NUEVO: Distinguimos entre quitar un filtro normal y una exclusión
                    if (filterType === 'excludedGenres' || filterType === 'excludedCountries') {
                        const type = filterType === 'excludedGenres' ? 'genre' : 'country';
                        if (toggleExcludedFilter(type, filterValue)) {
                            renderFilterPills(); // ✨ CORRECCIÓN: Redibujamos inmediatamente.
                            document.dispatchEvent(new CustomEvent('filtersChanged'));
                        }
                    } else {
                        handleFilterChange(filterType, null);
                    }
                }, { once: true });
            }
        });
    }

    const sidebarScrollable = document.querySelector('.sidebar-scrollable-filters');
    if (sidebarScrollable) {
        sidebarScrollable.addEventListener('click', (e) => {
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
                    renderFilterPills(); // Redibujamos las píldoras al instante.
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

    if (dom.playButton) {
        dom.playButton.addEventListener('click', resetFilters);
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