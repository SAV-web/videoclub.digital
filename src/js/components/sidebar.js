// =================================================================
//                      COMPONENTE SIDEBAR
// =================================================================
// Gestiona toda la interactividad del sidebar: colapsar/expandir,
// secciones desplegables, filtros, autocompletado y slider de año.

import { CONFIG } from '../config.js';
import { debounce, triggerPopAnimation, createElement } from '../utils.js';
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
import { unflipAllCards } from './card.js';
import { closeModal } from './quick-view.js';
import {
    getActiveFilters,
    setFilter,
    toggleExcludedFilter,
} from '../state.js';
// ✨ REFACTORIZACIÓN: Importamos ICONS desde el fichero de constantes.
import { CSS_CLASSES, SELECTORS, ICONS } from '../constants.js';

// Icono para el botón de pausa en los filtros de exclusión.
const ICON_PAUSE_SMALL = '⏸︎';

// Referencias cacheadas a los elementos del DOM del sidebar.
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

const SELECTION_FRIENDLY_NAMES = new Map([
    ['C', 'Criterion'], ['M', '1001 Pelis'], ['A', 'Arrow'],
    ['K', 'Kino Lorber'], ['E', 'Eureka'], ['H', 'Series HBO'], ['N', 'Netflix']
]);

// Renderiza las "píldoras" de filtros activos en cada sección.
function renderFilterPills() {
    const activeFilters = getActiveFilters();

    document.querySelectorAll('.active-filters-list').forEach(container => container.innerHTML = '');

    const createPill = (type, value, isExcluded = false) => {
        const pill = createElement('div', {
            className: `filter-pill ${isExcluded ? 'filter-pill--exclude' : ''}`,
            dataset: { filterType: type, filterValue: value }
        });
        const text = (type === 'selection') ? SELECTION_FRIENDLY_NAMES.get(value) || value : value;
        const textSpan = createElement('span', { textContent: text });
        pill.appendChild(textSpan);

        const removeButtonHTML = isExcluded ? ICON_PAUSE_SMALL : '×';
        const removeButton = createElement('span', { className: 'remove-filter-btn', innerHTML: removeButtonHTML, attributes: { 'aria-hidden': 'true' } });
        pill.appendChild(removeButton);
        
        return pill;
    };

    const renderPillsForSection = (filterType, values, isExcluded = false) => {
        const section = document.querySelector(`.sidebar-filter-form[data-filter-type="${filterType}"]`)?.closest('.collapsible-section') ||
                        document.querySelector(`.filter-link[data-filter-type="${filterType}"]`)?.closest('.collapsible-section');
        if (!section) return;

        const container = section.querySelector('.active-filters-list');
        if (!container) return;

        const valuesArray = Array.isArray(values) ? values : [values].filter(Boolean);
        valuesArray.forEach(value => {
            const pill = createPill(filterType, value, isExcluded);
            container.appendChild(pill);
        });
    };

    renderPillsForSection('selection', activeFilters.selection);
    renderPillsForSection('genre', activeFilters.genre);
    renderPillsForSection('country', activeFilters.country);
    renderPillsForSection('director', activeFilters.director);
    renderPillsForSection('actor', activeFilters.actor);

    renderPillsForSection('genre', activeFilters.excludedGenres, true);
    renderPillsForSection('country', activeFilters.excludedCountries, true);

    updateFilterLinksUI();
}

// Actualiza la UI de los enlaces de filtro para ocultar los que ya están activos.
function updateFilterLinksUI() {
    const activeFilters = getActiveFilters();

    document.querySelectorAll('.filter-link').forEach(link => {
        const type = link.dataset.filterType;
        const value = link.dataset.filterValue;

        link.style.display = 'flex';

        const isExcluded = (type === 'genre' && activeFilters.excludedGenres?.includes(value)) ||
                           (type === 'country' && activeFilters.excludedCountries?.includes(value));
        const isActive = activeFilters[type] === value;

        if (isActive || isExcluded) {
            link.style.display = 'none';
        }
    });
}

// Maneja el cambio de un filtro de inclusión.
async function handleFilterChange(type, value) {
    const activeFilters = getActiveFilters();
    const isActivating = activeFilters[type] !== value;
    
    setFilter(type, isActivating ? value : null);
    renderFilterPills();
    document.dispatchEvent(new CustomEvent('filtersChanged'));
}

// Resetea todos los filtros.
function resetFilters() {
    const playButton = document.querySelector('#play-button');
    if (playButton) triggerPopAnimation(playButton);
    document.dispatchEvent(new CustomEvent('filtersReset'));
}

// Colapsa todas las secciones desplegables del sidebar.
export function collapseAllSections() {
    dom.collapsibleSections.forEach(section => section.classList.remove(CSS_CLASSES.ACTIVE));
    if (dom.sidebarInnerWrapper) {
        dom.sidebarInnerWrapper.classList.remove('is-compact');
    }
}

// Inicializa el slider de años (noUiSlider).
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

// Configura los botones de subir/bajar en los inputs de año.
function setupYearInputSteppers() {
    document.querySelectorAll('.year-input-wrapper').forEach(wrapper => {
        const input = wrapper.querySelector('.year-input');
        const stepperUp = wrapper.querySelector('.stepper-btn.stepper-up');
        const stepperDown = wrapper.querySelector('.stepper-btn.stepper-down');
        
        if (!input || !stepperUp || !stepperDown) return;

        const updateYearValue = (increment) => {
            let currentValue = parseInt(input.value, 10);
            if (isNaN(currentValue)) currentValue = increment > 0 ? CONFIG.YEAR_MIN : CONFIG.YEAR_MAX;
            const newValue = Math.min(Math.max(currentValue + increment, CONFIG.YEAR_MIN), CONFIG.YEAR_MAX);
            input.value = newValue;
            input.dispatchEvent(new Event('change', { bubbles: true }));
        };

        stepperUp.addEventListener('click', () => updateYearValue(1));
        stepperDown.addEventListener('click', () => updateYearValue(-1));
    });
}

const suggestionFetchers = {
    genre: fetchGenreSuggestions,
    director: fetchDirectorSuggestions,
    actor: fetchActorSuggestions,
    country: fetchCountrySuggestions
};

// Configura la lógica de autocompletado para los formularios de filtro.
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
                handleFilterChange(filterType, suggestionItem.dataset.value);
                input.value = '';
                clearAllSidebarAutocomplete();
            }
        });
    });
}

// Maneja el clic en una píldora de filtro para eliminarla.
function handlePillClick(e) {
    const pill = e.target.closest('.filter-pill');
    if (!pill) return;

    const { filterType, filterValue } = pill.dataset;

    pill.classList.add('is-removing');
    pill.addEventListener('animationend', () => {
        if (pill.classList.contains('filter-pill--exclude')) {
            if (toggleExcludedFilter(filterType, filterValue)) {
                renderFilterPills();
                document.dispatchEvent(new CustomEvent('filtersChanged'));
            }
        } else {
            handleFilterChange(filterType, null);
        }
    }, { once: true });
}

// Configura todos los event listeners del sidebar.
function setupEventListeners() {
    if (dom.rewindButton) {
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

            // ✨ REFACTORIZACIÓN: Usamos la biblioteca de iconos.
            e.currentTarget.innerHTML = isOpening ? ICONS.REWIND : ICONS.FORWARD;
            e.currentTarget.setAttribute('aria-label', isOpening ? 'Contraer sidebar' : 'Expandir sidebar');
        });
    }

    if (dom.toggleRotationBtn) {
        dom.toggleRotationBtn.addEventListener('click', (e) => {
            // Limpia los efectos de la UI antes de cambiar de modo.
            unflipAllCards();
            closeModal();

            document.body.classList.toggle('rotation-disabled');
            const isRotationDisabled = document.body.classList.contains('rotation-disabled');
            const button = e.currentTarget;

            button.innerHTML = isRotationDisabled ? ICONS.SQUARE_STOP : ICONS.PAUSE;
            button.setAttribute('aria-label', isRotationDisabled ? 'Activar rotación de tarjetas' : 'Pausar rotación de tarjetas');
            button.title = isRotationDisabled ? 'Giro automático' : 'Vista Rápida';
            
            localStorage.setItem('rotationState', isRotationDisabled ? 'disabled' : 'enabled');
            triggerPopAnimation(button);
        });
    }

    const sidebarScrollable = document.querySelector('.sidebar-scrollable-filters');
    if (sidebarScrollable) {
        sidebarScrollable.addEventListener('click', (e) => {
            handlePillClick(e);

            const excludeBtn = e.target.closest('.exclude-filter-btn');
            if (excludeBtn) {
                e.stopPropagation();
                if (toggleExcludedFilter(excludeBtn.dataset.type, excludeBtn.dataset.value)) {
                    renderFilterPills();
                    document.dispatchEvent(new CustomEvent('filtersChanged'));
                    triggerPopAnimation(excludeBtn);
                }
                return;
            }

            const link = e.target.closest('.filter-link');
            if (link) {
                triggerPopAnimation(link);
                handleFilterChange(link.dataset.filterType, link.dataset.filterValue);
            }
        });
    }

    const playButton = document.querySelector('#play-button');
    if (playButton) {
        playButton.addEventListener('click', resetFilters);
    }

    dom.collapsibleSections.forEach(clickedSection => {
        const header = clickedSection.querySelector('.section-header');
        header?.addEventListener('click', () => {
            const wasActive = clickedSection.classList.contains(CSS_CLASSES.ACTIVE);
            dom.collapsibleSections.forEach(section => section.classList.remove(CSS_CLASSES.ACTIVE));
            if (!wasActive) clickedSection.classList.add(CSS_CLASSES.ACTIVE);
            dom.sidebarInnerWrapper?.classList.toggle('is-compact', !wasActive);
        });
    });
}

// Función principal de inicialización del sidebar.
export function initSidebar() {
    if (window.innerWidth <= 768) {
        if (dom.rewindButton) {
            // ✨ REFACTORIZACIÓN: Usamos la biblioteca de iconos también aquí.
            dom.rewindButton.innerHTML = ICONS.FORWARD;
            dom.rewindButton.setAttribute('aria-label', 'Expandir sidebar');
        }
    }

    const createExcludeButton = (name, type, excludableList) => {
        if (excludableList.includes(name)) {
            return createElement('button', {
                className: 'exclude-filter-btn',
                dataset: { value: name, type },
                attributes: { 'aria-label': `Excluir ${type} ${name}`, type: 'button' },
                innerHTML: ICON_PAUSE_SMALL
            });
        }
        return null;
    };

    document.querySelectorAll('.filter-link').forEach(link => {
        const { filterType, filterValue } = link.dataset;
        const textWrapper = createElement('span', { textContent: link.textContent });
        link.innerHTML = '';
        link.append(textWrapper);

        const excludable = { genre: ['Animación', 'Documental'], country: ['EEUU'] };
        if (excludable[filterType]) {
            const excludeBtn = createExcludeButton(filterValue, filterType, excludable[filterType]);
            if (excludeBtn) link.append(excludeBtn);
        }
    });

    const toggleBtn = dom.toggleRotationBtn;
    if (toggleBtn) {
        const isRotationDisabled = document.body.classList.contains('rotation-disabled');
        toggleBtn.innerHTML = isRotationDisabled ? ICONS.SQUARE_STOP : ICONS.PAUSE;
        toggleBtn.setAttribute('aria-label', isRotationDisabled ? 'Activar rotación de tarjetas' : 'Pausar rotación de tarjetas');
        toggleBtn.title = isRotationDisabled ? 'Giro automático' : 'Vista Rápida';
    }

    initYearSlider();
    setupEventListeners();
    setupAutocompleteHandlers();
    setupYearInputSteppers();

    document.addEventListener('updateSidebarUI', () => {
        dom.sidebarFilterForms.forEach(form => {
            const input = form.querySelector(SELECTORS.SIDEBAR_FILTER_INPUT);
            if (input) input.value = '';
        });

        const currentFilters = getActiveFilters();
        const years = (currentFilters.year || `${CONFIG.YEAR_MIN}-${CONFIG.YEAR_MAX}`).split('-').map(Number);
        if (dom.yearSlider?.noUiSlider) {
            dom.yearSlider.noUiSlider.set(years, false);
        }

        renderFilterPills();
    });
    
    document.addEventListener('filtersReset', collapseAllSections);
    document.addEventListener('uiActionTriggered', collapseAllSections);
}