// =================================================================
//          GESTOR DE MODALES ACCESIBLE (v5.0 - SOLUCIÓN FINAL)
// =================================================================
// v5.0 - CORRECCIÓN DEFINITIVA: Se introduce un filtro de visibilidad (`isVisible`)
//        en la lógica de la trampa de foco. Esto soluciona el bug crítico
//        donde `querySelectorAll` incluía elementos de vistas ocultas
//        (ej. el formulario de registro cuando se veía el de login),
//        lo que rompía la trampa en una dirección.
// Esta versión combina:
// 1. Recálculo dinámico de elementos en cada Tab.
// 2. Filtro por visibilidad (`offsetParent`) para ignorar elementos ocultos.
// 3. `setTimeout(fn, 0)` para sincronizar el foco con el ciclo de renderizado.
// =================================================================

let focusTrapCleanup = null;
let previouslyFocusedElement = null;

const FOCUSABLE_ELEMENTS_SELECTOR = [
    'a[href]:not([tabindex^="-"])',
    'button:not([disabled]):not([tabindex^="-"])',
    'textarea:not([disabled]):not([tabindex^="-"])',
    'input:not([type="hidden"]):not([disabled]):not([tabindex^="-"])',
    'select:not([disabled]):not([tabindex^="-"])',
    '[tabindex]:not([tabindex^="-"])'
].join(', ');

/**
 * Verifica si un elemento es realmente visible en el DOM.
 * Un elemento con `display:none` (o dentro de un padre con `display:none`)
 * no tendrá un `offsetParent`, lo que nos permite filtrarlo eficazmente.
 * @param {HTMLElement} element El elemento a comprobar.
 * @returns {boolean} `true` si el elemento es visible.
 */
function isVisible(element) {
    return element.offsetParent !== null;
}

/**
 * Gestiona la navegación por Tab dentro de la modal para crear un ciclo.
 */
function handleKeyDown(e) {
    if (e.key !== 'Tab') {
        return;
    }

    // 1. Obtener todos los elementos potencialmente enfocables.
    const allPotentials = Array.from(e.currentTarget.querySelectorAll(FOCUSABLE_ELEMENTS_SELECTOR));
    
    // 2. FILTRADO CRÍTICO: Quedarse solo con los elementos que son VISIBLES ahora mismo.
    const focusableElements = allPotentials.filter(isVisible);
    
    if (focusableElements.length === 0) {
        e.preventDefault(); // Si no hay nada enfocable, evitamos que el foco se escape.
        return;
    }

    const firstFocusable = focusableElements[0];
    const lastFocusable = focusableElements[focusableElements.length - 1];
    
    if (e.shiftKey) { // Navegación hacia atrás (Shift + Tab)
        if (document.activeElement === firstFocusable) {
            e.preventDefault();
            lastFocusable.focus();
        }
    } else { // Navegación hacia adelante (Tab)
        if (document.activeElement === lastFocusable) {
            e.preventDefault();
            firstFocusable.focus();
        }
    }
}

/**
 * Activa la trampa de foco en un elemento.
 * @param {HTMLElement} element El elemento modal.
 */
function trapFocus(element) {
    previouslyFocusedElement = document.activeElement;
    element.addEventListener('keydown', handleKeyDown);

    // Buscamos el primer elemento visible para enfocarlo.
    const firstFocusable = Array.from(element.querySelectorAll(FOCUSABLE_ELEMENTS_SELECTOR)).find(isVisible);

    // Usamos setTimeout para asegurar que el DOM se ha actualizado antes de mover el foco.
    const focusTimeout = setTimeout(() => {
        if (firstFocusable) {
            firstFocusable.focus();
        }
    }, 0);

    // Preparamos la función que deshará todo lo que hemos hecho.
    focusTrapCleanup = () => {
        clearTimeout(focusTimeout);
        element.removeEventListener('keydown', handleKeyDown);
        if (previouslyFocusedElement) {
            // Devolvemos el foco a donde estaba, también de forma asíncrona.
            setTimeout(() => previouslyFocusedElement.focus(), 0);
        }
        focusTrapCleanup = null;
        previouslyFocusedElement = null;
    };
}

/**
 * Libera la trampa de foco, ejecutando la función de limpieza.
 */
export function releaseFocus() {
    if (typeof focusTrapCleanup === 'function') {
        focusTrapCleanup();
    }
}

/**
 * Abre una modal de forma accesible.
 * @param {HTMLElement} modalElement
 * @param {HTMLElement} [overlayElement]
 */
export function openAccessibleModal(modalElement, overlayElement) {
    if (!modalElement) return;

    modalElement.hidden = false;
    if (overlayElement) overlayElement.hidden = false;
    
    modalElement.setAttribute('aria-hidden', 'false');
    
    trapFocus(modalElement);
}

/**
 * Cierra una modal de forma accesible.
 * @param {HTMLElement} modalElement
 * @param {HTMLElement} [overlayElement]
 */
export function closeAccessibleModal(modalElement, overlayElement) {
    if (!modalElement) return;

    modalElement.hidden = true;
    if (overlayElement) overlayElement.hidden = true;

    modalElement.setAttribute('aria-hidden', 'true');
    
    releaseFocus();
}
