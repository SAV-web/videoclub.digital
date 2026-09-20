import { CONFIG, CSS_CLASSES, ICONS } from "../../constants.js";
import { debounce, triggerHapticFeedback, triggerPopAnimation, executeViewTransition, LocalStore } from "../../utils.js";
import { getCurrentPage, appEvents } from "../../state.js";
import { unflipAllCards } from "../card.js";
import { closeModal } from "../modal.js";
import { lockGlobalInteractions, areInteractionsLocked } from "../../ui.js";
import { loadAndRenderMovies } from "../../main.js";
import { dom, isMobileLayout, sidebarUnsubscribers } from "./context.js";

declare module "../../state.js" {
  interface AppEventPayloads {
    'sidebar:drawerOpened': undefined;
    'sidebar:drawerClosed': undefined;
  }
}

// --- Constantes Locales de Gestos ---
const SWIPE_VELOCITY_THRESHOLD = 0.4;
let DRAWER_WIDTH = 300;

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
export function setSidebarState(isOpen: boolean): void {
  if (isMobileLayout() && dom.sidebar) {
    document.body.classList.toggle(CSS_CLASSES.SIDEBAR_OPEN, isOpen);
    dom.sidebar.style.transform = '';
    touchState.currentTranslate = isOpen ? 0 : -DRAWER_WIDTH;

    if (isOpen) {
      appEvents.emit("sidebar:drawerOpened");
    } else {
      appEvents.emit("sidebar:drawerClosed");
    }
  }

  updateRewindButtonState(isOpen);
}

export const openMobileDrawer = (): void => setSidebarState(true);
export const closeMobileDrawer = (): void => setSidebarState(false);
export const tryCloseMobileDrawer = (): void => { if (isMobileLayout()) closeMobileDrawer(); };

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

export function initTouchGestures(): void {
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
//          PELLIZCO MÁGICO (Pinch to zoom para el Modo Muro)
// =================================================================

export function toggleRotationMode(forceState: boolean | null = null): void {
  const button = dom.toggleRotationBtn;
  if (!button) return;

  const isCurrentlyDisabled = document.body.classList.contains(CSS_CLASSES.ROTATION_DISABLED);
  const shouldDisable = forceState !== null ? forceState : !isCurrentlyDisabled;

  if (isCurrentlyDisabled === shouldDisable) return;

  triggerHapticFeedback('medium');
  unflipAllCards();
  closeModal({ suppressHistoryBack: true });

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
export function initPinchGestures(): void {
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

  const handlePinchTouchStart = (e: TouchEvent) => {
    if (e.touches.length === 2) {
      isPinching = true;
      hasTriggered = false;
      initialDistance = Math.hypot(e.touches[0].pageX - e.touches[1].pageX, e.touches[0].pageY - e.touches[1].pageY);
    }
  };

  const handlePinchTouchMove = (e: TouchEvent) => {
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

  const handlePinchTouchEnd = (e: TouchEvent) => {
    if (hasTriggered) activateCooldown();
    if (e.touches.length < 2) { isPinching = false; initialDistance = null; }
    if (e.touches.length === 0) hasTriggered = false;
  };

  target.addEventListener('touchstart', handlePinchTouchStart, { passive: true });
  target.addEventListener('touchmove', handlePinchTouchMove, { passive: true });
  target.addEventListener('touchend', handlePinchTouchEnd);

  pinchInited = true;

  sidebarUnsubscribers.push(() => {
    target.removeEventListener('click', handleClick, { capture: true });
    target.removeEventListener('touchstart', handlePinchTouchStart);
    target.removeEventListener('touchmove', handlePinchTouchMove);
    target.removeEventListener('touchend', handlePinchTouchEnd);
    pinchInited = false;
  });
}
