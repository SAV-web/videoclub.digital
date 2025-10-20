// =================================================================
//                      COMPONENTE CARD
// =================================================================
// Este módulo se encarga de todo lo relacionado con las tarjetas de película.
// Lógica final: o voltea la tarjeta, o abre el modal de Vista Rápida.

import { CONFIG } from '../config.js';
import { formatRuntime, formatVotesUnified, createElement } from '../utils.js';
import { CSS_CLASSES, SELECTORS } from '../constants.js'; 
import { openModal, closeModal } from './quick-view.js';

// --- VARIABLES Y CONSTANTES DEL MÓDULO ---
const MAX_VOTES = {
    FA: 220000,
    IMDB: 3200000
};
const SQRT_MAX_VOTES = {
    FA: Math.sqrt(MAX_VOTES.FA),
    IMDB: Math.sqrt(MAX_VOTES.IMDB)
};
const cardTemplate = document.getElementById(SELECTORS.MOVIE_CARD_TEMPLATE.substring(1));
let renderedCardCount = 0;
let currentlyFlippedCard = null;
const isDesktop = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
const NO_TRANSITION_CLASS = 'no-transition';

const lazyLoadObserver = new IntersectionObserver((entries, observer) => {
    entries.forEach(entry => {
        if (entry.isIntersecting) {
            const img = entry.target;
            img.onload = () => {
                img.classList.add(CSS_CLASSES.LOADED);
                img.onload = null;
            };
            img.src = img.dataset.src;
            observer.unobserve(img);
        }
    });
}, { rootMargin: '0px 0px 800px 0px' });

// --- FUNCIONES PRIVADAS DEL MÓDULO ---

function collapseScrollableContentInstantly(cardElement) {
    const scrollableContent = cardElement.querySelector(SELECTORS.SCROLLABLE_CONTENT);
    if (scrollableContent) {
        scrollableContent.classList.remove('full-view');
        scrollableContent.classList.add(NO_TRANSITION_CLASS);
        setTimeout(() => {
            scrollableContent.classList.remove(NO_TRANSITION_CLASS);
        }, 0);
    }
}

function setupCardImage(imgElement, movieData) {
    const version = movieData.last_synced_at ? new Date(movieData.last_synced_at).getTime() : '1';
    const basePosterUrl = (movieData.image && movieData.image !== '.')
        ? `${CONFIG.POSTER_BASE_URL}${movieData.image}.webp`
        : `https://via.placeholder.com/500x750.png?text=${encodeURIComponent(movieData.title)}`;
    const highQualityPoster = `${basePosterUrl}?v=${version}`;
    const lowQualityPlaceholder = movieData.thumbhash_st || 'data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs=';

    imgElement.dataset.src = highQualityPoster;
    imgElement.alt = `Póster de ${movieData.title}`;
    imgElement.src = lowQualityPlaceholder;
    if (movieData.thumbhash_st) {
        imgElement.classList.add(CSS_CLASSES.LAZY_LQIP);
    }

    if (renderedCardCount < 6) { 
        imgElement.loading = 'eager';
        imgElement.setAttribute('fetchpriority', 'high');
    }
    
    lazyLoadObserver.observe(imgElement);
}

function populateCardText(elements, movieData) {
    elements.title.textContent = movieData.title || 'Título no disponible';
    if (movieData.critic && movieData.critic.trim() !== '') {
        elements.criticContainer.style.display = 'block';
        elements.critic.textContent = movieData.critic;
    } else {
        elements.criticContainer.style.display = 'none';
    }
    elements.title.title = movieData.title || 'Título no disponible';
    
    const directorContainer = elements.director;
    const directorsString = movieData.directors || 'Director no disponible';
    
    directorContainer.textContent = '';
    
    if (directorsString && directorsString !== 'Director no disponible') {
        const directors = directorsString.split(',').map(name => name.trim());
        const fragment = document.createDocumentFragment();

        directors.forEach((name, index) => {
            const link = document.createElement('a');
            link.textContent = name;
            const url = new URL(window.location.origin + window.location.pathname);
            url.searchParams.set('dir', name);
            link.href = url.search;
            fragment.appendChild(link);
            if (index < directors.length - 1) {
                fragment.appendChild(document.createTextNode(', '));
            }
        });
        directorContainer.appendChild(fragment);
    } else {
        directorContainer.textContent = directorsString;
    }
    
    elements.duration.textContent = formatRuntime(movieData.minutes);

    if (movieData.type?.toUpperCase().startsWith('S.') && movieData.episodes) {
        elements.episodes.textContent = `${movieData.episodes} x`;
    } else {
        elements.episodes.textContent = '';
    }

    elements.genre.textContent = movieData.genres || 'Género no disponible';
    elements.actors.textContent = (movieData.actors?.toUpperCase() === '(A)') ? "Animación" : (movieData.actors || 'Reparto no disponible');
    elements.synopsis.textContent = movieData.synopsis || 'Argumento no disponible.';

    let displayYear = movieData.year || 'N/A';
    const hasYearEnd = movieData.type?.toUpperCase().startsWith('S.') && movieData.year_end;

    if (hasYearEnd) {
        const yearEnd = String(movieData.year_end).trim();
        if (yearEnd.toUpperCase() === 'M') {
            displayYear = `${movieData.year} (M)`;
        } else if (yearEnd === '-') {
            displayYear = `${movieData.year}-`;
        } else if (!isNaN(yearEnd) && yearEnd.length === 4) {
            const shortYearEnd = yearEnd.substring(2);
            displayYear = `${movieData.year}-${shortYearEnd}`;
        } else {
            displayYear = `${movieData.year} - ${yearEnd}`;
        }
    }
    elements.year.textContent = displayYear;

    const countryCode = movieData.country_code;
    if (countryCode && elements.countryContainer) {
        elements.countryContainer.style.display = 'flex';
        elements.countryFlag.className = `fi fi-${countryCode}`;
    } else if (elements.countryContainer) {
        elements.countryContainer.style.display = 'none';
    }
}

function setupCardRatings(elements, movieData) {
    const isValidHttpUrl = (s) => s && (s.startsWith('http://') || s.startsWith('https://'));



    if (isValidHttpUrl(movieData.fa_id)) {
        elements.faLink.href = movieData.fa_id;
        elements.faLink.classList.remove(CSS_CLASSES.DISABLED);
    } else {
        elements.faLink.classList.add(CSS_CLASSES.DISABLED);
    }
    
    let faRatingText = movieData.fa_rating || 'N/A';
    if (faRatingText !== 'N/A' && !String(faRatingText).includes('.')) {
        faRatingText = `${faRatingText}.0`;
    }
    elements.faRating.textContent = faRatingText;
    
    const faVotesCount = parseInt(String(movieData.fa_votes).replace(/\D/g, ''), 10) || 0;
    if (faVotesCount > 0) {
        const sqrtValue = Math.sqrt(faVotesCount);
        const faPercentage = Math.min((sqrtValue / SQRT_MAX_VOTES.FA) * 100, 100);
        elements.faVotesBar.style.width = `${faPercentage}%`;
        const formattedVotes = formatVotesUnified(faVotesCount);
        elements.faVotesBarContainer.title = `${formattedVotes} votos`;
        elements.faVotesBarContainer.style.display = 'block';
    } else {
        elements.faVotesBarContainer.style.display = 'none';
    }

    if (isValidHttpUrl(movieData.imdb_id)) {
        elements.imdbLink.href = movieData.imdb_id;
        elements.imdbLink.classList.remove(CSS_CLASSES.DISABLED);
    } else {
        elements.imdbLink.classList.add(CSS_CLASSES.DISABLED);
    }

    let imdbRatingText = movieData.imdb_rating || 'N/A';
    if (imdbRatingText !== 'N/A' && !String(imdbRatingText).includes('.')) {
        imdbRatingText = `${imdbRatingText}.0`;
    }
    elements.imdbRating.textContent = imdbRatingText;

    const imdbVotesCount = parseInt(String(movieData.imdb_votes).replace(/\D/g, ''), 10) || 0;
    if (imdbVotesCount > 0) {
        const sqrtValue = Math.sqrt(imdbVotesCount);
        const imdbPercentage = Math.min((sqrtValue / SQRT_MAX_VOTES.IMDB) * 100, 100);
        elements.imdbVotesBar.style.width = `${imdbPercentage}%`;
        const formattedVotes = formatVotesUnified(imdbVotesCount);
        elements.imdbVotesBarContainer.title = `${formattedVotes} votos`;
        elements.imdbVotesBarContainer.style.display = 'block';
    } else {
        elements.imdbVotesBarContainer.style.display = 'none';
    }
}

function calculateStars(averageRating) {
    if (averageRating <= 5.5) return 0;
    if (averageRating >= 9) return 4;
    return ((averageRating - 5.5) / (9 - 5.5)) * 4;
}

function renderStars(starContainer, filledStars) {
    const stars = starContainer.querySelectorAll('.star-icon');
    stars.forEach((star, index) => {
        const fillValue = Math.max(0, Math.min(1, filledStars - index));
        const filledPath = star.querySelector('.star-icon-path--filled');

        if (fillValue > 0) {
            star.style.display = 'block';
            const clipPercentage = 100 - (fillValue * 100);
            filledPath.style.clipPath = `inset(0 ${clipPercentage}% 0 0)`;
        } else {
            star.style.display = 'none';
        }
    });
}

function createMovieCard(movieData) {
    if (!cardTemplate) return null;
    const cardClone = cardTemplate.content.cloneNode(true);
    const cardElement = cardClone.querySelector(`.${CSS_CLASSES.MOVIE_CARD}`);
    
    // Para el modo virtual, posicionamos la tarjeta de forma absoluta
    if (movieData._virtual) {
        cardElement.style.position = 'absolute';
        cardElement.style.top = `${movieData._virtual.top}px`;
    }

    if (movieData.id) {
        cardElement.style.viewTransitionName = `movie-${movieData.id}`;
    }

    const elements = {
        img: cardClone.querySelector('img'),
        title: cardClone.querySelector(SELECTORS.TITLE),
        director: cardClone.querySelector(SELECTORS.DIRECTOR),
        year: cardClone.querySelector(SELECTORS.YEAR),
        countryContainer: cardClone.querySelector(SELECTORS.COUNTRY_CONTAINER),
        countryFlag: cardClone.querySelector(SELECTORS.COUNTRY_FLAG),
        lowRatingCircle: cardClone.querySelector('[data-template="low-rating-circle"]'),
        averageRatingStars: cardClone.querySelector('[data-template="average-rating-stars"]'),
        duration: cardClone.querySelector(SELECTORS.DURATION),
        episodes: cardClone.querySelector('[data-template="episodes"]'),
        wikipediaLink: cardClone.querySelector('[data-template="wikipedia-link"]'),
        wikipediaIcon: cardClone.querySelector('[data-template="wikipedia-icon"]'),
        faLink: cardClone.querySelector(SELECTORS.FA_LINK),
        faIcon: cardClone.querySelector(SELECTORS.FA_ICON),
        faRating: cardClone.querySelector(SELECTORS.FA_RATING),
        faVotesBarContainer: cardClone.querySelector('[data-template="fa-votes-bar-container"]'),
        faVotesBar: cardClone.querySelector('[data-template="fa-votes-bar"]'),
        imdbLink: cardClone.querySelector(SELECTORS.IMDB_LINK),
        imdbIcon: cardClone.querySelector(SELECTORS.IMDB_ICON),
        imdbRating: cardClone.querySelector(SELECTORS.IMDB_RATING),
        imdbVotesBarContainer: cardClone.querySelector('[data-template="imdb-votes-bar-container"]'),
        imdbVotesBar: cardClone.querySelector('[data-template="imdb-votes-bar"]'),
        genre: cardClone.querySelector(SELECTORS.GENRE),
        actors: cardClone.querySelector(SELECTORS.ACTORS),
        synopsis: cardClone.querySelector(SELECTORS.SYNOPSIS),
        criticContainer: cardClone.querySelector('[data-template="critic-container"]'),
        critic: cardClone.querySelector('[data-template="critic"]')
    };

    setupCardImage(elements.img, movieData);
    populateCardText(elements, movieData);
    setupCardRatings(elements, movieData);

    elements.wikipediaLink.style.display = 'flex';

    if (movieData.wikipedia && movieData.wikipedia.startsWith('http')) {
        elements.wikipediaLink.href = movieData.wikipedia;
        elements.wikipediaLink.classList.remove(CSS_CLASSES.DISABLED);
        elements.wikipediaLink.title = 'Ver en Wikipedia';
    } else {
        elements.wikipediaLink.classList.add(CSS_CLASSES.DISABLED);
        elements.wikipediaLink.removeAttribute('href');
        elements.wikipediaLink.title = 'No disponible en Wikipedia';
    }

    if (elements.averageRatingStars && elements.lowRatingCircle) {
        const ratings = [movieData.fa_rating, movieData.imdb_rating].filter(r => r !== null && r !== undefined && r > 0);
        if (ratings.length > 0) {
            const sum = ratings.reduce((acc, rating) => acc + rating, 0);
            const average = sum / ratings.length;
            const formattedAverage = average.toFixed(1);

            elements.lowRatingCircle.title = `Nota media: ${formattedAverage}`;
            elements.averageRatingStars.title = `Nota media: ${formattedAverage}`;

            if (average <= 5.5) {
                elements.lowRatingCircle.style.display = 'block';
                elements.averageRatingStars.style.display = 'none';
            } else {
                elements.lowRatingCircle.style.display = 'none';
                elements.averageRatingStars.style.display = 'flex';
                const filledStars = calculateStars(average);
                renderStars(elements.averageRatingStars, filledStars);
            }
        } else {
            elements.lowRatingCircle.style.display = 'none';
            elements.averageRatingStars.style.display = 'none';
            elements.lowRatingCircle.title = '';
            elements.averageRatingStars.title = '';
        }
    }

    renderedCardCount++;
    return cardClone;
}

/**
 * Función manejadora que decide qué acción tomar al hacer clic en una tarjeta.
 * @param {Event} e - El evento de click.
 */
function handleDocumentClick(e) {
    if (currentlyFlippedCard && !currentlyFlippedCard.contains(e.target)) {
        const inner = currentlyFlippedCard.querySelector('.flip-card-inner');
        if (inner) {
            inner.classList.remove('is-flipped');
            currentlyFlippedCard = null;
        }
        document.removeEventListener('click', handleDocumentClick);
    }
}

function handleCardClick(e) {
    const cardElement = this;
    const isRotationDisabled = document.body.classList.contains('rotation-disabled');

    // Intercept links early
    const directorLink = e.target.closest('.front-director-info a');
    if (directorLink) {
        e.preventDefault();
        const directorName = directorLink.textContent;
        const eventDetail = { 
            keepSort: true, 
            newFilter: { type: 'director', value: directorName } 
        };
        document.dispatchEvent(new CustomEvent('filtersReset', { detail: eventDetail }));
        return;
    }
    if (e.target.closest('a')) return;

    // --- Lógica de Volteo Táctil ---
    if (!isDesktop && !isRotationDisabled) {
        e.preventDefault();
        e.stopPropagation();

        const inner = cardElement.querySelector('.flip-card-inner');
        if (!inner) return;

        const isThisCardFlipped = inner.classList.contains('is-flipped');

        // Si hay otra tarjeta volteada, la des-volteamos primero
        if (currentlyFlippedCard && currentlyFlippedCard !== cardElement) {
            currentlyFlippedCard.querySelector('.flip-card-inner').classList.remove('is-flipped');
            document.removeEventListener('click', handleDocumentClick);
        }

        // Voltear/des-voltear la tarjeta actual
        inner.classList.toggle('is-flipped');

        if (!isThisCardFlipped) {
            // La tarjeta acaba de ser volteada
            currentlyFlippedCard = cardElement;
            // Añadimos un listener para des-voltearla si se hace clic fuera
            setTimeout(() => {
                document.addEventListener('click', handleDocumentClick);
            }, 0);
        } else {
            // La tarjeta acaba de ser des-volteada
            currentlyFlippedCard = null;
            document.removeEventListener('click', handleDocumentClick);
        }
        
        return;
    }

    // --- Lógica para Escritorio o modo Vista Rápida ---
    if (isRotationDisabled) {
        // ✨ MEJORA: Si la modal ya está abierta, el clic en una tarjeta la cierra.
        const quickViewModal = document.getElementById('quick-view-modal');
        if (quickViewModal && quickViewModal.classList.contains('is-visible')) { 
            closeModal();
            return; 
        }

        openModal(cardElement);
    }
    // En escritorio con rotación activada, el hover de CSS se encarga de todo.
}


// --- FUNCIONES PÚBLICAS (EXPORTADAS) ---

export function unflipAllCards() {
    if (currentlyFlippedCard) {
        const inner = currentlyFlippedCard.querySelector('.flip-card-inner');
        if (inner) {
            inner.classList.remove('is-flipped');
        }
        currentlyFlippedCard = null;
        document.removeEventListener('click', handleDocumentClick);
    }
}

export function setupCardInteractions() {
    document.querySelectorAll(`.${CSS_CLASSES.MOVIE_CARD}`).forEach(card => {
        // ✨ NOTA: Se ha simplificado la lógica. Eliminamos el listener de 'mouseleave'
        // que ya no es necesario para el nuevo comportamiento.
        card.removeEventListener('click', handleCardClick);
        card.addEventListener('click', handleCardClick);

        // Añadir listener para el scroll táctil en el reverso
        if (!isDesktop) {
            const scrollableContent = card.querySelector(SELECTORS.SCROLLABLE_CONTENT);
            if (scrollableContent) {
                scrollableContent.addEventListener('click', (e) => {
                    const inner = card.querySelector(SELECTORS.FLIP_CARD_INNER);
                    const isRotationDisabled = document.body.classList.contains('rotation-disabled');
                    
                    // Aplicar solo en modo pausa (táctil) y si la tarjeta está volteada
                    if (!isRotationDisabled && inner && inner.classList.contains(CSS_CLASSES.IS_FLIPPED)) {
                        e.stopPropagation(); // Evita que el clic des-voltee la tarjeta
                        scrollableContent.classList.toggle('full-view');
                    }
                });
            }
        }

        if (isDesktop) {
            const scrollableContent = card.querySelector(SELECTORS.SCROLLABLE_CONTENT);
            const plotSummary = card.querySelector(SELECTORS.PLOT_SUMMARY);

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
                    // Ahora el scrollable se colapsa solo al quitar el ratón.
                    scrollableContent.classList.remove('full-view');
                });
            }
        }
    });
}

export function renderMovieGrid(gridContainer, movies, isVirtual = false) {
    renderedCardCount = 0;
    currentlyFlippedCard = null;
    if (!gridContainer) return;
    
    // En modo no virtual, limpiamos como siempre.
    // En modo virtual, el contenedor ya tiene el "spacer" y no debe limpiarse.
    if (!isVirtual) {
        gridContainer.textContent = '';
    } else {
        // En modo virtual, eliminamos solo las tarjetas antiguas para reemplazarlas.
        gridContainer.querySelectorAll(`.${CSS_CLASSES.MOVIE_CARD}`).forEach(card => card.remove());
    }

    const fragment = document.createDocumentFragment();
    movies.forEach((movie) => {
        const card = createMovieCard(movie);
        if (card) fragment.appendChild(card);
    });

    // Añadimos el fragmento con las nuevas tarjetas.
    gridContainer.appendChild(fragment);
}

export function renderSkeletons(gridContainer, paginationContainer) {
    if (gridContainer) gridContainer.textContent = '';
    if (paginationContainer) paginationContainer.textContent = '';
    if (!gridContainer) return;

    const fragment = document.createDocumentFragment();
    for (let i = 0; i < CONFIG.ITEMS_PER_PAGE; i++) {
        fragment.appendChild(createElement('div', { className: 'skeleton-card' }));
    }
    gridContainer.appendChild(fragment);
}

export function renderNoResults(gridContainer, paginationContainer, activeFilters) {
    if (gridContainer) gridContainer.textContent = '';
    if (paginationContainer) paginationContainer.textContent = '';
    if (!gridContainer) return;

    const noResultsDiv = createElement('div', {
        className: 'no-results',
        attributes: { role: 'status' }
    });
    noResultsDiv.appendChild(createElement('h3', { textContent: 'No se encontraron resultados' }));

    const hasActiveFilters = Object.values(activeFilters).some(value => value && value !== 'id,asc' && value !== 'all');
    if (activeFilters.searchTerm) {
        noResultsDiv.appendChild(createElement('p', { textContent: `Prueba a simplificar tu búsqueda para "${activeFilters.searchTerm}".` }));
    } else if (hasActiveFilters) {
        noResultsDiv.appendChild(createElement('p', { textContent: 'Intenta eliminar algunos filtros para obtener más resultados.' }));
    }

    // ✨ CAMBIO APLICADO: 
    // Se reemplaza 'clear-filters-btn-empty' por el nuevo sistema de componentes 'btn btn--outline'.
    // Se mantiene el ID original para que el event listener en main.js siga funcionando sin cambios.
    noResultsDiv.appendChild(createElement('button', {
        id: 'clear-filters-from-empty',
        className: 'btn btn--outline',
        textContent: 'Limpiar todos los filtros'
    }));
    gridContainer.appendChild(noResultsDiv);
}

export function renderErrorState(gridContainer, paginationContainer, message) {
    if (gridContainer) gridContainer.textContent = '';
    if (paginationContainer) paginationContainer.textContent = '';
    if (!gridContainer) return;
    
    const errorDiv = createElement('div', {
        className: 'no-results',
        attributes: { role: 'alert' }
    });
    errorDiv.appendChild(createElement('h3', { textContent: '¡Vaya! Algo ha ido mal' }));
    errorDiv.appendChild(createElement('p', { textContent: message }));
    gridContainer.appendChild(errorDiv);
}