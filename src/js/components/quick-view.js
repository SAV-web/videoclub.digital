// =================================================================
//                      COMPONENTE QUICK VIEW (VISTA RÁPIDA)
// =================================================================

const isDesktop = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
const dom = {
    overlay: document.getElementById('quick-view-overlay'),
    modal: document.getElementById('quick-view-modal'),
    content: document.getElementById('quick-view-content'),
    closeBtn: document.getElementById('quick-view-close-btn'),
    template: document.getElementById('quick-view-template').content,
};

// Variable para guardar la película que se está mostrando
let currentMovieData = null;

/**
 * Maneja los clics fuera de la modal para cerrarla.
 * Se asegura de que el clic no sea en la propia modal.
 * @param {Event} event
 */
function handleOutsideClick(event) {
    // Si la modal es visible y el clic ocurrió fuera de ella...
    // Y también nos aseguramos de que el clic no fue en una tarjeta (para evitar doble comportamiento)
    if (dom.modal.classList.contains('is-visible') && !dom.modal.contains(event.target) && !event.target.closest('.movie-card')) {
        closeModal();
    }
}



/**
 * Cierra la ventana de Vista Rápida.
 */
export function closeModal() {
    dom.modal.classList.remove('is-visible');
    dom.overlay.classList.remove('is-visible');
    document.body.classList.remove('modal-open');

    // Esperamos a que la animación de salida termine para ocultarlo del todo
    dom.modal.addEventListener('transitionend', () => {
        dom.modal.hidden = true;
    }, { once: true });

    // Dejamos de escuchar clics fuera una vez que la modal se cierra.
    document.removeEventListener('click', handleOutsideClick);
}

/**
 * Rellena la ventana con los datos de una película.
 * @param {HTMLElement} cardElement - El elemento de la tarjeta desde donde leer los datos.
 */
function populateModal(cardElement) {
    const clone = dom.template.cloneNode(true);
    const front = clone.querySelector('.quick-view-front');
    const back = clone.querySelector('.quick-view-back');

    // --- Populate Front ---
    const frontImg = front.querySelector('img');
    const cardImg = cardElement.querySelector('.flip-card-front img');
    frontImg.src = cardImg.src;
    frontImg.alt = cardImg.alt;

    // Usar textContent para datos simples y clonación de nodos para HTML
    const titleSource = cardElement.querySelector('[data-template="title"]');
    const directorSource = cardElement.querySelector('[data-template="director"]');
    const yearSource = cardElement.querySelector('[data-template="year"]');

    const titleTarget = front.querySelector('[data-template="title"]');
    const directorTarget = front.querySelector('[data-template="director"]');
    const yearTarget = front.querySelector('[data-template="year"]');

    if (titleTarget && titleSource) titleTarget.textContent = titleSource.textContent;
    if (yearTarget && yearSource) yearTarget.textContent = yearSource.textContent;

    // Reemplazar innerHTML con clonación de nodos para seguridad
    if (directorTarget && directorSource) {
        directorTarget.textContent = ''; // Limpiar contenido existente
        Array.from(directorSource.childNodes).forEach(node => {
            directorTarget.appendChild(node.cloneNode(true));
        });
    }
    
    const lowRatingCircle = cardElement.querySelector('[data-template="low-rating-circle"]');
    if (lowRatingCircle) {
        front.querySelector('[data-template="low-rating-circle"]').replaceWith(lowRatingCircle.cloneNode(true));
    }

    const starContainer = cardElement.querySelector('[data-template="average-rating-stars"]');
    if (starContainer) {
        front.querySelector('[data-template="average-rating-stars"]').replaceWith(starContainer.cloneNode(true));
    }
    
    const countryContainer = cardElement.querySelector('[data-template="country-container"]');
    if (countryContainer) {
        front.querySelector('[data-template="country-container"]').replaceWith(countryContainer.cloneNode(true));
    }

    // --- Populate Back ---
    const wikipediaLink = cardElement.querySelector('[data-template="wikipedia-link"]');
    if (wikipediaLink) {
        back.querySelector('[data-template="wikipedia-link"]').replaceWith(wikipediaLink.cloneNode(true));
    }
    
    back.querySelector('[data-template="episodes"]').textContent = cardElement.querySelector('[data-template="episodes"]').textContent;
    back.querySelector('[data-template="duration"]').textContent = cardElement.querySelector('[data-template="duration"]').textContent;

    const ratingsContainer = cardElement.querySelector('.ratings-container');
    if (ratingsContainer) {
        back.querySelector('.ratings-container').replaceWith(ratingsContainer.cloneNode(true));
    }

    back.querySelector('[data-template="genre"]').textContent = cardElement.querySelector('[data-template="genre"]').textContent;
    back.querySelector('[data-template="actors"]').textContent = cardElement.querySelector('[data-template="actors"]').textContent;
    back.querySelector('[data-template="synopsis"]').textContent = cardElement.querySelector('[data-template="synopsis"]').textContent;
    
    const criticContainer = cardElement.querySelector('[data-template="critic-container"]');
    if (criticContainer && criticContainer.style.display !== 'none') {
        back.querySelector('[data-template="critic-container"]').style.display = 'block';
        back.querySelector('[data-template="critic"]').textContent = cardElement.querySelector('[data-template="critic"]').textContent;
    } else {
        back.querySelector('[data-template="critic-container"]').style.display = 'none';
    }

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

    // Resetea el scroll al principio cada vez que se abre una nueva modal
    dom.content.scrollTop = 0;

    populateModal(cardElement);
    
    dom.modal.hidden = false;
    document.body.classList.add('modal-open');

    // Usamos un pequeño timeout para asegurar que el navegador aplica la transición
    setTimeout(() => {
        dom.modal.classList.add('is-visible');
        dom.overlay.classList.add('is-visible');
        // Empezamos a escuchar clics "fuera" solo DESPUÉS de que la modal se haya abierto.
        // El `setTimeout` es clave para que el mismo clic que abre la modal no la cierre.
        setTimeout(() => document.addEventListener('click', handleOutsideClick), 0);
    }, 10);
}

/**
 * Inicializa los listeners para la Vista Rápida (cerrar al pulsar Escape).
 */
export function initQuickView() {
    if (!dom.modal) {
        console.error("Quick View modal element not found. Initialization failed.");
        return;
    }

    window.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && dom.modal.classList.contains('is-visible')) {
            closeModal();
        }
    });

    // ✨ CORRECCIÓN: La lógica de cierre exterior se gestiona ahora dinámicamente
    // para evitar conflictos. Mantenemos el listener del overlay como una
    // capa de seguridad, pero la lógica principal está en `handleOutsideClick`.
    dom.overlay.addEventListener('click', (e) => {
        if (e.target === dom.overlay) closeModal();
    });
    // El botón de cierre explícito (la 'X') también debe cerrar la modal.
    if (dom.closeBtn) dom.closeBtn.addEventListener('click', closeModal);
}