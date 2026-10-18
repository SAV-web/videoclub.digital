import { CSS_CLASSES } from "../../constants.js";

// Consultas de Viewport cacheadas a nivel de módulo para evitar Layout Thrashing en eventos de alta frecuencia
const landscapeCompactQuery =
  typeof window !== "undefined" && typeof window.matchMedia === "function"
    ? window.matchMedia("(orientation: landscape) and (max-height: 600px)")
    : null;

const landscapeOrientationQuery =
  typeof window !== "undefined" && typeof window.matchMedia === "function"
    ? window.matchMedia("(orientation: landscape)")
    : null;

export const isLandscapeCompactViewport = (): boolean => {
  if (landscapeCompactQuery) return landscapeCompactQuery.matches;
  if (typeof window !== "undefined") {
    return window.innerWidth > window.innerHeight && window.innerHeight <= 600;
  }
  return false;
};

export const isMobilePortraitViewport = (): boolean => {
  if (typeof window === "undefined") return false;
  if (window.innerWidth > 768) return false;
  return landscapeOrientationQuery ? !landscapeOrientationQuery.matches : window.innerHeight > window.innerWidth;
};

export const SWIPE_X_THRESHOLD = 80;
export const SWIPE_Y_CLOSE_THRESHOLD = 90;

export interface TouchState {
  startY: number;
  startX: number;
  currentY: number;
  startTime: number;
  isDragging: boolean;
  isHorizontalSwipe: boolean;
  target: HTMLElement | null;
}

export const touchState: TouchState = {
  startY: 0,
  startX: 0,
  currentY: 0,
  startTime: 0,
  isDragging: false,
  isHorizontalSwipe: false,
  target: null
};

/**
 * Inicia el seguimiento del gesto táctil.
 */
export function handleTouchStart(e: TouchEvent, modal: HTMLElement | null): void {
  if (!modal) return;

  touchState.startY = e.touches[0].clientY;
  touchState.startX = e.touches[0].clientX;
  touchState.target = e.target as HTMLElement | null;
  touchState.currentY = 0;
  touchState.isDragging = false;
  touchState.isHorizontalSwipe = false;
  touchState.startTime = Date.now();

  modal.classList.remove(CSS_CLASSES.IS_DRAGGING); // Reactivar transición CSS si estaba desactivada
}

export interface GestureMoveOptions {
  modal: HTMLElement | null;
  content: HTMLElement | null;
}

/**
 * Procesa el movimiento del dedo (Arrastre vertical o Swipe horizontal).
 */
export function handleTouchMove(e: TouchEvent, options: GestureMoveOptions): void {
  // Salir rápido si no es un gesto válido o ya está cancelado
  if (!touchState.isDragging && !touchState.isHorizontalSwipe && e.defaultPrevented) return;

  const { modal, content } = options;
  if (!modal || !content) return;

  const currentY = e.touches[0].clientY;
  const currentX = e.touches[0].clientX;
  const deltaY = currentY - touchState.startY;
  const deltaX = currentX - touchState.startX;

  // Restaurar tamaño del cartel en columna izquierda (modo apaisado) si el usuario hace scroll hacia arriba (swipe abajo)
  if (Math.abs(deltaY) > Math.abs(deltaX) && deltaY > 15 && touchState.target?.closest(".quick-view-media")) {
    if (isLandscapeCompactViewport()) {
      const compactFront = modal.querySelector<HTMLElement>(".quick-view-media.poster-compact");
      if (compactFront) {
        compactFront.classList.remove("poster-compact");
      }
    }
  }

  // 1. Detección de Intención (Primera vez)
  if (!touchState.isDragging && !touchState.isHorizontalSwipe) {
    if (Math.abs(deltaX) < 5 && Math.abs(deltaY) < 5) return; // Umbral de ruido

    const SCROLL_TOLERANCE = 5; // Tolerancia para scroll inercial (iOS)

    // Gesto Vertical (Cierre): Solo en modo bottom-sheet vertical si estamos arriba del todo y arrastramos hacia abajo
    if (Math.abs(deltaY) > Math.abs(deltaX) && deltaY > 0 && content.scrollTop <= SCROLL_TOLERANCE) {
      if (isMobilePortraitViewport()) {
        touchState.isDragging = true;
        modal.classList.add(CSS_CLASSES.IS_DRAGGING); // Desactivar transición para seguir el dedo
      }
    }
    // Gesto Horizontal (Navegación)
    else if (Math.abs(deltaX) > Math.abs(deltaY)) {
      touchState.isHorizontalSwipe = true;
    }
  }

  // 2. Ejecución
  if (touchState.isDragging) {
    if (e.cancelable) e.preventDefault();

    let translateY = deltaY;
    // Rubber Banding (Resistencia exponencial al arrastrar hacia arriba/tope)
    if (translateY < 0) {
      translateY = -Math.pow(Math.abs(translateY), 0.75);
    }

    modal.style.transform = `translate(-50%, ${translateY}px)`;
    touchState.currentY = deltaY;
  } else if (touchState.isHorizontalSwipe) {
    if (e.cancelable) e.preventDefault(); // Evitar "Atrás/Adelante" del navegador
  }
}

export interface GestureEndOptions {
  modal: HTMLElement | null;
  navigateToSibling: (direction: number) => void;
  closeModal: () => void;
  resetModalTransform: () => void;
}

/**
 * Finaliza el gesto y decide la acción (Cerrar, Navegar o Resetear).
 */
export function handleTouchEnd(e: TouchEvent, options: GestureEndOptions): void {
  const { modal, navigateToSibling, closeModal, resetModalTransform } = options;
  if (!modal) return;

  const duration = Date.now() - touchState.startTime;

  // A. Navegación Horizontal
  if (touchState.isHorizontalSwipe) {
    const deltaX = e.changedTouches[0].clientX - touchState.startX;
    const velocityX = Math.abs(deltaX) / (duration || 1);
    if (Math.abs(deltaX) > SWIPE_X_THRESHOLD || velocityX > 0.4) { // Distancia O "Flick" rápido
      navigateToSibling(deltaX < 0 ? 1 : -1);
    }
    touchState.isHorizontalSwipe = false;
    touchState.target = null;
    return;
  }

  // B. Cierre Vertical
  if (!touchState.isDragging) {
    touchState.target = null;
    return;
  }

  modal.classList.remove(CSS_CLASSES.IS_DRAGGING); // Reactivar transición CSS

  const velocityY = touchState.currentY / (duration || 1);
  if (touchState.currentY > SWIPE_Y_CLOSE_THRESHOLD || velocityY > 0.5) { // Distancia O Inercia hacia abajo
    closeModal();
  } else {
    resetModalTransform(); // Rebote elástico
  }

  touchState.currentY = 0;
  touchState.isDragging = false;
  touchState.target = null;
}
