import { CONFIG, ICONS, CSS_CLASSES, SELECTORS, FILTER_CONFIG, REGIONAL_GROUPS, DEFAULTS } from "../../constants.js";
import { debounce, triggerPopAnimation, createElement, triggerHapticFeedback, highlightAccentInsensitive, normalizeText } from "../../utils.js";
import { fetchDirectorSuggestions, fetchActorSuggestions, fetchCountrySuggestions, fetchGenreSuggestions } from "../../api.js";
import { getActiveFilters, setFilter, toggleExcludedFilter, getActiveFilterCount, resetFiltersState, setSort, setMediaType, getCurrentPage, setSearchTerm, appEvents } from "../../state.js";
import { showToast, clearToast, clearAllSidebarAutocomplete, notifyRemovedPersonIncompatibleFilters, updateTypeFilterUI } from "../../ui.js";
import { loadAndRenderMovies } from "../../main.js";
import { ActiveFilters, MovieCardElement } from "../../types.js";
import { dom, sectionContainers, isMobileLayout, sidebarUnsubscribers } from "./context.js";
import { tryCloseMobileDrawer } from "./gestures.js";

// =================================================================
//          EL BUSCADOR INTERNO (Autocompletar)
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
    formElement.closest(".section-content")?.classList.remove("is-searching");
    return;
  }

  formElement.closest(".section-content")?.classList.add("is-searching");

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

// Actualiza el estado visual de los controles de filtro (activo / excluido)
export function updateAllFilterControls(): void {
  const activeFilters = getActiveFilters();

  const excludedGenresSet = new Set(activeFilters.excludedGenres || []);
  const excludedCountriesSet = new Set(activeFilters.excludedCountries || []);

  const normActiveFilters: Record<string, string> = {};
  for (const k in activeFilters) {
    const val = activeFilters[k as keyof ActiveFilters];
    if (!val || Array.isArray(val)) continue;
    normActiveFilters[k] = normalizeText(val as string);
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
      normValue = normalizeText(value);
      link._normValue = normValue;
    }

    const isActive = normActiveFilters[type] === normValue;

    let shouldHide = isActive || isExcluded;
    if (type === 'studio' || type === 'genre' || type === 'country' || type === 'selection' || type === 'director' || type === 'actor') {
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

function isPredefinedFilterItem(type: string, value: string): boolean {
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

  if (type === 'director') {
    const items = FILTER_CONFIG.director?.items || {};
    return Object.keys(items).some(k => k.toLowerCase() === normVal || items[k as keyof typeof items].toLowerCase() === normVal);
  }

  if (type === 'actor') {
    const items = FILTER_CONFIG.actor?.items || {};
    return Object.keys(items).some(k => k.toLowerCase() === normVal || items[k as keyof typeof items].toLowerCase() === normVal);
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
export function renderFilterPills(): void {
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

// --- ACCIONES (Clics en botones de filtros) ---

export async function handleMyListToggle(): Promise<void> {
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

export function clearActiveSearchTerm(): void {
  setSearchTerm("");
  const mainSearchInput = document.querySelector<HTMLInputElement>(SELECTORS.SEARCH_INPUT);
  if (mainSearchInput) mainSearchInput.value = "";
}

export async function handleFilterChangeOptimistic(type: string, value: string | null, forceSet = false): Promise<void> {
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

    clearActiveSearchTerm();

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
    clearActiveSearchTerm();
  }

  setFilter(type, newValue);

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

export async function handleToggleExcludedFilterOptimistic(type: string, value: string): Promise<void> {
  clearToast();
  const previousState = getActiveFilters();

  if (previousState.searchTerm) {
    clearActiveSearchTerm();
  }

  if (!toggleExcludedFilter(type, value)) return;

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

export function resetFilters(): void {
  clearToast();
  triggerHapticFeedback('medium');
  appEvents.emit("filtersReset");
  tryCloseMobileDrawer();
}

export async function handleRandomMovieRecommendation(): Promise<void> {
  clearToast();
  if (dom.playButton) triggerPopAnimation(dom.playButton);
  triggerHapticFeedback('medium');

  const grid = document.getElementById("grid-container");
  if (!grid) return;

  const cards = Array.from(
    grid.querySelectorAll<MovieCardElement>(
      `.${CSS_CLASSES.MOVIE_CARD}:not(.person-card):not(.collection-card):not(.studio-card)`
    )
  );

  if (cards.length === 0) {
    showToast("No hay películas disponibles en la vista actual.", "info");
    return;
  }

  const randomIndex = Math.floor(Math.random() * cards.length);
  const targetCard = cards[randomIndex];
  const movieTitle = (targetCard.movieData as { title?: string } | undefined)?.title;

  if (movieTitle) {
    showToast(`🎲 El oráculo ha elegido: ${movieTitle}`, "info");
  }

  tryCloseMobileDrawer();

  const { openModal, initQuickView } = await import("../modal.js");
  initQuickView();
  openModal(targetCard, cards);
}

export function hasCompactTriggeringFilters(): boolean {
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

const suggestionFetchers: Record<string, (term: string) => Promise<string[]>> = {
  genre: fetchGenreSuggestions,
  director: fetchDirectorSuggestions,
  actor: fetchActorSuggestions,
  country: fetchCountrySuggestions
};

const sanitizeSearchTerm = (term: string) => term.replace(/%/g, '\\%').replace(/_/g, '\\_');

export function setupAutocompleteHandlers(): void {
  dom.sidebarFilterForms.forEach((form) => {
    const input = form.querySelector<HTMLInputElement>(SELECTORS.SIDEBAR_FILTER_INPUT);
    const filterType = form.dataset.filterType;
    if (!filterType) return;
    const fetcher = suggestionFetchers[filterType];
    if (!input || !fetcher) return;

    input.setAttribute("role", "combobox");
    input.setAttribute("aria-autocomplete", "list");
    input.setAttribute("aria-expanded", "false");

    let isSubmitting = false;

    const clearBtn = form.querySelector<HTMLButtonElement>(".sidebar-input-clear");
    const syncClearState = () => {
      const hasVal = input.value.trim().length > 0;
      form.classList.toggle("has-value", hasVal);
      if (!hasVal) {
        form.closest(".section-content")?.classList.remove("is-searching");
      }
    };

    const handleClearPointerDown = (e: Event) => {
      e.preventDefault();
      e.stopPropagation();
      input.value = "";
      syncClearState();
      clearAllSidebarAutocomplete();
      input.focus();
    };

    if (clearBtn) {
      clearBtn.addEventListener("pointerdown", handleClearPointerDown);
    }

    const selectCandidate = async () => {
      if (isSubmitting) return;
      const rawTerm = input.value.trim();
      const resultsContainer = form.querySelector<HTMLElement>(SELECTORS.SIDEBAR_AUTOCOMPLETE_RESULTS);
      const hasRenderedItems = !!(resultsContainer && resultsContainer.children.length > 0);

      if (!rawTerm && !hasRenderedItems) return;

      isSubmitting = true;
      debouncedFetch.cancel();

      try {
        if (hasRenderedItems) {
          const items = Array.from(resultsContainer!.children) as HTMLElement[];
          const activeItem = items.find(i => i.classList.contains('is-active')) || items[0];
          if (activeItem) {
            activeItem.click();
            return;
          }
        }

        input.blur();
        if (rawTerm.length < 2) return;

        const apiTerm = sanitizeSearchTerm(rawTerm);
        let selectedValue = rawTerm;

        try {
          const suggestions = await fetcher(apiTerm);
          if (suggestions && suggestions.length > 0) {
            const normalizedRaw = normalizeText(rawTerm).toLowerCase();
            const exactMatch = suggestions.find(s => normalizeText(s).toLowerCase() === normalizedRaw);
            selectedValue = exactMatch || suggestions[0];
          }
        } catch {
          selectedValue = rawTerm;
        }

        triggerHapticFeedback('light');
        handleFilterChangeOptimistic(filterType, selectedValue);
        input.value = "";
        syncClearState();
        clearAllSidebarAutocomplete();
        tryCloseMobileDrawer();
      } finally {
        isSubmitting = false;
      }
    };

    const handleSubmit = (e: Event) => {
      e.preventDefault();
      selectCandidate();
    };

    form.addEventListener("submit", handleSubmit);

    const debouncedFetch = debounce(async () => {
      const rawTerm = input.value.trim();
      if (rawTerm.length < 3) { clearAllSidebarAutocomplete(); return; }

      const apiTerm = sanitizeSearchTerm(rawTerm);
      const suggestions = await fetcher(apiTerm);
      if (input.value.trim() !== rawTerm) return;
      renderSidebarAutocomplete(form, suggestions, rawTerm);
    }, CONFIG.SEARCH_DEBOUNCE_DELAY);

    const handleInput = () => {
      syncClearState();
      debouncedFetch();
    };

    input.addEventListener("input", handleInput);

    const handleKeydown = (e: KeyboardEvent) => {
      if (e.key === "Enter") {
        e.preventDefault();
        selectCandidate();
        return;
      }

      if (e.key === "Escape") {
        e.preventDefault();
        clearAllSidebarAutocomplete();
        return;
      }

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
        syncClearState();
        clearAllSidebarAutocomplete();
        tryCloseMobileDrawer();
      }
    };

    form.addEventListener("click", handleFormClick);

    sidebarUnsubscribers.push(() => {
      form.removeEventListener("submit", handleSubmit);
      input.removeEventListener("input", handleInput);
      input.removeEventListener("keydown", handleKeydown);
      form.removeEventListener("click", handleFormClick);
      if (clearBtn) clearBtn.removeEventListener("pointerdown", handleClearPointerDown);
      debouncedFetch.cancel();
    });
  });
}

export function handlePillClick(e: MouseEvent): boolean {
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
