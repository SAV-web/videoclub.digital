import { SELECTORS, CSS_CLASSES } from "../../constants.js";

export const MOBILE_BREAKPOINT = 768;
export const MOBILE_HEIGHT_LIMIT = 500;

export const dom = {
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

export const sectionContainers: Record<string, HTMLElement> = {};

export function getEffectiveViewportDimensions(): { width: number; height: number } {
  if (typeof window === "undefined") {
    return { width: 1024, height: 768 };
  }

  let isLandscape: boolean | null = null;

  if (typeof screen !== "undefined" && screen?.orientation?.type) {
    isLandscape = screen.orientation.type.startsWith("landscape");
  } else if (typeof window.orientation === "number") {
    isLandscape = Math.abs(window.orientation) === 90;
  } else if (typeof window.matchMedia === "function") {
    isLandscape = window.matchMedia("(orientation: landscape)").matches;
  }

  const w = window.innerWidth;
  const h = window.innerHeight;

  if (isLandscape !== null && w && h) {
    if (isLandscape && w < h) {
      // Dimensiones desactualizadas durante rotación a horizontal (landscape) en WebKit
      return { width: Math.max(w, h), height: Math.min(w, h) };
    }
    if (!isLandscape && w > h) {
      // Dimensiones desactualizadas durante rotación a vertical (portrait) en WebKit
      return { width: Math.min(w, h), height: Math.max(w, h) };
    }
  }

  return { width: w, height: h };
}

export const isMobileLayout = (): boolean => {
  const { width, height } = getEffectiveViewportDimensions();
  return width <= MOBILE_BREAKPOINT || height <= MOBILE_HEIGHT_LIMIT;
};

export function isSidebarCollapsed(): boolean {
  if (typeof document === "undefined") return false;
  return (
    document.documentElement.classList.contains(CSS_CLASSES.SIDEBAR_COLLAPSED) ||
    document.body.classList.contains(CSS_CLASSES.SIDEBAR_COLLAPSED)
  );
}

export function setSidebarCollapsed(collapsed: boolean): void {
  if (typeof document === "undefined") return;
  document.documentElement.classList.toggle(CSS_CLASSES.SIDEBAR_COLLAPSED, collapsed);
  document.body.classList.toggle(CSS_CLASSES.SIDEBAR_COLLAPSED, collapsed);
}

// --- Registro de ciclo de vida compartido ---
// Los arrays se exportan como const y se vacían con .length = 0 
// (nunca se reasignan) para que puedan mutarse con .push() desde 
// cualquier módulo consumidor sin restricciones de ESM.
export const sidebarUnsubscribers: Array<() => void> = [];
export const sidebarTimeouts: Array<ReturnType<typeof setTimeout>> = [];

let sidebarAbortController: AbortController | null = null;
let sidebarLifecycleGen = 0;
let isSidebarInitializedFlag = false;

export function isInitialized(): boolean {
  return isSidebarInitializedFlag;
}

export function setInitialized(value: boolean): void {
  isSidebarInitializedFlag = value;
}

export function bumpGeneration(): void {
  sidebarLifecycleGen++;
}

export function getGeneration(): number {
  return sidebarLifecycleGen;
}

// Aborta el controller vigente (si existe) y lo deja en null.
// Reemplaza el bloque de disposeSidebarEvents que hacía esto inline.
export function abortAndClear(): void {
  if (sidebarAbortController) {
    sidebarAbortController.abort();
    sidebarAbortController = null;
  }
}

// Aborta el controller anterior (si existe) y crea uno nuevo, 
// devolviéndolo para que el llamador guarde una referencia local 
// (por ejemplo para leer .signal más adelante en la misma función).
export function renewAbortController(): AbortController {
  if (sidebarAbortController) {
    sidebarAbortController.abort();
  }
  sidebarAbortController = new AbortController();
  return sidebarAbortController;
}
