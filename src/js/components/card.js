// =================================================================
//          COMPONENTE: Movie Card (Tarjeta de Película)
// =================================================================
// Responsabilidades:
// - Crear el elemento DOM para una tarjeta de película a partir de una plantilla.
// - Poblar la tarjeta con los datos de la película (texto, imágenes, ratings).
// - Gestionar los listeners de eventos individuales de la tarjeta (hover, no-click).
// - Manejar la lógica de las acciones del usuario (watchlist, rating) con UI optimista
//   y feedback háptico para una experiencia táctil mejorada.
// =================================================================

import { CONFIG } from '../config.js';
import { formatRuntime, formatVotesUnified, createElement, triggerHapticFeedback } from '../utils.js';
import { CSS_CLASSES, SELECTORS } from '../constants.js';
import { openModal, closeModal } from './quick-view.js';
import { getUserDataForMovie, updateUserDataForMovie } from '../state.js';
import { setUserMovieDataAPI } from '../api-user.js';
import { showToast } from '../toast.js';
import {
    calculateAverageStars,
    renderAverageStars,
    calculateUserStars,
    renderUserStars,
    setupRatingListeners,
    setUpdateCardUIFn
} from './rating-stars.js';

// --- Constantes y Estado del Módulo ---

const MAX_VOTES = { FA: 220000, IMDB: 3200000 };
const SQRT_MAX_VOTES = { FA: Math.sqrt(MAX_VOTES.FA), IMDB: Math.sqrt(MAX_VOTES.IMDB) };
const cardTemplate = document.getElementById(SELECTORS.MOVIE_CARD_TEMPLATE.substring(1));
let renderedCardCount = 0; // Para priorizar la carga de las primeras imágenes
let currentlyFlippedCard = null;
const isDesktop = window.matchMedia('(hover: hover) and (pointer: fine)').matches;

/**
 * Observador de Intersección para cargar imágenes de forma diferida (lazy-loading).
 * Empieza a cargar las imágenes cuando están a 800px de entrar en el viewport.
 */
const lazyLoadObserver = new IntersectionObserver((entries, observer) => {
    entries.forEach(entry => {
        if (entry.isIntersecting) {
            const img = entry.target;
            img.onload = () => { img.classList.add(CSS_CLASSES.LOADED); img.onload = null; };
            img.src = img.dataset.src;
            observer.unobserve(img);
        }
    });
}, { rootMargin: '0px 0px 800px 0px' });


// =================================================================
//          LÓGICA DE ACCIONES DEL USUARIO (CON UI OPTIMISTA)
// =================================================================

/**
 * Actualiza la UI del botón de watchlist basándose en el estado global.
 * @param {HTMLElement} cardElement - El elemento de la tarjeta.
 */
function updateWatchlistActionUI(cardElement) {
    const movieId = parseInt(cardElement.dataset.movieId, 10);
    const userData = getUserDataForMovie(movieId);
    const watchlistButton = cardElement.querySelector('[data-action="toggle-watchlist"]');
    if (watchlistButton) {
        const isOnWatchlist = userData?.onWatchlist ?? false;
        watchlistButton.classList.toggle('is-active', isOnWatchlist);
        watchlistButton.setAttribute('aria-label', isOnWatchlist ? 'Quitar de mi lista' : 'Añadir a mi lista');
    }
}

/**
 * Maneja el clic en el botón de watchlist de forma optimista.
 * 1. Da feedback háptico.
 * 2. Actualiza el estado local y la UI inmediatamente.
 * 3. Llama a la API en segundo plano.
 * 4. Si la API falla, revierte el cambio y notifica al usuario.
 * @param {Event} event - El evento de clic.
 */
async function handleWatchlistClick(event) {
    event.preventDefault();
    event.stopPropagation();
    const button = event.currentTarget;
    const card = button.closest('.movie-card');
    const movieId = parseInt(card.dataset.movieId, 10);
    const wasOnWatchlist = button.classList.contains('is-active');
    const newUserData = { onWatchlist: !wasOnWatchlist };
    const previousUserData = getUserDataForMovie(movieId) || { onWatchlist: false, rating: null };

    triggerHapticFeedback('light');
    updateUserDataForMovie(movieId, newUserData);

    try {
        await setUserMovieDataAPI(movieId, newUserData);
        triggerHapticFeedback('success');
    } catch (error) {
        showToast(error.message, 'error');
        updateUserDataForMovie(movieId, previousUserData);
    }
}

/**
 * Maneja el clic en la primera opción de rating (suspenso/1 estrella).
 * Es un atajo para ciclar entre: sin nota -> suspenso -> 1 estrella -> sin nota.
 * @param {Event} event - El evento de clic.
 */
async function handleFirstOptionClick(event) {
    event.preventDefault();
    event.stopPropagation();
    const card = event.currentTarget.closest('.movie-card');
    const movieId = parseInt(card.dataset.movieId, 10);
    if (!movieId) return;
    
    const currentUserData = getUserDataForMovie(movieId) || { rating: null };
    const currentRating = currentUserData.rating;

    let newRating;
    if (currentRating === null) { newRating = 2; } 
    else if (currentRating === 2) { newRating = 3; } 
    else if (currentRating === 3) { newRating = null; } 
    else { newRating = 3; } // Si tiene otra nota, se establece a 1 estrella (rating 3)

    const newUserData = { rating: newRating };
    const previousUserData = JSON.parse(card.dataset.previousUserData || '{}');

    triggerHapticFeedback('light');
    updateUserDataForMovie(movieId, newUserData);
    
    try {
        await setUserMovieDataAPI(movieId, newUserData);
        triggerHapticFeedback('success');
    } catch (error) {
        showToast(error.message, 'error');
        updateUserDataForMovie(movieId, previousUserData);
    }
}


// =================================================================
//          RENDERIZADO Y ACTUALIZACIÓN DE LA UI DE LA TARJETA
// =================================================================

/**
 * Actualiza todos los elementos visuales de una tarjeta que dependen del estado del usuario.
 * (Watchlist, rating, etc.).
 * @param {HTMLElement} cardElement - El elemento de la tarjeta a actualizar.
 */
export function updateCardUI(cardElement) {
    const movieId = parseInt(cardElement.dataset.movieId, 10);
    const movieData = cardElement.movieData;
    if (!movieData) return;
    const userData = getUserDataForMovie(movieId);
    const userRating = userData?.rating;
    updateWatchlistActionUI(cardElement);
    const starContainer = cardElement.querySelector('[data-action="set-rating-estrellas"]');
    const lowRatingCircle = cardElement.querySelector('[data-action="set-rating-suspenso"]');
    if (!starContainer || !lowRatingCircle) return;
    
    const isLoggedIn = document.body.classList.contains('user-logged-in');
    cardElement.dataset.previousUserData = JSON.stringify(userData || { onWatchlist: false, rating: null });

    lowRatingCircle.style.display = 'none';
    starContainer.style.display = 'none';

    if (isLoggedIn && userRating !== null && userRating !== undefined) {
        starContainer.classList.add('has-user-rating');
        lowRatingCircle.classList.add('has-user-rating');
        
        if (userRating === 2) {
            lowRatingCircle.style.display = 'block';
        } else if (userRating >= 3) {
            starContainer.style.display = 'flex';
            renderUserStars(starContainer, calculateUserStars(userRating), true);
        }
    } else {
        starContainer.classList.remove('has-user-rating');
        lowRatingCircle.classList.remove('has-user-rating');
        const ratings = [movieData.fa_rating, movieData.imdb_rating].filter(r => r && r > 0);
        if (ratings.length > 0) {
            const average = ratings.reduce((a, b) => a + b, 0) / ratings.length;
            if (average <= 5.5) {
                lowRatingCircle.style.display = 'block';
            } else {
                starContainer.style.display = 'flex';
                renderAverageStars(starContainer, calculateAverageStars(average));
            }
        }
    }
    
    starContainer.classList.toggle('is-interactive', isLoggedIn);
    lowRatingCircle.classList.toggle('is-interactive', isLoggedIn);
}

/**
 * Configura la imagen del póster con lazy-loading y placeholders.
 * @param {HTMLImageElement} imgElement - El elemento <img> de la tarjeta.
 * @param {object} movieData - Los datos de la película.
 */
function setupCardImage(imgElement, movieData) {
    const version = movieData.last_synced_at ? new Date(movieData.last_synced_at).getTime() : '1';
    const basePosterUrl = (movieData.image && movieData.image !== '.') ? `${CONFIG.POSTER_BASE_URL}${movieData.image}.webp` : `https://via.placeholder.com/500x750.png?text=${encodeURIComponent(movieData.title)}`;
    const highQualityPoster = `${basePosterUrl}?v=${version}`;
    
    if (movieData.thumbhash_st) {
        imgElement.src = movieData.thumbhash_st;
        imgElement.dataset.src = highQualityPoster;
        imgElement.classList.add(CSS_CLASSES.LAZY_LQIP);
        lazyLoadObserver.observe(imgElement);
    } else {
        imgElement.src = highQualityPoster;
        imgElement.loading = (renderedCardCount < 6) ? 'eager' : 'lazy';
    }
    
    imgElement.alt = `Póster de ${movieData.title}`;
    if (renderedCardCount < 6) { 
        imgElement.setAttribute('fetchpriority', 'high');
    }
}

/**
 * Rellena los campos de texto y metadatos de la tarjeta.
 * @param {object} elements - Un objeto con referencias a los elementos DOM de la tarjeta.
 * @param {object} movieData - Los datos de la película.
 */
function populateCardText(elements, movieData) {
    elements.title.textContent = movieData.title || 'Título no disponible';
    elements.title.title = movieData.title || 'Título no disponible';
    const directorContainer = elements.director;
    directorContainer.textContent = '';
    const directorsString = movieData.directors || 'Director no disponible';
    if (directorsString && directorsString !== 'Director no disponible') {
        directorsString.split(',').map(name => name.trim()).forEach((name, index, arr) => {
            const link = createElement('a', { textContent: name, href: `#` });
            link.dataset.directorName = name;
            directorContainer.appendChild(link);
            if (index < arr.length - 1) directorContainer.appendChild(document.createTextNode(', '));
        });
    } else { directorContainer.textContent = directorsString; }
    
    elements.duration.textContent = formatRuntime(movieData.minutes);
    elements.episodes.textContent = (movieData.type?.toUpperCase().startsWith('S.') && movieData.episodes) ? `${movieData.episodes} x` : '';
    elements.genre.textContent = movieData.genres || 'Género no disponible';
    elements.actors.textContent = (movieData.actors?.toUpperCase() === '(A)') ? "Animación" : (movieData.actors || 'Reparto no disponible');
    elements.synopsis.textContent = movieData.synopsis || 'Argumento no disponible.';
    elements.criticContainer.style.display = (movieData.critic && movieData.critic.trim() !== '') ? 'block' : 'none';
    if (elements.criticContainer.style.display === 'block') elements.critic.textContent = movieData.critic;
    
    let displayYear = movieData.year || 'N/A';
    if (movieData.type?.toUpperCase().startsWith('S.') && movieData.year_end) {
        const yearEnd = String(movieData.year_end).trim();
        if (yearEnd.toUpperCase() === 'M') displayYear = `${movieData.year} (M)`;
        else if (yearEnd === '-') displayYear = `${movieData.year}-`;
        else if (!isNaN(yearEnd) && yearEnd.length === 4) displayYear = `${movieData.year}-${yearEnd.substring(2)}`;
        else displayYear = `${movieData.year} - ${yearEnd}`;
    }
    elements.year.textContent = displayYear;
    
    elements.countryContainer.style.display = movieData.country_code ? 'flex' : 'none';
    if (movieData.country_code) elements.countryFlag.className = `fi fi-${movieData.country_code}`;
    
    const collections = movieData.collections_list || '';
    elements.netflixIcon.style.display = 'none';
    elements.hboIcon.style.display = 'none';
    if (collections.includes('N')) {
        elements.netflixIcon.style.display = 'block';
    } else if (collections.includes('H')) {
        elements.hboIcon.style.display = 'block';
    }
}

/**
 * Configura los elementos de rating (Filmaffinity, IMDb) en la tarjeta.
 * @param {object} elements - Un objeto con referencias a los elementos DOM de la tarjeta.
 * @param {object} movieData - Los datos de la película.
 */
function setupCardRatings(elements, movieData) {
    const isValidHttpUrl = (s) => s && (s.startsWith('http://') || s.startsWith('https://'));
    elements.faLink.href = isValidHttpUrl(movieData.fa_id) ? movieData.fa_id : '#';
    elements.faLink.classList.toggle(CSS_CLASSES.DISABLED, !isValidHttpUrl(movieData.fa_id));
    elements.faRating.textContent = movieData.fa_rating ? `${movieData.fa_rating}`.includes('.') ? movieData.fa_rating : `${movieData.fa_rating}.0` : 'N/A';
    const faVotesCount = parseInt(String(movieData.fa_votes).replace(/\D/g, ''), 10) || 0;
    elements.faVotesBarContainer.style.display = faVotesCount > 0 ? 'block' : 'none';
    if (faVotesCount > 0) {
        elements.faVotesBar.style.width = `${Math.min((Math.sqrt(faVotesCount) / SQRT_MAX_VOTES.FA) * 100, 100)}%`;
        elements.faVotesBarContainer.title = `${formatVotesUnified(faVotesCount)} votos`;
    }
    elements.imdbLink.href = isValidHttpUrl(movieData.imdb_id) ? movieData.imdb_id : '#';
    elements.imdbLink.classList.toggle(CSS_CLASSES.DISABLED, !isValidHttpUrl(movieData.imdb_id));
    elements.imdbRating.textContent = movieData.imdb_rating ? `${movieData.imdb_rating}`.includes('.') ? movieData.imdb_rating : `${movieData.imdb_rating}.0` : 'N/A';
    const imdbVotesCount = parseInt(String(movieData.imdb_votes).replace(/\D/g, ''), 10) || 0;
    elements.imdbVotesBarContainer.style.display = imdbVotesCount > 0 ? 'block' : 'none';
    if (imdbVotesCount > 0) {
        elements.imdbVotesBar.style.width = `${Math.min((Math.sqrt(imdbVotesCount) / SQRT_MAX_VOTES.IMDB) * 100, 100)}%`;
        elements.imdbVotesBarContainer.title = `${formatVotesUnified(imdbVotesCount)} votos`;
    }
}


// =================================================================
//          MANEJO DE EVENTOS Y CREACIÓN DE TARJETAS
// =================================================================

/**
 * Voltea todas las tarjetas que estén mostrando su cara trasera.
 */
export function unflipAllCards() {
    if (currentlyFlippedCard) {
        currentlyFlippedCard.querySelector('.flip-card-inner')?.classList.remove('is-flipped');
        currentlyFlippedCard = null;
        document.removeEventListener('click', handleDocumentClick);
    }
}

/**
 * Listener para el documento que cierra una tarjeta volteada si se hace clic fuera de ella.
 * @param {Event} e
 */
function handleDocumentClick(e) {
    if (currentlyFlippedCard && !currentlyFlippedCard.contains(e.target)) {
        unflipAllCards();
    }
}

/**
 * Función principal que maneja los clics en una tarjeta.
 * Esta función es llamada por el listener delegado en main.js.
 * @param {Event} event - El evento de clic.
 */
export function handleCardClick(event) {
    const cardElement = this; // 'this' es establecido por .call() en el listener delegado
    const e = event;

    const directorLink = e.target.closest('.front-director-info a[data-director-name]');
    if (directorLink) {
        e.preventDefault();
        const eventDetail = { keepSort: true, newFilter: { type: 'director', value: directorLink.dataset.directorName } };
        document.dispatchEvent(new CustomEvent('filtersReset', { detail: eventDetail }));
        return;
    }
    if (e.target.closest('a')) return;

    const isRotationDisabled = document.body.classList.contains('rotation-disabled');
    if (!isDesktop && !isRotationDisabled) {
        e.preventDefault(); e.stopPropagation();
        const inner = cardElement.querySelector('.flip-card-inner');
        if (!inner) return;
        const isThisCardFlipped = inner.classList.contains('is-flipped');
        if (currentlyFlippedCard && currentlyFlippedCard !== cardElement) { unflipAllCards(); }
        inner.classList.toggle('is-flipped');
        if (!isThisCardFlipped) {
            currentlyFlippedCard = cardElement;
            setTimeout(() => document.addEventListener('click', handleDocumentClick), 0);
        } else {
            currentlyFlippedCard = null;
        }
        return;
    }

    if (isRotationDisabled) {
        if (document.getElementById('quick-view-modal')?.classList.contains('is-visible')) {
            closeModal();
            return;
        }
        openModal(cardElement);
    }
}

/**
 * Añade listeners de hover a una tarjeta para el efecto de volteo retardado en escritorio.
 * @param {HTMLElement} cardElement
 */
function setupIntentionalHover(cardElement) {
    let hoverTimeout;
    const HOVER_DELAY = 300;
    cardElement.addEventListener('mouseenter', () => {
        if (document.body.classList.contains('rotation-disabled')) return;
        hoverTimeout = setTimeout(() => cardElement.classList.add('is-hovered'), HOVER_DELAY);
    });
    cardElement.addEventListener('mouseleave', () => {
        clearTimeout(hoverTimeout);
        cardElement.classList.remove('is-hovered');
    });
}

/**
 * Inicializa los listeners de eventos que son específicos de una tarjeta individual
 * y no pueden ser delegados (ej. mouseenter/mouseleave).
 * @param {HTMLElement} cardElement
 */
export function initializeCard(cardElement) {
    setupIntentionalHover(cardElement);

    const isLoggedIn = document.body.classList.contains('user-logged-in');
    if (isLoggedIn) {
        cardElement.querySelector('[data-action="toggle-watchlist"]')?.addEventListener('click', handleWatchlistClick);
        const starContainer = cardElement.querySelector('[data-action="set-rating-estrellas"]');
        if (starContainer) {
            setupRatingListeners(starContainer, true);
            starContainer.querySelector('[data-rating-level="1"]')?.addEventListener('click', handleFirstOptionClick);
        }
        cardElement.querySelector('[data-action="set-rating-suspenso"]')?.addEventListener('click', handleFirstOptionClick);
    }
}

/**
 * Crea una nueva tarjeta de película y la configura.
 * @param {object} movieData - Los datos de la película.
 * @returns {DocumentFragment | null} - Un fragmento de documento con la tarjeta o null si falla.
 */
function createMovieCard(movieData) {
    if (!cardTemplate) return null;
    const cardClone = cardTemplate.content.cloneNode(true);
    const cardElement = cardClone.querySelector(`.${CSS_CLASSES.MOVIE_CARD}`);
    cardElement.dataset.movieId = movieData.id;
    cardElement.movieData = movieData;
    if (movieData.id) cardElement.style.viewTransitionName = `movie-${movieData.id}`;
    
    const elements = {
        img: cardClone.querySelector('img'), title: cardClone.querySelector(SELECTORS.TITLE), director: cardClone.querySelector(SELECTORS.DIRECTOR),
        year: cardClone.querySelector(SELECTORS.YEAR), countryContainer: cardClone.querySelector(SELECTORS.COUNTRY_CONTAINER),
        countryFlag: cardClone.querySelector(SELECTORS.COUNTRY_FLAG), faLink: cardClone.querySelector(SELECTORS.FA_LINK),
        faRating: cardClone.querySelector(SELECTORS.FA_RATING), faVotesBarContainer: cardClone.querySelector('[data-template="fa-votes-bar-container"]'),
        faVotesBar: cardClone.querySelector('[data-template="fa-votes-bar"]'), imdbLink: cardClone.querySelector(SELECTORS.IMDB_LINK),
        imdbRating: cardClone.querySelector(SELECTORS.IMDB_RATING), imdbVotesBarContainer: cardClone.querySelector('[data-template="imdb-votes-bar-container"]'),
        imdbVotesBar: cardClone.querySelector('[data-template="imdb-votes-bar"]'), duration: cardClone.querySelector(SELECTORS.DURATION),
        episodes: cardClone.querySelector('[data-template="episodes"]'), netflixIcon: cardClone.querySelector('[data-template="netflix-icon"]'),
        hboIcon: cardClone.querySelector('[data-template="hbo-icon"]'), wikipediaLink: cardClone.querySelector('[data-template="wikipedia-link"]'),
        genre: cardClone.querySelector(SELECTORS.GENRE), actors: cardClone.querySelector(SELECTORS.ACTORS), synopsis: cardClone.querySelector(SELECTORS.SYNOPSIS),
        criticContainer: cardClone.querySelector('[data-template="critic-container"]'), critic: cardClone.querySelector('[data-template="critic"]')
    };

    populateCardText(elements, movieData);
    setupCardImage(elements.img, movieData);
    setupCardRatings(elements, movieData);
    elements.wikipediaLink.href = (movieData.wikipedia && movieData.wikipedia.startsWith('http')) ? movieData.wikipedia : '#';
    elements.wikipediaLink.style.display = (movieData.wikipedia && movieData.wikipedia.startsWith('http')) ? 'inline-flex' : 'none';
    
    updateCardUI(cardElement); 
    initializeCard(cardElement);
    
    return cardClone;
}


// =================================================================
//          FUNCIONES PÚBLICAS DE RENDERIZADO
// =================================================================

/**
 * Renderiza la parrilla completa de tarjetas de películas.
 * @param {HTMLElement} gridContainer - El elemento contenedor de la parrilla.
 * @param {object[]} movies - Un array con los datos de las películas.
 */
export function renderMovieGrid(gridContainer, movies) { 
    renderedCardCount = 0; 
    unflipAllCards(); 
    if (!gridContainer) return; 
    
    gridContainer.textContent = ''; 
    const fragment = document.createDocumentFragment(); 
    
    movies.forEach((movie, index) => {
        const cardNode = createMovieCard(movie); 
        if (cardNode) {
            const cardElement = cardNode.querySelector('.movie-card');
            if (cardElement) {
                cardElement.style.setProperty('--card-index', index);
                renderedCardCount++;
            }
            fragment.appendChild(cardNode); 
        }
    }); 
    
    gridContainer.appendChild(fragment); 
}

/**
 * Renderiza los esqueletos de carga mientras se obtienen los datos.
 * @param {HTMLElement} gridContainer
 * @param {HTMLElement} paginationContainer
 */
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

/**
 * Renderiza el mensaje de "Sin resultados".
 * @param {HTMLElement} gridContainer
 * @param {HTMLElement} paginationContainer
 * @param {object} activeFilters
 */
export function renderNoResults(gridContainer, paginationContainer, activeFilters) {
    if (gridContainer) gridContainer.textContent = '';
    if (paginationContainer) paginationContainer.textContent = '';
    if (!gridContainer) return;
    const noResultsDiv = createElement('div', { className: 'no-results', attributes: { role: 'status' } });
    noResultsDiv.appendChild(createElement('h3', { textContent: 'No se encontraron resultados' }));
    const hasActiveFilters = Object.values(activeFilters).some(value => value && value !== 'id,asc' && value !== 'all');
    if (activeFilters.searchTerm) {
        noResultsDiv.appendChild(createElement('p', { textContent: `Prueba a simplificar tu búsqueda para "${activeFilters.searchTerm}".` }));
    } else if (hasActiveFilters) {
        noResultsDiv.appendChild(createElement('p', { textContent: 'Intenta eliminar algunos filtros para obtener más resultados.' }));
    }
    noResultsDiv.appendChild(createElement('button', { id: 'clear-filters-from-empty', className: 'btn btn--outline', textContent: 'Limpiar todos los filtros' }));
    gridContainer.appendChild(noResultsDiv);
}

/**
 * Renderiza un mensaje de error en la parrilla.
 * @param {HTMLElement} gridContainer
 * @param {HTMLElement} paginationContainer
 * @param {string} message
 */
export function renderErrorState(gridContainer, paginationContainer, message) {
    if (gridContainer) gridContainer.textContent = '';
    if (paginationContainer) paginationContainer.textContent = '';
    if (!gridContainer) return;
    const errorDiv = createElement('div', { className: 'no-results', attributes: { role: 'alert' } });
    errorDiv.appendChild(createElement('h3', { textContent: '¡Vaya! Algo ha ido mal' }));
    errorDiv.appendChild(createElement('p', { textContent: message }));
    gridContainer.appendChild(errorDiv);
}

// Inyecta la función de actualización de UI en el módulo de estrellas para evitar dependencias circulares.
setUpdateCardUIFn(updateCardUI);