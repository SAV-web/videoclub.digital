// =================================================================
//          COMPONENTE QUICK VIEW (VISTA RÁPIDA) - v2 (Accesible)
// =================================================================
// v2.0 - Se integra con el nuevo 'modal-manager.js' para delegar toda la
//        lógica de accesibilidad, incluyendo la trampa de foco, la
//        restauración del foco al cerrar y la gestión de atributos ARIA.
// =================================================================

import { openAccessibleModal, closeAccessibleModal } from './modal-manager.js';

const isDesktop = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
const dom = {
    overlay: document.getElementById('quick-view-overlay'),
    modal: document.getElementById('quick-view-modal'),
    content: document.getElementById('quick-view-content'),
    closeBtn: document.getElementById('quick-view-close-btn'),
    template: document.getElementById('quick-view-template').content,
};

/**
 * Maneja los clics fuera de la modal para cerrarla, asegurándose de que el clic
 * no sea en la propia tarjeta que la abrió.
 * @param {Event} event
 */
function handleOutsideClick(event) {
    if (dom.modal.classList.contains('is-visible') && !dom.modal.contains(event.target) && !event.target.closest('.movie-card')) {
        closeModal();
    }
}

/**
 * Cierra la ventana de Vista Rápida de forma controlada.
 */
export function closeModal() {
    // 1. Gestionar las clases para las animaciones CSS de salida.
    dom.modal.classList.remove('is-visible');
    dom.overlay.classList.remove('is-visible');
    document.body.classList.remove('modal-open');

    // 2. Delegar la lógica de accesibilidad (liberar foco, ARIA, 'hidden') al gestor.
    closeAccessibleModal(dom.modal, dom.overlay);
    
    // 3. Limpiar el listener de clic exterior para evitar ejecuciones innecesarias.
    document.removeEventListener('click', handleOutsideClick);
}

/**
 * Rellena la ventana de Vista Rápida con los datos de una tarjeta específica.
 * @param {HTMLElement} cardElement - El elemento de la tarjeta desde donde se leerán los datos.
 */
function populateModal(cardElement) {
    const clone = dom.template.cloneNode(true);
    const front = clone.querySelector('.quick-view-front');
    const back = clone.querySelector('.quick-view-back');

    // --- Rellenar Cara Frontal ---
    const frontImg = front.querySelector('img');
    const cardImg = cardElement.querySelector('.flip-card-front img');
    frontImg.src = cardImg.src;
    frontImg.alt = cardImg.alt;

    const copyContent = (sourceSelector, targetSelector, targetParent = front) => {
        const source = cardElement.querySelector(sourceSelector);
        const target = targetParent.querySelector(targetSelector);
        if (source && target) {
            target.replaceWith(source.cloneNode(true));
        }
    };
    
    copyContent('[data-template="title"]', '[data-template="title"]');
    copyContent('[data-template="director"]', '[data-template="director"]');
    copyContent('[data-template="year"]', '[data-template="year"]');
    copyContent('[data-template="low-rating-circle"]', '[data-template="low-rating-circle"]');
    copyContent('[data-template="average-rating-stars"]', '[data-template="average-rating-stars"]');
    copyContent('[data-template="country-container"]', '[data-template="country-container"]');

    // --- Rellenar Cara Trasera ---
    copyContent('[data-template="wikipedia-link"]', '[data-template="wikipedia-link"]', back);
    copyContent('.ratings-container', '.ratings-container', back);

    const copyText = (sourceSelector, targetSelector, targetParent = back) => {
        const source = cardElement.querySelector(sourceSelector);
        const target = targetParent.querySelector(targetSelector);
        if (source && target) {
            target.textContent = source.textContent;
        }
    };

    copyText('[data-template="episodes"]', '[data-template="episodes"]', back);
    copyText('[data-template="duration"]', '[data-template="duration"]', back);
    copyText('[data-template="genre"]', '[data-template="genre"]', back);
    copyText('[data-template="actors"]', '[data-template="actors"]', back);
    copyText('[data-template="synopsis"]', '[data-template="synopsis"]', back);
    
    const criticContainerSource = cardElement.querySelector('[data-template="critic-container"]');
    const criticContainerTarget = back.querySelector('[data-template="critic-container"]');
    if (criticContainerSource && criticContainerTarget) {
        if (criticContainerSource.style.display !== 'none') {
            criticContainerTarget.style.display = 'block';
            copyText('[data-template="critic"]', '[data-template="critic"]', back);
        } else {
            criticContainerTarget.style.display = 'none';
        }
    }

    // Lógica para expandir sinopsis en hover (solo en escritorio)
    if (isDesktop) {
        const scrollableContent = back.querySelector('.scrollable-content');
        const plotSummary = back.querySelector('.plot-summary-final');
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

    dom.content.textContent = '';
    dom.content.appendChild(clone);
}


/**
 * Abre la ventana de Vista Rápida con los datos de una película.
 * @param {HTMLElement} cardElement - El elemento de la tarjeta que se ha clickeado.
 */
export function openModal(cardElement) {
    if (!cardElement) return;

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

        // 3. Añadir el listener de clic exterior DESPUÉS de que la modal esté abierta
        //    para evitar que el mismo clic que la abre la cierre inmediatamente.
        setTimeout(() => document.addEventListener('click', handleOutsideClick), 0);
    }, 10);
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
}