// =================================================================
//          COMPONENTE: Sidebar (Filtros + Gestos Táctiles)
// =================================================================
// FICHERO: src/js/components/sidebar.js
// ESTADO: Fusionado (Incluye lógica de filtros y Touch Drawer)
// =================================================================

import noUiSlider from 'nouislider';
import 'nouislider/dist/nouislider.css'; 
import { CONFIG } from "../constants.js"; // ✨ Actualizado a constants.js
import { debounce, triggerPopAnimation, createElement, triggerHapticFeedback, highlightAccentInsensitive } from "../utils.js";
import {
  fetchDirectorSuggestions, fetchActorSuggestions, fetchCountrySuggestions, fetchGenreSuggestions,
} from "../api.js";
import { unflipAllCards } from "./card.js";
import { closeModal } from "./quick-view.js";
import { getActiveFilters, setFilter, toggleExcludedFilter, getActiveFilterCount } from "../state.js";
import { ICONS, CSS_CLASSES, SELECTORS, FILTER_CONFIG } from "../constants.js";
import { loadAndRenderMovies } from "../main.js";
import { showToast, clearAllSidebarAutocomplete } from "../ui.js"; 

// --- Referencias DOM Centralizadas ---
const dom = {
  sidebar: document.getElementById("sidebar"),
  sidebarInnerWrapper: document.querySelector(".sidebar-inner-wrapper"),
  rewindButton: document.querySelector("#rewind-button"),
  toggleRotationBtn: document.querySelector("#toggle-rotation-btn"),
  playButton: document.querySelector("#play-button"),
  collapsibleSections: document.querySelectorAll(".collapsible-section"),
  sidebarFilterForms: document.querySelectorAll(SELECTORS.SIDEBAR_FILTER_FORM),
  sidebarScrollable: document.querySelector(".sidebar-scrollable-filters"),
  yearSlider: document.querySelector(SELECTORS.YEAR_SLIDER),
  yearStartInput: document.querySelector(SELECTORS.YEAR_START_INPUT),
  yearEndInput: document.querySelector(SELECTORS.YEAR_END_INPUT),
  sidebarOverlay: document.getElementById("sidebar-overlay"),
};

// =================================================================
//          1. LÓGICA DE GESTOS TÁCTILES (Touch Drawer)
// =================================================================

const DRAWER_WIDTH = 280;
const SWIPE_VELOCITY_THRESHOLD = 0.4;

let touchState = {
  isDragging: false,
  isHorizontalDrag: false,
  startX: 0,
  startY: 0,
  startTime: 0,
  currentTranslate: 0,
  startTranslate: 0
};

const openMobileDrawer = () => {
  document.body.classList.add("sidebar-is-open");
  dom.sidebar.style.transform = `translateX(0px)`;
  dom.sidebar.style.transition = "transform 0.4s cubic-bezier(0.25, 1, 0.5, 1)";
  touchState.currentTranslate = 0;
  updateRewindButtonIcon(true);
};

const closeMobileDrawer = () => {
  document.body.classList.remove("sidebar-is-open");
  dom.sidebar.style.transform = `translateX(-${DRAWER_WIDTH}px)`;
  dom.sidebar.style.transition = "transform 0.3s cubic-bezier(0.4, 0, 0.2, 1)";
  touchState.currentTranslate = -DRAWER_WIDTH;
  updateRewindButtonIcon(false);
};

function handleTouchStart(e) {
  if (window.innerWidth > 768) return;

  const isOpen = document.body.classList.contains("sidebar-is-open");
  // Permitir arrastre si está abierto (desde el sidebar) o cerrado (desde el borde izq)
  const canStartDrag = (isOpen && e.target.closest("#sidebar")) || (!isOpen && e.touches[0].clientX < 80);

  if (!canStartDrag) {
    touchState.isDragging = false;
    return;
  }

  touchState.isDragging = true;
  touchState.isHorizontalDrag = false;
  touchState.startX = e.touches[0].clientX;
  touchState.startY = e.touches[0].clientY;
  touchState.startTime = Date.now();
  touchState.startTranslate = isOpen ? 0 : -DRAWER_WIDTH;
  
  dom.sidebar.style.transition = "none"; // Respuesta inmediata al dedo
}

function handleTouchMove(e) {
  if (!touchState.isDragging) return;

  const currentX = e.touches[0].clientX;
  const currentY = e.touches[0].clientY;
  const diffX = currentX - touchState.startX;
  const diffY = currentY - touchState.startY;

  // Detectar intención del usuario (Scroll vs Swipe)
  if (!touchState.isHorizontalDrag) {
    if (Math.abs(diffX) > 5 || Math.abs(diffY) > 5) {
      if (Math.abs(diffY) > Math.abs(diffX) * 1.5) {
        touchState.isDragging = false; // Es scroll vertical
        return;
      }
      touchState.isHorizontalDrag = true; // Es swipe
    } else {
      return; // Umbral no superado
    }
  }

  e.preventDefault(); // Bloquear scroll nativo

  let newTranslate = touchState.startTranslate + diffX;

  // Física Elástica (Rubber Banding)
  if (newTranslate > 0) {
    newTranslate *= 0.3; // Resistencia al tirar a la derecha
  } else if (newTranslate < -DRAWER_WIDTH) {
    const overflow = Math.abs(newTranslate + DRAWER_WIDTH);
    newTranslate = -DRAWER_WIDTH - (overflow * 0.3); // Resistencia al tirar a la izquierda
  }

  touchState.currentTranslate = newTranslate;
  dom.sidebar.style.transform = `translateX(${touchState.currentTranslate}px)`;
}

function handleTouchEnd(e) {
  if (!touchState.isDragging || !touchState.isHorizontalDrag) {
    touchState.isDragging = false;
    return;
  }
  touchState.isDragging = false;
  touchState.isHorizontalDrag = false;

  const duration = Date.now() - touchState.startTime;
  const finalX = e.changedTouches[0].clientX;
  const distance = finalX - touchState.startX;
  const velocity = duration > 0 ? distance / duration : 0;

  // Decisión basada en inercia o posición
  if (Math.abs(velocity) > SWIPE_VELOCITY_THRESHOLD) {
    velocity > 0 ? openMobileDrawer() : closeMobileDrawer();
  } else {
    // Punto medio (-140px)
    touchState.currentTranslate > -DRAWER_WIDTH / 2 ? openMobileDrawer() : closeMobileDrawer();
  }
}

function updateRewindButtonIcon(isOpen) {
  if (!dom.rewindButton) return;
  dom.rewindButton.innerHTML = isOpen ? ICONS.REWIND : ICONS.FORWARD;
  dom.rewindButton.setAttribute("aria-label", isOpen ? "Contraer sidebar" : "Expandir sidebar");
  dom.rewindButton.setAttribute("aria-expanded", isOpen);
}

function initTouchGestures() {
  if (!dom.sidebar) return;
  document.addEventListener("touchstart", handleTouchStart, { passive: true });
  document.addEventListener("touchmove", handleTouchMove, { passive: false });
  document.addEventListener("touchend", handleTouchEnd, { passive: true });

  // Reset en resize
  window.addEventListener("resize", () => {
    if (window.innerWidth > 768) {
      document.body.classList.remove("sidebar-is-open");
      dom.sidebar.style.transform = "";
      dom.sidebar.style.transition = "";
      touchState.currentTranslate = -DRAWER_WIDTH;
    } else {
      // Sincronizar estado visual si cambiamos de orientación en tablet/móvil
      if (document.body.classList.contains("sidebar-is-open")) openMobileDrawer();
      else closeMobileDrawer();
    }
  });
}

// =================================================================
//          2. LÓGICA DE AUTOCOMPLETADO (Filtros)
// =================================================================

function renderSidebarAutocomplete(formElement, suggestions, searchTerm) {
  const input = formElement.querySelector(SELECTORS.SIDEBAR_FILTER_INPUT);
  let resultsContainer = formElement.querySelector(SELECTORS.SIDEBAR_AUTOCOMPLETE_RESULTS);

  if (!resultsContainer) {
    resultsContainer = createElement("div", { className: "sidebar-autocomplete-results" });
    formElement.appendChild(resultsContainer);
  }

  resultsContainer.textContent = "";

  if (suggestions.length === 0) {
    input.removeAttribute("aria-expanded");
    resultsContainer.remove();
    return;
  }

  resultsContainer.id = `autocomplete-results-${formElement.dataset.filterType}`;
  resultsContainer.setAttribute("role", "listbox");
  input.setAttribute("aria-expanded", "true");
  input.setAttribute("aria-controls", resultsContainer.id);

  const fragment = document.createDocumentFragment();
  suggestions.forEach((suggestion, index) => {
    const item = createElement("div", {
      className: CSS_CLASSES.SIDEBAR_AUTOCOMPLETE_ITEM,
      dataset: { value: suggestion },
      innerHTML: highlightAccentInsensitive(suggestion, searchTerm),
      id: `suggestion-item-${formElement.dataset.filterType}-${index}`,
      attributes: { role: "option" },
    });
    fragment.appendChild(item);
  });

  resultsContainer.appendChild(fragment);
}

// =================================================================
//          3. GESTIÓN DE UI FILTROS
// =================================================================

function updateFilterAvailabilityUI() {
  const activeCount = getActiveFilterCount();
  const limitReached = activeCount >= CONFIG.MAX_ACTIVE_FILTERS;
  document.querySelectorAll(".filter-link").forEach((link) => {
    const isDisabled = limitReached && link.style.display !== "none";
    link.toggleAttribute("disabled", isDisabled);
    link.style.pointerEvents = isDisabled ? "none" : "auto";
    link.style.opacity = isDisabled ? "0.5" : "1";
  });
  document.querySelectorAll(".sidebar-filter-input").forEach((input) => {
    input.disabled = limitReached;
    input.placeholder = limitReached ? "Límite de filtros" : `Otro ${input.closest("form").dataset.filterType}...`;
  });
}

function updateFilterLinksUI() {
  const activeFilters = getActiveFilters();
  document.querySelectorAll(".filter-link").forEach((link) => {
    const type = link.dataset.filterType;
    const value = link.dataset.filterValue;
    const isExcluded = (type === "genre" && activeFilters.excludedGenres?.includes(value)) || (type === "country" && activeFilters.excludedCountries?.includes(value));
    const isActive = activeFilters[type] === value;
    link.style.display = isActive || isExcluded ? "none" : "flex";
  });
}

function renderFilterPills() {
  const activeFilters = getActiveFilters();
  document.querySelectorAll(".active-filters-list").forEach((container) => (container.textContent = ""));
  let pillIndex = 0;

  const createPill = (type, value, isExcluded = false, index = 0) => {
    const pill = createElement("div", { className: `filter-pill ${isExcluded ? "filter-pill--exclude" : ""}`, dataset: { filterType: type, filterValue: value } });
    pill.style.setProperty("--pill-index", index);
    const text = FILTER_CONFIG[type]?.items[value] || value;
    pill.appendChild(createElement("span", { textContent: text }));
    pill.appendChild(createElement("span", { className: "remove-filter-btn", innerHTML: isExcluded ? ICONS.PAUSE_SMALL : "×", attributes: { "aria-hidden": "true" } }));
    return pill;
  };

  const renderPillsForSection = (filterType, values, isExcluded = false, currentIndex) => {
    const section = document.querySelector(`.sidebar-filter-form[data-filter-type="${filterType}"]`)?.closest(".collapsible-section") || document.querySelector(`.filter-link[data-filter-type="${filterType}"]`)?.closest(".collapsible-section");
    if (!section) return currentIndex;
    const container = section.querySelector(".active-filters-list");
    if (!container) return currentIndex;
    const valuesArray = Array.isArray(values) ? values : [values].filter(Boolean);
    valuesArray.forEach((value) => { container.appendChild(createPill(filterType, value, isExcluded, currentIndex++)); });
    return currentIndex;
  };

  const SECTION_CONFIG = [
    { type: 'selection', prop: 'selection' },
    { type: 'studio',    prop: 'studio' },
    { type: 'genre',     prop: 'genre' },
    { type: 'country',   prop: 'country' },
    { type: 'director',  prop: 'director' },
    { type: 'actor',     prop: 'actor' },
    { type: 'genre',     prop: 'excludedGenres',    isExcluded: true },
    { type: 'country',   prop: 'excludedCountries', isExcluded: true },
  ];

  SECTION_CONFIG.forEach(({ type, prop, isExcluded }) => {
    pillIndex = renderPillsForSection(type, activeFilters[prop], isExcluded || false, pillIndex);
  });

  updateFilterLinksUI();
  updateFilterAvailabilityUI();
}

async function handleFilterChangeOptimistic(type, value) {
  const previousFilters = getActiveFilters();
  if (value) {
    if (type === 'selection' && previousFilters.studio) setFilter('studio', null); 
    else if (type === 'studio' && previousFilters.selection) setFilter('selection', null);
  }
  const isActivating = previousFilters[type] !== value;
  const newValue = isActivating ? value : null;
  if (!setFilter(type, newValue)) {
    showToast(`Límite de ${CONFIG.MAX_ACTIVE_FILTERS} filtros alcanzado.`, "error");
    if (type === 'selection' && previousFilters.studio) setFilter('studio', previousFilters.studio);
    if (type === 'studio' && previousFilters.selection) setFilter('selection', previousFilters.selection);
    return;
  }
  renderFilterPills();
  document.dispatchEvent(new CustomEvent("uiActionTriggered"));
  try { await loadAndRenderMovies(1); } catch (error) {
    if (error.name === "AbortError") return;
    showToast(`No se pudo aplicar el filtro.`, "error");
    setFilter('selection', previousFilters.selection);
    setFilter('studio', previousFilters.studio);
    setFilter(type, previousFilters[type]);
    renderFilterPills();
  }
}

async function handleToggleExcludedFilterOptimistic(type, value) {
  const previousState = getActiveFilters();
  if (!toggleExcludedFilter(type, value)) {
    showToast(`Límite de filtros alcanzado.`, "error");
    return;
  }
  renderFilterPills();
  document.dispatchEvent(new CustomEvent("uiActionTriggered"));
  try { await loadAndRenderMovies(1); } catch (error) {
    if (error.name === "AbortError") return;
    showToast(`No se pudo aplicar el filtro de exclusión.`, "error");
    toggleExcludedFilter(type, value);
    setFilter("country", previousState.country);
    setFilter("genre", previousState.genre);
    renderFilterPills();
  }
}

function resetFilters() {
  if (dom.playButton) triggerPopAnimation(dom.playButton);
  triggerHapticFeedback('medium');
  document.dispatchEvent(new CustomEvent("filtersReset"));
}

export function collapseAllSections() {
  dom.collapsibleSections.forEach((section) => section.classList.remove(CSS_CLASSES.ACTIVE));
  if (dom.sidebarInnerWrapper) dom.sidebarInnerWrapper.classList.remove("is-compact");
}

// =================================================================
//          4. SLIDERS, INPUTS Y LISTENERS
// =================================================================

function initYearSlider() {
  if (!dom.yearSlider || !dom.yearStartInput || !dom.yearEndInput) return;
  const yearInputs = [dom.yearStartInput, dom.yearEndInput];
  const sliderInstance = noUiSlider.create(dom.yearSlider, {
    start: [CONFIG.YEAR_MIN, CONFIG.YEAR_MAX],
    connect: true, step: 1, range: { min: CONFIG.YEAR_MIN, max: CONFIG.YEAR_MAX },
    format: { to: (value) => Math.round(value), from: (value) => Number(value) },
  });
  sliderInstance.on("update", (values, handle) => { yearInputs[handle].value = values[handle]; });
  const debouncedUpdate = debounce((values) => {
    const yearFilter = `${values[0]}-${values[1]}`;
    handleFilterChangeOptimistic("year", yearFilter);
  }, 500);
  sliderInstance.on("set", debouncedUpdate);
  yearInputs.forEach((input, index) => {
    input.addEventListener("change", (e) => {
      const values = [null, null];
      values[index] = e.target.value;
      sliderInstance.set(values);
    });
  });
}

function setupYearInputSteppers() {
  document.querySelectorAll(".year-input-wrapper").forEach((wrapper) => {
    const input = wrapper.querySelector(".year-input");
    const stepperUp = wrapper.querySelector(".stepper-btn.stepper-up");
    const stepperDown = wrapper.querySelector(".stepper-btn.stepper-down");
    if (!input || !stepperUp || !stepperDown) return;
    const updateYearValue = (increment) => {
      triggerHapticFeedback('light');
      let currentValue = parseInt(input.value, 10);
      if (isNaN(currentValue)) currentValue = increment > 0 ? CONFIG.YEAR_MIN : CONFIG.YEAR_MAX;
      const newValue = Math.min(Math.max(currentValue + increment, CONFIG.YEAR_MIN), CONFIG.YEAR_MAX);
      input.value = newValue;
      input.dispatchEvent(new Event("change", { bubbles: true }));
    };
    stepperUp.addEventListener("click", () => updateYearValue(1));
    stepperDown.addEventListener("click", () => updateYearValue(-1));
  });
}

const suggestionFetchers = { genre: fetchGenreSuggestions, director: fetchDirectorSuggestions, actor: fetchActorSuggestions, country: fetchCountrySuggestions };

function setupAutocompleteHandlers() {
  dom.sidebarFilterForms.forEach((form) => {
    const input = form.querySelector(SELECTORS.SIDEBAR_FILTER_INPUT);
    const filterType = form.dataset.filterType;
    const fetcher = suggestionFetchers[filterType];
    if (!input || !fetcher) return;
    input.setAttribute("role", "combobox");
    input.setAttribute("aria-autocomplete", "list");
    input.setAttribute("aria-expanded", "false");
    
    const debouncedFetch = debounce(async () => {
      const searchTerm = input.value;
      if (searchTerm.length < 3) { clearAllSidebarAutocomplete(form); return; }
      const suggestions = await fetcher(searchTerm);
      renderSidebarAutocomplete(form, suggestions, searchTerm);
    }, CONFIG.SEARCH_DEBOUNCE_DELAY);
    
    input.addEventListener("input", debouncedFetch);
    
    input.addEventListener("keydown", (e) => {
       const resultsContainer = form.querySelector(SELECTORS.SIDEBAR_AUTOCOMPLETE_RESULTS);
       if (!resultsContainer || resultsContainer.children.length === 0) return;
       const items = Array.from(resultsContainer.children);
       let activeIndex = items.findIndex(i => i.classList.contains('is-active'));
       
       const updateActiveSuggestion = (index) => {
         items.forEach(item => item.classList.remove("is-active"));
         if (index >= 0 && items[index]) {
           items[index].classList.add("is-active");
           input.setAttribute("aria-activedescendant", items[index].id);
         } else { input.removeAttribute("aria-activedescendant"); }
       };

       switch (e.key) {
        case "ArrowDown": e.preventDefault(); activeIndex = Math.min(activeIndex + 1, items.length - 1); updateActiveSuggestion(activeIndex); break;
        case "ArrowUp": e.preventDefault(); activeIndex = Math.max(activeIndex - 1, -1); updateActiveSuggestion(activeIndex); break;
        case "Enter": e.preventDefault(); if (activeIndex >= 0 && items[activeIndex]) items[activeIndex].click(); break;
        case "Escape": e.preventDefault(); clearAllSidebarAutocomplete(); break;
      }
    });
    
    form.addEventListener("click", (e) => {
      const suggestionItem = e.target.closest(`.${CSS_CLASSES.SIDEBAR_AUTOCOMPLETE_ITEM}`);
      if (suggestionItem) {
        triggerHapticFeedback('light');
        handleFilterChangeOptimistic(filterType, suggestionItem.dataset.value);
        input.value = "";
        clearAllSidebarAutocomplete();
      }
    });
  });
}

function handlePillClick(e) {
  const pill = e.target.closest(".filter-pill");
  if (!pill) return;
  triggerHapticFeedback('medium');
  const { filterType, filterValue } = pill.dataset;
  pill.classList.add("is-removing");
  pill.addEventListener("animationend", () => {
    if (pill.classList.contains("filter-pill--exclude")) handleToggleExcludedFilterOptimistic(filterType, filterValue);
    else handleFilterChangeOptimistic(filterType, null);
  }, { once: true });
}

function setupEventListeners() {
  document.querySelectorAll(".collapsible-section .section-header").forEach((header) => {
    const iconWrapper = document.createElement('div');
    iconWrapper.innerHTML = ICONS.CHEVRON_RIGHT;
    if (iconWrapper.firstChild) header.appendChild(iconWrapper.firstChild);
  });

  // Manejo Unificado del Botón Rewind (Click en Desktop/Tablet/Móvil)
  if (dom.rewindButton) {
    dom.rewindButton.addEventListener("click", (e) => {
      triggerHapticFeedback('light');
      const isMobile = window.innerWidth <= 768;
      
      if (isMobile) {
        const isOpen = document.body.classList.contains("sidebar-is-open");
        isOpen ? closeMobileDrawer() : openMobileDrawer();
      } else {
        document.body.classList.toggle("sidebar-collapsed");
        const isNowCollapsed = document.body.classList.contains("sidebar-collapsed");
        updateRewindButtonIcon(!isNowCollapsed);
      }
    });
  }

  // Cierre por Overlay (Móvil)
  if (dom.sidebarOverlay) {
    dom.sidebarOverlay.addEventListener("click", closeMobileDrawer);
  }

if (dom.toggleRotationBtn) {
    dom.toggleRotationBtn.addEventListener("click", (e) => {
      triggerHapticFeedback('light');
      unflipAllCards();
      closeModal();
      
      document.body.classList.toggle("rotation-disabled");
      const isRotationDisabled = document.body.classList.contains("rotation-disabled");
      const button = e.currentTarget;
      
      // Actualización visual (Iconos y Tooltips)
      button.innerHTML = isRotationDisabled ? ICONS.SQUARE_STOP : ICONS.PAUSE;
      button.setAttribute("aria-label", isRotationDisabled ? "Activar rotación de tarjetas" : "Pausar rotación de tarjetas");
      button.title = isRotationDisabled ? "Giro automático" : "Vista Rápida";
      
      // ✨ ACCESIBILIDAD: Comunicar estado al lector de pantalla
      button.setAttribute("aria-pressed", isRotationDisabled);
      
      localStorage.setItem("rotationState", isRotationDisabled ? "disabled" : "enabled");
      triggerPopAnimation(button);
    });
  }

  if (dom.sidebarScrollable) {
    dom.sidebarScrollable.addEventListener("click", (e) => {
      handlePillClick(e);
      const excludeBtn = e.target.closest(".exclude-filter-btn");
      if (excludeBtn) {
        e.stopPropagation();
        triggerHapticFeedback('medium');
        triggerPopAnimation(excludeBtn);
        handleToggleExcludedFilterOptimistic(excludeBtn.dataset.type, excludeBtn.dataset.value);
        return;
      }
      const link = e.target.closest(".filter-link");
      if (link && !link.hasAttribute("disabled")) {
        triggerHapticFeedback('light');
        triggerPopAnimation(link);
        handleFilterChangeOptimistic(link.dataset.filterType, link.dataset.filterValue);
      }
    });
  }
  
  if (dom.playButton) dom.playButton.addEventListener("click", resetFilters);

  dom.collapsibleSections.forEach((clickedSection) => {
    const header = clickedSection.querySelector(".section-header");
    header?.addEventListener("click", () => {
      triggerHapticFeedback('light');
      const wasActive = clickedSection.classList.contains(CSS_CLASSES.ACTIVE);
      const isNowActive = !wasActive;
      dom.collapsibleSections.forEach((section) => {
        if (section !== clickedSection) {
          section.classList.remove(CSS_CLASSES.ACTIVE);
          section.querySelector('.section-header')?.setAttribute('aria-expanded', 'false');
        }
      });
      clickedSection.classList.toggle(CSS_CLASSES.ACTIVE, isNowActive);
      header.setAttribute('aria-expanded', isNowActive);
      dom.sidebarInnerWrapper?.classList.toggle("is-compact", isNowActive);
    });
  });
}

// =================================================================
//          INICIALIZACIÓN PRINCIPAL
// =================================================================

export function initSidebar() {
  if (window.innerWidth <= 768) {
    updateRewindButtonIcon(false); // Móvil empieza cerrado
  }
  
  const populateFilterSection = (filterType) => {
    const config = FILTER_CONFIG[filterType];
    if (!config) return;
    const contentId = filterType === 'country' ? 'countries-content' : `${filterType}s-content`;
    const listContainer = document.querySelector(`#${contentId} > div:first-child`);
    if (!listContainer) return;
    listContainer.textContent = "";
    const fragment = document.createDocumentFragment();
    Object.entries(config.items).forEach(([value, text]) => {
      const link = createElement("button", { type: "button", className: "filter-link", dataset: { filterType, filterValue: value } });
      const textWrapper = createElement("span", { textContent: text });
      link.appendChild(textWrapper);
      if (config.excludable?.includes(value)) {
        const excludeBtn = createElement("button", {
          type: "button", className: "exclude-filter-btn",
          dataset: { value: value, type: filterType },
          attributes: { "aria-label": `Excluir ${config.label} ${text}` },
          innerHTML: ICONS.PAUSE_SMALL,
        });
        link.appendChild(excludeBtn);
      }
      fragment.appendChild(link);
    });
    listContainer.appendChild(fragment);
  };

  Object.keys(FILTER_CONFIG).forEach(populateFilterSection);
  
  if (dom.toggleRotationBtn) {
    const isRotationDisabled = document.body.classList.contains("rotation-disabled");
    dom.toggleRotationBtn.innerHTML = isRotationDisabled ? ICONS.SQUARE_STOP : ICONS.PAUSE;
    dom.toggleRotationBtn.setAttribute("aria-label", isRotationDisabled ? "Activar rotación de tarjetas" : "Pausar rotación de tarjetas");
    dom.toggleRotationBtn.title = isRotationDisabled ? "Giro automático" : "Vista Rápida";
  }

  initYearSlider();
  initTouchGestures(); // ACTIVACIÓN DE GESTOS
  setupEventListeners();
  setupAutocompleteHandlers();
  setupYearInputSteppers();

  document.addEventListener("updateSidebarUI", () => {
    dom.sidebarFilterForms.forEach((form) => {
      const input = form.querySelector(SELECTORS.SIDEBAR_FILTER_INPUT);
      if (input) input.value = "";
    });
    const currentFilters = getActiveFilters();
    const years = (currentFilters.year || `${CONFIG.YEAR_MIN}-${CONFIG.YEAR_MAX}`).split("-").map(Number);
    if (dom.yearSlider?.noUiSlider) dom.yearSlider.noUiSlider.set(years, false);
    renderFilterPills();
  });
  
  document.addEventListener("filtersReset", collapseAllSections);
  document.addEventListener("uiActionTriggered", collapseAllSections);
}