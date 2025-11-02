// =================================================================
//          COMPONENTE QUICK VIEW (VISTA RÁPIDA) - v2 (Accesible)
// =================================================================
// v2.0 - Se integra con el nuevo 'modal-manager.js' para delegar toda la
//        lógica de accesibilidad, incluyendo la trampa de foco, la
//        restauración del foco al cerrar y la gestión de atributos ARIA.
// =================================================================

import { openAccessibleModal, closeAccessibleModal } from './modal-manager.js';
// ▼▼▼ IMPORTACIONES CLAVE ▼▼▼
// Traemos las funciones de `card.js` para reutilizar la lógica de actualización
// y configuración de listeners para los elementos interactivos (estrellas, watchlist).
import { updateCardUI, initializeCard } from './card.js';
import { unflipAllCards } from './card.js';


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
    // Si el clic es fuera de la modal Y no es en la tarjeta que la abrió (o cualquier otra)
    // la cerramos. Esto evita que el clic de apertura la cierre inmediatamente.
    const isClickInsideCard = event.target.closest('.movie-card');
    if (dom.modal.classList.contains('is-visible') && !dom.modal.contains(event.target) && !isClickInsideCard) {
        closeModal();
    }
}

/**
 * Cierra la ventana de Vista Rápida de forma controlada.
 */
export function closeModal() {
    if (!dom.modal.classList.contains('is-visible')) return;

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
 * Maneja el clic en el nombre de un director dentro de la modal.
 * Cierra la modal y aplica el filtro de director en la vista principal.
 * @param {Event} event - El evento de clic.
 */
function handleDirectorClick(event) {
    const directorLink = event.target.closest('.front-director-info a[data-director-name]');
    if (!directorLink) return;

    event.preventDefault();
    const directorName = directorLink.dataset.directorName;

    // 1. Cierra la modal.
    closeModal();
    // 2. Dispara el evento para que el sistema de filtros actúe.
    document.dispatchEvent(new CustomEvent('filtersReset', { detail: { keepSort: true, newFilter: { type: 'director', value: directorName } } }));
}

/**
 * Rellena la ventana de Vista Rápida con los datos de una tarjeta específica.
 * @param {HTMLElement} cardElement - El elemento de la tarjeta desde donde se leerán los datos.
 */
function populateModal(cardElement) {
    const clone = dom.template.cloneNode(true);
    const front = clone.querySelector('.quick-view-front');
    const back = clone.querySelector('.quick-view-back');

    // ▼▼▼ MEJORA: Asignamos los datos de la película y el ID al contenido de la modal.
    // Esto es crucial para que las funciones de `updateCardUI` e `initializeCard` funcionen.
    dom.content.movieData = cardElement.movieData;
    dom.content.dataset.movieId = cardElement.dataset.movieId;

    // --- Rellenar Cara Frontal ---
    const frontImg = front.querySelector('img');
    const cardImg = cardElement.querySelector('.flip-card-front img');
    frontImg.src = cardImg.src;
    frontImg.alt = cardImg.alt;

    // Función segura para copiar texto sin romper el DOM.
    const copyTextContent = (sourceSelector, targetSelector, parent) => {
        const source = cardElement.querySelector(sourceSelector);
        const target = parent.querySelector(targetSelector);
        if (source && target) target.textContent = source.textContent;
    };

    // Función segura para copiar HTML interno.
    const copyInnerHTML = (sourceSelector, targetSelector, parent) => {
        const source = cardElement.querySelector(sourceSelector);
        const target = parent.querySelector(targetSelector);
        if (source && target) target.innerHTML = source.innerHTML;
    };

    // --- Rellenar Cara Frontal (de forma segura) ---
    copyTextContent('[data-template="title"]', '#quick-view-title', front);
    copyInnerHTML('[data-template="director"]', '[data-template="director"]', front);
    copyTextContent('[data-template="year"]', '[data-template="year"]', front);
    copyInnerHTML('[data-template="country-container"]', '[data-template="country-container"]', front);

    // Copia de iconos de plataforma
    ['[data-template="netflix-icon"]', '[data-template="hbo-icon"]'].forEach(selector => {
        const sourceIcon = cardElement.querySelector(selector);
        const targetIcon = front.querySelector(selector);
        if (sourceIcon && targetIcon) {
            targetIcon.style.display = sourceIcon.style.display;
        }
    });
    
    // --- Rellenar Cara Trasera (de forma segura) ---
    copyInnerHTML('.ratings-container', '.ratings-container', back);
    copyInnerHTML('.details-list', '.details-list', back);
    copyTextContent('[data-template="synopsis"]', '[data-template="synopsis"]', back);

    // Lógica específica y segura para Wikipedia
    const wikipediaLinkTarget = back.querySelector('[data-template="wikipedia-link"]');
    const wikipediaLinkSource = cardElement.querySelector('[data-template="wikipedia-link"]');
    if (wikipediaLinkTarget && wikipediaLinkSource) {
        wikipediaLinkTarget.href = wikipediaLinkSource.href;
        wikipediaLinkTarget.style.display = wikipediaLinkSource.style.display;
    }

    // Lógica específica y segura para duración y episodios
    copyTextContent('[data-template="duration"]', '[data-template="duration"]', back);
    const episodesTarget = back.querySelector('[data-template="episodes"]');
    const episodesSource = cardElement.querySelector('[data-template="episodes"]');
    if (episodesTarget && episodesSource) {
        episodesTarget.textContent = episodesSource.textContent;
        episodesTarget.style.display = episodesSource.textContent ? 'inline' : 'none';
    }
    
    copyInnerHTML('[data-template="critic-container"]', '[data-template="critic-container"]', back);

    dom.content.textContent = '';
    dom.content.appendChild(clone);

    // ▼▼▼ PASO CLAVE: Reutilizamos la lógica de la tarjeta ▼▼▼
    // 1. `updateCardUI` se encarga de mostrar el estado correcto de estrellas y watchlist.
    updateCardUI(dom.content);
    // 2. `initializeCard` añade los event listeners para que los botones sean funcionales.
    initializeCard(dom.content);

    // ▼▼▼ PASO ADICIONAL: Añadimos el listener para el clic en el director.
    dom.content.addEventListener('click', handleDirectorClick);
}


/**
 * Abre la ventana de Vista Rápida con los datos de una película.
 * @param {HTMLElement} cardElement - El elemento de la tarjeta que se ha clickeado.
 */
export function openModal(cardElement) {
    if (!cardElement) return;

    // Si hay alguna tarjeta volteada, la cerramos para evitar solapamientos visuales.
    unflipAllCards();

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