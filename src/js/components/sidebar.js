// =================================================================
//                      COMPONENTE SIDEBAR (Versión Optimista)
// =================================================================
// v2.0 - Implementada la lógica de UI Optimista. Los cambios de filtro
//        actualizan la UI instantáneamente y luego llaman a la API.
//        Se incluye un mecanismo de reversión en caso de error de red.

import { CONFIG } from '../config.js';
import { debounce, triggerPopAnimation, createElement } from '../utils.js';
import { fetchDirectorSuggestions, fetchActorSuggestions, fetchCountrySuggestions, fetchGenreSuggestions } from '../api.js';
import { renderSidebarAutocomplete, clearAllSidebarAutocomplete } from './autocomplete.js';
import { unflipAllCards } from './card.js';
import { closeModal } from './quick-view.js';
import { getActiveFilters, setFilter, toggleExcludedFilter } from '../state.js';
import { ICONS, CSS_CLASSES, SELECTORS } from '../constants.js';

// --- NUEVAS IMPORTACIONES ---
// Importamos la función de carga principal para orquestar desde aquí.
import { loadAndRenderMovies } from '../main.js';
// Importamos la función de notificación para el manejo de errores.
import { showToast } from '../toast.js';
// --- FIN NUEVAS IMPORTACIONES ---

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
    document.querySelectorAll('.active-filters-list').forEach(container => container.textContent = '');

    const createPill = (type, value, isExcluded = false) => {
        const pill = createElement('div', {
            className: `filter-pill ${isExcluded ? 'filter-pill--exclude' : ''}`,
            dataset: { filterType: type, filterValue: value }
        });
        const text = (type === 'selection') ? SELECTION_FRIENDLY_NAMES.get(value) || value : value;
        const textSpan = createElement('span', { textContent: text });
        pill.appendChild(textSpan);

        const removeButtonHTML = isExcluded ? ICONS.PAUSE_SMALL : '×';
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

// =================================================================
// == NUEVA LÓGICA DE MANEJO DE FILTROS CON UI OPTIMISTA ==
// =================================================================

/**
 * Maneja el cambio de un filtro de forma optimista.
 * Actualiza la UI instantáneamente y luego dispara la llamada a la API.
 * Revierte la UI si la llamada a la API falla.
 * @param {string} type - El tipo de filtro (ej: 'genre', 'country').
 * @param {string|null} value - El nuevo valor del filtro.
 */
async function handleFilterChangeOptimistic(type, value) {
    const previousFilters = getActiveFilters();
    const isActivating = previousFilters[type] !== value;
    const newValue = isActivating ? value : null;

    // 1. ACTUALIZACIÓN OPTIMISTA: Modificar estado y UI al instante.
    setFilter(type, newValue);
    renderFilterPills();
    document.dispatchEvent(new CustomEvent('uiActionTriggered'));

    try {
        // 2. LLAMADA A LA API: Se ejecuta en segundo plano.
        await loadAndRenderMovies(1);
    } catch (error) {
        // 3. MANEJO DE ERROR Y REVERSIÓN
        // Ignoramos los errores de 'AbortError' ya que son intencionados.
        if (error.name === 'AbortError') return;

        console.error(`Error optimista al aplicar el filtro ${type}:`, error);
        showToast(`No se pudo aplicar el filtro.`, 'error');

        // Revertimos el estado al que teníamos antes del clic.
        // NOTA: Una función `setState(previousState)` sería ideal, pero
        // por ahora revertimos el filtro específico que falló.
        setFilter(type, previousFilters[type]);
        
        // Volvemos a renderizar la UI del sidebar para que refleje el estado revertido.
        renderFilterPills();
    }
}

/**
 * Maneja el cambio de un filtro de exclusión de forma optimista.
 * @param {string} type - El tipo de filtro ('genre' o 'country').
 * @param {string} value - El valor a incluir/excluir.
 */
async function handleToggleExcludedFilterOptimistic(type, value) {
    const previousState = getActiveFilters(); // Guardamos todo el estado de filtros

    // 1. ACTUALIZACIÓN OPTIMISTA
    if (!toggleExcludedFilter(type, value)) {
        // La acción fue prevenida (ej. límite alcanzado), no hacemos nada.
        showToast(`Límite de 3 exclusiones alcanzado.`, 'error');
        return;
    }
    renderFilterPills();
    document.dispatchEvent(new CustomEvent('uiActionTriggered'));

    try {
        // 2. LLAMADA A LA API
        await loadAndRenderMovies(1);
    } catch (error) {
        // 3. REVERSIÓN
        if (error.name === 'AbortError') return;
        
        console.error(`Error optimista al excluir ${type}:`, error);
        showToast(`No se pudo aplicar el filtro de exclusión.`, 'error');

        // Revertimos la acción. Es más seguro restaurar todo el objeto.
        // Aquí necesitaríamos una función `setFilters(filtersObject)` en state.js.
        // Solución simple por ahora: revertir la acción manualmente.
        toggleExcludedFilter(type, value); // Esto deshará el toggle
        setFilter('country', previousState.country); // Restaura el filtro de inclusión si se borró
        setFilter('genre', previousState.genre);
        
        renderFilterPills();
    }
}

// =================================================================
// == FIN DE LA NUEVA LÓGICA ==
// =================================================================


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
    const sliderInstance = noUiSlider.create(dom.yearSlider, {
        start: [CONFIG.YEAR_MIN, CONFIG.YEAR_MAX],
        connect: true,
        step: 1,
        range: { 'min': CONFIG.YEAR_MIN, 'max': CONFIG.YEAR_MAX },
        format: { to: value => Math.round(value), from: value => Number(value) }
    });

    sliderInstance.on('update', (values, handle) => {
        yearInputs[handle].value = values[handle];
    });

    const debouncedUpdate = debounce(values => {
        const yearFilter = `${values[0]}-${values[1]}`;
        // En lugar de llamar a `setFilter` y despachar, llamamos a la función optimista.
        handleFilterChangeOptimistic('year', yearFilter);
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
                case 'ArrowDown': e.preventDefault(); activeIndex = Math.min(activeIndex + 1, items.length - 1); updateActiveSuggestion(activeIndex); break;
                case 'ArrowUp': e.preventDefault(); activeIndex = Math.max(activeIndex - 1, -1); updateActiveSuggestion(activeIndex); break;
                case 'Enter': e.preventDefault(); if (activeIndex >= 0 && items[activeIndex]) items[activeIndex].click(); break;
                case 'Escape': e.preventDefault(); clearAllSidebarAutocomplete(); break;
            }
        });

        form.addEventListener('click', (e) => {
            const suggestionItem = e.target.closest(`.${CSS_CLASSES.SIDEBAR_AUTOCOMPLETE_ITEM}`);
            if (suggestionItem) {
                handleFilterChangeOptimistic(filterType, suggestionItem.dataset.value);
                input.value = '';
                clearAllSidebarAutocomplete();
            }
        });
    });
}

function handlePillClick(e) {
    const pill = e.target.closest('.filter-pill');
    if (!pill) return;
    const { filterType, filterValue } = pill.dataset;
    pill.classList.add('is-removing');
    pill.addEventListener('animationend', () => {
        if (pill.classList.contains('filter-pill--exclude')) {
            handleToggleExcludedFilterOptimistic(filterType, filterValue);
        } else {
            handleFilterChangeOptimistic(filterType, null);
        }
    }, { once: true });
}

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
            e.currentTarget.innerHTML = isOpening ? ICONS.REWIND : ICONS.FORWARD;
            e.currentTarget.setAttribute('aria-label', isOpening ? 'Contraer sidebar' : 'Expandir sidebar');
        });
    }

    if (dom.toggleRotationBtn) {
        dom.toggleRotationBtn.addEventListener('click', (e) => {
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
                triggerPopAnimation(excludeBtn);
                handleToggleExcludedFilterOptimistic(excludeBtn.dataset.type, excludeBtn.dataset.value);
                return;
            }
            const link = e.target.closest('.filter-link');
            if (link) {
                triggerPopAnimation(link);
                handleFilterChangeOptimistic(link.dataset.filterType, link.dataset.filterValue);
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

export function initSidebar() {
    if (window.innerWidth <= 768) {
        if (dom.rewindButton) {
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
                innerHTML: ICONS.PAUSE_SMALL
            });
        }
        return null;
    };

    document.querySelectorAll('.filter-link').forEach(link => {
        const { filterType, filterValue } = link.dataset;
        const textWrapper = createElement('span', { textContent: link.textContent });
        link.textContent = '';
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