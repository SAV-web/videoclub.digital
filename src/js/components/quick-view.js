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
 * Cierra la ventana de Vista Rápida.
 */
function closeModal() {
    dom.modal.classList.remove('is-visible');
    dom.overlay.classList.remove('is-visible');
    document.body.classList.remove('modal-open');

    // Esperamos a que la animación de salida termine para ocultarlo del todo
    dom.modal.addEventListener('transitionend', () => {
        dom.modal.hidden = true;
    }, { once: true });
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

    front.querySelector('[data-template="title"]').textContent = cardElement.querySelector('[data-template="title"]').textContent;
    front.querySelector('[data-template="director"]').innerHTML = cardElement.querySelector('[data-template="director"]').innerHTML;
    front.querySelector('[data-template="year"]').textContent = cardElement.querySelector('[data-template="year"]').textContent;
    
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

    dom.content.innerHTML = '';
    dom.content.appendChild(clone);
}


/**
 * Abre la ventana de Vista Rápida con los datos de una película.
 * @param {HTMLElement} cardElement - El elemento de la tarjeta que se ha clickeado.
 */
export function openModal(cardElement) {
    if (!cardElement) return;

    populateModal(cardElement);
    
    dom.modal.hidden = false;
    document.body.classList.add('modal-open');

    // Usamos un pequeño timeout para asegurar que el navegador aplica la transición
    setTimeout(() => {
        dom.modal.classList.add('is-visible');
        dom.overlay.classList.add('is-visible');
    }, 10);
}

/**
 * Inicializa los listeners para la Vista Rápida (cerrar al pulsar botón, overlay o Escape).
 */
export function initQuickView() {
    if (!dom.modal || !dom.overlay || !dom.closeBtn) {
        console.error("Quick View DOM elements not found. Initialization failed.");
        return;
    }
    dom.closeBtn.addEventListener('click', closeModal);
    dom.overlay.addEventListener('click', closeModal);

    window.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && dom.modal.classList.contains('is-visible')) {
            closeModal();
        }
    });
}