// =================================================================
//                      COMPONENTE SIDEBAR (Versión Optimizada y Dinámica)
// =================================================================
// Responsabilidades:
// - Gestionar la interactividad del menú lateral (filtros, secciones, slider de año).
// - Implementar la lógica de UI Optimista para una respuesta instantánea.
// - Renderizar los filtros activos como "píldoras" con animación en cascada.
// - Validar y aplicar un límite máximo de filtros activos para mejorar la UX.
// - Manejar los buscadores de autocompletado.
// - ✨ MEJORA: Generar dinámicamente los filtros desde una configuración central.
// =================================================================

// ▼▼▼ AÑADE ESTAS DOS LÍNEAS AL PRINCIPIO ▼▼▼
import noUiSlider from 'nouislider';
import 'nouislider/dist/nouislider.css'; 
// ▲▲▲ FIN DE LÍNEAS A AÑADIR ▲▲▲
import { CONFIG } from "../config.js";
import { debounce, triggerPopAnimation, createElement } from "../utils.js";
import {
  fetchDirectorSuggestions,
  fetchActorSuggestions,
  fetchCountrySuggestions,
  fetchGenreSuggestions,
} from "../api.js";
import {
  renderSidebarAutocomplete,
  clearAllSidebarAutocomplete,
} from "./autocomplete.js";
import { unflipAllCards } from "./card.js";
import { closeModal } from "./quick-view.js";
import {
  getActiveFilters,
  setFilter,
  toggleExcludedFilter,
  getActiveFilterCount,
} from "../state.js";
import { ICONS, CSS_CLASSES, SELECTORS, FILTER_CONFIG } from "../constants.js";
import { loadAndRenderMovies } from "../main.js";
import { showToast } from "../toast.js";

// Referencias cacheadas a los elementos del DOM del sidebar.
const dom = {
  sidebarInnerWrapper: document.querySelector(".sidebar-inner-wrapper"),
  rewindButton: document.querySelector("#rewind-button"),
  toggleRotationBtn: document.querySelector("#toggle-rotation-btn"),
  collapsibleSections: document.querySelectorAll(".collapsible-section"),
  sidebarFilterForms: document.querySelectorAll(SELECTORS.SIDEBAR_FILTER_FORM),
  yearSlider: document.querySelector(SELECTORS.YEAR_SLIDER),
  yearStartInput: document.querySelector(SELECTORS.YEAR_START_INPUT),
  yearEndInput: document.querySelector(SELECTORS.YEAR_END_INPUT),
};

// =================================================================
//          RENDERIZADO DE PÍLDORAS Y ACTUALIZACIÓN DE UI
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
    input.placeholder = limitReached
      ? "Límite de filtros"
      : `Otro ${input.closest("form").dataset.filterType}...`;
  });
}

function updateFilterLinksUI() {
  const activeFilters = getActiveFilters();
  document.querySelectorAll(".filter-link").forEach((link) => {
    const type = link.dataset.filterType;
    const value = link.dataset.filterValue;
    const isExcluded =
      (type === "genre" && activeFilters.excludedGenres?.includes(value)) ||
      (type === "country" && activeFilters.excludedCountries?.includes(value));
    const isActive = activeFilters[type] === value;

    link.style.display = isActive || isExcluded ? "none" : "flex";
  });
}

function renderFilterPills() {
  const activeFilters = getActiveFilters();
  document
    .querySelectorAll(".active-filters-list")
    .forEach((container) => (container.textContent = ""));
  let pillIndex = 0;

  const createPill = (type, value, isExcluded = false, index = 0) => {
    const pill = createElement("div", {
      className: `filter-pill ${isExcluded ? "filter-pill--exclude" : ""}`,
      dataset: { filterType: type, filterValue: value },
    });
    pill.style.setProperty("--pill-index", index);

    const text = FILTER_CONFIG[type]?.items[value] || value;

    pill.appendChild(createElement("span", { textContent: text }));
    pill.appendChild(
      createElement("span", {
        className: "remove-filter-btn",
        innerHTML: isExcluded ? ICONS.PAUSE_SMALL : "×",
        attributes: { "aria-hidden": "true" },
      })
    );
    return pill;
  };

  const renderPillsForSection = (
    filterType,
    values,
    isExcluded = false,
    currentIndex
  ) => {
    const section =
      document
        .querySelector(`.sidebar-filter-form[data-filter-type="${filterType}"]`)
        ?.closest(".collapsible-section") ||
      document
        .querySelector(`.filter-link[data-filter-type="${filterType}"]`)
        ?.closest(".collapsible-section");
    if (!section) return currentIndex;
    const container = section.querySelector(".active-filters-list");
    if (!container) return currentIndex;
    const valuesArray = Array.isArray(values)
      ? values
      : [values].filter(Boolean);
    valuesArray.forEach((value) => {
      container.appendChild(
        createPill(filterType, value, isExcluded, currentIndex++)
      );
    });
    return currentIndex;
  };

  pillIndex = renderPillsForSection(
    "selection",
    activeFilters.selection,
    false,
    pillIndex
  );
  pillIndex = renderPillsForSection(
    "studio",
    activeFilters.studio,
    false,
    pillIndex
  );
  pillIndex = renderPillsForSection(
    "genre",
    activeFilters.genre,
    false,
    pillIndex
  );
  pillIndex = renderPillsForSection(
    "country",
    activeFilters.country,
    false,
    pillIndex
  );
  pillIndex = renderPillsForSection(
    "director",
    activeFilters.director,
    false,
    pillIndex
  );
  pillIndex = renderPillsForSection(
    "actor",
    activeFilters.actor,
    false,
    pillIndex
  );
  pillIndex = renderPillsForSection(
    "genre",
    activeFilters.excludedGenres,
    true,
    pillIndex
  );
  pillIndex = renderPillsForSection(
    "country",
    activeFilters.excludedCountries,
    true,
    pillIndex
  );

  updateFilterLinksUI();
  updateFilterAvailabilityUI();
}

// =================================================================
//          MANEJO DE FILTROS CON UI OPTIMISTA Y LÍMITES
// =================================================================

async function handleFilterChangeOptimistic(type, value) {
  const previousFilters = getActiveFilters();
  // ▼▼▼ LÓGICA DE EXCLUSIVIDAD MUTUA AÑADIDA ▼▼▼
  // Antes de aplicar el nuevo filtro, comprobamos si es de un tipo que entra en conflicto.
  if (value) { // Solo aplicamos la lógica de limpieza si estamos ACTIVANDO un filtro.
    if (type === 'selection' && previousFilters.studio) {
      // Si estamos activando una 'selección' y ya hay un 'estudio', limpiamos el estudio.
      setFilter('studio', null); 
    } else if (type === 'studio' && previousFilters.selection) {
      // Si estamos activando un 'estudio' y ya hay una 'selección', limpiamos la selección.
      setFilter('selection', null);
    }
  }
  // ▲▲▲ FIN DE LA LÓGICA AÑADIDA ▲▲▲
  const isActivating = previousFilters[type] !== value;
  const newValue = isActivating ? value : null;

  if (!setFilter(type, newValue)) {
    showToast(
      `Límite de ${CONFIG.MAX_ACTIVE_FILTERS} filtros alcanzado.`,
      "error"
    );
    // Si la acción fue bloqueada, debemos revertir la limpieza que hicimos antes.
    if (type === 'selection' && previousFilters.studio) setFilter('studio', previousFilters.studio);
    if (type === 'studio' && previousFilters.selection) setFilter('selection', previousFilters.selection);
    return;
  }

  renderFilterPills();
  document.dispatchEvent(new CustomEvent("uiActionTriggered"));

  try {
    await loadAndRenderMovies(1);
  } catch (error) {
    if (error.name === "AbortError") return;
    showToast(`No se pudo aplicar el filtro.`, "error");
    // La reversión es más compleja ahora, debemos restaurar todo el estado previo.
    setFilter('selection', previousFilters.selection);
    setFilter('studio', previousFilters.studio);
    setFilter(type, previousFilters[type]); // Asegura que el filtro original se restaure.
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

  try {
    await loadAndRenderMovies(1);
  } catch (error) {
    if (error.name === "AbortError") return;
    showToast(`No se pudo aplicar el filtro de exclusión.`, "error");
    toggleExcludedFilter(type, value);
    setFilter("country", previousState.country);
    setFilter("genre", previousState.genre);
    renderFilterPills();
  }
}

function resetFilters() {
  const playButton = document.querySelector("#play-button");
  if (playButton) triggerPopAnimation(playButton);
  document.dispatchEvent(new CustomEvent("filtersReset"));
}

export function collapseAllSections() {
  dom.collapsibleSections.forEach((section) =>
    section.classList.remove(CSS_CLASSES.ACTIVE)
  );
  if (dom.sidebarInnerWrapper) {
    dom.sidebarInnerWrapper.classList.remove("is-compact");
  }
}

// =================================================================
//          INICIALIZACIÓN DE COMPONENTES DEL SIDEBAR
// =================================================================

function initYearSlider() {
  if (!dom.yearSlider || !dom.yearStartInput || !dom.yearEndInput) return;
  const yearInputs = [dom.yearStartInput, dom.yearEndInput];
  const sliderInstance = noUiSlider.create(dom.yearSlider, {
    start: [CONFIG.YEAR_MIN, CONFIG.YEAR_MAX],
    connect: true,
    step: 1,
    range: { min: CONFIG.YEAR_MIN, max: CONFIG.YEAR_MAX },
    format: {
      to: (value) => Math.round(value),
      from: (value) => Number(value),
    },
  });
  sliderInstance.on("update", (values, handle) => {
    yearInputs[handle].value = values[handle];
  });
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
      let currentValue = parseInt(input.value, 10);
      if (isNaN(currentValue))
        currentValue = increment > 0 ? CONFIG.YEAR_MIN : CONFIG.YEAR_MAX;
      const newValue = Math.min(
        Math.max(currentValue + increment, CONFIG.YEAR_MIN),
        CONFIG.YEAR_MAX
      );
      input.value = newValue;
      input.dispatchEvent(new Event("change", { bubbles: true }));
    };
    stepperUp.addEventListener("click", () => updateYearValue(1));
    stepperDown.addEventListener("click", () => updateYearValue(-1));
  });
}

const suggestionFetchers = {
  genre: fetchGenreSuggestions,
  director: fetchDirectorSuggestions,
  actor: fetchActorSuggestions,
  country: fetchCountrySuggestions,
};

function setupAutocompleteHandlers() {
  dom.sidebarFilterForms.forEach((form) => {
    const input = form.querySelector(SELECTORS.SIDEBAR_FILTER_INPUT);
    const filterType = form.dataset.filterType;
    const fetcher = suggestionFetchers[filterType];
    if (!input || !fetcher) return;
    input.setAttribute("role", "combobox");
    input.setAttribute("aria-autocomplete", "list");
    input.setAttribute("aria-expanded", "false");
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
    input.addEventListener("input", debouncedFetch);
    input.addEventListener("keydown", (e) => {
      const resultsContainer = form.querySelector(
        SELECTORS.SIDEBAR_AUTOCOMPLETE_RESULTS
      );
      if (!resultsContainer || resultsContainer.children.length === 0) return;
      const items = Array.from(resultsContainer.children);
      const updateActiveSuggestion = (index) => {
        items.forEach((item) => item.classList.remove("is-active"));
        if (index >= 0 && items[index]) {
          items[index].classList.add("is-active");
          input.setAttribute("aria-activedescendant", items[index].id);
        } else {
          input.removeAttribute("aria-activedescendant");
        }
      };
      switch (e.key) {
        case "ArrowDown":
          e.preventDefault();
          activeIndex = Math.min(activeIndex + 1, items.length - 1);
          updateActiveSuggestion(activeIndex);
          break;
        case "ArrowUp":
          e.preventDefault();
          activeIndex = Math.max(activeIndex - 1, -1);
          updateActiveSuggestion(activeIndex);
          break;
        case "Enter":
          e.preventDefault();
          if (activeIndex >= 0 && items[activeIndex])
            items[activeIndex].click();
          break;
        case "Escape":
          e.preventDefault();
          clearAllSidebarAutocomplete();
          break;
      }
    });
    form.addEventListener("click", (e) => {
      const suggestionItem = e.target.closest(
        `.${CSS_CLASSES.SIDEBAR_AUTOCOMPLETE_ITEM}`
      );
      if (suggestionItem) {
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
  const { filterType, filterValue } = pill.dataset;
  pill.classList.add("is-removing");
  pill.addEventListener(
    "animationend",
    () => {
      if (pill.classList.contains("filter-pill--exclude")) {
        handleToggleExcludedFilterOptimistic(filterType, filterValue);
      } else {
        handleFilterChangeOptimistic(filterType, null);
      }
    },
    { once: true }
  );
}

function setupEventListeners() {
  // ▼▼▼ LÓGICA AÑADIDA PARA INYECTAR LOS ICONOS CHEVRON ▼▼▼
  // Al inicio, buscamos todas las cabeceras de sección.
  document.querySelectorAll(".collapsible-section .section-header").forEach((header) => {
    // Creamos un elemento temporal para insertar el SVG de forma segura.
    const iconWrapper = document.createElement('div');
    iconWrapper.innerHTML = ICONS.CHEVRON_RIGHT;
    
    // Añadimos el icono SVG (que es el primer hijo del wrapper) al final del botón.
    if (iconWrapper.firstChild) {
      header.appendChild(iconWrapper.firstChild);
    }
  });
  // ▲▲▲ FIN DE LA LÓGICA AÑADIDA ▲▲▲

  if (dom.rewindButton) {
    dom.rewindButton.addEventListener("click", (e) => {

      const isMobile = window.innerWidth <= 768;
      let isOpening;
      if (isMobile) {
        document.body.classList.toggle("sidebar-is-open");
        isOpening = document.body.classList.contains("sidebar-is-open");
      } else {
        document.body.classList.toggle("sidebar-collapsed");
        isOpening = !document.body.classList.contains("sidebar-collapsed");
      }
      e.currentTarget.innerHTML = isOpening ? ICONS.REWIND : ICONS.FORWARD;
      e.currentTarget.setAttribute(
        "aria-label",
        isOpening ? "Contraer sidebar" : "Expandir sidebar"
      );
    });
  }
  if (dom.toggleRotationBtn) {
    dom.toggleRotationBtn.addEventListener("click", (e) => {
      unflipAllCards();
      closeModal();
      document.body.classList.toggle("rotation-disabled");
      const isRotationDisabled =
        document.body.classList.contains("rotation-disabled");
      const button = e.currentTarget;
      button.innerHTML = isRotationDisabled ? ICONS.SQUARE_STOP : ICONS.PAUSE;
      button.setAttribute(
        "aria-label",
        isRotationDisabled
          ? "Activar rotación de tarjetas"
          : "Pausar rotación de tarjetas"
      );
      button.title = isRotationDisabled ? "Giro automático" : "Vista Rápida";
      localStorage.setItem(
        "rotationState",
        isRotationDisabled ? "disabled" : "enabled"
      );
      triggerPopAnimation(button);
    });
  }
  const sidebarScrollable = document.querySelector(
    ".sidebar-scrollable-filters"
  );
  if (sidebarScrollable) {
    sidebarScrollable.addEventListener("click", (e) => {
      handlePillClick(e);
      const excludeBtn = e.target.closest(".exclude-filter-btn");
      if (excludeBtn) {
        e.stopPropagation();
        triggerPopAnimation(excludeBtn);
        handleToggleExcludedFilterOptimistic(
          excludeBtn.dataset.type,
          excludeBtn.dataset.value
        );
        return;
      }
      const link = e.target.closest(".filter-link");
      if (link && !link.hasAttribute("disabled")) {
        triggerPopAnimation(link);
        handleFilterChangeOptimistic(
          link.dataset.filterType,
          link.dataset.filterValue
        );
      }
    });
  }
  const playButton = document.querySelector("#play-button");
  if (playButton) {
    playButton.addEventListener("click", resetFilters);
  }
dom.collapsibleSections.forEach((clickedSection) => {
    const header = clickedSection.querySelector(".section-header");
    
    header?.addEventListener("click", () => {
      // 1. Determina el estado final de la sección que se ha clickeado.
      const wasActive = clickedSection.classList.contains(CSS_CLASSES.ACTIVE);
      const isNowActive = !wasActive;

      // 2. Cierra todas las demás secciones y actualiza su estado ARIA a 'false'.
      dom.collapsibleSections.forEach((section) => {
        if (section !== clickedSection) {
          section.classList.remove(CSS_CLASSES.ACTIVE);
          section.querySelector('.section-header')?.setAttribute('aria-expanded', 'false');
        }
      });

      // 3. Activa/desactiva la sección clickeada y sincroniza su atributo ARIA.
      clickedSection.classList.toggle(CSS_CLASSES.ACTIVE, isNowActive);
      header.setAttribute('aria-expanded', isNowActive);

      // 4. Gestiona la clase 'is-compact' en el contenedor principal.
      dom.sidebarInnerWrapper?.classList.toggle("is-compact", isNowActive);
    });
});
}

/**
 * Función principal que inicializa todo el componente del sidebar.
 */
export function initSidebar() {
  if (window.innerWidth <= 768) {
    if (dom.rewindButton) {
      dom.rewindButton.innerHTML = ICONS.FORWARD;
      dom.rewindButton.setAttribute("aria-label", "Expandir sidebar");
    }
  }

  const populateFilterSection = (filterType) => {
    const config = FILTER_CONFIG[filterType];
    if (!config) return;

    // ✨ CORRECCIÓN: Se maneja el caso especial de "country" -> "countries"
    const contentId = filterType === 'country' ? 'countries-content' : `${filterType}s-content`;
    const listContainer = document.querySelector(`#${contentId} > div:first-child`);

    if (!listContainer) {
        console.warn(`No se encontró el contenedor de lista para el tipo de filtro: ${filterType}`);
        return;
    }

    listContainer.textContent = "";
    const fragment = document.createDocumentFragment();

    Object.entries(config.items).forEach(([value, text]) => {
      const link = createElement("button", {
        type: "button",
        className: "filter-link",
        dataset: { filterType, filterValue: value },
      });

      const textWrapper = createElement("span", { textContent: text });
      link.appendChild(textWrapper);

      if (config.excludable?.includes(value)) {
        const excludeBtn = createElement("button", {
          type: "button",
          className: "exclude-filter-btn",
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

  const toggleBtn = dom.toggleRotationBtn;
  if (toggleBtn) {
    const isRotationDisabled =
      document.body.classList.contains("rotation-disabled");
    toggleBtn.innerHTML = isRotationDisabled ? ICONS.SQUARE_STOP : ICONS.PAUSE;
    toggleBtn.setAttribute(
      "aria-label",
      isRotationDisabled
        ? "Activar rotación de tarjetas"
        : "Pausar rotación de tarjetas"
    );
    toggleBtn.title = isRotationDisabled ? "Giro automático" : "Vista Rápida";
  }

  initYearSlider();
  setupEventListeners();
  setupAutocompleteHandlers();
  setupYearInputSteppers();

  document.addEventListener("updateSidebarUI", () => {
    dom.sidebarFilterForms.forEach((form) => {
      const input = form.querySelector(SELECTORS.SIDEBAR_FILTER_INPUT);
      if (input) input.value = "";
    });
    const currentFilters = getActiveFilters();
    const years = (
      currentFilters.year || `${CONFIG.YEAR_MIN}-${CONFIG.YEAR_MAX}`
    )
      .split("-")
      .map(Number);
    if (dom.yearSlider?.noUiSlider) {
      dom.yearSlider.noUiSlider.set(years, false);
    }
    renderFilterPills();
  });

  document.addEventListener("filtersReset", collapseAllSections);
  document.addEventListener("uiActionTriggered", collapseAllSections);
}