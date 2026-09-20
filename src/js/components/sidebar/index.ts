/// <reference types="vite/client" />

// =================================================================
//                 LA CAJONERA (Menú Lateral y Filtros)
// =================================================================
// Orquestador del menú lateral: inicialización, binding de eventos
// del DOM y ciclo de vida de los subsistemas del sidebar.
// =================================================================

import { CONFIG, ICONS, CSS_CLASSES, SELECTORS, FILTER_CONFIG, STUDIO_DATA, SELECTION_DATA, REGIONAL_GROUPS, StudioInfo, SelectionInfo } from "../../constants.js";
import { createElement, triggerHapticFeedback, triggerPopAnimation, runWhenIdle } from "../../utils.js";
import { fetchRandomTopActors, fetchRandomTopDirectors } from "../../api.js";
import { appEvents } from "../../state.js";

import {
  dom, sectionContainers, isMobileLayout, MOBILE_HEIGHT_LIMIT,
  sidebarUnsubscribers, sidebarTimeouts,
  isInitialized, setInitialized,
  bumpGeneration, getGeneration,
  abortAndClear, renewAbortController
} from "./context.js";

import {
  setSidebarState,
  syncSidebarResponsiveState, initTouchGestures, initPinchGestures,
  toggleRotationMode, openMobileDrawer, closeMobileDrawer,
  tryCloseMobileDrawer
} from "./gestures.js";

import {
  initYearSlider, setupYearInputSteppers, destroyYearSlider
} from "./yearFilter.js";

import {
  handleFilterChangeOptimistic,
  handleToggleExcludedFilterOptimistic,
  handleMyListToggle,
  resetFilters,
  handleRandomMovieRecommendation,
  hasCompactTriggeringFilters,
  collapseAllSections,
  renderFilterPills,
  updatePillVisibility,
  setupAutocompleteHandlers,
  handlePillClick
} from "./filters.js";

export { openMobileDrawer, closeMobileDrawer } from "./gestures.js";
export { collapseAllSections } from "./filters.js";

export function disposeSidebarEvents(): void {
  bumpGeneration();
  abortAndClear();
  destroyYearSlider();
  sidebarTimeouts.forEach(t => clearTimeout(t));
  sidebarTimeouts.length = 0;
  sidebarUnsubscribers.forEach(unsub => unsub());
  sidebarUnsubscribers.length = 0;
  setInitialized(false);
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

  const brandLink = dom.sidebar?.querySelector<HTMLAnchorElement>(".brand-link");
  if (brandLink) {
    const handleBrandClick = (e: MouseEvent) => {
      if (e.ctrlKey || e.metaKey || e.shiftKey || e.button === 1) return;
      e.preventDefault();
      resetFilters();
    };
    brandLink.addEventListener("click", handleBrandClick);
    sidebarUnsubscribers.push(() => brandLink.removeEventListener("click", handleBrandClick));
  }

  if (dom.playButton) {
    dom.playButton.addEventListener("click", handleRandomMovieRecommendation);
    sidebarUnsubscribers.push(() => dom.playButton?.removeEventListener("click", handleRandomMovieRecommendation));
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
        const gen = getGeneration();
        const timeoutId = setTimeout(() => {

          if (gen !== getGeneration()) return;
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
  if (isInitialized()) return;
  setInitialized(true);

  const sidebarLifecycleController = renewAbortController();

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

  const currentSignal = sidebarLifecycleController.signal;
  const currentFilterGen = getGeneration();
  const updateDynamicFilters = async () => {
    try {
      if (currentFilterGen !== getGeneration() || currentSignal.aborted) return;
      const [actors, directors] = await Promise.all([
        fetchRandomTopActors(),
        fetchRandomTopDirectors()
      ]);
      if (currentFilterGen !== getGeneration() || currentSignal.aborted) return;

      if (actors && actors.length > 0) {
        FILTER_CONFIG.actor.items = actors.reduce((acc, name) => ({ ...acc, [name]: name }), {});
        populateFilterSection('actor');
      }

      if (directors && directors.length > 0) {
        FILTER_CONFIG.director.items = directors.reduce((acc, name) => ({ ...acc, [name]: name }), {});
        populateFilterSection('director');
      }
    } catch (e) {
      if (import.meta.env.DEV) console.error("Error cargando filtros dinámicos:", e);
    }
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
    appEvents.on("sidebar:requestCloseDrawer", () => {
      closeMobileDrawer();
    }),
    appEvents.on("sidebar:applyYearFilter", ({ value }) => {
      handleFilterChangeOptimistic("year", value, true);
    }),
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
