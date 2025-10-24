// =================================================================
//          COMPONENTE: Rating Stars (v2.6 - Final)
// =================================================================
import { getUserDataForMovie, updateUserDataForMovie } from '../state.js';
import { setUserMovieDataAPI } from '../api-user.js';
import { showToast } from '../toast.js';

// NOTAS EXACTAS para cada nivel de estrellas. El índice corresponde al nivel - 1.
// 1 estrella = nota 3, 2 estrellas = nota 5, etc.
const LEVEL_TO_RATING_MAP = [3, 5, 7, 9];

// --- LÓGICA DE CÁLCULO ---
export function calculateUserStars(rating) {
    if (rating === null || rating === undefined) return 0;
    if (rating >= 9) return 4;
    if (rating >= 7) return 3;
    if (rating >= 5) return 2;
    if (rating >= 1) return 1; // Incluye la nota de suspenso (ej. 2)
    return 0;
}
/**
 * Calcula el número fraccionario de estrellas para la nota media.
 * @param {number} averageRating - La nota media (1-10).
 * @returns {number} El número de estrellas a rellenar (0-4).
 */
export function calculateAverageStars(averageRating) {
    if (averageRating <= 5.5) return 0;
    if (averageRating >= 9) return 4;
    return ((averageRating - 5.5) / (9 - 5.5)) * 4;
}

// --- LÓGICA DE RENDERIZADO ---

/**
 * Renderiza estrellas con relleno fraccionario.
 * @param {HTMLElement} starContainer - El contenedor de las estrellas.
 * @param {number} filledStars - El número fraccionario de estrellas.
 */
export function renderAverageStars(starContainer, filledStars) {
    const stars = starContainer.querySelectorAll('.star-icon');
    stars.forEach((star, index) => {
        const fillValue = Math.max(0, Math.min(1, filledStars - index));
        if (fillValue > 0) {
            star.style.display = 'block';
            const filledPath = star.querySelector('.star-icon-path--filled');
            const clipPercentage = 100 - (fillValue * 100);
            filledPath.style.clipPath = `inset(0 ${clipPercentage}% 0 0)`;
        } else {
            star.style.display = 'none';
        }
    });
}

/**
 * Renderiza un número de estrellas completas.
 * @param {HTMLElement} starContainer - El contenedor de las estrellas.
 * @param {number} filledLevel - El número de estrellas a rellenar.
 * @param {boolean} [hideHollowStars=false] - Si es true, las estrellas no rellenas se ocultan.
 */
export function renderUserStars(starContainer, filledLevel, hideHollowStars = false) {
    const stars = starContainer.querySelectorAll('.star-icon');
    stars.forEach((star, index) => {
        if (hideHollowStars && index >= filledLevel) {
            star.style.display = 'none'; // Oculta las estrellas que deberían ser huecas
        } else {
            star.style.display = 'block'; // Asegura que las estrellas estén visibles
            const filledPath = star.querySelector('.star-icon-path--filled');
            filledPath.style.clipPath = (index < filledLevel) ? 'inset(0 0% 0 0)' : 'inset(0 100% 0 0)';
        }
    });
}

// --- LÓGICA DE INTERACCIÓN ---

/**
 * Maneja el clic en las estrellas 2, 3 o 4.
 */
async function handleRatingClick(event) {
    event.preventDefault();
    event.stopPropagation();
    
    const clickedElement = event.currentTarget;
    const card = clickedElement.closest('.movie-card');
    const movieId = parseInt(card.dataset.movieId, 10);
    const starIndex = parseInt(clickedElement.dataset.ratingLevel, 10) - 1;

    const currentUserData = getUserDataForMovie(movieId) || { rating: null };
    const currentStars = calculateUserStars(currentUserData.rating);
    const numStarsClicked = starIndex + 1;

    let newRating = (numStarsClicked === currentStars) ? null : LEVEL_TO_RATING_MAP[starIndex];
    
    const newUserData = { rating: newRating };
    const previousUserData = JSON.parse(card.dataset.previousUserData || '{}');

    updateUserDataForMovie(movieId, newUserData);
    updateCardUI(card);
    
    try {
        await setUserMovieDataAPI(movieId, newUserData);
    } catch (error) {
        showToast(error.message, 'error');
        updateUserDataForMovie(movieId, previousUserData);
        updateCardUI(card);
    }
}

/**
 * Maneja el movimiento del ratón sobre las estrellas.
 */
function handleRatingMouseMove(event) {
    const starContainer = event.currentTarget.closest('.star-rating-container');
    const hoverLevel = parseInt(event.currentTarget.dataset.ratingLevel, 10);
    renderUserStars(starContainer, hoverLevel);
}

/**
 * Maneja cuando el ratón sale del contenedor de estrellas.
 */
function handleRatingMouseLeave(event) {
    const card = event.currentTarget.closest('.movie-card');
    if (card && updateCardUI) {
        updateCardUI(card);
    }
}

/**
 * Asigna los listeners de eventos para la interactividad de las estrellas.
 * @param {HTMLElement} starContainer - El contenedor de las estrellas.
 * @param {boolean} isInteractive - Si es true, se añaden los listeners de clic y hover.
 */
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

// Setter para inyectar la dependencia de `updateCardUI` desde `card.js`.
let updateCardUI;
export function setUpdateCardUIFn(fn) {
    updateCardUI = fn;
}