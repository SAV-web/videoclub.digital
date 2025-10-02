// =================================================================
//                      COMPONENTE QUICK VIEW (VISTA RÁPIDA)
// =================================================================

// Elementos del DOM que usaremos
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
    
    // Selectores para la plantilla
    const templateElements = {
        img: clone.querySelector('.quick-view-poster img'),
        title: clone.querySelector('[data-template="title"]'),
        year: clone.querySelector('[data-template="year"]'),
        countryContainer: clone.querySelector('[data-template="country-container"]'),
        countryFlag: clone.querySelector('[data-template="country-flag"]'),
        duration: clone.querySelector('[data-template="duration"]'),
        episodes: clone.querySelector('[data-template="episodes"]'),
        ratingsContainer: clone.querySelector('[data-template="ratings-container"]'),
        synopsis: clone.querySelector('[data-template="synopsis"]'),
        criticContainer: clone.querySelector('[data-template="critic-container"]'),
        critic: clone.querySelector('[data-template="critic"]'),
        director: clone.querySelector('[data-template="director"]'),
        actors: clone.querySelector('[data-template="actors"]'),
        genre: clone.querySelector('[data-template="genre"]'),
    };
    
    // Leemos los datos directamente desde la tarjeta que nos han pasado
    templateElements.img.src = cardElement.querySelector('.flip-card-front img').src;
    templateElements.img.alt = cardElement.querySelector('.flip-card-front img').alt;
    templateElements.title.textContent = cardElement.querySelector('[data-template="title"]').textContent;
    
    // Copiamos los metadatos
    templateElements.year.textContent = cardElement.querySelector('[data-template="year"]').textContent;
    const countryInfo = cardElement.querySelector('[data-template="country-container"]');
    if (countryInfo && countryInfo.style.display !== 'none') {
        templateElements.countryFlag.className = countryInfo.querySelector('.fi').className;
    } else {
        templateElements.countryContainer.style.display = 'none';
    }
    templateElements.duration.textContent = cardElement.querySelector('[data-template="duration"]').textContent;
    templateElements.episodes.textContent = cardElement.querySelector('[data-template="episodes"]').textContent;

    // Clonamos las barras de rating completas
    const ratingsFromCard = cardElement.querySelector('.ratings-container');
    if (ratingsFromCard) {
        templateElements.ratingsContainer.innerHTML = ratingsFromCard.innerHTML;
    }

    // Rellenamos el resto de detalles del reverso
    templateElements.synopsis.textContent = cardElement.querySelector('[data-template="synopsis"]').textContent;
    const criticFromCard = cardElement.querySelector('[data-template="critic"]');
    if (criticFromCard && criticFromCard.textContent.trim() !== '') {
        templateElements.critic.textContent = criticFromCard.textContent;
    } else {
        templateElements.criticContainer.style.display = 'none';
    }

    templateElements.director.textContent = cardElement.querySelector('.front-director-info').textContent; // Tomamos el director del frontal
    templateElements.actors.textContent = cardElement.querySelector('[data-template="actors"]').textContent;
    templateElements.genre.textContent = cardElement.querySelector('[data-template="genre"]').textContent;
    
    // Limpiamos el contenido anterior e insertamos el nuevo
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