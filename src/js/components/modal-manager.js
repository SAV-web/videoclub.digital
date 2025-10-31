// =================================================================
//          GESTOR DE MODALES ACCESIBLE (v4.1 - VERSIÓN COMPLETA Y VERIFICADA)
// =================================================================
// Ubicación: src/js/components/modal-manager.js
//
// Este módulo es un "destornillador especializado". Su única responsabilidad
// es gestionar la trampa de foco de las modales de forma accesible.
// Es intencionadamente pequeño y enfocado.
// =================================================================

// --- 1. ESTADO INTERNO DEL MÓDULO ---
let focusTrapCleanup = null;      // Guardará la función para desactivar la trampa.
let previouslyFocusedElement = null; // Guardará el elemento que tenía el foco antes de abrir la modal.

// --- 2. CONSTANTES Y CONFIGURACIÓN ---
const FOCUSABLE_ELEMENTS_SELECTOR = [
    'a[href]:not([tabindex^="-"])',
    'button:not([disabled]):not([tabindex^="-"])',
    'textarea:not([disabled]):not([tabindex^="-"])',
    'input:not([type="hidden"]):not([disabled]):not([tabindex^="-"])',
    'select:not([disabled]):not([tabindex^="-"])',
    '[tabindex]:not([tabindex^="-"])'
].join(', ');

// --- 3. LÓGICA INTERNA: EL "CEREBRO" DE LA TRAMPA ---
/**
 * Se ejecuta en cada 'keydown'. Si es la tecla Tab, asegura que el foco
 * permanezca dentro del elemento contenedor.
 * @param {KeyboardEvent} e - El evento de teclado.
 */
function handleKeyDown(e) {
    if (e.key !== 'Tab') {
        return;
    }

    const focusableElements = Array.from(e.currentTarget.querySelectorAll(FOCUSABLE_ELEMENTS_SELECTOR));
    if (focusableElements.length === 0) {
        e.preventDefault();
        return;
    }

    const firstFocusable = focusableElements[0];
    const lastFocusable = focusableElements[focusableElements.length - 1];
    
    if (e.shiftKey) { // Navegación hacia atrás
        if (document.activeElement === firstFocusable) {
            e.preventDefault();
            lastFocusable.focus();
        }
    } else { // Navegación hacia adelante
        if (document.activeElement === lastFocusable) {
            e.preventDefault();
            firstFocusable.focus();
        }
    }
}

// --- 4. LÓGICA INTERNA: FUNCIONES DE CONFIGURACIÓN Y LIMPIEZA ---
/**
 * Activa la trampa de foco.
 * @param {HTMLElement} element - El elemento modal.
 */
function trapFocus(element) {
    previouslyFocusedElement = document.activeElement;
    element.addEventListener('keydown', handleKeyDown);

    const firstFocusable = element.querySelector(FOCUSABLE_ELEMENTS_SELECTOR);

    const focusTimeout = setTimeout(() => {
        if (firstFocusable) {
            firstFocusable.focus();
        }
    }, 0);

    focusTrapCleanup = () => {
        clearTimeout(focusTimeout);
        element.removeEventListener('keydown', handleKeyDown);
        if (previouslyFocusedElement) {
            setTimeout(() => previouslyFocusedElement.focus(), 0);
        }
        focusTrapCleanup = null;
        previouslyFocusedElement = null;
    };
}

// --- 5. INTERFAZ PÚBLICA (API): LAS FUNCIONES QUE EXPORTAMOS Y USAMOS ---

/**
 * Libera la trampa de foco y restaura el foco anterior.
 * Es la función que se llama desde closeAccessibleModal.
 */
export function releaseFocus() {
    if (typeof focusTrapCleanup === 'function') {
        focusTrapCleanup();
    }
}

/**
 * Orquesta la apertura de una modal de forma accesible.
 * @param {HTMLElement} modalElement - El elemento de la modal a abrir.
 * @param {HTMLElement} [overlayElement] - El overlay asociado.
 */
export function openAccessibleModal(modalElement, overlayElement) {
    if (!modalElement) return;

    modalElement.hidden = false;
    if (overlayElement) overlayElement.hidden = false;
    modalElement.setAttribute('aria-hidden', 'false');
    
    trapFocus(modalElement);
}

/**
 * Orquesta el cierre de una modal de forma accesible.
 * @param {HTMLElement} modalElement - El elemento de la modal a cerrar.
 * @param {HTMLElement} [overlayElement] - El overlay asociado.
 */
export function closeAccessibleModal(modalElement, overlayElement) {
    if (!modalElement) return;

    modalElement.hidden = true;
    if (overlayElement) overlayElement.hidden = true;
    modalElement.setAttribute('aria-hidden', 'true');
    
    releaseFocus();
}