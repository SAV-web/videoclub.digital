// =================================================================
//          COMPONENTE: Rating Stars (UI Logic)
// =================================================================
// FICHERO: src/js/components/rating.js
// RESPONSABILIDAD: 
// - Calcular visualización de estrellas (Media vs Usuario).
// - Gestionar efectos visuales (Hover) sin lógica de negocio.
// - Renderizar el estado visual de las estrellas (relleno/clip).
// =================================================================

import { getUserDataForMovie, updateUserDataForMovie } from "../state.js";
import { setUserMovieDataAPI } from "../api.js";
import { CSS_CLASSES } from "../constants.js";
import { showToast } from "../ui.js";
import { triggerHapticFeedback, formatVotesUnified } from "../utils.js";

const MAX_VOTES = { FA: 220000, IMDB: 3200000 };
const SQRT_MAX_VOTES = { FA: Math.sqrt(MAX_VOTES.FA), IMDB: Math.sqrt(MAX_VOTES.IMDB) };

// =================================================================
//          1. REGLAS DE NEGOCIO (Domain Logic / State Helpers)
// =================================================================

export const LEVEL_TO_RATING_MAP = [5, 7, 9];
const MIN_STAR_THRESHOLD = 5.5;

/**
 * Resuelve cuál será la siguiente nota al hacer clic en una estrella.
 * Implementa el ciclo de UX para el nivel 1 (suspenso -> aprobado -> limpiar) y toggles simples.
 */
export function resolveNextRating(currentRating, clickedLevel) {
  if (clickedLevel === 1) {
    if (currentRating === 2) return 5;
    if (currentRating === 5) return null;
    return 2;
  }
  const potentialRating = LEVEL_TO_RATING_MAP[clickedLevel - 1];
  const currentVisualStars = calculateUserStars(currentRating);
  
  if (clickedLevel === currentVisualStars) return null; // Toggle off
  return potentialRating;
}

/**
 * Reglas de exclusividad mutua entre Watchlist y Rating.
 */
export function resolveWatchlistMutationOnRate(newRating) {
  if (newRating !== null) return false; // Si la marcamos como vista, ya no está en pendientes
  return undefined; // No mutar
}

export function resolveRatingMutationOnWatchlist(isOnWatchlist) {
  if (isOnWatchlist) return null; // Si la añadimos a pendientes, borramos la nota
  return undefined; // No mutar
}

/**
 * Helpers para decidir qué estado visual renderizar de forma determinista.
 */
export function getRatingPresentationState(movie, userData, isLoggedIn) {
  const userRating = userData?.rating;
  const hasUserVote = isLoggedIn && typeof userRating === 'number';
  const avg = movie?.avg_rating;
  const hasValidAverage = typeof avg === "number" && avg > 0;

  return {
    showUserRating: hasUserVote,
    showAverageRating: !hasUserVote && hasValidAverage && avg > MIN_STAR_THRESHOLD,
    showEmptyAverage: !hasUserVote && hasValidAverage && avg <= MIN_STAR_THRESHOLD,
    userRatingValue: userRating,
    averageRatingValue: avg,
    visualUserStars: calculateUserStars(userRating),
    visualAverageStars: calculateAverageStars(avg)
  };
}

// =================================================================
//          2. LÓGICA DE CÁLCULO VISUAL (Funciones Puras)
// =================================================================

/**
 * Convierte nota de usuario (1-10) a nivel de estrellas (0-3).
 * @param {number|null} rating
 * @returns {number} 0 a 3
 */
export function calculateUserStars(rating) {
  // Nota: 0 estrellas puede significar "sin voto" o "suspenso (2)"
  // La distinción se maneja en la capa de UI
  if (!rating) return 0;
  if (rating >= 9) return 3;
  if (rating >= 7) return 2;
  if (rating >= 5) return 1;
  return 0;
}

/**
 * Convierte nota media (0-10) a valor continuo para clip-path (0.0 - 3.0).
 * @param {number} averageRating 
 * @returns {number}
 */
export function calculateAverageStars(averageRating) {
  if (averageRating <= MIN_STAR_THRESHOLD) return 0;
  if (averageRating >= 9) return 3;
  // Interpolación lineal entre 5.5 y 9 sobre 3 estrellas
  return ((averageRating - MIN_STAR_THRESHOLD) / 3.5) * 3;
}

// =================================================================
//          2. LÓGICA DE RENDERIZADO (DOM)
// =================================================================

/**
 * Renderiza el estado visual de las estrellas.
 * @param {HTMLElement} starContainer - Contenedor de las estrellas.
 * @param {number} filledAmount - Cantidad de estrellas a llenar (ej: 2.5).
 * @param {Object} options - Configuración.
 */
function renderStars(starContainer, filledAmount, { hideUnfilled = false, snapToInteger = false } = {}) {
  // Usamos querySelectorAll para robustez frente a cambios en la estructura HTML
  const stars = starContainer.querySelectorAll(".star-icon");
  
  const effectiveFill = snapToInteger ? Math.round(filledAmount) : filledAmount;

  // Bucle imperativo para máximo rendimiento en animaciones
  for (let i = 0; i < stars.length; i++) {
    const star = stars[i];
    // Calcular cuánto se llena esta estrella específica (0 a 1)
    const fillValue = Math.max(0, Math.min(1, effectiveFill - i));
    
    // Búsqueda del path de relleno (scopeado al elemento actual)
    const filledPath = star.querySelector(".star-icon-path--filled");

    if (hideUnfilled && fillValue === 0) {
      // ESTADO: Estrella vacía en modo "solo lectura" (Media)
      // Usamos opacity: 0 para mantener el layout y eventos, pero hacerla invisible
      star.style.opacity = "0";
    } else {
      // ESTADO: Estrella visible (parcial o total)
      star.style.opacity = "1";
      
      // Técnica de recorte para estrellas parciales
      const clipPercentage = (1 - fillValue) * 100;
      const newClip = `inset(0 ${clipPercentage}% 0 0)`;
      // Optimización: Solo tocar el DOM si el estilo cambia
      if (filledPath.style.clipPath !== newClip) {
        filledPath.style.clipPath = newClip;
      }
    }
  }
}

export const renderAverageStars = (container, value) => 
  renderStars(container, value, { hideUnfilled: true, snapToInteger: false });

export const renderUserStars = (container, value, hideHollow = false) => 
  renderStars(container, value, { hideUnfilled: hideHollow, snapToInteger: true });

// =================================================================
//          3. INTERACCIÓN (Eventos)
// =================================================================

/**
 * Maneja el hover sobre las estrellas (Feedback visual inmediato).
 */
function handleRatingMouseMove(event) {
  // Usamos currentTarget para asegurar que tenemos el elemento con el listener
  const starIcon = event.currentTarget; 
  const starContainer = starIcon.parentElement; // Asumimos estructura directa
  
  if (!starContainer) return;

  const hoverLevel = parseInt(starIcon.dataset.ratingLevel, 10);
  
  // Renderizamos estado "potencial" (lo que pasaría si haces click)
  // hideHollowStars = false para que el usuario vea las estrellas vacías que va a rellenar
  renderUserStars(starContainer, hoverLevel, false);
}

/**
 * Restaura el estado original al salir del contenedor.
 */
function handleRatingMouseLeave(event) {
  // Disparamos evento para que 'card.js' refresque la UI con el estado real (store)
  // Esto desacopla rating.js del estado global.
  // Delegamos la restauración visual a card.js para mantener una única fuente de verdad
  const updateEvent = new CustomEvent("card:requestUpdate", {
    bubbles: true,
    composed: true,
    detail: { cardElement: event.currentTarget.closest(".movie-card") },
  });
  
  // El evento debe dispararse desde un elemento que esté en el DOM
  event.target.dispatchEvent(updateEvent);
}

export function setupRatingListeners(starContainer, isInteractive) {
  if (!isInteractive) return;

  // Delegación de eventos podría ser mejor si hay muchas estrellas, 
  // pero para 4 elementos, listeners directos son aceptables y más precisos para mouseenter.
  // 4 estrellas → listeners directos son más claros y baratos que delegación
  const stars = starContainer.querySelectorAll(".star-icon");
  
  stars.forEach((star) => {
    star.addEventListener("mouseenter", handleRatingMouseMove, { passive: true });
  });

  // Listener en el contenedor para detectar cuando salimos del área de votación
  starContainer.addEventListener("mouseleave", handleRatingMouseLeave, { passive: true });
}

// =================================================================
//          4. GESTIÓN DE ESTADO Y CLICS (Lógica de Negocio)
// =================================================================

async function setRating(movieId, value, card) {
  // 5.1 Mejora: Guardamos solo el rating anterior para un rollback preciso y robusto.
  // Usamos '?? null' para normalizar 'undefined' (sin datos) a 'null' (sin voto).
  const previousRating = getUserDataForMovie(movieId)?.rating ?? null;
  
  if (previousRating === value) return;

  const newState = { rating: value };

  const watchlistMutation = resolveWatchlistMutationOnRate(value);
  if (watchlistMutation !== undefined) {
    newState.onWatchlist = watchlistMutation;
  }

  triggerHapticFeedback("light");
  updateUserDataForMovie(movieId, newState);
  updateRatingUI(card);

  try {
    await setUserMovieDataAPI(movieId, newState);
    // 5.2 Feedback de confirmación solo al establecer voto, no al eliminarlo
    if (value !== null) triggerHapticFeedback("success");
  } catch (err) {
    showToast(err.message, "error");
    // Rollback: Restauramos explícitamente el rating anterior
    updateUserDataForMovie(movieId, { rating: previousRating });
    updateRatingUI(card);
  }
}

/**
 * Maneja el clic en elementos de valoración.
 * @returns {boolean} Devuelve true si el click fue manejado y debe detenerse la propagación.
 */
export function handleRatingClick(event, card) {
  const target = event.target;
  const starEl = target.closest(".star-icon[data-rating-level]");
  const wallRatingEl = target.closest(".wall-rating-number");
  const ratingBlock = target.closest(".card-rating-block");
  
  if (starEl) {
    event.preventDefault(); event.stopPropagation();
    const movieId = parseInt(card.dataset.movieId, 10);
    const currentRating = getUserDataForMovie(movieId)?.rating;
    const level = parseInt(starEl.dataset.ratingLevel, 10);

    const newRating = resolveNextRating(currentRating, level);

    setRating(movieId, newRating, card);
    
    // Feedback visual post-tap (Animación de pulso)
    starEl.classList.add('just-rated');
    setTimeout(() => starEl.classList.remove('just-rated'), 400);
    
    return true; // Handled
  } else if (wallRatingEl || (ratingBlock && document.body.classList.contains(CSS_CLASSES.ROTATION_DISABLED))) {
    event.preventDefault(); event.stopPropagation();
    const movieId = parseInt(card.dataset.movieId, 10);
    // Al pulsar el bloque o la nota, iniciamos el voto con "suspenso" (2)
    setRating(movieId, 2, card);
    return true;
  }
  return false; // Not handled
}

// =================================================================
//          5. ACTUALIZACIÓN DE UI (Estrellas y Barras)
// =================================================================

export function updateRatingUI(card) {
  const movieId = parseInt(card.dataset.movieId, 10);
  const movie = card.movieData;
  if (!movie) return;

  const userData = getUserDataForMovie(movieId);
  const userRating = userData?.rating;
  const isLoggedIn = document.body.classList.contains(CSS_CLASSES.USER_LOGGED_IN);

  const starCont = card.querySelector('[data-action="set-rating-estrellas"]');
  const circleEl = card.querySelector('[data-action="set-rating-suspenso"]');
  
  if (!starCont || !circleEl) return;

  circleEl.style.display = "none";
  starCont.style.display = "none";

  const state = getRatingPresentationState(movie, userData, isLoggedIn);

  const hideExtraStars = () => {
    const stars = starCont.querySelectorAll(".star-icon");
    for (let i = 1; i < stars.length; i++) stars[i].style.opacity = "0";
  };

  if (state.showUserRating) {
    starCont.classList.add("has-user-rating");
    circleEl.classList.add("has-user-rating");
    
    starCont.style.display = "flex";
    if (state.userRatingValue === 2) {
      renderUserStars(starCont, 0, false);
      hideExtraStars();
    } else {
      renderUserStars(starCont, state.visualUserStars, true);
    }
  } else {
    starCont.classList.remove("has-user-rating");
    circleEl.classList.remove("has-user-rating");
    
    if (state.showEmptyAverage) {
      if (isLoggedIn) {
        starCont.style.display = "flex";
        renderUserStars(starCont, 0);
        hideExtraStars();
      } else {
        circleEl.style.display = "block";
      }
    } else if (state.showAverageRating) {
      starCont.style.display = "flex";
      renderAverageStars(starCont, state.visualAverageStars);
    }
  }
}

export function setupCardRatings(container, movie) {
  const setup = (key, maxKey) => {
    const link = container.querySelector(`[data-template="${key}-link"]`);
    if (!link) return;

    // 8.2 Mejora: Cachear referencias DOM para evitar queries repetidas y mejorar legibilidad
    const ratingEl = container.querySelector(`[data-template="${key}-rating"]`);
    const barCont = container.querySelector(`[data-template="${key}-votes-bar-container"]`);
    const barEl = container.querySelector(`[data-template="${key}-votes-bar"]`);
    const countEl = container.querySelector(`[data-template="${key}-votes-count"]`);

    const id = movie[`${key}_id`];
    const rating = movie[`${key}_rating`];
    const votes = movie[`${key}_votes`] || 0;

    // 8.1 Mejora: Validación estricta de URL (evita falsos positivos como "http-fake")
    if (id && /^https?:\/\//.test(id)) {
      link.href = id;
      link.classList.remove("disabled");
      link.setAttribute("aria-label", `Nota ${key.toUpperCase()}: ${rating}`);
    } else {
      link.removeAttribute("href");
      link.classList.add("disabled");
    }

    if (ratingEl) ratingEl.textContent = rating ? (String(rating).includes(".") ? rating : `${rating}.0`) : "N/A";
    
    if (barCont) {
      barCont.style.display = votes > 0 ? "block" : "none";
      if (votes > 0 && barEl) {
        const width = Math.min((Math.sqrt(votes) / SQRT_MAX_VOTES[maxKey]) * 100, 100);
        barEl.style.width = `${width}%`;
        const formattedVotes = formatVotesUnified(votes, key);
        barCont.dataset.votes = formattedVotes;
        if (countEl) countEl.textContent = formattedVotes;
      }
    }
  };
  setup("fa", "FA");
  setup("imdb", "IMDB");
}