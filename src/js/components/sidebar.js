// =================================================================
//          COMPONENTE: Sidebar (Filtros + Gestos Táctiles Optimizado)
// =================================================================
// FICHERO: src/js/components/sidebar.js
// =================================================================

import noUiSlider from 'nouislider';
import 'nouislider/dist/nouislider.css'; 
import { CONFIG } from "../constants.js";
import { debounce, triggerPopAnimation, createElement, triggerHapticFeedback, highlightAccentInsensitive } from "../utils.js";
import {
  fetchDirectorSuggestions, fetchActorSuggestions, fetchCountrySuggestions, fetchGenreSuggestions,
} from "../api.js";
import { unflipAllCards } from "./card.js";
import { closeModal } from "./modal.js";
import { getActiveFilters, setFilter, toggleExcludedFilter, getActiveFilterCount } from "../state.js";
import { ICONS, CSS_CLASSES, SELECTORS, FILTER_CONFIG, STUDIO_DATA } from "../constants.js";
import { showToast, clearAllSidebarAutocomplete } from "../ui.js"; 
import { loadAndRenderMovies } from "../main.js";
import spriteUrl from "../../sprite.svg";

// --- Constantes Locales ---
const MOBILE_BREAKPOINT = 768;
const SWIPE_VELOCITY_THRESHOLD = 0.4;
let DRAWER_WIDTH = 280;

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
  // ✨ OPTIMIZACIÓN 3.B: Referencia al contenido principal para bloquearlo
  mainContent: document.querySelector(".main-content-wrapper"), 
};

// =================================================================
//          1. LÓGICA DE GESTOS TÁCTILES (GPU Accelerated)
// =================================================================

let touchState = {
  isDragging: false,
  isHorizontalDrag: false,
  startX: 0,
  startY: 0,
  startTime: 0,
  currentTranslate: 0,
  startTranslate: 0,
  isInteractive: false // Nuevo: Para detección de intención
};

export const openMobileDrawer = () => {
  document.body.classList.add("sidebar-is-open");
  // Usamos clases CSS para la transición suave, no inline styles
  dom.sidebar.style.transform = ''; 
  touchState.currentTranslate = 0;
  updateRewindButtonIcon(true);
};

export const closeMobileDrawer = () => {
  document.body.classList.remove("sidebar-is-open");
  dom.sidebar.style.transform = ''; 
  touchState.currentTranslate = -DRAWER_WIDTH;
  updateRewindButtonIcon(false);
};

function updateDrawerWidth() {
  if (dom.sidebar) {
    const width = dom.sidebar.offsetWidth;
    if (width > 0) DRAWER_WIDTH = width;
  }
}

function handleTouchStart(e) {
  if (window.innerWidth > MOBILE_BREAKPOINT) return;
  updateDrawerWidth(); 
  
  // 🛡️ FIX: Si la modal está abierta, el sidebar NO debe responder a gestos.
  if (document.body.classList.contains("modal-open")) return;
  
  const isOpen = document.body.classList.contains("sidebar-is-open");
  // Zona de activación: Borde izquierdo (150px) o cualquier parte si ya está abierto
  const canStartDrag = (isOpen && e.target.closest("#sidebar")) || (!isOpen && e.touches[0].clientX < 150);

  if (!canStartDrag) {
    touchState.isDragging = false;
    return;
  }

  touchState.isDragging = true;
  touchState.isHorizontalDrag = false;
  touchState.startX = e.touches[0].clientX;
  touchState.startY = e.touches[0].clientY;
  touchState.startTime = Date.now();
  // Si está abierto empieza en 0, si no en -280
  touchState.startTranslate = isOpen ? 0 : -DRAWER_WIDTH;

  // INTENT DETECTION: Comprobamos si el gesto empieza sobre un elemento interactivo.
  // Solo relevante si el sidebar está cerrado (swipe desde borde) para no bloquear cards.
  touchState.isInteractive = !isOpen && !!e.target.closest('button, a, input, select, textarea, .movie-card, .noUi-handle');

  // Optimización: Añadimos el listener costoso (no pasivo) SOLO cuando empieza un posible drag
  document.addEventListener("touchmove", handleTouchMove, { passive: false });
}

function handleTouchMove(e) {
  if (!touchState.isDragging) return;

  const currentX = e.touches[0].clientX;
  const currentY = e.touches[0].clientY;
  const diffX = currentX - touchState.startX;
  const diffY = currentY - touchState.startY;

  // Detección de intención (Scroll Vertical vs Swipe Horizontal)
  if (!touchState.isHorizontalDrag) {
    // LÓGICA DE UMBRALES DINÁMICOS
    // Si estamos sobre una card/botón, exigimos un movimiento más claro (15px) para "robar" el gesto.
    // Si estamos en fondo neutro, respondemos rápido (5px).
    const threshold = touchState.isInteractive ? 15 : 5;
    
    // Si el movimiento es menor al umbral, no hacemos nada (esperamos intención)
    if (Math.abs(diffX) < threshold && Math.abs(diffY) < threshold) return;

    // Si se mueve más en Y que en X, asumimos que es scroll y cancelamos el swipe
    if (Math.abs(diffY) > Math.abs(diffX)) {
      touchState.isDragging = false;
      document.removeEventListener("touchmove", handleTouchMove); // Dejar de escuchar
      return;
    }
    
    // ¡INTENCIÓN CONFIRMADA! Es un swipe horizontal.
    touchState.isHorizontalDrag = true;
    
    // Reseteamos el origen (startX) al punto actual para evitar un "salto" visual
    // y asegurar que el arrastre empiece suavemente desde aquí.
    touchState.startX = currentX;
    touchState.startY = currentY;
    touchState.startTime = Date.now();

    // AHORA SÍ: Bloqueamos la UI y activamos GPU
    dom.sidebar.classList.add("is-dragging");
    document.body.classList.add("sidebar-is-dragging");
  }

  // Prevenir scroll nativo del navegador (pull-to-refresh, etc.)
  if (e.cancelable) e.preventDefault();

  // Usamos (currentX - touchState.startX) porque startX se reseteó al confirmar el gesto
  let newTranslate = touchState.startTranslate + (currentX - touchState.startX);

  // Física de límites (Rubber Banding)
  if (newTranslate > 0) {
    // Resistencia al tirar más allá de la apertura (derecha)
    newTranslate *= 0.2; 
  } else if (newTranslate < -DRAWER_WIDTH) {
    // Resistencia al tirar más allá del cierre (izquierda)
    const overflow = Math.abs(newTranslate + DRAWER_WIDTH);
    newTranslate = -DRAWER_WIDTH - (overflow * 0.2); 
  }

  touchState.currentTranslate = newTranslate;
  // Aplicación directa sin requestAnimationFrame para respuesta 1:1 inmediata
  // (La clase .is-dragging asegura que no haya lag de transition)
  dom.sidebar.style.transform = `translateX(${touchState.currentTranslate}px)`;
}

function handleTouchEnd(e) {
  if (!touchState.isDragging) return;

  // Limpieza: Quitamos el listener para devolver el control del scroll al navegador
  document.removeEventListener("touchmove", handleTouchMove);
  
  touchState.isDragging = false;
  touchState.isHorizontalDrag = false;

  // ✨ LIMPIEZA 3.B: Restaurar estado normal
  dom.sidebar.classList.remove("is-dragging");
  document.body.classList.remove("sidebar-is-dragging");

  const duration = Date.now() - touchState.startTime;
  const finalX = e.changedTouches[0].clientX;
  const distance = finalX - touchState.startX;
  const velocity = duration > 0 ? distance / duration : 0;

  // Lógica de decisión mejorada: Flick o Posición (50%)
  let shouldOpen;
  if (velocity > SWIPE_VELOCITY_THRESHOLD) {
    shouldOpen = true; // Flick rápido derecha -> Abrir
  } else if (velocity < -SWIPE_VELOCITY_THRESHOLD) {
    shouldOpen = false; // Flick rápido izquierda -> Cerrar
  } else {
    shouldOpen = touchState.currentTranslate > -DRAWER_WIDTH * 0.5; // Lento -> Decidir por mitad
  }

  if (shouldOpen) {
    openMobileDrawer();
  } else {
    closeMobileDrawer();
  }
}

function updateRewindButtonIcon(isOpen) {
  if (!dom.rewindButton) return;
  dom.rewindButton.innerHTML = isOpen ? ICONS.REWIND : ICONS.FORWARD;
  dom.rewindButton.setAttribute("aria-label", isOpen ? "Contraer sidebar" : "Expandir sidebar");
  dom.rewindButton.setAttribute("aria-expanded", isOpen);

  // Also update the mobile toggle in the header
  const mobileToggle = document.getElementById('mobile-sidebar-toggle');
  if (mobileToggle) {
    mobileToggle.setAttribute('aria-expanded', String(isOpen));
    mobileToggle.setAttribute('aria-label', isOpen ? 'Cerrar menú de filtros' : 'Abrir menú de filtros');
  }
}

function initTouchGestures() {
  if (!dom.sidebar) return;
  
  updateDrawerWidth();
  
  // Passive true para start/end mejora rendimiento de scroll
  // Passive false para move es necesario para e.preventDefault()
  document.addEventListener("touchstart", handleTouchStart, { passive: true });
  // Eliminado listener global de touchmove para mejorar rendimiento de scroll general
  document.addEventListener("touchend", handleTouchEnd, { passive: true });

  window.addEventListener("resize", () => {
    if (window.innerWidth <= MOBILE_BREAKPOINT) updateDrawerWidth();
    
    // Reset en cambio de orientación/tamaño
    if (window.innerWidth > MOBILE_BREAKPOINT) {
      document.body.classList.remove("sidebar-is-open");
      dom.sidebar.style.transform = "";
      touchState.currentTranslate = -DRAWER_WIDTH;
    }
  });
}

// =================================================================
//          LOGICA DE ROTACIÓN Y GESTOS (Pinch-to-Zoom)
// =================================================================

function toggleRotationMode(forceState = null) {
  const button = dom.toggleRotationBtn;
  if (!button) return;

  const isCurrentlyDisabled = document.body.classList.contains("rotation-disabled");
  // Si forceState es null, alternamos. Si no, usamos el estado forzado.
  const shouldDisable = forceState !== null ? forceState : !isCurrentlyDisabled;

  // Si ya estamos en el estado deseado, no hacemos nada
  if (isCurrentlyDisabled === shouldDisable) return;

  triggerHapticFeedback('medium');
  unflipAllCards();
  closeModal();

  const updateState = () => {
    document.body.classList.toggle("rotation-disabled", shouldDisable);
    
    button.innerHTML = shouldDisable ? ICONS.SQUARE_STOP : ICONS.PAUSE;
    button.setAttribute("aria-label", shouldDisable ? "Activar rotación de tarjetas" : "Pausar rotación de tarjetas");
    button.title = shouldDisable ? "Giro automático" : "Vista Rápida";
    button.setAttribute("aria-pressed", shouldDisable);
    localStorage.setItem("rotationState", shouldDisable ? "disabled" : "enabled");
  };

  if (document.startViewTransition) {
    document.startViewTransition(() => updateState());
  } else {
    updateState();
  }

  triggerPopAnimation(button);
}

function initPinchGestures() {
  const target = document.querySelector('.main-content-wrapper');
  if (!target) return;

  // 🛡️ INTERCEPTOR GLOBAL DE CLICS (Fase de Captura)
  // Esto es crucial: detiene el evento 'click' en la raíz (window) antes de que
  // baje a los elementos del DOM. Es la única forma segura de evitar que
  // el navegador interprete el final del gesto como un clic en una tarjeta.
  window.addEventListener('click', (e) => {
    if (document.body.dataset.gestureCooldown === "true") {
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
    }
  }, { capture: true });

  let initialDistance = null;
  let isPinching = false;
  let hasTriggered = false;
  let cooldownTimer = null;

  const activateCooldown = () => {
    document.body.dataset.gestureCooldown = "true";
    if (cooldownTimer) clearTimeout(cooldownTimer);
    // Aumentamos a 800ms para cubrir dispositivos más lentos o transiciones largas
    cooldownTimer = setTimeout(() => {
      delete document.body.dataset.gestureCooldown;
      cooldownTimer = null;
    }, 800); 
  };

  target.addEventListener('touchstart', (e) => {
    if (e.touches.length === 2) {
      isPinching = true;
      hasTriggered = false;
      initialDistance = Math.hypot(
        e.touches[0].pageX - e.touches[1].pageX,
        e.touches[0].pageY - e.touches[1].pageY
      );
    }
  }, { passive: true });

  target.addEventListener('touchmove', (e) => {
    if (!isPinching || e.touches.length !== 2 || initialDistance === null) return;

    // Si ya se disparó la acción, solo mantenemos el cooldown vivo y salimos
    if (hasTriggered) {
      activateCooldown();
      return;
    }

    const currentDistance = Math.hypot(
      e.touches[0].pageX - e.touches[1].pageX,
      e.touches[0].pageY - e.touches[1].pageY
    );

    const diff = currentDistance - initialDistance;
    const THRESHOLD = 60; // Sensibilidad en píxeles

    if (Math.abs(diff) > THRESHOLD) {
      // Solo reaccionamos a "Pellizcar hacia adentro" (juntar dedos)
      if (diff < 0) {
         toggleRotationMode(); // Actúa como interruptor (toggle)
         activateCooldown();
         hasTriggered = true;
      } 
    }
  }, { passive: true });

  target.addEventListener('touchend', (e) => {
    // Al soltar, si hubo gesto, renovamos el cooldown una última vez para matar el click
    if (hasTriggered) {
      activateCooldown();
    }

    if (e.touches.length < 2) {
      isPinching = false;
      initialDistance = null;
    }
    
    if (e.touches.length === 0) {
      hasTriggered = false;
    }
  });
}

// =================================================================
//          2. RESTO DE FUNCIONES (Sin cambios lógicos mayores)
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
    input.setAttribute("aria-expanded", "false"); // FIX: Estado explícito
    input.removeAttribute("aria-activedescendant"); // FIX: Limpieza
    input.removeAttribute("aria-controls"); // FIX: Limpieza
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

async function handleFilterChangeOptimistic(type, value, forceSet = false) {
  const previousFilters = getActiveFilters();
  if (value) {
    if (type === 'selection' && previousFilters.studio) setFilter('studio', null); 
    else if (type === 'studio' && previousFilters.selection) setFilter('selection', null);
  }
  
  // FIX: Si forceSet es true (slider), aplicamos el valor aunque sea igual al actual.
  const isActivating = forceSet || previousFilters[type] !== value;
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
    console.error("Fallo al aplicar filtro:", error); // Añadimos log para depuración
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
  if (window.innerWidth <= MOBILE_BREAKPOINT) closeMobileDrawer();
}

export function collapseAllSections() {
  dom.collapsibleSections.forEach((section) => {
    section.classList.remove(CSS_CLASSES.ACTIVE);
    section.querySelector('.section-header')?.setAttribute('aria-expanded', 'false');
  });
  if (dom.sidebarInnerWrapper) dom.sidebarInnerWrapper.classList.remove("is-compact");
}

function initYearSlider() {
  if (!dom.yearSlider || !dom.yearStartInput || !dom.yearEndInput) return;
  const yearInputs = [dom.yearStartInput, dom.yearEndInput];
  const sliderInstance = noUiSlider.create(dom.yearSlider, {
    start: [CONFIG.YEAR_MIN, CONFIG.YEAR_MAX],
    connect: true, step: 1, range: { min: CONFIG.YEAR_MIN, max: CONFIG.YEAR_MAX },
    format: { to: (value) => Math.round(value), from: (value) => Number(value) },
  });
  sliderInstance.on("update", (values, handle) => { yearInputs[handle].value = values[handle]; });

  const updateSliderFilter = (values, handle) => {
    let [start, end] = values.map(Number);

    // BUG FIX: If the user creates an invalid range (start > end) by dragging
    // one handle past the other, we correct it to a single-year selection.
    if (start > end) {
      if (handle === 0) { // Left handle (start) was moved
        end = start;
      } else { // Right handle (end) was moved
        start = end;
      }
    }

    const yearFilter = `${start}-${end}`;
    // FIX: Usar forceSet=true para evitar que el filtro se desactive si el valor es el mismo (toggle)
    handleFilterChangeOptimistic("year", yearFilter, true);
    if (window.innerWidth <= MOBILE_BREAKPOINT) closeMobileDrawer();
  };

  const debouncedUpdate = debounce(updateSliderFilter, 500);
  sliderInstance.on("set", debouncedUpdate);
  yearInputs.forEach((input, index) => {
    input.addEventListener("change", (e) => {
      const newValue = parseFloat(e.target.value);
      const currentValues = sliderInstance.get().map(v => parseFloat(v));

      // Lógica para mantener rango de un solo año al empujar los límites
      if (currentValues[0] === currentValues[1]) {
        // Si subimos el inicio (min), subimos también el fin (max)
        if (index === 0 && newValue > currentValues[0]) {
          sliderInstance.set([newValue, newValue]);
          return;
        }
        // Si bajamos el fin (max), bajamos también el inicio (min)
        if (index === 1 && newValue < currentValues[1]) {
          sliderInstance.set([newValue, newValue]);
          return;
        }
      }

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
        if (window.innerWidth <= MOBILE_BREAKPOINT) closeMobileDrawer();
      }
    });
  });
}

function handlePillClick(e) {
  const pill = e.target.closest(".filter-pill");
  if (!pill) return false;
  
  triggerHapticFeedback('medium');
  const { filterType, filterValue } = pill.dataset;
  pill.classList.add("is-removing");
  
  pill.addEventListener("animationend", () => {
    if (pill.classList.contains("filter-pill--exclude")) handleToggleExcludedFilterOptimistic(filterType, filterValue);
    else handleFilterChangeOptimistic(filterType, null);
  }, { once: true });
  
  return true;
}

function setupEventListeners() {
  document.querySelectorAll(".collapsible-section .section-header").forEach((header) => {
    const iconWrapper = document.createElement('div');
    iconWrapper.innerHTML = ICONS.CHEVRON_RIGHT;
    if (iconWrapper.firstChild) header.appendChild(iconWrapper.firstChild);
  });

  // Listener para píldoras superiores (Static Filters) que no estaban cubiertas
  const staticFilters = document.querySelector(".sidebar-static-filters");
  if (staticFilters) {
    staticFilters.addEventListener("click", (e) => {
      if (handlePillClick(e)) {
        if (window.innerWidth <= MOBILE_BREAKPOINT) closeMobileDrawer();
      }
    });
  }

  if (dom.rewindButton) {
    dom.rewindButton.addEventListener("click", (e) => {
      triggerHapticFeedback('light');
      const isMobile = window.innerWidth <= MOBILE_BREAKPOINT;
      
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

  if (dom.sidebarOverlay) {
    dom.sidebarOverlay.addEventListener("click", closeMobileDrawer);
  }

  if (dom.toggleRotationBtn) {
    dom.toggleRotationBtn.addEventListener("click", (e) => {
      toggleRotationMode();
      if (window.innerWidth <= MOBILE_BREAKPOINT) closeMobileDrawer();
    });
  }

  if (dom.sidebarScrollable) {
    dom.sidebarScrollable.addEventListener("click", (e) => {
      const excludeBtn = e.target.closest(".exclude-filter-btn");
      if (excludeBtn) {
        e.stopPropagation();
        triggerHapticFeedback('medium');
        triggerPopAnimation(excludeBtn);
        handleToggleExcludedFilterOptimistic(excludeBtn.dataset.type, excludeBtn.dataset.value);
        if (window.innerWidth <= MOBILE_BREAKPOINT) closeMobileDrawer();
        return;
      }
      
      if (handlePillClick(e)) {
        if (window.innerWidth <= MOBILE_BREAKPOINT) closeMobileDrawer();
        return;
      }

      const link = e.target.closest(".filter-link");
      if (link && !link.hasAttribute("disabled")) {
        triggerHapticFeedback('light');
        triggerPopAnimation(link);
        handleFilterChangeOptimistic(link.dataset.filterType, link.dataset.filterValue);
        if (window.innerWidth <= MOBILE_BREAKPOINT) closeMobileDrawer();
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

      if (isNowActive) {
        setTimeout(() => {
          if (clickedSection.classList.contains(CSS_CLASSES.ACTIVE)) {
            clickedSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
          }
        }, 300);
      }
    });
  });
}

// =================================================================
//          INICIALIZACIÓN PRINCIPAL
// =================================================================

export function initSidebar() {
  if (window.innerWidth <= MOBILE_BREAKPOINT) {
    updateRewindButtonIcon(false);
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
      
      if (filterType === 'studio' && STUDIO_DATA[value]) {
        const p = STUDIO_DATA[value];
        link.classList.add("filter-link--studio");
        link.title = text; 
        link.innerHTML = `
          <svg width="${p.w || 24}" height="${p.h || 24}" viewBox="${p.vb || '0 0 24 24'}" class="sidebar-platform-icon ${p.class || ''}" fill="currentColor">
            <use href="${spriteUrl}#${p.id}"></use>
          </svg>
          <span class="sr-only">${text}</span>
        `;
      } else {
        const textWrapper = createElement("span", { textContent: text });
        link.appendChild(textWrapper);
      }

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
  
  // Restaurar estado de rotación (Modal Mode) desde localStorage
  try {
    if (localStorage.getItem("rotationState") === "disabled") {
      document.body.classList.add("rotation-disabled");
    }
  } catch (e) {}

  if (dom.toggleRotationBtn) {
    const isRotationDisabled = document.body.classList.contains("rotation-disabled");
    dom.toggleRotationBtn.innerHTML = isRotationDisabled ? ICONS.SQUARE_STOP : ICONS.PAUSE;
    dom.toggleRotationBtn.setAttribute("aria-label", isRotationDisabled ? "Activar rotación de tarjetas" : "Pausar rotación de tarjetas");
    dom.toggleRotationBtn.title = isRotationDisabled ? "Giro automático" : "Vista Rápida";
    dom.toggleRotationBtn.setAttribute("aria-pressed", isRotationDisabled);
  }

  initYearSlider();
  initTouchGestures();
  setupEventListeners();
  initPinchGestures();
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
    
    // FIX: Usar requestAnimationFrame para asegurar que el DOM está estable antes de ocultar enlaces.
    // Esto soluciona el problema de duplicidad visual en Chrome al recargar con filtros activos.
    requestAnimationFrame(() => {
      renderFilterPills();
    });
  });
  
  document.addEventListener("filtersReset", collapseAllSections);
  document.addEventListener("uiActionTriggered", collapseAllSections);
}