/// <reference types="vite/client" />

// =================================================================
//                 LA CAJONERA (Menú Lateral y Filtros)
// =================================================================
// Controla el menú izquierdo, los filtros, las etiquetas (píldoras),
// y los gestos táctiles (deslizar para abrir, pellizcar para muro).
// =================================================================

import { DualRangeSlider } from './yearSlider.js';
import { CONFIG } from "../constants.js";
import { debounce, triggerPopAnimation, createElement, triggerHapticFeedback, highlightAccentInsensitive, LocalStore, normalizeText, normalizeGenreText, executeViewTransition, runWhenIdle, parseYearRangeRaw } from "../utils.js";
import {
  fetchDirectorSuggestions, fetchActorSuggestions, fetchCountrySuggestions, fetchGenreSuggestions,
  fetchRandomTopActors, fetchRandomTopDirectors
} from "../api.js";
import { unflipAllCards } from "./card.js";
import { closeModal } from "./modal.js";
import { getActiveFilters, setFilter, toggleExcludedFilter, getActiveFilterCount, resetFiltersState, setSort, setMediaType, getCurrentPage, setSearchTerm, appEvents } from "../state.js";
import { ICONS, CSS_CLASSES, SELECTORS, FILTER_CONFIG, STUDIO_DATA, SELECTION_DATA, REGIONAL_GROUPS, StudioInfo, SelectionInfo, DEFAULTS } from "../constants.js";
import { showToast, clearToast, clearAllSidebarAutocomplete, lockGlobalInteractions, areInteractionsLocked, notifyRemovedPersonIncompatibleFilters, updateTypeFilterUI } from "../ui.js";
import { loadAndRenderMovies } from "../main.js";
import { ActiveFilters } from '../types.js';

// --- Constantes Locales ---
const MOBILE_BREAKPOINT = 768;
const MOBILE_HEIGHT_LIMIT = 500;
const SWIPE_VELOCITY_THRESHOLD = 0.4;
let DRAWER_WIDTH = 300;

let yearInteractionState = { start: false, end: false };



const dom = {
  sidebar: document.getElementById("sidebar") as HTMLElement | null,
  sidebarInnerWrapper: document.querySelector(".sidebar-inner-wrapper") as HTMLElement | null,
  rewindButton: document.querySelector("#rewind-button") as HTMLElement | null,
  toggleRotationBtn: document.querySelector("#toggle-rotation-btn") as HTMLElement | null,
  playButton: document.querySelector("#play-button") as HTMLElement | null,
  collapsibleSections: document.querySelectorAll(".collapsible-section") as NodeListOf<HTMLElement>,
  sidebarFilterForms: document.querySelectorAll(SELECTORS.SIDEBAR_FILTER_FORM) as NodeListOf<HTMLFormElement>,
  sidebarScrollable: document.querySelector(".sidebar-scrollable-filters") as HTMLElement | null,
  yearSlider: document.querySelector(SELECTORS.YEAR_SLIDER) as HTMLElement | null,
  yearStartInput: document.querySelector(SELECTORS.YEAR_START_INPUT) as HTMLInputElement | null,
  yearEndInput: document.querySelector(SELECTORS.YEAR_END_INPUT) as HTMLInputElement | null,
  sidebarOverlay: document.getElementById("sidebar-overlay") as HTMLElement | null,
  mobileSidebarToggle: document.getElementById("mobile-sidebar-toggle") as HTMLElement | null,
  myListButton: document.getElementById("my-list-button") as HTMLElement | null,
};

const sectionContainers: Record<string, HTMLElement> = {};
const isMobileLayout = (): boolean => window.innerWidth <= MOBILE_BREAKPOINT || window.innerHeight <= MOBILE_HEIGHT_LIMIT;

let isSidebarInitialized = false;
let sidebarLifecycleGen = 0;
let sidebarUnsubscribers: Array<() => void> = [];
let sidebarAbortController: AbortController | null = null;
let sidebarTimeouts: Array<ReturnType<typeof setTimeout>> = [];
let yearSliderInstance: DualRangeSlider | null = null;

export function disposeSidebarEvents(): void {
  sidebarLifecycleGen++;
  if (sidebarAbortController) {
    sidebarAbortController.abort();
    sidebarAbortController = null;
  }
  if (yearSliderInstance) {
    yearSliderInstance.destroy();
    yearSliderInstance = null;
  }
  sidebarTimeouts.forEach(t => clearTimeout(t));
  sidebarTimeouts = [];
  sidebarUnsubscribers.forEach(unsub => unsub());
  sidebarUnsubscribers = [];
  isSidebarInitialized = false;
}





// =================================================================
//          1. GESTOS TÁCTILES (El dedo manda)
// =================================================================


interface TouchState {
  isDragging: boolean;
  isHorizontalDrag: boolean;
  startX: number;
  startY: number;
  startTime: number;
  currentTranslate: number;
  startTranslate: number;
  isInteractive: boolean;
}

let touchState: TouchState = {
  isDragging: false,
  isHorizontalDrag: false,
  startX: 0,
  startY: 0,
  startTime: 0,
  currentTranslate: 0,
  startTranslate: 0,
  isInteractive: false
};

// Guarda el año si has tocado las casillas manuales
function applyPendingYearFilters(): void {
  if (!dom.yearStartInput || !dom.yearEndInput) return;

  const currentStart = parseInt(dom.yearStartInput.value, 10);
  const currentEnd = parseInt(dom.yearEndInput.value, 10);

  if (isNaN(currentStart) || isNaN(currentEnd)) return;

  const activeFilters = getActiveFilters();
  const [globalStart, globalEnd] = parseYearRangeRaw(activeFilters.year);

  if (currentStart !== globalStart || currentEnd !== globalEnd) {
    handleFilterChangeOptimistic("year", currentStart === currentEnd ? `${currentStart}` : `${currentStart}-${currentEnd}`, true);
  }
}

// Actualiza el icono y los atributos de accesibilidad del botón rewind/colapso
function updateRewindButtonState(isOpen: boolean): void {
  if (dom.rewindButton) {
    dom.rewindButton.innerHTML = isOpen ? ICONS.REWIND : ICONS.FORWARD;
    const label = isOpen ? "Cerrar menú" : "Abrir menú";
    Object.assign(dom.rewindButton, { title: label, ariaLabel: label, ariaExpanded: isOpen });
  }
  if (dom.mobileSidebarToggle) {
    dom.mobileSidebarToggle.setAttribute('aria-expanded', String(isOpen));
    dom.mobileSidebarToggle.setAttribute('aria-label', isOpen ? 'Cerrar menú' : 'Abrir menú');
  }
}

// Sincroniza el estado visual del sidebar y de sus botones según el viewport (móvil vs escritorio/apaisado)
export function syncSidebarResponsiveState(): void {
  const isMobile = isMobileLayout();
  if (isMobile) {
    updateDrawerWidth();
    const isMobileOpen = document.body.classList.contains(CSS_CLASSES.SIDEBAR_OPEN);
    updateRewindButtonState(isMobileOpen);
  } else {
    document.body.classList.remove(CSS_CLASSES.SIDEBAR_OPEN);
    if (dom.sidebar) dom.sidebar.style.transform = '';
    touchState.currentTranslate = -DRAWER_WIDTH;
    const isDesktopOpen = !document.body.classList.contains(CSS_CLASSES.SIDEBAR_COLLAPSED);
    updateRewindButtonState(isDesktopOpen);
  }
}

// Abre o cierra el cajón izquierdo
function setSidebarState(isOpen: boolean): void {
  if (isMobileLayout() && dom.sidebar) {
    document.body.classList.toggle(CSS_CLASSES.SIDEBAR_OPEN, isOpen);
    dom.sidebar.style.transform = '';
    touchState.currentTranslate = isOpen ? 0 : -DRAWER_WIDTH;

    if (isOpen) {
      yearInteractionState = { start: false, end: false };
    } else {
      applyPendingYearFilters();
    }
  }

  updateRewindButtonState(isOpen);
}

export const openMobileDrawer = (): void => setSidebarState(true);
export const closeMobileDrawer = (): void => setSidebarState(false);
const tryCloseMobileDrawer = (): void => { if (isMobileLayout()) closeMobileDrawer(); };

function updateDrawerWidth(): void {
  if (dom.sidebar) {
    const width = dom.sidebar.offsetWidth;
    if (width > 0) DRAWER_WIDTH = width;
  }
}

// Cuando pones el dedo en la pantalla
function handleTouchStart(e: TouchEvent): void {
  if (!isMobileLayout()) return;
  if (document.body.classList.contains(CSS_CLASSES.MODAL_OPEN)) return;

  const isOpen = document.body.classList.contains(CSS_CLASSES.SIDEBAR_OPEN);
  const target = e.target as HTMLElement;

  // Evitar conflicto entre el slider de años y los gestos de deslizamiento del drawer móvil
  if (target.closest("#year-slider, .custom-year-slider, .slider-handle, .slider-track")) {
    touchState.isDragging = false;
    return;
  }

  const canStartDrag = (isOpen && target.closest("#sidebar")) || (!isOpen && e.touches[0].clientX < 150);

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
  touchState.isInteractive = !isEdgeSwipe && !!target.closest('button, a, input, select, textarea, .movie-card, .custom-year-slider, .slider-handle');

  document.addEventListener("touchmove", handleTouchMove as EventListener, { passive: true });
}

// Cuando mueves el dedo
function handleTouchMove(e: TouchEvent): void {
  if (!touchState.isDragging || !dom.sidebar) return;

  const currentX = e.touches[0].clientX;
  const currentY = e.touches[0].clientY;
  const diffX = currentX - touchState.startX;
  const diffY = currentY - touchState.startY;

  if (!touchState.isHorizontalDrag) {
    const threshold = touchState.isInteractive ? 15 : 10;

    if (Math.abs(diffX) < threshold && Math.abs(diffY) < threshold) return;

    if (Math.abs(diffY) > Math.abs(diffX)) {
      touchState.isDragging = false;
      document.removeEventListener("touchmove", handleTouchMove as EventListener);
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
function handleTouchEnd(e: TouchEvent): void {
  if (!touchState.isDragging || !dom.sidebar) return;
  document.removeEventListener("touchmove", handleTouchMove as EventListener);

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

function initTouchGestures(): void {
  if (!dom.sidebar) return;
  updateDrawerWidth();
  const tStart = handleTouchStart as EventListener;
  const tEnd = handleTouchEnd as EventListener;
  document.addEventListener("touchstart", tStart, { passive: true });
  document.addEventListener("touchend", tEnd, { passive: true });
  document.addEventListener("touchcancel", tEnd, { passive: true });

  const handleResize = debounce(() => {
    syncSidebarResponsiveState();
  }, 100);

  const handleOrientation = () => {
    syncSidebarResponsiveState();
  };

  window.addEventListener("resize", handleResize);

  if (typeof screen !== "undefined" && screen?.orientation) {
    screen.orientation.addEventListener("change", handleOrientation);
  } else if (typeof window !== "undefined") {
    window.addEventListener("orientationchange", handleOrientation);
  }

  sidebarUnsubscribers.push(() => {
    document.removeEventListener("touchstart", tStart);
    document.removeEventListener("touchend", tEnd);
    document.removeEventListener("touchcancel", tEnd);
    window.removeEventListener("resize", handleResize);
    if (typeof screen !== "undefined" && screen?.orientation) {
      screen.orientation.removeEventListener("change", handleOrientation);
    } else if (typeof window !== "undefined") {
      window.removeEventListener("orientationchange", handleOrientation);
    }
    handleResize.cancel();
  });
}


// =================================================================
//          2. PELLIZCO MÁGICO (Pinch to zoom para el Modo Muro)
// =================================================================

function toggleRotationMode(forceState: boolean | null = null): void {
  const button = dom.toggleRotationBtn;
  if (!button) return;

  const isCurrentlyDisabled = document.body.classList.contains(CSS_CLASSES.ROTATION_DISABLED);
  const shouldDisable = forceState !== null ? forceState : !isCurrentlyDisabled;

  if (isCurrentlyDisabled === shouldDisable) return;

  triggerHapticFeedback('medium');
  unflipAllCards();
  closeModal();

  const updateState = (): void => {
    const currentPage = getCurrentPage();
    const oldPageSize = shouldDisable ? CONFIG.ITEMS_PER_PAGE : CONFIG.WALL_MODE_ITEMS_PER_PAGE;
    const newPageSize = shouldDisable ? CONFIG.WALL_MODE_ITEMS_PER_PAGE : CONFIG.ITEMS_PER_PAGE;

    const firstItemIndex = (currentPage - 1) * oldPageSize;
    const newPage = Math.floor(firstItemIndex / newPageSize) + 1;

    document.body.classList.toggle(CSS_CLASSES.ROTATION_DISABLED, shouldDisable);
    button.innerHTML = shouldDisable ? ICONS.SQUARE_STOP : ICONS.PAUSE;
    button.setAttribute("aria-label", shouldDisable ? "Activar rotación de tarjetas" : "Pausar rotación de tarjetas");
    button.title = shouldDisable ? "Giro automático" : "Vista Rápida";
    button.setAttribute("aria-pressed", String(shouldDisable));
    LocalStore.set("rotationState", shouldDisable ? "disabled" : "enabled");

    loadAndRenderMovies(newPage, { forceSkeleton: true });
  };

  executeViewTransition(updateState);

  triggerPopAnimation(button);
}

let pinchInited = false;
function initPinchGestures(): void {
  if (pinchInited) return;
  const target = document.querySelector('.main-content-wrapper') as HTMLElement | null;
  if (!target) return;

  const handleClick = (e: MouseEvent) => {
    if (areInteractionsLocked()) {
      const el = e.target as HTMLElement;
      if (el.closest('.movie-card, .grid-container')) {
        e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation();
      }
    }
  };

  target.addEventListener('click', handleClick, { capture: true });

  let initialDistance: number | null = null;
  let isPinching = false;
  let hasTriggered = false;

  const activateCooldown = () => {
    lockGlobalInteractions(800);
  };

  const handleTouchStart = (e: TouchEvent) => {
    if (e.touches.length === 2) {
      isPinching = true;
      hasTriggered = false;
      initialDistance = Math.hypot(e.touches[0].pageX - e.touches[1].pageX, e.touches[0].pageY - e.touches[1].pageY);
    }
  };

  const handleTouchMove = (e: TouchEvent) => {
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
  };

  const handleTouchEnd = (e: TouchEvent) => {
    if (hasTriggered) activateCooldown();
    if (e.touches.length < 2) { isPinching = false; initialDistance = null; }
    if (e.touches.length === 0) hasTriggered = false;
  };

  target.addEventListener('touchstart', handleTouchStart, { passive: true });
  target.addEventListener('touchmove', handleTouchMove, { passive: true });
  target.addEventListener('touchend', handleTouchEnd);

  pinchInited = true;

  sidebarUnsubscribers.push(() => {
    target.removeEventListener('click', handleClick, { capture: true });
    target.removeEventListener('touchstart', handleTouchStart);
    target.removeEventListener('touchmove', handleTouchMove);
    target.removeEventListener('touchend', handleTouchEnd);
    pinchInited = false;
  });
}


// =================================================================
//          3. EL BUSCADOR INTERNO (Autocompletar)
// =================================================================

function renderSidebarAutocomplete(formElement: HTMLFormElement, suggestions: string[], searchTerm: string): void {
  const input = formElement.querySelector<HTMLInputElement>(SELECTORS.SIDEBAR_FILTER_INPUT);
  if (!input) return;

  let resultsContainer = formElement.querySelector<HTMLElement>(SELECTORS.SIDEBAR_AUTOCOMPLETE_RESULTS);

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

  const filterType = formElement.dataset.filterType || "";

  resultsContainer.id = `autocomplete-results-${filterType}`;
  resultsContainer.setAttribute("role", "listbox");
  input.setAttribute("aria-expanded", "true");
  input.setAttribute("aria-controls", resultsContainer.id);

  const fragment = document.createDocumentFragment();
  suggestions.forEach((suggestion, index) => {
    const isActive = index === 0;
    const item = createElement("div", {
      className: `${CSS_CLASSES.SIDEBAR_AUTOCOMPLETE_ITEM}${isActive ? ' is-active' : ''}`,
      dataset: { value: suggestion },
      id: `suggestion-item-${filterType}-${index}`,
      attributes: { role: "option", "aria-selected": isActive ? "true" : "false" },
    });
    item.appendChild(highlightAccentInsensitive(suggestion, searchTerm));
    fragment.appendChild(item);
  });

  resultsContainer.appendChild(fragment);

  if (suggestions.length > 0) {
    input.setAttribute("aria-activedescendant", `suggestion-item-${filterType}-0`);
  }
}

// Enciende o apaga botones si llegas al límite de filtros
function updateAllFilterControls(): void {
  const activeFilters = getActiveFilters();
  const limitReached = getActiveFilterCount() >= CONFIG.MAX_ACTIVE_FILTERS;

  const excludedGenresSet = new Set(activeFilters.excludedGenres || []);
  const excludedCountriesSet = new Set(activeFilters.excludedCountries || []);

  const normActiveFilters: Record<string, string> = {};
  for (const k in activeFilters) {
    const val = activeFilters[k as keyof ActiveFilters];
    if (!val || Array.isArray(val)) continue;
    normActiveFilters[k] = k === 'genre' ? normalizeGenreText(val as string) : normalizeText(val as string);
  }

  const filterLinks = document.getElementsByClassName("filter-link") as HTMLCollectionOf<HTMLElement & { _normValue?: string }>;
  for (let i = 0; i < filterLinks.length; i++) {
    const link = filterLinks[i];
    const type = link.dataset.filterType || "";
    const value = link.dataset.filterValue || "";

    const isExcluded = (type === "genre" && excludedGenresSet.has(value)) ||
      (type === "country" && excludedCountriesSet.has(value));

    let normValue = link._normValue;
    if (normValue === undefined) {
      normValue = type === 'genre' ? normalizeGenreText(value) : normalizeText(value);
      link._normValue = normValue;
    }

    const isActive = normActiveFilters[type] === normValue;

    let shouldHide = isActive || isExcluded;
    if (type === 'studio' || type === 'genre' || type === 'country' || type === 'selection') {
      shouldHide = false;
      link.classList.toggle('active', isActive);
      link.classList.toggle('is-excluded', isExcluded);

      const textSpan = link.querySelector("span:not(.sr-only):not(.remove-filter-btn)");
      if (textSpan) {
        const linkWithText = link as HTMLElement & { _originalText?: string };
        if (linkWithText._originalText === undefined) {
          linkWithText._originalText = textSpan.textContent || value;
        }
        const targetText = isExcluded ? `(-) ${linkWithText._originalText}` : linkWithText._originalText;
        if (textSpan.textContent !== targetText) {
          textSpan.textContent = targetText;
        }
      }
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

  const filterInputs = document.getElementsByClassName("sidebar-filter-input") as HTMLCollectionOf<HTMLInputElement>;
  for (let i = 0; i < filterInputs.length; i++) {
    const input = filterInputs[i];
    if (input.disabled !== limitReached) {
      input.disabled = limitReached;
      const form = input.closest("form");
      input.placeholder = limitReached ? "Límite de filtros" : `Otro ${form?.dataset.filterType}...`;
    }
  }

  if (dom.myListButton) {
    const isMyListActive = !!activeFilters.myList;
    dom.myListButton.classList.toggle("active", isMyListActive);

    let iconHtml: string = ICONS.STAR;
    let nextTitle = "Filtrar por Mi Lista";
    if (activeFilters.myList === 'rated') {
      iconHtml = ICONS.STAR;
      nextTitle = "Vistas / Puntuadas";
    } else if (activeFilters.myList === 'watchlist') {
      iconHtml = ICONS.WATCHLIST;
      nextTitle = "Pendientes de ver";
    } else if (activeFilters.myList === 'mixed') {
      iconHtml = ICONS.LIST;
      nextTitle = "Mi Lista (Combinado)";
    }
    dom.myListButton.innerHTML = iconHtml;
    dom.myListButton.title = nextTitle;
    dom.myListButton.setAttribute("aria-label", nextTitle);
  }
}

export function isPredefinedFilterItem(type: string, value: string): boolean {
  if (!value || !type) return false;
  const normVal = value.trim().toLowerCase();

  if (type === 'selection') {
    const items = FILTER_CONFIG.selection.items;
    const titles = FILTER_CONFIG.selection.titles;
    return Object.keys(items).some(k => k.toLowerCase() === normVal || items[k as keyof typeof items].toLowerCase() === normVal) ||
      (titles ? Object.keys(titles).some(k => k.toLowerCase() === normVal || titles[k as keyof typeof titles].toLowerCase() === normVal) : false);
  }

  if (type === 'studio') {
    const items = FILTER_CONFIG.studio.items;
    return Object.keys(items).some(k => k.toLowerCase() === normVal || items[k as keyof typeof items].toLowerCase() === normVal);
  }

  if (type === 'genre') {
    const items = FILTER_CONFIG.genre.items;
    return Object.keys(items).some(k => k.toLowerCase() === normVal || items[k as keyof typeof items].toLowerCase() === normVal);
  }

  if (type === 'country') {
    const items = FILTER_CONFIG.country.items;
    const isItem = Object.keys(items).some(k => k.toLowerCase() === normVal || items[k as keyof typeof items].toLowerCase() === normVal);
    const isGroup = Object.values(REGIONAL_GROUPS).some(r => r.value.toLowerCase() === normVal || r.label.toLowerCase() === normVal);
    return isItem || isGroup;
  }

  return false;
}

export function updatePillVisibility(): void {
  Object.keys(sectionContainers).forEach(type => {
    const cont = sectionContainers[type];
    if (!cont) return;
    const section = cont.closest('.collapsible-section');
    const isSectionOpen = section?.classList.contains(CSS_CLASSES.ACTIVE) ?? false;

    Array.from(cont.children).forEach(child => {
      const pill = child as HTMLElement;
      const filterType = pill.dataset.filterType || type;
      const filterVal = pill.dataset.filterValue || '';

      const isPredefined = isPredefinedFilterItem(filterType, filterVal);
      const shouldHide = isSectionOpen && isPredefined;

      pill.style.display = shouldHide ? 'none' : '';
    });
  });
}

let lastPillState: Record<string, string> = {};

// Pinta los filtros como etiquetas de colores ("píldoras")
function renderFilterPills(): void {
  const activeFilters = getActiveFilters();
  let pillIndex = 0;

  Object.keys(FILTER_CONFIG).forEach(type => {
    const cont = sectionContainers[type];
    if (!cont) return;

    const inc = activeFilters[type as keyof ActiveFilters];
    const exc = type === 'genre' ? (activeFilters.excludedGenres || []) : type === 'country' ? (activeFilters.excludedCountries || []) : [];
    const stateKey = `${type}-combined`;
    const currState = `${(inc as string) || ""}|${exc.join(",")}`;

    if (lastPillState[stateKey] === currState) {
      if (inc) pillIndex++;
      pillIndex += exc.length;
      return;
    }
    lastPillState[stateKey] = currState;

    const desired: Array<{ val: string; exc: boolean }> = [];
    if (inc && typeof inc === 'string') desired.push({ val: inc, exc: false });
    exc.forEach(v => desired.push({ val: v, exc: true }));

    const exist = Array.from(cont.children) as HTMLElement[];
    const kept = new Set<HTMLElement>();

    desired.forEach(item => {
      let pill = exist.find(p => p.dataset.filterValue === item.val && p.classList.contains("filter-pill--exclude") === item.exc);
      if (pill) {
        kept.add(pill);
        cont.appendChild(pill);
      } else {
        pill = createElement("div", { className: `filter-pill ${item.exc ? "filter-pill--exclude" : ""}`, dataset: { filterType: type, filterValue: item.val } });
        pill.style.setProperty("--pill-index", String(pillIndex));

        const config = FILTER_CONFIG[type as keyof typeof FILTER_CONFIG] as unknown as { items?: Record<string, string>; titles?: Record<string, string> } | undefined;
        let text = config?.items?.[item.val] || config?.items?.[item.val.toUpperCase()];
        if (!text && type === 'selection' && FILTER_CONFIG.selection.titles) {
          text = FILTER_CONFIG.selection.titles[item.val] || FILTER_CONFIG.selection.titles[item.val.toUpperCase()];
        }
        if (!text && type === 'country') {
          text = Object.values(REGIONAL_GROUPS).find(r => r.value === item.val)?.label;
        }

        const pillLabel = item.exc ? `(-) ${text || item.val}` : (text || item.val);
        pill.appendChild(createElement("span", { textContent: pillLabel }));
        pill.appendChild(createElement("span", { className: "remove-filter-btn", innerHTML: "×", attributes: { "aria-hidden": "true" } }));
        cont.appendChild(pill);
      }
      pillIndex++;
    });

    exist.forEach(p => { if (!kept.has(p)) p.remove(); });
  });

  updateAllFilterControls();
  updatePillVisibility();
}

// --- 4. ACCIONES (Clics en botones de filtros) ---

async function handleMyListToggle(): Promise<void> {
  const currentFilters = getActiveFilters();
  const current = currentFilters.myList;

  // Ciclo: Mis Puntuaciones -> Pendiente -> Mi lista -> Todas
  const cycle: Array<string | null> = ['rated', 'watchlist', 'mixed', null];
  const nextIndex = (cycle.indexOf(current) + 1) % cycle.length;
  const nextState = cycle[nextIndex];

  clearToast();
  triggerHapticFeedback('medium');
  if (dom.myListButton) triggerPopAnimation(dom.myListButton);

  // Resetear filtros pero mantener sort y mediaType
  resetFiltersState();
  setSort(currentFilters.sort);
  setMediaType(currentFilters.mediaType);

  if (nextState) {
    setFilter('myList', nextState);
    const messages: Record<string, string> = {
      rated: "Mostrando tus puntuaciones",
      watchlist: "Mostrando pendientes",
      mixed: "Mostrando toda tu lista"
    };
    showToast(messages[nextState], "info");
  } else {
    showToast("Regresando al catálogo completo", "info");
  }

  appEvents.emit("updateSidebarUI");
  appEvents.emit("uiActionTriggered");
  tryCloseMobileDrawer();
  await loadAndRenderMovies(1);
}

async function handleFilterChangeOptimistic(type: string, value: string | null, forceSet = false): Promise<void> {
  clearToast();
  const previousFilters = getActiveFilters();

  if (value && (type === 'actor' || type === 'director')) {
    notifyRemovedPersonIncompatibleFilters(previousFilters);
    const currentSort = previousFilters.sort;
    const currentMediaType = previousFilters.mediaType;

    resetFiltersState();
    setSort(currentSort);
    setMediaType(currentMediaType);
    setFilter(type, value, true);
    setFilter('myList', null);

    appEvents.emit("updateSidebarUI");

    const mainSearchInput = document.querySelector<HTMLInputElement>(SELECTORS.SEARCH_INPUT);
    if (mainSearchInput) mainSearchInput.value = "";

    renderFilterPills();
    appEvents.emit("uiActionTriggered");

    try {
      await loadAndRenderMovies(1);
    } catch (error: unknown) {
      if ((error as Error)?.name !== "AbortError") showToast("Error al cargar filmografía.", "error");
    }

    return;
  }

  if (value) {
    if (type === 'selection' && previousFilters.studio) setFilter('studio', null);
    else if (type === 'studio' && previousFilters.selection) setFilter('selection', null);
  }

  const isActivating = forceSet || previousFilters[type as keyof ActiveFilters] !== value;
  const newValue = isActivating ? value : null;

  if (newValue && type !== 'actor' && type !== 'director') {
    if (previousFilters.actor) setFilter('actor', null);
    if (previousFilters.director) setFilter('director', null);
  } else if (newValue && (type === 'actor' || type === 'director')) {
    notifyRemovedPersonIncompatibleFilters(previousFilters);
    updateTypeFilterUI(DEFAULTS.MEDIA_TYPE);
  }

  if (newValue) setFilter('myList', null);

  // Si activamos un filtro, limpiamos la búsqueda de texto
  if (newValue && previousFilters.searchTerm) {
    setSearchTerm("");
    const mainSearchInput = document.querySelector<HTMLInputElement>(SELECTORS.SEARCH_INPUT);
    if (mainSearchInput) mainSearchInput.value = "";
  }

  if (!setFilter(type, newValue)) {
    showToast(`Límite de ${CONFIG.MAX_ACTIVE_FILTERS} filtros alcanzado.`, "error");
    if (type === 'selection' && previousFilters.studio) setFilter('studio', previousFilters.studio);
    if (type === 'studio' && previousFilters.selection) setFilter('selection', previousFilters.selection);
    return;
  }

  renderFilterPills();
  const isYearFilter = type === 'year';
  const targetPage = isYearFilter ? getCurrentPage() : 1;

  try {
    await loadAndRenderMovies(targetPage, { isYearFilter });
  } catch (error: unknown) {
    if ((error as Error)?.name === "AbortError") return;
    if (import.meta.env.DEV) console.error("Fallo al aplicar filtro:", error);
    showToast(`No se pudo aplicar el filtro.`, "error");
    setFilter('selection', previousFilters.selection);
    setFilter('studio', previousFilters.studio);
    setFilter('actor', previousFilters.actor);
    setFilter('director', previousFilters.director);
    setFilter('excludedCountries', previousFilters.excludedCountries, true);
    setFilter('excludedGenres', previousFilters.excludedGenres, true);
    setFilter(type, previousFilters[type as keyof ActiveFilters]);
    renderFilterPills();
  }
}

async function handleToggleExcludedFilterOptimistic(type: string, value: string): Promise<void> {
  clearToast();
  const previousState = getActiveFilters();

  if (previousState.searchTerm) {
    setSearchTerm("");
    const mainSearchInput = document.querySelector<HTMLInputElement>(SELECTORS.SEARCH_INPUT);
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
    const config = FILTER_CONFIG[type as keyof typeof FILTER_CONFIG] as unknown as { items?: Record<string, string> } | undefined;
    const label = config?.items?.[value] || value;
    showToast(`Excluido: ${label}`, "info");
  }

  renderFilterPills();
  try {
    await loadAndRenderMovies(1);
  } catch (error: unknown) {
    if ((error as Error)?.name === "AbortError") return;
    showToast(`No se pudo aplicar el filtro de exclusión.`, "error");
    toggleExcludedFilter(type, value);
    setFilter("country", previousState.country);
    setFilter("genre", previousState.genre);
    renderFilterPills();
  }
}

function resetFilters(): void {
  clearToast();
  if (dom.playButton) triggerPopAnimation(dom.playButton);
  triggerHapticFeedback('medium');
  appEvents.emit("filtersReset");
  tryCloseMobileDrawer();
}

function hasCompactTriggeringFilters(): boolean {
  const filters = getActiveFilters();
  const defaultYearRange = `${CONFIG.YEAR_MIN}-${CONFIG.YEAR_MAX}`;
  const isYearActive = !!(filters.year && filters.year !== defaultYearRange);
  const totalCount = getActiveFilterCount();
  return (isYearActive ? totalCount - 1 : totalCount) > 0;
}

export function collapseAllSections(): void {
  dom.collapsibleSections.forEach((section) => {
    section.classList.remove(CSS_CLASSES.ACTIVE);
    section.classList.remove("is-ready");
    section.querySelector('.section-header')?.setAttribute('aria-expanded', 'false');
  });

  if (dom.sidebarInnerWrapper) {
    dom.sidebarInnerWrapper.classList.toggle("is-compact", hasCompactTriggeringFilters());
  }

  updatePillVisibility();
}

// =================================================================
//          5. LA LÍNEA DEL TIEMPO (Slider de años) ---
// =================================================================

function initYearSlider(): void {
  if (yearSliderInstance) {
    yearSliderInstance.destroy();
    yearSliderInstance = null;
  }

  if (!dom.yearSlider || !dom.yearStartInput || !dom.yearEndInput) return;
  const yearInputs = [dom.yearStartInput, dom.yearEndInput];

  const pivotYear = 2000;

  const currentFilters = getActiveFilters();
  let initialYears = (currentFilters.year || `${CONFIG.YEAR_MIN}-${CONFIG.YEAR_MAX}`).split("-").map(Number);
  if (initialYears.length === 1) initialYears = [initialYears[0], initialYears[0]];

  yearSliderInstance = new DualRangeSlider(dom.yearSlider, {
    min: CONFIG.YEAR_MIN,
    max: CONFIG.YEAR_MAX,
    pivotYear: pivotYear,
    start: initialYears,
  });

  const slider = yearSliderInstance;

  sidebarUnsubscribers.push(() => {
    if (yearSliderInstance === slider) {
      yearSliderInstance.destroy();
      yearSliderInstance = null;
    }
  });

  slider.on("update", (values, handle) => {
    if (yearInputs[handle]) {
      const yearVal = Number(values[handle]);
      yearInputs[handle]!.value = String(yearVal);
    }
  });

  const updateSliderFilter = (values: (string | number)[], handle: number, autoClose = true) => {
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

  sidebarUnsubscribers.push(() => {
    debouncedUpdate.cancel();
  });

  slider.on("set", (values, handle) => {
    triggerHapticFeedback("light");
    const h = Number(handle);
    if (h === 0) yearInteractionState.start = true;
    if (h === 1) yearInteractionState.end = true;
    debouncedUpdate(values, handle, true);
  });

  yearInputs.forEach((input, index) => {
    const onInputChange = (e: Event) => {
      const target = e.target as HTMLInputElement;
      const cleanVal = target.value.replace(/[^0-9]/g, "");
      const newValue = parseFloat(cleanVal);
      if (isNaN(newValue)) return;
      const currentValues = slider.get();

      const triggerUpdate = (vals: Array<string | number>) => {
        if (index === 0) yearInteractionState.start = true;
        if (index === 1) yearInteractionState.end = true;
        debouncedUpdate(vals, index, false);
      };

      if (currentValues[0] === currentValues[1]) {
        if (index === 0 && newValue > currentValues[0]) { slider.set([newValue, newValue], false); triggerUpdate([newValue, newValue]); return; }
        if (index === 1 && newValue < currentValues[1]) { slider.set([newValue, newValue], false); triggerUpdate([newValue, newValue]); return; }
      }
      const values: Array<number | null> = [null, null];
      values[index] = newValue;
      slider.set(values, false);
      triggerUpdate(slider.get());
    };

    input.addEventListener("change", onInputChange);
    sidebarUnsubscribers.push(() => input.removeEventListener("change", onInputChange));
  });

  sidebarUnsubscribers.push(
    appEvents.on("updateSidebarUI", () => {
      debouncedUpdate.cancel();
      const currentFilters = getActiveFilters();
      const years = parseYearRangeRaw(currentFilters.year);
      slider.set(years, false);
    })
  );
}



function setupYearInputSteppers(): void {
  document.querySelectorAll(".year-input-wrapper").forEach((wrapper) => {
    const input = wrapper.querySelector(".year-input") as HTMLInputElement | null;
    const stepperUp = wrapper.querySelector(".stepper-btn.stepper-up") as HTMLButtonElement | null;
    const stepperDown = wrapper.querySelector(".stepper-btn.stepper-down") as HTMLButtonElement | null;
    if (!input || !stepperUp || !stepperDown) return;

    const updateYearValue = (increment: number) => {
      triggerHapticFeedback('medium');
      const cleanVal = input.value.replace(/[^0-9]/g, "");
      let currentValue = parseInt(cleanVal, 10);
      if (isNaN(currentValue)) currentValue = increment > 0 ? CONFIG.YEAR_MIN : CONFIG.YEAR_MAX;
      const newValue = Math.min(Math.max(currentValue + increment, CONFIG.YEAR_MIN), CONFIG.YEAR_MAX);
      input.value = String(newValue);
      input.dispatchEvent(new Event("change", { bubbles: true }));
    };
    const handleUp = () => updateYearValue(1);
    const handleDown = () => updateYearValue(-1);
    stepperUp.addEventListener("click", handleUp);
    stepperDown.addEventListener("click", handleDown);
    sidebarUnsubscribers.push(() => {
      stepperUp.removeEventListener("click", handleUp);
      stepperDown.removeEventListener("click", handleDown);
    });
  });
}

const suggestionFetchers: Record<string, (term: string) => Promise<string[]>> = {
  genre: fetchGenreSuggestions,
  director: fetchDirectorSuggestions,
  actor: fetchActorSuggestions,
  country: fetchCountrySuggestions
};

const sanitizeSearchTerm = (term: string) => term.replace(/%/g, '\\%').replace(/_/g, '\\_');

function setupAutocompleteHandlers(): void {
  dom.sidebarFilterForms.forEach((form) => {
    const input = form.querySelector<HTMLInputElement>(SELECTORS.SIDEBAR_FILTER_INPUT);
    const filterType = form.dataset.filterType;
    if (!filterType) return;
    const fetcher = suggestionFetchers[filterType];
    if (!input || !fetcher) return;

    input.setAttribute("role", "combobox");
    input.setAttribute("aria-autocomplete", "list");
    input.setAttribute("aria-expanded", "false");

    const handleSubmit = (e: Event) => {
      e.preventDefault();
      const resultsContainer = form.querySelector<HTMLElement>(SELECTORS.SIDEBAR_AUTOCOMPLETE_RESULTS);
      if (resultsContainer && resultsContainer.children.length > 0) {
        const items = Array.from(resultsContainer.children) as HTMLElement[];
        const activeItem = items.find(i => i.classList.contains('is-active')) || items[0];
        if (activeItem) activeItem.click();
      }
    };

    form.addEventListener("submit", handleSubmit);

    const debouncedFetch = debounce(async () => {
      const rawTerm = input.value.trim();
      if (rawTerm.length < 3) { clearAllSidebarAutocomplete(); return; }

      const apiTerm = sanitizeSearchTerm(rawTerm);
      const suggestions = await fetcher(apiTerm);
      renderSidebarAutocomplete(form, suggestions, rawTerm);
    }, CONFIG.SEARCH_DEBOUNCE_DELAY);

    input.addEventListener("input", debouncedFetch);

    const handleKeydown = (e: KeyboardEvent) => {
      if (e.key === "Enter") e.preventDefault();

      const resultsContainer = form.querySelector<HTMLElement>(SELECTORS.SIDEBAR_AUTOCOMPLETE_RESULTS);
      if (!resultsContainer || resultsContainer.children.length === 0) return;

      const items = resultsContainer.children as HTMLCollectionOf<HTMLElement>;
      let activeIndex = -1;
      for (let i = 0; i < items.length; i++) {
        if (items[i].classList.contains('is-active')) { activeIndex = i; break; }
      }

      const updateActiveSuggestion = (index: number) => {
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
        case "ArrowDown":
          e.preventDefault();
          activeIndex = activeIndex < items.length - 1 ? activeIndex + 1 : -1;
          updateActiveSuggestion(activeIndex);
          break;
        case "ArrowUp":
          e.preventDefault();
          activeIndex = activeIndex > -1 ? activeIndex - 1 : items.length - 1;
          updateActiveSuggestion(activeIndex);
          break;
        case "Enter":
          if (activeIndex >= 0 && items[activeIndex]) {
            items[activeIndex].click();
          } else if (items.length > 0) {
            items[0].click();
          }
          break;
        case "Escape":
          e.preventDefault();
          clearAllSidebarAutocomplete();
          break;
      }
    };

    input.addEventListener("keydown", handleKeydown);

    const handleFormClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      const suggestionItem = target.closest<HTMLElement>(`.${CSS_CLASSES.SIDEBAR_AUTOCOMPLETE_ITEM}`);
      if (suggestionItem) {
        triggerHapticFeedback('light');
        handleFilterChangeOptimistic(filterType, suggestionItem.dataset.value || null);
        input.value = "";
        clearAllSidebarAutocomplete();
        tryCloseMobileDrawer();
      }
    };

    form.addEventListener("click", handleFormClick);

    sidebarUnsubscribers.push(() => {
      form.removeEventListener("submit", handleSubmit);
      input.removeEventListener("input", debouncedFetch);
      input.removeEventListener("keydown", handleKeydown);
      form.removeEventListener("click", handleFormClick);
      debouncedFetch.cancel();
    });
  });
}

function handlePillClick(e: MouseEvent): boolean {
  const target = e.target as HTMLElement;
  const pill = target.closest<HTMLElement>(".filter-pill");
  if (!pill) return false;

  triggerHapticFeedback('medium');
  const { filterType, filterValue } = pill.dataset;
  if (!filterType || !filterValue) return false;
  pill.classList.add("is-removing");

  pill.addEventListener("animationend", () => {
    if (pill.classList.contains("filter-pill--exclude")) {
      handleToggleExcludedFilterOptimistic(filterType, filterValue);
    } else {
      handleFilterChangeOptimistic(filterType, null);
    }
  }, { once: true });

  return true;
}

function setupEventListeners(): void {
  document.querySelectorAll<HTMLElement>(".collapsible-section .section-header").forEach((header) => {
    const iconWrapper = document.createElement('div');
    iconWrapper.innerHTML = ICONS.CHEVRON_RIGHT;
    if (iconWrapper.firstChild) header.appendChild(iconWrapper.firstChild);
  });

  const staticFilters = document.querySelector<HTMLElement>(".sidebar-static-filters");
  if (staticFilters) {
    const handleStaticClick = (e: MouseEvent) => {
      if (handlePillClick(e)) {
        tryCloseMobileDrawer();
      }
    };
    staticFilters.addEventListener("click", handleStaticClick);
    sidebarUnsubscribers.push(() => staticFilters.removeEventListener("click", handleStaticClick));
  }

  if (dom.rewindButton) {
    const handleRewind = () => {
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
    };
    dom.rewindButton.addEventListener("click", handleRewind);
    sidebarUnsubscribers.push(() => dom.rewindButton?.removeEventListener("click", handleRewind));
  }

  if (dom.sidebarOverlay) {
    dom.sidebarOverlay.addEventListener("click", closeMobileDrawer);
    sidebarUnsubscribers.push(() => dom.sidebarOverlay?.removeEventListener("click", closeMobileDrawer));
  }

  if (dom.toggleRotationBtn) {
    const handleRotationClick = () => {
      toggleRotationMode();
      tryCloseMobileDrawer();
    };
    dom.toggleRotationBtn.addEventListener("click", handleRotationClick);
    sidebarUnsubscribers.push(() => dom.toggleRotationBtn?.removeEventListener("click", handleRotationClick));
  }

  if (dom.sidebarScrollable) {
    const handleScrollableKeydown = (e: KeyboardEvent) => {
      if (e.key === "Enter" || e.key === " ") {
        const target = e.target as HTMLElement;
        if (target.tagName === "BUTTON") return;
        const link = target.closest<HTMLElement>(".filter-link");
        if (link) {
          e.preventDefault();
          link.click();
        }
      }
    };

    const handleScrollableClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      const excludeBtn = target.closest<HTMLElement>(".exclude-filter-btn");
      if (excludeBtn) {
        e.stopPropagation();
        triggerHapticFeedback('medium');
        triggerPopAnimation(excludeBtn);
        const type = excludeBtn.dataset.type || "";
        const value = excludeBtn.dataset.value || "";
        handleToggleExcludedFilterOptimistic(type, value);
        tryCloseMobileDrawer();
        return;
      }

      if (handlePillClick(e)) {
        tryCloseMobileDrawer();
        return;
      }

      const link = target.closest<HTMLElement>(".filter-link");
      if (link && !link.hasAttribute("disabled")) {
        triggerHapticFeedback('light');
        triggerPopAnimation(link);
        const type = link.dataset.filterType || "";
        const value = link.dataset.filterValue || "";
        if (link.classList.contains("is-excluded")) {
          handleToggleExcludedFilterOptimistic(type, value);
        } else {
          handleFilterChangeOptimistic(type, value);
        }
        tryCloseMobileDrawer();
      }
    };

    dom.sidebarScrollable.addEventListener("keydown", handleScrollableKeydown);
    dom.sidebarScrollable.addEventListener("click", handleScrollableClick);
    sidebarUnsubscribers.push(() => {
      dom.sidebarScrollable?.removeEventListener("keydown", handleScrollableKeydown);
      dom.sidebarScrollable?.removeEventListener("click", handleScrollableClick);
    });
  }

  if (dom.playButton) {
    dom.playButton.addEventListener("click", resetFilters);
    sidebarUnsubscribers.push(() => dom.playButton?.removeEventListener("click", resetFilters));
  }

  if (dom.myListButton) {
    dom.myListButton.addEventListener("click", handleMyListToggle);
    sidebarUnsubscribers.push(() => dom.myListButton?.removeEventListener("click", handleMyListToggle));
  }

  dom.collapsibleSections.forEach((clickedSection) => {
    const header = clickedSection.querySelector<HTMLElement>(".section-header");
    if (!header) return;

    const handleHeaderClick = () => {
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
      header.setAttribute('aria-expanded', String(isNowActive));
      dom.sidebarInnerWrapper?.classList.toggle("is-compact", isNowActive || hasCompactTriggeringFilters());

      updatePillVisibility();

      if (isNowActive) {
        const gen = sidebarLifecycleGen;
        const timeoutId = setTimeout(() => {

          if (gen !== sidebarLifecycleGen) return;
          if (clickedSection.classList.contains(CSS_CLASSES.ACTIVE)) {
            clickedSection.classList.add("is-ready");

            const nextSection = clickedSection.nextElementSibling as HTMLElement | null;
            const nextHeader = nextSection?.querySelector<HTMLElement>('.section-header');
            const inputField = clickedSection.querySelector<HTMLElement>('.sidebar-filter-input');
            const profileContainer = document.getElementById('user-profile-container');

            if (isMobileLayout() && profileContainer) {
              profileContainer.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            } else if (nextHeader) {
              nextHeader.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            } else if (inputField) {
              inputField.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            } else if (header) {
              header.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            }

            if (inputField && !isMobileLayout()) {
              inputField.focus({ preventScroll: true });
            }
          }
        }, 300);
        sidebarTimeouts.push(timeoutId);
      }
    };

    header.addEventListener("click", handleHeaderClick);
    sidebarUnsubscribers.push(() => header.removeEventListener("click", handleHeaderClick));
  });
}


// =================================================================
//          ARRANQUE DEL COMPONENTE
// =================================================================

export function initSidebar(): void {
  if (isSidebarInitialized) return;
  isSidebarInitialized = true;

  if (sidebarAbortController) {
    sidebarAbortController.abort();
  }
  sidebarAbortController = new AbortController();

  if (isMobileLayout()) {
    setSidebarState(false);
  } else if (window.innerWidth <= 1024 && window.innerHeight > MOBILE_HEIGHT_LIMIT) {
    document.body.classList.add(CSS_CLASSES.SIDEBAR_COLLAPSED);
    setSidebarState(false);
  } else {
    syncSidebarResponsiveState();
  }

  const populateFilterSection = (filterType: string) => {
    const config = FILTER_CONFIG[filterType as keyof typeof FILTER_CONFIG];
    if (!config) return;
    const contentId = filterType === 'country' ? 'countries-content' : `${filterType}s-content`;
    const listContainer = document.querySelector(`#${contentId} > div:first-child`);
    if (!listContainer) return;

    const collapsibleSection = listContainer.closest('.collapsible-section');
    const pillsContainer = collapsibleSection?.querySelector('.active-filters-list') as HTMLElement | null;
    if (pillsContainer) sectionContainers[filterType] = pillsContainer;

    listContainer.textContent = "";
    const fragment = document.createDocumentFragment();

    Object.entries(config.items).forEach(([value, text]) => {
      const link = createElement("div", {
        className: "filter-link",
        dataset: { filterType, filterValue: value },
        attributes: { role: "button", tabindex: "0" }
      });

      const iconData: StudioInfo | SelectionInfo | null = (filterType === 'studio' ? STUDIO_DATA[value] : null) ||
        (filterType === 'selection' ? SELECTION_DATA[value] : null);

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
          svg.setAttribute("width", String(iconData.w || "24"));
          svg.setAttribute("height", String(iconData.h || "24"));
          svg.setAttribute("viewBox", iconData.vb || "0 0 24 24");
          svg.setAttribute("class", `sidebar-platform-icon ${iconData.class || ''}`);
          svg.setAttribute("fill", "currentColor");
          svg.innerHTML = `<use href="#${iconData.id}"></use>`;
          link.appendChild(svg);
        }

        link.appendChild(createElement("span", { className: "sr-only", textContent: text }));
      } else {
        const textWrapper = createElement("span", { textContent: text });
        link.appendChild(textWrapper);
      }

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

  const currentSignal = sidebarAbortController.signal;
  const currentFilterGen = sidebarLifecycleGen;
  const updateDynamicFilters = async () => {
    try {
      if (currentFilterGen !== sidebarLifecycleGen || currentSignal.aborted) return;
      const [actors, directors] = await Promise.all([
        fetchRandomTopActors(),
        fetchRandomTopDirectors()
      ]);
      if (currentFilterGen !== sidebarLifecycleGen || currentSignal.aborted) return;

      if (actors && actors.length > 0) {
        FILTER_CONFIG.actor.items = actors.reduce((acc, name) => ({ ...acc, [name]: name }), {});
        populateFilterSection('actor');
      }

      if (directors && directors.length > 0) {
        FILTER_CONFIG.director.items = directors.reduce((acc, name) => ({ ...acc, [name]: name }), {});
        populateFilterSection('director');
      }
    } catch (e) { }
  };

  sidebarUnsubscribers.push(
    runWhenIdle(updateDynamicFilters, 500)
  );




  if (dom.toggleRotationBtn) {
    const isRotationDisabled = document.body.classList.contains(CSS_CLASSES.ROTATION_DISABLED);
    dom.toggleRotationBtn.innerHTML = isRotationDisabled ? ICONS.SQUARE_STOP : ICONS.PAUSE;
    dom.toggleRotationBtn.setAttribute("aria-label", isRotationDisabled ? "Activar rotación de tarjetas" : "Pausar rotación de tarjetas");
    dom.toggleRotationBtn.title = isRotationDisabled ? "Giro automático" : "Vista Rápida";
    dom.toggleRotationBtn.setAttribute("aria-pressed", String(isRotationDisabled));
  }

  initYearSlider();
  initTouchGestures();

  setupEventListeners();
  initPinchGestures();
  setupAutocompleteHandlers();
  setupYearInputSteppers();

  sidebarUnsubscribers.push(
    appEvents.on("updateSidebarUI", () => {
      dom.sidebarFilterForms.forEach((form) => {
        const input = form.querySelector<HTMLInputElement>(SELECTORS.SIDEBAR_FILTER_INPUT);
        if (input) input.value = "";
      });

      requestAnimationFrame(() => {
        renderFilterPills();
      });
    }),

    appEvents.on("filtersReset", collapseAllSections),
    appEvents.on("uiActionTriggered", collapseAllSections)
  );

  renderFilterPills();


  if (hasCompactTriggeringFilters() && dom.sidebarInnerWrapper) {
    dom.sidebarInnerWrapper.classList.add("is-compact");
  }
}
