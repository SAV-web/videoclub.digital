// =================================================================
//          COMPONENTE: Sidebar (Filtros + Gestos Táctiles)
// =================================================================
// FICHERO: src/js/components/sidebar.js
// RESPONSABILIDAD:
// - Gestión de la barra lateral y sus estados (abierto/cerrado).
// - Lógica de filtros (renderizado, selección, exclusión).
// - Gestos táctiles (Swipe) para móvil.
// - Integración con Slider de años y Autocompletado.
// =================================================================

import noUiSlider from 'nouislider';
import 'nouislider/dist/nouislider.css'; 
import { CONFIG } from "../constants.js";
import { debounce, triggerPopAnimation, createElement, triggerHapticFeedback, highlightAccentInsensitive, LocalStore } from "../utils.js";
import {
  fetchDirectorSuggestions, fetchActorSuggestions, fetchCountrySuggestions, fetchGenreSuggestions,
  fetchRandomTopActors, fetchRandomTopDirectors
} from "../api.js";
import { unflipAllCards } from "./card.js";
import { closeModal } from "./modal.js";
import { getActiveFilters, setFilter, toggleExcludedFilter, getActiveFilterCount, resetFiltersState, setSort, setMediaType, getCurrentPage } from "../state.js";
import { ICONS, CSS_CLASSES, SELECTORS, FILTER_CONFIG, STUDIO_DATA, SELECTION_DATA } from "../constants.js";
import { showToast, clearAllSidebarAutocomplete } from "../ui.js"; 
import { loadAndRenderMovies } from "../main.js";
import spriteUrl from "../../sprite.svg";

// --- Constantes Locales ---
const MOBILE_BREAKPOINT = 768;
const SWIPE_VELOCITY_THRESHOLD = 0.4;
let DRAWER_WIDTH = 280;

// Estado de interacción con el filtro de años (para cierre inteligente en móvil)
let yearInteractionState = { start: false, end: false };

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
  mobileSidebarToggle: document.getElementById("mobile-sidebar-toggle"),
  mainContent: document.querySelector(".main-content-wrapper"), 
  myListButton: document.getElementById("my-list-button"),
};

// Caché para contenedores de secciones (evita querySelector repetido en renderFilterPills)
const sectionContainers = {};

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
  isInteractive: false 
};

function applyPendingYearFilters() {
  if (!dom.yearStartInput || !dom.yearEndInput) return;
  
  const currentStart = parseInt(dom.yearStartInput.value, 10);
  const currentEnd = parseInt(dom.yearEndInput.value, 10);
  
  if (isNaN(currentStart) || isNaN(currentEnd)) return;

  const activeFilters = getActiveFilters();
  let globalStart = CONFIG.YEAR_MIN;
  let globalEnd = CONFIG.YEAR_MAX;
  
  if (activeFilters.year) {
      const parts = activeFilters.year.split('-');
      if (parts.length === 2) {
          globalStart = parseInt(parts[0], 10);
          globalEnd = parseInt(parts[1], 10);
      }
  }
  
  if (currentStart !== globalStart || currentEnd !== globalEnd) {
      const yearFilter = `${currentStart}-${currentEnd}`;
      handleFilterChangeOptimistic("year", yearFilter, true);
  }
}

// Fuente única de verdad para el estado del sidebar
function setSidebarState(isOpen) {
  // 1. Clases y Estilos (Solo en móvil gestionamos la clase de drawer para evitar overlay en desktop)
  if (window.innerWidth <= MOBILE_BREAKPOINT) {
    document.body.classList.toggle(CSS_CLASSES.SIDEBAR_OPEN, isOpen);
    dom.sidebar.style.transform = ''; // Limpiar transform inline para que CSS mande (o resetear drag)
    touchState.currentTranslate = isOpen ? 0 : -DRAWER_WIDTH;
    
    // Resetear estado de interacción de años al abrir
    if (isOpen) {
      yearInteractionState = { start: false, end: false };
    } else {
      // AL CERRAR: Aplicar filtros de año pendientes si han cambiado
      applyPendingYearFilters();
    }
  }

  // 2. Iconos y ARIA (Sincronización)
  if (dom.rewindButton) {
    dom.rewindButton.innerHTML = isOpen ? ICONS.REWIND : ICONS.FORWARD;
    const label = isOpen ? "Cerrar sidebar" : "Abrir sidebar";
    dom.rewindButton.setAttribute("aria-label", label);
    dom.rewindButton.title = label;
    dom.rewindButton.setAttribute("aria-expanded", isOpen);
  }
  if (dom.mobileSidebarToggle) {
    dom.mobileSidebarToggle.setAttribute('aria-expanded', String(isOpen));
    dom.mobileSidebarToggle.setAttribute('aria-label', isOpen ? 'Cerrar menú de filtros' : 'Abrir menú de filtros');
  }
}

export const openMobileDrawer = () => setSidebarState(true);
export const closeMobileDrawer = () => setSidebarState(false);
const tryCloseMobileDrawer = () => {
  if (window.innerWidth <= MOBILE_BREAKPOINT) closeMobileDrawer();
};

function updateDrawerWidth() {
  if (dom.sidebar) {
    const width = dom.sidebar.offsetWidth;
    if (width > 0) DRAWER_WIDTH = width;
  }
}

function handleTouchStart(e) {
  if (window.innerWidth > MOBILE_BREAKPOINT) return;
  if (document.body.classList.contains(CSS_CLASSES.MODAL_OPEN)) return;
  
  const isOpen = document.body.classList.contains(CSS_CLASSES.SIDEBAR_OPEN);
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
  touchState.startTranslate = isOpen ? 0 : -DRAWER_WIDTH;
  
  // Detección de elementos interactivos para no robarles el clic
  // MEJORA: Si es un swipe desde el borde real (< 30px), asumimos intención clara de abrir y bajamos el umbral.
  // Si es más adentro, respetamos las tarjetas para no cancelar sus clics accidentalmente.
  const isEdgeSwipe = !isOpen && touchState.startX < 30;
  // FIX: Permitir detección de interactividad también cuando está abierto para proteger el scroll vertical
  touchState.isInteractive = !isEdgeSwipe && !!e.target.closest('button, a, input, select, textarea, .movie-card, .noUi-handle, .sidebar-inner-wrapper');

  // Passive false para poder cancelar el scroll nativo si es necesario
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
    // Umbral dinámico: más alto si estamos sobre un elemento interactivo
    const threshold = touchState.isInteractive ? 15 : 10; // Aumentado base a 10px para evitar falsos positivos
    
    // Si no superamos el umbral, esperamos
    if (Math.abs(diffX) < threshold && Math.abs(diffY) < threshold) return;

    // Si es scroll vertical, cancelamos el swipe del sidebar
    if (Math.abs(diffY) > Math.abs(diffX)) {
      touchState.isDragging = false;
      document.removeEventListener("touchmove", handleTouchMove);
      return;
    }
    
    // Confirmado: Es swipe horizontal
    touchState.isHorizontalDrag = true;
    touchState.startX = currentX; // Resetear origen para evitar salto visual
    touchState.startY = currentY;
    touchState.startTime = Date.now();

    dom.sidebar.classList.add(CSS_CLASSES.IS_DRAGGING); // Quitar transición CSS
    document.body.classList.add(CSS_CLASSES.SIDEBAR_DRAGGING_BODY); // Bloquear scroll body
  }

  if (e.cancelable) e.preventDefault(); // Evitar navegación nativa

  let newTranslate = touchState.startTranslate + (currentX - touchState.startX);

  // Física de límites (Rubber Banding)
  if (newTranslate > 0) {
    newTranslate *= 0.2; 
  } else if (newTranslate < -DRAWER_WIDTH) {
    const overflow = Math.abs(newTranslate + DRAWER_WIDTH);
    newTranslate = -DRAWER_WIDTH - (overflow * 0.2); 
  }

  touchState.currentTranslate = newTranslate;
  dom.sidebar.style.transform = `translateX(${touchState.currentTranslate}px)`;
}

function handleTouchEnd(e) {
  if (!touchState.isDragging) return;
  document.removeEventListener("touchmove", handleTouchMove);
  
  if (!touchState.isHorizontalDrag) {
    touchState.isDragging = false;
    return;
  }
  
  touchState.isDragging = false;
  touchState.isHorizontalDrag = false;

  dom.sidebar.classList.remove(CSS_CLASSES.IS_DRAGGING);
  document.body.classList.remove(CSS_CLASSES.SIDEBAR_DRAGGING_BODY);

  const duration = Date.now() - touchState.startTime;
  const finalX = e.changedTouches[0].clientX;
  const distance = finalX - touchState.startX;
  const velocity = duration > 0 ? distance / duration : 0;

  // Lógica de decisión: Flick rápido o posición
  let shouldOpen;
  if (velocity > SWIPE_VELOCITY_THRESHOLD) {
    shouldOpen = true; // Flick derecha -> Abrir
  } else if (velocity < -SWIPE_VELOCITY_THRESHOLD) {
    shouldOpen = false; // Flick izquierda -> Cerrar
  } else {
    shouldOpen = touchState.currentTranslate > -DRAWER_WIDTH * 0.5; // Posición > 50%
  }

  if (shouldOpen) openMobileDrawer();
  else closeMobileDrawer();
}

function initTouchGestures() {
  if (!dom.sidebar) return;
  updateDrawerWidth();
  document.addEventListener("touchstart", handleTouchStart, { passive: true });
  document.addEventListener("touchend", handleTouchEnd, { passive: true });
  document.addEventListener("touchcancel", handleTouchEnd, { passive: true });

  window.addEventListener("resize", () => {
    if (window.innerWidth <= MOBILE_BREAKPOINT) updateDrawerWidth();
    if (window.innerWidth > MOBILE_BREAKPOINT) {
      document.body.classList.remove(CSS_CLASSES.SIDEBAR_OPEN);
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

  const isCurrentlyDisabled = document.body.classList.contains(CSS_CLASSES.ROTATION_DISABLED);
  const shouldDisable = forceState !== null ? forceState : !isCurrentlyDisabled;

  if (isCurrentlyDisabled === shouldDisable) return;

  triggerHapticFeedback('medium');
  unflipAllCards();
  closeModal();

  const updateState = () => {
    // Calcular nueva página para mantener la posición aproximada del usuario
    const currentPage = getCurrentPage();
    // Si activamos modo muro (shouldDisable=true), venimos de normal (42). Si no, venimos de muro (60).
    const oldPageSize = shouldDisable ? CONFIG.ITEMS_PER_PAGE : CONFIG.WALL_MODE_ITEMS_PER_PAGE;
    const newPageSize = shouldDisable ? CONFIG.WALL_MODE_ITEMS_PER_PAGE : CONFIG.ITEMS_PER_PAGE;
    
    const firstItemIndex = (currentPage - 1) * oldPageSize;
    const newPage = Math.floor(firstItemIndex / newPageSize) + 1;

    document.body.classList.toggle(CSS_CLASSES.ROTATION_DISABLED, shouldDisable);
    button.innerHTML = shouldDisable ? ICONS.SQUARE_STOP : ICONS.PAUSE;
    button.setAttribute("aria-label", shouldDisable ? "Activar rotación de tarjetas" : "Pausar rotación de tarjetas");
    button.title = shouldDisable ? "Giro automático" : "Vista Rápida";
    button.setAttribute("aria-pressed", shouldDisable);
    LocalStore.set("rotationState", shouldDisable ? "disabled" : "enabled");
    
    // Recargar grid con la nueva página calculada y skeletons forzados
    loadAndRenderMovies(newPage, { forceSkeleton: true });
  };

  if (document.startViewTransition) document.startViewTransition(() => updateState());
  else updateState();

  triggerPopAnimation(button);
}

// Estado del gesto de pellizco (Pinch)
let pinchInited = false;

function initPinchGestures() {
  if (pinchInited) return;
  const target = document.querySelector('.main-content-wrapper');
  if (!target) return;

  // FIX: Usar target (wrapper) en lugar de window para limitar el alcance del bloqueo
  target.addEventListener('click', (e) => {
    if ("gestureCooldown" in document.body.dataset) {
      if (e.target.closest('.movie-card, .grid-container')) {
        e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation();
      }
    }
  }, { capture: true });

  let initialDistance = null;
  let isPinching = false;
  let hasTriggered = false;
  let cooldownTimer = null;

  // Owner del cooldown global: Sidebar gestiona la creación del estado de bloqueo
  const activateCooldown = () => {
    document.body.dataset.gestureCooldown = "true";
    if (cooldownTimer) clearTimeout(cooldownTimer);
    cooldownTimer = setTimeout(() => {
      delete document.body.dataset.gestureCooldown;
      cooldownTimer = null;
    }, 800); 
  };

  target.addEventListener('touchstart', (e) => {
    if (e.touches.length === 2) {
      isPinching = true;
      hasTriggered = false;
      initialDistance = Math.hypot(e.touches[0].pageX - e.touches[1].pageX, e.touches[0].pageY - e.touches[1].pageY);
    }
  }, { passive: true });

  target.addEventListener('touchmove', (e) => {
    if (!isPinching || e.touches.length !== 2 || initialDistance === null) return;
    if (hasTriggered) { activateCooldown(); return; }

    const currentDistance = Math.hypot(e.touches[0].pageX - e.touches[1].pageX, e.touches[0].pageY - e.touches[1].pageY);
    const diff = currentDistance - initialDistance;

    if (Math.abs(diff) > 60) {
      // Solo "Pellizcar hacia adentro" (Zoom Out) -> Activar modo muro
      if (diff < 0) {
         toggleRotationMode(); // Toggle
         activateCooldown();
         hasTriggered = true;
      } 
    }
  }, { passive: true });

  target.addEventListener('touchend', (e) => {
    if (hasTriggered) activateCooldown();
    if (e.touches.length < 2) { isPinching = false; initialDistance = null; }
    if (e.touches.length === 0) hasTriggered = false;
  });

  pinchInited = true;
}

// =================================================================
//          2. GESTIÓN DE FILTROS Y UI
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
    input.setAttribute("aria-expanded", "false");
    input.removeAttribute("aria-activedescendant");
    input.removeAttribute("aria-controls");
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
      id: `suggestion-item-${formElement.dataset.filterType}-${index}`,
      attributes: { role: "option" },
    });
    item.appendChild(highlightAccentInsensitive(suggestion, searchTerm));
    fragment.appendChild(item);
  });

  resultsContainer.appendChild(fragment);
}

/**
 * Actualiza el estado visual (visible/deshabilitado) de TODOS los controles de filtro.
 * Optimización: Unifica dos bucles anteriores en uno solo.
 */
function updateAllFilterControls() {
  const activeFilters = getActiveFilters();
  const activeCount = getActiveFilterCount();
  const limitReached = activeCount >= CONFIG.MAX_ACTIVE_FILTERS;

  // 1. Actualizar enlaces de filtro (Links)
  // Simplificación: Consultar DOM directamente para evitar caché obsoleta tras renderizado dinámico
  document.querySelectorAll(".filter-link").forEach(link => {
    const type = link.dataset.filterType;
    const value = link.dataset.filterValue;
    
    // A. Visibilidad: Ocultar si ya está activo o excluido
    const isExcluded = (type === "genre" && activeFilters.excludedGenres?.includes(value)) || 
                       (type === "country" && activeFilters.excludedCountries?.includes(value));
    const isActive = activeFilters[type] === value;
    
    // MOD: Para estudios, no ocultamos, marcamos como activo. Para el resto, ocultamos si está activo.
    let shouldHide = isActive || isExcluded;
    if (type === 'studio') {
      shouldHide = false;
      link.classList.toggle('active', isActive);
    }
    
    // Optimización: Usar atributo hidden estándar (delegan layout al CSS)
    if (link.hidden !== shouldHide) link.hidden = shouldHide;

    // B. Disponibilidad: Deshabilitar si límite alcanzado (y no está oculto)
    if (!shouldHide) {
        const shouldDisable = limitReached;
        // Comprobación simple de atributo para evitar repintados
        if (link.hasAttribute("disabled") !== shouldDisable) {
            link.toggleAttribute("disabled", shouldDisable);
            link.setAttribute("aria-disabled", String(shouldDisable)); // Semántica explícita
            link.style.pointerEvents = shouldDisable ? "none" : "auto";
            link.style.opacity = shouldDisable ? "0.5" : "1";
        }
    }

    // C. Visibilidad de Botones de Exclusión
    const excludeBtn = link.querySelector(".exclude-filter-btn");
    if (excludeBtn) {
        // Solo mostrar botón excluir si NO hay un país activo (para evitar conflictos)
        const shouldHideExclude = (type === 'country' && activeFilters.country);
        if (excludeBtn.hidden !== !!shouldHideExclude) excludeBtn.hidden = !!shouldHideExclude;
    }
  });

  // 2. Actualizar Inputs de texto (Autocompletado)
  document.querySelectorAll(".sidebar-filter-input").forEach((input) => {
    if (input.disabled !== limitReached) {
        input.disabled = limitReached;
        input.placeholder = limitReached ? "Límite de filtros" : `Otro ${input.closest("form").dataset.filterType}...`;
    }
  });
}

// Estado local para reconciliación de DOM (evita reflows innecesarios)
let lastPillState = {};

function renderFilterPills() {
  const activeFilters = getActiveFilters();
  let pillIndex = 0;

  const createPill = (type, value, isExcluded = false, index = 0) => {
    const pill = createElement("div", { className: `filter-pill ${isExcluded ? "filter-pill--exclude" : ""}`, dataset: { filterType: type, filterValue: value } });
    pill.style.setProperty("--pill-index", index);
    const text = FILTER_CONFIG[type]?.items[value] || value;
    pill.appendChild(createElement("span", { textContent: text }));
    pill.appendChild(createElement("span", { className: "remove-filter-btn", innerHTML: isExcluded ? ICONS.PAUSE_SMALL : "×", attributes: { "aria-hidden": "true" } }));
    return pill;
  };

  const renderPillsForSection = (filterType) => {
    // Optimización: Usar caché de contenedores en lugar de buscar en el DOM
    const container = sectionContainers[filterType];
    if (!container) return;

    // Obtener valores de inclusión y exclusión
    const incValue = activeFilters[filterType];
    let excValues = [];
    if (filterType === 'genre') excValues = activeFilters.excludedGenres || [];
    else if (filterType === 'country') excValues = activeFilters.excludedCountries || [];

    // RECONCILIACIÓN SIMPLE: Comprobar si los datos han cambiado antes de tocar el DOM
    // Usamos una clave combinada para evitar que la exclusión borre a la inclusión
    const stateKey = `${filterType}-combined`;
    // Optimización: Concatenación simple en lugar de JSON.stringify para reducir GC
    const currentState = `${incValue || ""}|${excValues.join(",")}`;
    
    if (lastPillState[stateKey] === currentState) {
      // Solo incrementamos el índice para mantener la coherencia de animaciones
      if (incValue) pillIndex++;
      pillIndex += excValues.length;
      return;
    }

    lastPillState[stateKey] = currentState;
    container.textContent = "";
    
    // 1. Renderizar Inclusión (si existe)
    if (incValue) {
      container.appendChild(createPill(filterType, incValue, false, pillIndex++));
    }

    // 2. Renderizar Exclusiones (si existen)
    excValues.forEach((value) => {
      container.appendChild(createPill(filterType, value, true, pillIndex++));
    });
  };

  // Iterar sobre todas las secciones definidas en la configuración
  Object.keys(FILTER_CONFIG).forEach(type => renderPillsForSection(type));

  updateAllFilterControls();
}

async function handleMyListToggle() {
  const currentFilters = getActiveFilters();
  const isActivating = !currentFilters.myList;

  triggerHapticFeedback('medium');
  
  // Resetear filtros pero mantener sort y mediaType
  resetFiltersState();
  setSort(currentFilters.sort);
  setMediaType(currentFilters.mediaType);

  if (isActivating) {
    setFilter('myList', true);
    showToast("Mostrando tu lista (votos y pendientes)", "info");
  }

  document.dispatchEvent(new CustomEvent("updateSidebarUI"));
  document.dispatchEvent(new CustomEvent("uiActionTriggered"));
  await loadAndRenderMovies(1);
}

async function handleFilterChangeOptimistic(type, value, forceSet = false) {
  const previousFilters = getActiveFilters();
  
  // Lógica de Exclusividad: Si seleccionamos Actor o Director, limpiamos el resto
  // para enfocar la búsqueda en su filmografía, manteniendo solo las vistas.
  if (value && (type === 'actor' || type === 'director')) {
    const currentSort = previousFilters.sort;
    const currentMediaType = previousFilters.mediaType;
    
    resetFiltersState();
    setSort(currentSort);
    setMediaType(currentMediaType);
    setFilter(type, value, true); // Bypass limit por seguridad tras reset
    setFilter('myList', false); // Asegurar que myList está off
    
    // Actualizar UI (Slider de años, etc.) para reflejar el reinicio visualmente
    document.dispatchEvent(new CustomEvent("updateSidebarUI"));
    
    // FIX: Limpiar input de búsqueda principal visualmente para coincidir con el reset de estado
    const mainSearchInput = document.querySelector(SELECTORS.SEARCH_INPUT);
    if (mainSearchInput) mainSearchInput.value = "";

    renderFilterPills();
    document.dispatchEvent(new CustomEvent("uiActionTriggered"));
    
    try { await loadAndRenderMovies(1); } 
    catch (error) { if (error.name !== "AbortError") showToast("Error al cargar filmografía.", "error"); }
    
    return;
  }

  if (value) {
    if (type === 'selection' && previousFilters.studio) setFilter('studio', null); 
    else if (type === 'studio' && previousFilters.selection) setFilter('selection', null);
  }
  
  const isActivating = forceSet || previousFilters[type] !== value;
  const newValue = isActivating ? value : null;
  
  // Lógica de Exclusividad Inversa: Si activamos cualquier otro filtro, limpiamos Actor/Director
  if (newValue && type !== 'actor' && type !== 'director') {
    if (previousFilters.actor) setFilter('actor', null);
    if (previousFilters.director) setFilter('director', null);
  }
  
  // Si activamos un filtro normal, desactivamos myList
  if (newValue) setFilter('myList', false);

  // Lógica de País: Si seleccionamos un país, limpiamos las exclusiones de países
  if (newValue && type === 'country') {
    setFilter('excludedCountries', [], true);
  }

  if (!setFilter(type, newValue)) {
    showToast(`Límite de ${CONFIG.MAX_ACTIVE_FILTERS} filtros alcanzado.`, "error");
    // Restaurar estado si falló el setFilter (por límite)
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
    console.error("Fallo al aplicar filtro:", error);
    showToast(`No se pudo aplicar el filtro.`, "error");
    // Rollback completo
    setFilter('selection', previousFilters.selection);
    setFilter('studio', previousFilters.studio);
    setFilter('actor', previousFilters.actor);
    setFilter('director', previousFilters.director);
    setFilter('excludedCountries', previousFilters.excludedCountries, true);
    setFilter(type, previousFilters[type]);
    renderFilterPills();
  }
}

async function handleToggleExcludedFilterOptimistic(type, value) {
  const previousState = getActiveFilters();
  
  // Guard: No permitir exclusión de país si ya hay uno seleccionado
  if (type === 'country' && previousState.country) {
    return;
  }

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
    toggleExcludedFilter(type, value); // Revertir toggle
    setFilter("country", previousState.country); // Restaurar posibles efectos colaterales
    setFilter("genre", previousState.genre);
    renderFilterPills();
  }
}

function resetFilters() {
  if (dom.playButton) triggerPopAnimation(dom.playButton);
  triggerHapticFeedback('medium');
  document.dispatchEvent(new CustomEvent("filtersReset"));
  tryCloseMobileDrawer();
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
  
  // Escala logarítmica: Muchos años comprimidos a la izquierda, pocos expandidos a la derecha (recientes)
  // El 50% del slider se dedica a los últimos 20 años.
  const pivotYear = Math.max(CONFIG.YEAR_MIN + 1, CONFIG.YEAR_MAX - 20);

  const sliderInstance = noUiSlider.create(dom.yearSlider, {
    start: [CONFIG.YEAR_MIN, CONFIG.YEAR_MAX],
    connect: true, step: 1, 
    range: { 'min': CONFIG.YEAR_MIN, '50%': pivotYear, 'max': CONFIG.YEAR_MAX },
    format: { to: (value) => Math.round(value), from: (value) => Number(value) },
  });
  sliderInstance.on("update", (values, handle) => { yearInputs[handle].value = values[handle]; });

  const updateSliderFilter = (values, handle, autoClose = true) => {
    let [start, end] = values.map(Number);
    if (start > end) {
      if (handle === 0) end = start; else start = end;
    }
    const yearFilter = `${start}-${end}`;
    
    // Lógica condicional para móvil: Esperar a que el usuario elija ambos límites
    if (window.innerWidth <= MOBILE_BREAKPOINT) {
      // En móvil, diferimos la actualización. Solo cerramos si es slider (autoClose=true) y completo.
      if (autoClose && yearInteractionState.start && yearInteractionState.end) {
        closeMobileDrawer();
      }
    } else {
      // Escritorio: Actualización inmediata
      handleFilterChangeOptimistic("year", yearFilter, true);
    }
  };

  const debouncedUpdate = debounce(updateSliderFilter, 500);
  
  // Interceptar evento 'set' para rastrear qué manija se movió
  sliderInstance.on("set", (values, handle) => {
    const h = Number(handle);
    if (h === 0) yearInteractionState.start = true;
    if (h === 1) yearInteractionState.end = true;
    debouncedUpdate(values, handle, true); // Auto-close activado para el slider
  });
  
  yearInputs.forEach((input, index) => {
    input.addEventListener("change", (e) => {
      const newValue = parseFloat(e.target.value);
      const currentValues = sliderInstance.get().map(v => parseFloat(v));
      
      // Helper para actualizar filtro SIN cerrar el sidebar
      const triggerUpdate = (vals) => {
        if (index === 0) yearInteractionState.start = true;
        if (index === 1) yearInteractionState.end = true;
        debouncedUpdate(vals, index, false); // Auto-close desactivado para inputs
      };

      if (currentValues[0] === currentValues[1]) {
        // Usar 'false' para NO disparar evento 'set' del slider (evitar doble llamada)
        if (index === 0 && newValue > currentValues[0]) { sliderInstance.set([newValue, newValue], false); triggerUpdate([newValue, newValue]); return; }
        if (index === 1 && newValue < currentValues[1]) { sliderInstance.set([newValue, newValue], false); triggerUpdate([newValue, newValue]); return; }
      }
      const values = [null, null];
      values[index] = e.target.value;
      sliderInstance.set(values, false);
      triggerUpdate(sliderInstance.get());
    });
  });

  // FIX: Escuchar actualizaciones externas para cancelar debounce pendiente y actualizar UI
  document.addEventListener("updateSidebarUI", () => {
    debouncedUpdate.cancel(); // Cancelar cualquier actualización pendiente del usuario
    const currentFilters = getActiveFilters();
    const years = (currentFilters.year || `${CONFIG.YEAR_MIN}-${CONFIG.YEAR_MAX}`).split("-").map(Number);
    sliderInstance.set(years, false); // false = no disparar eventos 'set'
  });
}

function setupYearInputSteppers() {
  document.querySelectorAll(".year-input-wrapper").forEach((wrapper) => {
    const input = wrapper.querySelector(".year-input");
    const stepperUp = wrapper.querySelector(".stepper-btn.stepper-up");
    const stepperDown = wrapper.querySelector(".stepper-btn.stepper-down");
    if (!input || !stepperUp || !stepperDown) return;
    const updateYearValue = (increment) => {
      triggerHapticFeedback('medium'); // Feedback más notable en móvil
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

function sanitizeSearchTerm(term) {
  // Escapar % y _ para que ILIKE los trate como literales y no como comodines
  return term.replace(/%/g, '\\%').replace(/_/g, '\\_');
}

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
      const rawTerm = input.value.trim();
      // FIX: Limpiar TODO (incluido este formulario) si el término es corto
      if (rawTerm.length < 3) { clearAllSidebarAutocomplete(); return; }
      
      // Sanitizar para la API (evitar comodines indeseados), pero usar raw para el resaltado UI
      const apiTerm = sanitizeSearchTerm(rawTerm);
      const suggestions = await fetcher(apiTerm);
      renderSidebarAutocomplete(form, suggestions, rawTerm);
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
        tryCloseMobileDrawer();
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

  const staticFilters = document.querySelector(".sidebar-static-filters");
  if (staticFilters) {
    staticFilters.addEventListener("click", (e) => {
      if (handlePillClick(e)) {
        tryCloseMobileDrawer();
      }
    });
  }

  if (dom.rewindButton) {
    dom.rewindButton.addEventListener("click", (e) => {
      triggerHapticFeedback('light');
      const isMobile = window.innerWidth <= MOBILE_BREAKPOINT;
      if (isMobile) {
        const isOpen = document.body.classList.contains(CSS_CLASSES.SIDEBAR_OPEN);
        isOpen ? closeMobileDrawer() : openMobileDrawer();
      } else {
        document.body.classList.toggle(CSS_CLASSES.SIDEBAR_COLLAPSED);
        const isNowCollapsed = document.body.classList.contains(CSS_CLASSES.SIDEBAR_COLLAPSED);
        setSidebarState(!isNowCollapsed); // Reutilizamos la lógica de iconos
      }
    });
  }

  if (dom.sidebarOverlay) dom.sidebarOverlay.addEventListener("click", closeMobileDrawer);

  if (dom.toggleRotationBtn) {
    dom.toggleRotationBtn.addEventListener("click", (e) => {
      toggleRotationMode();
      tryCloseMobileDrawer();
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
        tryCloseMobileDrawer();
        return;
      }
      
      if (handlePillClick(e)) {
        tryCloseMobileDrawer();
        return;
      }

      const link = e.target.closest(".filter-link");
      if (link && !link.hasAttribute("disabled")) {
        triggerHapticFeedback('light');
        triggerPopAnimation(link);
        handleFilterChangeOptimistic(link.dataset.filterType, link.dataset.filterValue);
        tryCloseMobileDrawer();
      }
    });
  }
  
  if (dom.playButton) dom.playButton.addEventListener("click", resetFilters);

  if (dom.myListButton) {
    dom.myListButton.addEventListener("click", handleMyListToggle);
  }

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
            if (header) header.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' });
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
    setSidebarState(false); // Estado inicial cerrado en móvil
  } else if (window.innerWidth <= 1024) {
    // Tablet/Laptop pequeño: Colapsar por defecto para ganar espacio (ej: 4 columnas en iPad Air)
    document.body.classList.add(CSS_CLASSES.SIDEBAR_COLLAPSED);
    setSidebarState(false); // Sincronizar icono a "Abrir"
  }
  
  const populateFilterSection = (filterType) => {
    const config = FILTER_CONFIG[filterType];
    if (!config) return;
    const contentId = filterType === 'country' ? 'countries-content' : `${filterType}s-content`;
    const listContainer = document.querySelector(`#${contentId} > div:first-child`);
    if (!listContainer) return;
    
    // Cachear el contenedor de píldoras para esta sección
    const pillsContainer = listContainer.closest('.collapsible-section').querySelector('.active-filters-list');
    if (pillsContainer) sectionContainers[filterType] = pillsContainer;

    listContainer.textContent = "";
    const fragment = document.createDocumentFragment();
    Object.entries(config.items).forEach(([value, text]) => {
      const link = createElement("button", { type: "button", className: "filter-link", dataset: { filterType, filterValue: value } });
      
      // Detectar si hay configuración de icono (Estudio o Selección)
      const iconData = (filterType === 'studio' ? STUDIO_DATA[value] : null) || 
                       (filterType === 'selection' ? SELECTION_DATA?.[value] : null);

      if (iconData) {
        link.classList.add("filter-link--icon"); // Clase genérica para layout cuadrado
        link.title = text;
        
        if (iconData.img) {
          // Opción A: Imagen (PNG/JPG/WebP)
          const img = createElement("img", { 
            src: iconData.img, 
            className: `sidebar-platform-img ${iconData.invertDark ? 'invert-on-dark' : ''}`,
            alt: text 
          });
          link.appendChild(img);
        } else if (iconData.id) {
          // Opción B: SVG Sprite (Estudios existentes)
          const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
          svg.setAttribute("width", iconData.w || "24"); svg.setAttribute("height", iconData.h || "24");
          svg.setAttribute("viewBox", iconData.vb || "0 0 24 24"); svg.setAttribute("class", `sidebar-platform-icon ${iconData.class || ''}`);
          svg.setAttribute("fill", "currentColor");
          svg.innerHTML = `<use href="${spriteUrl}#${iconData.id}"></use>`;
          link.appendChild(svg);
        }

        link.appendChild(createElement("span", { className: "sr-only", textContent: text }));
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

  const updateDynamicFilters = async () => {
    try {
      const [actors, directors] = await Promise.all([
        fetchRandomTopActors(),
        fetchRandomTopDirectors()
      ]);

      if (actors && actors.length > 0) {
        FILTER_CONFIG.actor.items = actors.reduce((acc, name) => ({ ...acc, [name]: name }), {});
        populateFilterSection('actor');
      }

      if (directors && directors.length > 0) {
        FILTER_CONFIG.director.items = directors.reduce((acc, name) => ({ ...acc, [name]: name }), {});
        populateFilterSection('director');
      }
    } catch (e) { /* Fallback silencioso a estáticos */ }
  };

  if ("requestIdleCallback" in window) requestIdleCallback(updateDynamicFilters);
  else setTimeout(updateDynamicFilters, 500);
  
  if (dom.toggleRotationBtn) {
    const isRotationDisabled = document.body.classList.contains(CSS_CLASSES.ROTATION_DISABLED);
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
    // La actualización del slider se maneja ahora dentro de initYearSlider para gestionar el debounce
    
    requestAnimationFrame(() => {
      renderFilterPills();
    });
  });
  
  document.addEventListener("filtersReset", collapseAllSections);
  document.addEventListener("uiActionTriggered", collapseAllSections);

  // Sincronizar estado visual inicial (Pills) con el estado global (URL) tras carga diferida
  renderFilterPills();
}