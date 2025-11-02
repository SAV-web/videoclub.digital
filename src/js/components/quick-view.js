// =================================================================
//          COMPONENTE QUICK VIEW (VISTA RÁPIDA) - v3 (Gestos Nativos)
// =================================================================
// v3.0 - Integrada la funcionalidad "Swipe to Close" para una UX táctil nativa.
//      - La lógica de arrastre solo se activa en la parte superior de la modal
//        o cuando el contenido no tiene scroll, evitando conflictos.
//      - Se añade feedback visual (opacidad del overlay) durante el arrastre.
//      - Mantiene la integración con 'modal-manager.js' para la accesibilidad.
// =================================================================

import { openAccessibleModal, closeAccessibleModal } from './modal-manager.js';
import { triggerHapticFeedback } from '../utils.js';

// --- Constantes y referencias al DOM cacheadas ---
const dom = {
    overlay: document.getElementById('quick-view-overlay'),
    modal: document.getElementById('quick-view-modal'),
    content: document.getElementById('quick-view-content'),
    closeBtn: document.getElementById('quick-view-close-btn'),
    template: document.getElementById('quick-view-template').content,
};
const isDesktop = window.matchMedia('(hover: hover) and (pointer: fine)').matches;

// --- Estado para la gestión del gesto de arrastre ---
let isDragging = false;
let dragStartY = 0;

/**
 * Rellena la ventana de Vista Rápida con los datos de una tarjeta específica.
 * @param {HTMLElement} cardElement - El elemento de la tarjeta desde donde se leerán los datos.
 */
function populateModal(cardElement) {
    // Clonamos la plantilla para no modificar la original
    const clone = dom.template.cloneNode(true);
    
    // Función de ayuda para copiar contenido de la tarjeta a la modal
    const copyContent = (sourceSelector, targetSelector, targetParent = clone) => {
        const source = cardElement.querySelector(sourceSelector);
        const target = targetParent.querySelector(targetSelector);
        if (source && target) {
            // Reemplazamos el nodo placeholder con una copia del nodo real de la tarjeta
            target.replaceWith(source.cloneNode(true));
        }
    };
    
    // Copiamos la imagen
    const frontImg = clone.querySelector('.quick-view-front img');
    const cardImg = cardElement.querySelector('.flip-card-front img');
    if(frontImg && cardImg) {
        frontImg.src = cardImg.src;
        frontImg.alt = cardImg.alt;
    }

    // Copiamos todos los elementos de datos
    copyContent('[data-template="title"]', '[data-template="title"]');
    copyContent('[data-template="director"]', '[data-template="director"]');
    copyContent('[data-template="year"]', '[data-template="year"]');
    copyContent('[data-template="low-rating-circle"]', '[data-template="low-rating-circle"]');
    copyContent('[data-template="average-rating-stars"]', '[data-template="average-rating-stars"]');
    copyContent('[data-template="country-container"]', '[data-template="country-container"]');
    copyContent('[data-template="wikipedia-link"]', '[data-template="wikipedia-link"]', clone);
    copyContent('.ratings-container', '.ratings-container', clone);
    copyContent('[data-template="episodes"]', '[data-template="episodes"]', clone);
    copyContent('[data-template="duration"]', '[data-template="duration"]', clone);
    copyContent('[data-template="genre"]', '[data-template="genre"]', clone);
    copyContent('[data-template="actors"]', '[data-template="actors"]', clone);
    copyContent('[data-template="synopsis"]', '[data-template="synopsis"]', clone);

    // Manejo especial para la crítica, que puede estar oculta
    const criticContainerSource = cardElement.querySelector('[data-template="critic-container"]');
    const criticContainerTarget = clone.querySelector('[data-template="critic-container"]');
    if (criticContainerSource && criticContainerTarget) {
        if (criticContainerSource.style.display !== 'none') {
            criticContainerTarget.style.display = 'block';
            copyContent('[data-template="critic"]', '[data-template="critic"]', clone);
        } else {
            criticContainerTarget.style.display = 'none';
        }
    }

    // Lógica para expandir sinopsis en hover (solo en escritorio)
    if (isDesktop) {
        const scrollableContent = clone.querySelector('.scrollable-content');
        const plotSummary = clone.querySelector('.plot-summary-final');
        if (scrollableContent && plotSummary) {
            let scrollTimeoutId = null;
            plotSummary.addEventListener('mouseenter', () => {
                scrollTimeoutId = setTimeout(() => {
                    if (scrollableContent.scrollHeight > scrollableContent.clientHeight) {
                        scrollableContent.classList.add('full-view');
                    }
                }, 1000);
            });
            scrollableContent.addEventListener('mouseleave', () => {
                clearTimeout(scrollTimeoutId);
                scrollableContent.classList.remove('full-view');
            });
        }
    }

    // Limpiamos el contenido anterior e insertamos el nuevo
    dom.content.textContent = '';
    dom.content.appendChild(clone);
}


/**
 * Cierra la ventana de Vista Rápida de forma controlada y accesible.
 */
export function closeModal() {
    if (!dom.modal.classList.contains('is-visible')) return;

    // 1. Gestionar clases para las animaciones CSS de salida.
    dom.modal.classList.remove('is-visible');
    dom.overlay.classList.remove('is-visible');
    document.body.classList.remove('modal-open');

    // 2. Delegar la lógica de accesibilidad (liberar foco, ARIA, 'hidden') al gestor.
    closeAccessibleModal(dom.modal, dom.overlay);
    
    // 3. Limpieza de estilos en línea que puedan haber sido aplicados por gestos.
    dom.modal.style.transform = '';
    dom.overlay.style.opacity = '';
    dom.modal.style.transition = '';
    dom.overlay.style.transition = '';
}

/**
 * Abre la ventana de Vista Rápida con los datos de una película.
 * @param {HTMLElement} cardElement - El elemento de la tarjeta que se ha clickeado.
 */
export function openModal(cardElement) {
    if (!cardElement) return;
    
    triggerHapticFeedback('medium');
    dom.content.scrollTop = 0; // Asegurar que la modal siempre empiece desde arriba
    populateModal(cardElement);
    document.body.classList.add('modal-open');

    // Se usa un timeout para asegurar que el navegador aplique la transición correctamente
    setTimeout(() => {
        // 1. Añadir clases para la animación visual de entrada.
        dom.modal.classList.add('is-visible');
        dom.overlay.classList.add('is-visible');
        
        // 2. Delegar la lógica de accesibilidad (foco, ARIA, 'hidden') al gestor.
        openAccessibleModal(dom.modal, dom.overlay);
    }, 10);
}


// =================================================================
//          LÓGICA DE GESTOS TÁCTILES ("SWIPE TO CLOSE")
// =================================================================

/**
 * Inicia el seguimiento del arrastre si el toque comienza en una zona válida.
 * @param {TouchEvent} e
 */
function handleDragStart(e) {
    // El gesto solo se inicia si el contenido de la modal está en la parte superior.
    // Esto evita conflictos con el scroll del contenido.
    if (dom.content.scrollTop > 0) {
        isDragging = false;
        return;
    }
    
    isDragging = true;
    dragStartY = e.touches[0].clientY;
    
    // Desactivamos temporalmente las transiciones CSS para un seguimiento 1:1 con el dedo.
    dom.modal.style.transition = 'none';
    dom.overlay.style.transition = 'none';
}

/**
 * Mueve la modal y el overlay siguiendo el dedo del usuario.
 * @param {TouchEvent} e
 */
function handleDragMove(e) {
    if (!isDragging) return;

    const currentY = e.touches[0].clientY;
    const deltaY = currentY - dragStartY;

    // Solo permitimos el arrastre hacia abajo (valores positivos de deltaY).
    if (deltaY > 0) {
        e.preventDefault(); // Prevenimos el scroll de la página mientras arrastramos.
        
        const screenHeight = window.innerHeight;
        // La opacidad del overlay disminuye a medida que se arrastra la modal,
        // dando un feedback visual de que se está "descartando" la vista.
        const overlayOpacity = Math.max(0, 1 - (deltaY / (screenHeight / 2)));
        dom.overlay.style.opacity = overlayOpacity;

        // La modal se mueve verticalmente siguiendo el dedo.
        dom.modal.style.transform = `translateY(${deltaY}px)`;
    }
}

/**
 * Finaliza el arrastre y decide si cerrar la modal o devolverla a su sitio.
 * @param {TouchEvent} e
 */
function handleDragEnd(e) {
    if (!isDragging) return;
    isDragging = false;

    const touchY = e.changedTouches[0].clientY;
    const deltaY = touchY - dragStartY;

    // Restauramos las transiciones para que el cierre o el "snap back" sean animados.
    dom.modal.style.transition = '';
    dom.overlay.style.transition = '';
    
    const CLOSE_THRESHOLD_PX = 100; // El usuario debe arrastrar al menos 100px.

    // Si se ha superado el umbral, cerramos la modal.
    if (deltaY > CLOSE_THRESHOLD_PX) {
        closeModal();
    } else {
        // Si no, la modal y el overlay vuelven a su posición y opacidad originales.
        dom.modal.style.transform = '';
        dom.overlay.style.opacity = '';
    }
}

/**
 * Inicializa los listeners globales para la Vista Rápida.
 */
export function initQuickView() {
    if (!dom.modal) {
        console.error("Quick View modal element not found. Initialization failed.");
        return;
    }

    // Listener para la tecla 'Escape' para cerrar la modal
    window.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && dom.modal.classList.contains('is-visible')) {
            closeModal();
        }
    });

    // Listener para el botón de cierre explícito (la 'X')
    if (dom.closeBtn) {
        dom.closeBtn.addEventListener('click', closeModal);
    }
    
    // Listener para clics en el overlay
    if (dom.overlay) {
        dom.overlay.addEventListener('click', closeModal);
    }

    // Añadimos los listeners para el gesto "Swipe to Close" solo en dispositivos no-escritorio.
    if (!isDesktop) {
        dom.modal.addEventListener('touchstart', handleDragStart, { passive: true });
        dom.modal.addEventListener('touchmove', handleDragMove, { passive: false });
        dom.modal.addEventListener('touchend', handleDragEnd, { passive: true });
    }
}