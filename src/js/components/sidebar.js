// =================================================================
//                 LA CAJONERA (Menú Lateral y Filtros)
// =================================================================
// Controla el menú izquierdo, los filtros, las etiquetas (píldoras),
// y los gestos táctiles (deslizar para abrir, pellizcar para muro).
// =================================================================

import noUiSlider from 'nouislider';
import 'nouislider/dist/nouislider.css'; 
import { CONFIG } from "../constants.js";
import { debounce, triggerPopAnimation, createElement, triggerHapticFeedback, highlightAccentInsensitive, LocalStore, normalizeText, normalizeGenreText, executeViewTransition } from "../utils.js";
import {
  fetchDirectorSuggestions, fetchActorSuggestions, fetchCountrySuggestions, fetchGenreSuggestions,
  fetchRandomTopActors, fetchRandomTopDirectors
} from "../api.js";
import { unflipAllCards } from "./card.js";
import { closeModal } from "./modal.js";
import { getActiveFilters, setFilter, toggleExcludedFilter, getActiveFilterCount, resetFiltersState, setSort, setMediaType, getCurrentPage, setSearchTerm } from "../state.js";
import { ICONS, CSS_CLASSES, SELECTORS, FILTER_CONFIG, STUDIO_DATA, SELECTION_DATA, REGIONAL_GROUPS } from "../constants.js";
import { showToast, clearAllSidebarAutocomplete, lockGlobalInteractions, areInteractionsLocked } from "../ui.js"; 
import { loadAndRenderMovies } from "../main.js";
import spriteUrl from "../../sprite.svg";

// --- Constantes Locales ---
const MOBILE_BREAKPOINT = 768;
const MOBILE_HEIGHT_LIMIT = 500; 
const SWIPE_VELOCITY_THRESHOLD = 0.4;
let DRAWER_WIDTH = 300;

let yearInteractionState = { start: false, end: false };
let isInitialized = false;

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
  myListButton: document.getElementById("my-list-button"),
};

const sectionContainers = {};
const isMobileLayout = () => window.innerWidth <= MOBILE_BREAKPOINT || window.innerHeight <= MOBILE_HEIGHT_LIMIT;

// =================================================================
//          1. GESTOS TÁCTILES (El dedo manda)
// =================================================================

let touchState = {
  isDragging: false, isHorizontalDrag: false,
  startX: 0, startY: 0, startTime: 0,
  currentTranslate: 0, startTranslate: 0, isInteractive: false 
};

// Guarda el año si has tocado las casillas manuales
function applyPendingYearFilters() {
  if (!dom.yearStartInput || !dom.yearEndInput) return;
  
  const currentStart = parseInt(dom.yearStartInput.value, 10);
  const currentEnd = parseInt(dom.yearEndInput.value, 10);
  
  if (isNaN(currentStart) || isNaN(currentEnd)) return;

  const activeFilters = getActiveFilters();
  let [globalStart, globalEnd] = (activeFilters.year || `${CONFIG.YEAR_MIN}-${CONFIG.YEAR_MAX}`).split('-').map(Number);
  if (!globalEnd) globalEnd = globalStart;

  if (currentStart !== globalStart || currentEnd !== globalEnd) {
    handleFilterChangeOptimistic("year", currentStart === currentEnd ? `${currentStart}` : `${currentStart}-${currentEnd}`, true);
  }
}

// Abre o cierra el cajón izquierdo
function setSidebarState(isOpen) {
  if (isMobileLayout()) {
    document.body.classList.toggle(CSS_CLASSES.SIDEBAR_OPEN, isOpen);
    dom.sidebar.style.transform = ''; 
    touchState.currentTranslate = isOpen ? 0 : -DRAWER_WIDTH;
    
    if (isOpen) {
      yearInteractionState = { start: false, end: false };
    } else {
      applyPendingYearFilters();
    }
  }

  if (dom.rewindButton) {
    dom.rewindButton.innerHTML = isOpen ? ICONS.REWIND : ICONS.FORWARD;
    const label = isOpen ? "Cerrar menú" : "Abrir menú";
    Object.assign(dom.rewindButton, { title: label, ariaLabel: label, ariaExpanded: isOpen });
  }
  if (dom.mobileSidebarToggle) {
    dom.mobileSidebarToggle.setAttribute('aria-expanded', isOpen);
    dom.mobileSidebarToggle.setAttribute('aria-label', isOpen ? 'Cerrar menú' : 'Abrir menú');
  }
}

export const openMobileDrawer = () => setSidebarState(true);
export const closeMobileDrawer = () => setSidebarState(false);
const tryCloseMobileDrawer = () => { if (isMobileLayout()) closeMobileDrawer(); };

function updateDrawerWidth() {
  if (dom.sidebar) {
    const width = dom.sidebar.offsetWidth;
    if (width > 0) DRAWER_WIDTH = width;
  }
}

// Cuando pones el dedo en la pantalla
function handleTouchStart(e) {
  if (!isMobileLayout()) return;
  if (document.body.classList.contains(CSS_CLASSES.MODAL_OPEN)) return;
  
  const isOpen = document.body.classList.contains(CSS_CLASSES.SIDEBAR_OPEN);
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
  
  const isEdgeSwipe = !isOpen && touchState.startX < 30;
  touchState.isInteractive = !isEdgeSwipe && !!e.target.closest('button, a, input, select, textarea, .movie-card, .noUi-handle');

  document.addEventListener("touchmove", handleTouchMove, { passive: true });
}

// Cuando mueves el dedo
function handleTouchMove(e) {
  if (!touchState.isDragging) return;

  const currentX = e.touches[0].clientX;
  const currentY = e.touches[0].clientY;
  const diffX = currentX - touchState.startX;
  const diffY = currentY - touchState.startY;

  if (!touchState.isHorizontalDrag) {
    const threshold = touchState.isInteractive ? 15 : 10; 
    
    if (Math.abs(diffX) < threshold && Math.abs(diffY) < threshold) return;

    if (Math.abs(diffY) > Math.abs(diffX)) {
      touchState.isDragging = false;
      document.removeEventListener("touchmove", handleTouchMove);
      return;
    }
    
    touchState.isHorizontalDrag = true;
    touchState.startX = currentX; 
    touchState.startY = currentY;
    touchState.startTime = Date.now();

    dom.sidebar.classList.add(CSS_CLASSES.IS_DRAGGING); 
    document.body.classList.add(CSS_CLASSES.SIDEBAR_DRAGGING_BODY); 
  }

  let newTranslate = touchState.startTranslate + (currentX - touchState.startX);

  // Efecto goma elástica al chocar con los bordes
  if (newTranslate > 0) {
    newTranslate *= 0.2; 
  } else if (newTranslate < -DRAWER_WIDTH) {
    const overflow = Math.abs(newTranslate + DRAWER_WIDTH);
    newTranslate = -DRAWER_WIDTH - (overflow * 0.2); 
  }

  touchState.currentTranslate = newTranslate;
  dom.sidebar.style.transform = `translateX(${touchState.currentTranslate}px)`;
}

// Al levantar el dedo, decidimos qué hacer
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

  let shouldOpen;
  if (velocity > SWIPE_VELOCITY_THRESHOLD) {
    shouldOpen = true; 
  } else if (velocity < -SWIPE_VELOCITY_THRESHOLD) {
    shouldOpen = false; 
  } else {
    shouldOpen = touchState.currentTranslate > -DRAWER_WIDTH * 0.5; 
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

  const handleResize = debounce(() => {
    if (isMobileLayout()) updateDrawerWidth();
    else {
      document.body.classList.remove(CSS_CLASSES.SIDEBAR_OPEN);
      dom.sidebar.style.transform = "";
      touchState.currentTranslate = -DRAWER_WIDTH;
    }
  }, 250);

  window.addEventListener("resize", handleResize);
  
  if (screen?.orientation) {
    screen.orientation.addEventListener("change", handleResize);
  } else {
    window.addEventListener("orientationchange", handleResize);
  }
}

// =================================================================
//          2. PELLIZCO MÁGICO (Pinch to zoom para el Modo Muro)
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
    const currentPage = getCurrentPage();
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
    
    loadAndRenderMovies(newPage, { forceSkeleton: true });
  };

  executeViewTransition(updateState);

  triggerPopAnimation(button);
}

let pinchInited = false;
function initPinchGestures() {
  if (pinchInited) return;
  const target = document.querySelector('.main-content-wrapper');
  if (!target) return;

  target.addEventListener('click', (e) => {
    if (areInteractionsLocked()) {
      if (e.target.closest('.movie-card, .grid-container')) {
        e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation();
      }
    }
  }, { capture: true });

  let initialDistance = null;
  let isPinching = false;
  let hasTriggered = false;
  let cooldownTimer = null;

  const activateCooldown = () => {
    lockGlobalInteractions(800);
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
      if (diff < 0) {
         toggleRotationMode(); 
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
//          3. EL BUSCADOR INTERNO (Autocompletar)
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
    const isActive = index === 0; 
    const item = createElement("div", {
      className: `${CSS_CLASSES.SIDEBAR_AUTOCOMPLETE_ITEM}${isActive ? ' is-active' : ''}`,
      dataset: { value: suggestion },
      id: `suggestion-item-${formElement.dataset.filterType}-${index}`,
      attributes: { role: "option", "aria-selected": isActive ? "true" : "false" },
    });
    item.appendChild(highlightAccentInsensitive(suggestion, searchTerm));
    fragment.appendChild(item);
  });

  resultsContainer.appendChild(fragment);

  if (suggestions.length > 0) {
    input.setAttribute("aria-activedescendant", `suggestion-item-${formElement.dataset.filterType}-0`);
  }
}

// Enciende o apaga botones si llegas al límite de filtros
function updateAllFilterControls() {
  const activeFilters = getActiveFilters();
  const limitReached = getActiveFilterCount() >= CONFIG.MAX_ACTIVE_FILTERS;

  const excludedGenresSet = new Set(activeFilters.excludedGenres || []);
  const excludedCountriesSet = new Set(activeFilters.excludedCountries || []);

  const normActiveFilters = {};
  for (const k in activeFilters) {
    const val = activeFilters[k];
    if (!val || Array.isArray(val)) continue;
    normActiveFilters[k] = k === 'genre' ? normalizeGenreText(val) : normalizeText(val);
  }

  const filterLinks = document.getElementsByClassName("filter-link");
  for (let i = 0; i < filterLinks.length; i++) {
    const link = filterLinks[i];
    const type = link.dataset.filterType;
    const value = link.dataset.filterValue;
    
    const isExcluded = (type === "genre" && excludedGenresSet.has(value)) || 
                       (type === "country" && excludedCountriesSet.has(value));
    
    let isActive = false;
    let normValue = link._normValue;
    if (normValue === undefined) {
      normValue = type === 'genre' ? normalizeGenreText(value) : normalizeText(value);
      link._normValue = normValue;
    }
    
    isActive = normActiveFilters[type] === normValue;
    
    let shouldHide = isActive || isExcluded;
    if (type === 'studio' || type === 'genre' || type === 'country' || type === 'selection') {
      shouldHide = false;
      link.classList.toggle('active', isActive);
      link.classList.toggle('is-excluded', isExcluded);
    }
    
    if (link.hidden !== shouldHide) link.hidden = shouldHide;

    if (!shouldHide) {
        const shouldDisable = limitReached;
        if (link.hasAttribute("disabled") !== shouldDisable) {
            link.toggleAttribute("disabled", shouldDisable);
            link.setAttribute("aria-disabled", String(shouldDisable)); 
            link.style.pointerEvents = shouldDisable ? "none" : "auto";
            link.style.opacity = shouldDisable ? "0.5" : "1";
        }
    }
  }

  const filterInputs = document.getElementsByClassName("sidebar-filter-input");
  for (let i = 0; i < filterInputs.length; i++) {
    const input = filterInputs[i];
    if (input.disabled !== limitReached) {
        input.disabled = limitReached;
        input.placeholder = limitReached ? "Límite de filtros" : `Otro ${input.closest("form").dataset.filterType}...`;
    }
  }

  if (dom.myListButton) {
    const state = activeFilters.myList;
    dom.myListButton.classList.toggle("active", !!state);
    
    // Actualizar icono y tooltip según estado
    let iconHtml = ICONS.LIST;
    let title = "Mi Lista";
    
    if (state === 'rated') {
      iconHtml = ICONS.STAR;
      title = "Mis Puntuaciones";
    } else if (state === 'watchlist') {
      iconHtml = ICONS.WATCHLIST;
      title = "Pendientes";
    }
    
    dom.myListButton.innerHTML = iconHtml;
    dom.myListButton.title = title;
  }
}

let lastPillState = {};

// Pinta los filtros como etiquetas de colores ("píldoras")
function renderFilterPills() {
  const activeFilters = getActiveFilters();
  let pillIndex = 0;

  Object.keys(FILTER_CONFIG).forEach(type => {
    const cont = sectionContainers[type];
    if (!cont) return;

    const inc = activeFilters[type];
    const exc = type === 'genre' ? (activeFilters.excludedGenres || []) : type === 'country' ? (activeFilters.excludedCountries || []) : [];
    const stateKey = `${type}-combined`;
    const currState = `${inc || ""}|${exc.join(",")}`;
    
    if (lastPillState[stateKey] === currState) {
      if (inc) pillIndex++;
      pillIndex += exc.length;
      return;
    }
    lastPillState[stateKey] = currState;
    
    const desired = [];
    if (inc) desired.push({ val: inc, exc: false });
    exc.forEach(v => desired.push({ val: v, exc: true }));

    const exist = Array.from(cont.children);
    const kept = new Set();

    desired.forEach(item => {
      let pill = exist.find(p => p.dataset.filterValue === item.val && p.classList.contains("filter-pill--exclude") === item.exc);
      if (pill) { kept.add(pill); cont.appendChild(pill); }
      else {
        pill = createElement("div", { className: `filter-pill ${item.exc ? "filter-pill--exclude" : ""}`, dataset: { filterType: type, filterValue: item.val } });
        pill.style.setProperty("--pill-index", pillIndex);
        
        let text = FILTER_CONFIG[type]?.items[item.val];
        if (!text && type === 'country') text = Object.values(REGIONAL_GROUPS).find(r => r.value === item.val)?.label;
        
        pill.appendChild(createElement("span", { textContent: text || item.val }));
        pill.appendChild(createElement("span", { className: "remove-filter-btn", innerHTML: item.exc ? ICONS.PAUSE_SMALL : "×", attributes: { "aria-hidden": "true" } }));
        cont.appendChild(pill);
      }
      pillIndex++;
    });

    exist.forEach(p => { if (!kept.has(p)) p.remove(); });
  });

  updateAllFilterControls();
}

// --- 4. ACCIONES (Clics en botones de filtros) ---

async function handleMyListToggle() {
  const currentFilters = getActiveFilters();
  const current = currentFilters.myList;
  
  // Ciclo: Inactivo -> Puntuadas -> Pendientes -> Todo -> Inactivo
  const cycle = [null, 'rated', 'watchlist', 'mixed'];
  const nextIndex = (cycle.indexOf(current) + 1) % cycle.length;
  const nextState = cycle[nextIndex];

  triggerHapticFeedback('medium');
  if (dom.myListButton) triggerPopAnimation(dom.myListButton);
  
  // Resetear filtros pero mantener sort y mediaType
  resetFiltersState();
  setSort(currentFilters.sort);
  setMediaType(currentFilters.mediaType);

  if (nextState) {
    setFilter('myList', nextState);
    const messages = {
      rated: "Mostrando tus puntuaciones",
      watchlist: "Mostrando pendientes",
      mixed: "Mostrando toda tu lista"
    };
    showToast(messages[nextState], "info");
  }

  document.dispatchEvent(new CustomEvent("updateSidebarUI"));
  document.dispatchEvent(new CustomEvent("uiActionTriggered"));
  tryCloseMobileDrawer();
  await loadAndRenderMovies(1);
}

async function handleFilterChangeOptimistic(type, value, forceSet = false) {
  const previousFilters = getActiveFilters();
  
  if (value && (type === 'actor' || type === 'director')) {
    const currentSort = previousFilters.sort;
    const currentMediaType = previousFilters.mediaType;
    
    resetFiltersState();
    setSort(currentSort);
    setMediaType(currentMediaType);
    setFilter(type, value, true); 
    setFilter('myList', null); 
    
    document.dispatchEvent(new CustomEvent("updateSidebarUI"));
    
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
  
  if (newValue && type !== 'actor' && type !== 'director') {
    if (previousFilters.actor) setFilter('actor', null);
    if (previousFilters.director) setFilter('director', null);
  }
  
  if (newValue) setFilter('myList', null);

  // Si activamos un filtro, limpiamos la búsqueda de texto
  if (newValue && previousFilters.searchTerm) {
    setSearchTerm("");
    const mainSearchInput = document.querySelector(SELECTORS.SEARCH_INPUT);
    if (mainSearchInput) mainSearchInput.value = "";
  }

  if (newValue && type === 'country') {
    setFilter('excludedCountries', [], true);
  }

  if (newValue && type === 'genre') {
    const currentExcluded = previousFilters.excludedGenres || [];
    if (currentExcluded.includes(newValue)) {
       const newExcluded = currentExcluded.filter(g => g !== newValue);
       setFilter('excludedGenres', newExcluded, true);
    }
  }

  if (!setFilter(type, newValue)) {
    showToast(`Límite de ${CONFIG.MAX_ACTIVE_FILTERS} filtros alcanzado.`, "error");
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
    setFilter('selection', previousFilters.selection);
    setFilter('studio', previousFilters.studio);
    setFilter('actor', previousFilters.actor);
    setFilter('director', previousFilters.director);
    setFilter('excludedCountries', previousFilters.excludedCountries, true);
    setFilter('excludedGenres', previousFilters.excludedGenres, true);
    setFilter(type, previousFilters[type]);
    renderFilterPills();
  }
}

async function handleToggleExcludedFilterOptimistic(type, value) {
  const previousState = getActiveFilters();
  
  if (type === 'country' && previousState.country) {
    return;
  }

  if (type === 'genre' && previousState.genre === value) {
    setFilter('genre', null);
  }

  if (previousState.searchTerm) {
    setSearchTerm("");
    const mainSearchInput = document.querySelector(SELECTORS.SEARCH_INPUT);
    if (mainSearchInput) mainSearchInput.value = "";
  }

  if (!toggleExcludedFilter(type, value)) {
    showToast(`Límite de filtros alcanzado.`, "error");
    return;
  }

  const newState = getActiveFilters();
  const isNowExcluded = (type === 'genre' && newState.excludedGenres.includes(value)) ||
                        (type === 'country' && newState.excludedCountries.includes(value));

  if (isNowExcluded) {
    const label = FILTER_CONFIG[type]?.items[value] || value;
    showToast(`Excluido: ${label}`, "info");
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
  if (dom.playButton) triggerPopAnimation(dom.playButton);
  triggerHapticFeedback('medium');
  document.dispatchEvent(new CustomEvent("filtersReset"));
  tryCloseMobileDrawer();
}

function hasCompactTriggeringFilters() {
  const filters = getActiveFilters();
  const defaultYearRange = `${CONFIG.YEAR_MIN}-${CONFIG.YEAR_MAX}`;
  const isYearActive = !!(filters.year && filters.year !== defaultYearRange);
  const totalCount = getActiveFilterCount();
  return (isYearActive ? totalCount - 1 : totalCount) > 0;
}

export function collapseAllSections() {
  dom.collapsibleSections.forEach((section) => {
    section.classList.remove(CSS_CLASSES.ACTIVE);
    section.classList.remove("is-ready");
    section.querySelector('.section-header')?.setAttribute('aria-expanded', 'false');
  });
  
  if (dom.sidebarInnerWrapper) {
    dom.sidebarInnerWrapper.classList.toggle("is-compact", hasCompactTriggeringFilters());
  }
}

// --- 5. LA LÍNEA DEL TIEMPO (Slider de años) ---

function initYearSlider() {
  if (!dom.yearSlider || !dom.yearStartInput || !dom.yearEndInput) return;
  const yearInputs = [dom.yearStartInput, dom.yearEndInput];
  
  const pivotYear = Math.max(CONFIG.YEAR_MIN + 1, CONFIG.YEAR_MAX - 20);

  const currentFilters = getActiveFilters();
  let initialYears = (currentFilters.year || `${CONFIG.YEAR_MIN}-${CONFIG.YEAR_MAX}`).split("-").map(Number);
  if (initialYears.length === 1) initialYears = [initialYears[0], initialYears[0]];

  const sliderInstance = noUiSlider.create(dom.yearSlider, {
    start: initialYears,
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
    const yearFilter = start === end ? `${start}` : `${start}-${end}`;
    
    if (isMobileLayout()) {
      if (autoClose && yearInteractionState.start && yearInteractionState.end) {
        closeMobileDrawer();
      }
    } else {
      handleFilterChangeOptimistic("year", yearFilter, true);
    }
  };

  const debouncedUpdate = debounce(updateSliderFilter, 500);
  
  sliderInstance.on("set", (values, handle) => {
    triggerHapticFeedback("light");
    const h = Number(handle);
    if (h === 0) yearInteractionState.start = true;
    if (h === 1) yearInteractionState.end = true;
    debouncedUpdate(values, handle, true); 
  });
  
  yearInputs.forEach((input, index) => {
    input.addEventListener("change", (e) => {
      const newValue = parseFloat(e.target.value);
      const currentValues = sliderInstance.get().map(v => parseFloat(v));
      
      const triggerUpdate = (vals) => {
        if (index === 0) yearInteractionState.start = true;
        if (index === 1) yearInteractionState.end = true;
        debouncedUpdate(vals, index, false); 
      };

      if (currentValues[0] === currentValues[1]) {
        if (index === 0 && newValue > currentValues[0]) { sliderInstance.set([newValue, newValue], false); triggerUpdate([newValue, newValue]); return; }
        if (index === 1 && newValue < currentValues[1]) { sliderInstance.set([newValue, newValue], false); triggerUpdate([newValue, newValue]); return; }
      }
      const values = [null, null];
      values[index] = e.target.value;
      sliderInstance.set(values, false);
      triggerUpdate(sliderInstance.get());
    });
  });

  document.addEventListener("updateSidebarUI", () => {
    debouncedUpdate.cancel(); 
    const currentFilters = getActiveFilters();
    let years = (currentFilters.year || `${CONFIG.YEAR_MIN}-${CONFIG.YEAR_MAX}`).split("-").map(Number);
    if (years.length === 1) years = [years[0], years[0]];
    sliderInstance.set(years, false); 
  });
}

function setupYearInputSteppers() {
  document.querySelectorAll(".year-input-wrapper").forEach((wrapper) => {
    const input = wrapper.querySelector(".year-input");
    const stepperUp = wrapper.querySelector(".stepper-btn.stepper-up");
    const stepperDown = wrapper.querySelector(".stepper-btn.stepper-down");
    if (!input || !stepperUp || !stepperDown) return;
    const updateYearValue = (increment) => {
      triggerHapticFeedback('medium'); 
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

const sanitizeSearchTerm = term => term.replace(/%/g, '\\%').replace(/_/g, '\\_');

function setupAutocompleteHandlers() {
  dom.sidebarFilterForms.forEach((form) => {
    const input = form.querySelector(SELECTORS.SIDEBAR_FILTER_INPUT);
    const filterType = form.dataset.filterType;
    const fetcher = suggestionFetchers[filterType];
    if (!input || !fetcher) return;
    input.setAttribute("role", "combobox");
    input.setAttribute("aria-autocomplete", "list");
    input.setAttribute("aria-expanded", "false");
    
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      const resultsContainer = form.querySelector(SELECTORS.SIDEBAR_AUTOCOMPLETE_RESULTS);
      if (resultsContainer && resultsContainer.children.length > 0) {
        const items = Array.from(resultsContainer.children);
        const activeItem = items.find(i => i.classList.contains('is-active')) || items[0];
        if (activeItem) activeItem.click();
      }
    });

    const debouncedFetch = debounce(async () => {
      const rawTerm = input.value.trim();
      if (rawTerm.length < 3) { clearAllSidebarAutocomplete(); return; }
      
      const apiTerm = sanitizeSearchTerm(rawTerm);
      const suggestions = await fetcher(apiTerm);
      renderSidebarAutocomplete(form, suggestions, rawTerm);
    }, CONFIG.SEARCH_DEBOUNCE_DELAY);
    
    input.addEventListener("input", debouncedFetch);
    
    input.addEventListener("keydown", (e) => {
       if (e.key === "Enter") e.preventDefault();

       const resultsContainer = form.querySelector(SELECTORS.SIDEBAR_AUTOCOMPLETE_RESULTS);
       if (!resultsContainer || resultsContainer.children.length === 0) return;
       
       const items = resultsContainer.children;
       let activeIndex = -1;
       for (let i = 0; i < items.length; i++) {
         if (items[i].classList.contains('is-active')) { activeIndex = i; break; }
       }
       
       const updateActiveSuggestion = (index) => {
         for (let i = 0; i < items.length; i++) {
           items[i].classList.remove("is-active");
           items[i].setAttribute("aria-selected", "false");
         }
         if (index >= 0 && items[index]) {
           items[index].classList.add("is-active");
           items[index].setAttribute("aria-selected", "true");
           input.setAttribute("aria-activedescendant", items[index].id);
           items[index].scrollIntoView({ block: 'nearest' });
         } else { input.removeAttribute("aria-activedescendant"); }
       };

       switch (e.key) {
        case "ArrowDown": e.preventDefault(); activeIndex = activeIndex < items.length - 1 ? activeIndex + 1 : -1; updateActiveSuggestion(activeIndex); break;
        case "ArrowUp": e.preventDefault(); activeIndex = activeIndex > -1 ? activeIndex - 1 : items.length - 1; updateActiveSuggestion(activeIndex); break;
        case "Enter": 
          if (activeIndex >= 0 && items[activeIndex]) {
            items[activeIndex].click();
          } else if (items.length > 0) {
            items[0].click();
          }
          break;
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
      const isMobile = isMobileLayout();
      if (isMobile) {
        const isOpen = document.body.classList.contains(CSS_CLASSES.SIDEBAR_OPEN);
        isOpen ? closeMobileDrawer() : openMobileDrawer();
      } else {
        document.body.classList.toggle(CSS_CLASSES.SIDEBAR_COLLAPSED);
        const isNowCollapsed = document.body.classList.contains(CSS_CLASSES.SIDEBAR_COLLAPSED);
        setSidebarState(!isNowCollapsed); 
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
    dom.sidebarScrollable.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        if (e.target.tagName === "BUTTON") return; 
        const link = e.target.closest(".filter-link");
        if (link) {
          e.preventDefault();
          link.click();
        }
      }
    });

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
          section.classList.remove("is-ready");
          section.querySelector('.section-header')?.setAttribute('aria-expanded', 'false');
        }
      });
      
      if (!isNowActive) {
        clickedSection.classList.remove("is-ready");
      }

      clickedSection.classList.toggle(CSS_CLASSES.ACTIVE, isNowActive);
      header.setAttribute('aria-expanded', isNowActive);
      
      dom.sidebarInnerWrapper?.classList.toggle("is-compact", isNowActive || hasCompactTriggeringFilters());

      if (isNowActive) {
        setTimeout(() => {
          if (clickedSection.classList.contains(CSS_CLASSES.ACTIVE)) {
            clickedSection.classList.add("is-ready");
            
            const inputField = clickedSection.querySelector('.sidebar-filter-input');
            if (inputField) {
              inputField.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
              if (!isMobileLayout()) {
                inputField.focus({ preventScroll: true });
              }
            } else if (header) {
              header.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' });
            }
          }
        }, 300);
      }
    });
  });
}

// =================================================================
//          ARRANQUE DEL COMPONENTE
// =================================================================

export function initSidebar() {
  if (isInitialized) return;
  isInitialized = true;

  if (isMobileLayout()) {
    setSidebarState(false); 
  } else if (window.innerWidth <= 1024 && window.innerHeight > MOBILE_HEIGHT_LIMIT) {
    document.body.classList.add(CSS_CLASSES.SIDEBAR_COLLAPSED);
    setSidebarState(false); 
  }
  
  const populateFilterSection = (filterType) => {
    const config = FILTER_CONFIG[filterType];
    if (!config) return;
    const contentId = filterType === 'country' ? 'countries-content' : `${filterType}s-content`;
    const listContainer = document.querySelector(`#${contentId} > div:first-child`);
    if (!listContainer) return;
    
    const pillsContainer = listContainer.closest('.collapsible-section').querySelector('.active-filters-list');
    if (pillsContainer) sectionContainers[filterType] = pillsContainer;

    listContainer.textContent = "";
    const fragment = document.createDocumentFragment();

    Object.entries(config.items).forEach(([value, text]) => {
      const link = createElement("div", { 
        className: "filter-link", 
        dataset: { filterType, filterValue: value },
        attributes: { role: "button", tabindex: "0" }
      });
      
      const iconData = (filterType === 'studio' ? STUDIO_DATA[value] : null) || 
                       (filterType === 'selection' ? SELECTION_DATA?.[value] : null);

      if (iconData) {
        link.classList.add("filter-link--icon"); 
        link.title = text;
        
        if (iconData.img) {
          const img = createElement("img", { 
            src: iconData.img, 
            className: `sidebar-platform-img ${iconData.invertDark ? 'invert-on-dark' : ''}`,
            alt: text 
          });
          link.appendChild(img);
        } else if (iconData.id) {
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

    if (filterType === 'country') {
      Object.values(REGIONAL_GROUPS).forEach(region => {
        const link = createElement("div", { 
          className: "filter-link", 
          dataset: { filterType, filterValue: region.value },
          attributes: { role: "button", tabindex: "0" }
        });
        
        const text = createElement("span", { textContent: region.label });
        
        link.append(text);
        fragment.appendChild(link);
      });
    }

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
    } catch (e) {}
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
    
    requestAnimationFrame(() => {
      renderFilterPills();
    });
  });
  
  document.addEventListener("filtersReset", collapseAllSections);
  document.addEventListener("uiActionTriggered", collapseAllSections);

  renderFilterPills();
  
  if (hasCompactTriggeringFilters() && dom.sidebarInnerWrapper) {
    dom.sidebarInnerWrapper.classList.add("is-compact");
  }
}