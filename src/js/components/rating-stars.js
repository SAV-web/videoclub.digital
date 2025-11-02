// =================================================================
//          COMPONENTE: Rating Stars (v2.8 - Renderizado Optimizado)
// =================================================================
// v2.8 - Refactorizada la lógica de renderizado para mejorar el rendimiento.
//        - Se reemplaza 'display: none' por 'visibility: hidden' para evitar
//          reflows costosos al ocultar estrellas.
//        - Se mantiene la precisión del clip-path para valoraciones fraccionarias.
// =================================================================

import { getUserDataForMovie, updateUserDataForMovie } from '../state.js';
import { setUserMovieDataAPI } from '../api-user.js';
import { showToast } from '../toast.js';

const LEVEL_TO_RATING_MAP = [3, 5, 7, 9];
let updateCardUI; // Dependencia inyectada

// --- LÓGICA DE CÁLCULO (sin cambios) ---
export function calculateUserStars(rating) {
    if (rating === null || rating === undefined) return 0;
    if (rating >= 9) return 4;
    if (rating >= 7) return 3;
    if (rating >= 5) return 2;
    if (rating >= 1) return 1;
    return 0;
}

export function calculateAverageStars(averageRating) {
    if (averageRating <= 5.5) return 0;
    if (averageRating >= 9) return 4;
    return ((averageRating - 5.5) / (9 - 5.5)) * 4;
}

// =================================================================
//          LÓGICA DE RENDERIZADO (REFACTORIZADA)
// =================================================================

/**
 * Función interna y genérica que renderiza las estrellas de forma optimizada.
 * Es el único punto de verdad para la manipulación del DOM de las estrellas.
 * @param {HTMLElement} starContainer El contenedor de los elementos SVG de las estrellas.
 * @param {number} filledStars El número de estrellas a rellenar (puede ser fraccionario).
 * @param {object} [options] Opciones de configuración.
 * @param {boolean} [options.hideUnfilled=false] Si es true, oculta las estrellas que no están rellenas.
 * @param {boolean} [options.snapToInteger=false] Si es true, redondea el relleno al entero más cercano.
 */
function renderStars(starContainer, filledStars, { hideUnfilled = false, snapToInteger = false } = {}) {
    const stars = starContainer.querySelectorAll('.star-icon');
    const effectiveFilledStars = snapToInteger ? Math.round(filledStars) : filledStars;

    stars.forEach((star, index) => {
        const fillValue = Math.max(0, Math.min(1, effectiveFilledStars - index));
        const filledPath = star.querySelector('.star-icon-path--filled');
        
        // ▼▼▼ MEJORA CLAVE ▼▼▼
        // En lugar de cambiar 'display', que causa un reflow, usamos 'visibility'.
        // 'visibility: hidden' hace el elemento invisible pero sigue ocupando su espacio,
        // evitando que el layout de los elementos hermanos (las otras estrellas) se recalcule.
        if (hideUnfilled && fillValue === 0) {
            star.style.visibility = 'hidden';
        } else {
            star.style.visibility = 'visible';
            
            // Calculamos el porcentaje para el clip-path.
            const clipPercentage = 100 - (fillValue * 100);
            
            // Aplicamos el estilo. Cambiar clip-path es una operación mucho más barata
            // que cambiar el layout, y a menudo está acelerada por hardware.
            filledPath.style.clipPath = `inset(0 ${clipPercentage}% 0 0)`;
        }
    });
}

/**
 * Renderiza las estrellas para la nota media (relleno fraccionario).
 * @param {HTMLElement} starContainer Contenedor de las estrellas.
 * @param {number} filledStars Número fraccionario de estrellas a rellenar.
 */
export function renderAverageStars(starContainer, filledStars) {
    // ==========================================================
    //  ▼▼▼ CAMBIO CLAVE: hideUnfilled ahora es 'true' ▼▼▼
    //      Esto asegura que solo se muestren las estrellas con relleno.
    // ==========================================================
    renderStars(starContainer, filledStars, { hideUnfilled: true, snapToInteger: false });
}

/**
 * Renderiza las estrellas para la valoración del usuario (relleno entero).
 * @param {HTMLElement} starContainer Contenedor de las estrellas.
 * @param {number} filledLevel Número de estrellas completas a mostrar.
 * @param {boolean} [hideHollowStars=false] Si es true, oculta las estrellas vacías.
 */
export function renderUserStars(starContainer, filledLevel, hideHollowStars = false) {
    // Esta función ya funcionaba correctamente, pero se beneficia de la lógica
    // simplificada en renderStars.
    renderStars(starContainer, filledLevel, { hideUnfilled: hideHollowStars, snapToInteger: true });
}

// --- LÓGICA DE INTERACCIÓN (sin cambios) ---

async function handleRatingClick(event) {
    event.preventDefault();
    event.stopPropagation();

    const clickedElement = event.currentTarget;
    // ▼▼▼ CAMBIO CLAVE ▼▼▼
    // Hacemos la búsqueda del contenedor más genérica. Buscamos el ancestro más
    // cercano que tenga el ID de la película, ya sea una `.movie-card` o el
    // contenedor de la Quick View (`#quick-view-content`).
    const interactiveContainer = clickedElement.closest('[data-movie-id]');
    if (!interactiveContainer) return;

    const movieId = parseInt(interactiveContainer.dataset.movieId, 10);
    const starIndex = parseInt(clickedElement.dataset.ratingLevel, 10) - 1;

    const currentUserData = getUserDataForMovie(movieId) || { rating: null };
    const currentStars = calculateUserStars(currentUserData.rating);
    const numStarsClicked = starIndex + 1;

    let newRating = (numStarsClicked === currentStars) ? null : LEVEL_TO_RATING_MAP[starIndex];

    const newUserData = { rating: newRating };
    const previousUserData = JSON.parse(interactiveContainer.dataset.previousUserData || '{}');

    updateUserDataForMovie(movieId, newUserData);
    updateCardUI(interactiveContainer);

    try {
        await setUserMovieDataAPI(movieId, newUserData);
    } catch (error) {
        showToast(error.message, 'error');
        updateUserDataForMovie(movieId, previousUserData);
        updateCardUI(interactiveContainer);
    }
}

function handleRatingMouseMove(event) {
    const starContainer = event.currentTarget.closest('.star-rating-container');
    const hoverLevel = parseInt(event.currentTarget.dataset.ratingLevel, 10);
    renderUserStars(starContainer, hoverLevel);
}

function handleRatingMouseLeave(event) {
    // ▼▼▼ CAMBIO CLAVE ▼▼▼
    // Misma lógica que en handleRatingClick para encontrar el contenedor correcto.
    const interactiveContainer = event.currentTarget.closest('[data-movie-id]');
    if (interactiveContainer && updateCardUI) {
        // Al salir el ratón, restauramos el estado visual actual (la nota guardada).
        updateCardUI(interactiveContainer);
    }
}

export function setupRatingListeners(starContainer, isInteractive) {
    const stars = starContainer.querySelectorAll('.star-icon[data-rating-level]');
    if (isInteractive) {
        stars.forEach(star => {
            const level = parseInt(star.dataset.ratingLevel, 10);
            if (level > 1) { 
                star.addEventListener('click', handleRatingClick);
            }
            star.addEventListener('mousemove', handleRatingMouseMove);
        });
        starContainer.addEventListener('mouseleave', handleRatingMouseLeave);
    }
}

export function setUpdateCardUIFn(fn) {
    updateCardUI = fn;
}