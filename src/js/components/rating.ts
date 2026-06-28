// =================================================================
//          COMPONENTE: Rating Stars (UI Logic)
// =================================================================
// FICHERO: src/js/components/rating.ts
// RESPONSABILIDAD: 
// - Calcular visualización de estrellas (Media vs Usuario).
// - Gestionar efectos visuales (Hover) sin lógica de negocio.
// - Renderizar el estado visual de las estrellas (relleno/clip).
// =================================================================

import { getUserDataForMovie, updateUserDataForMovie, appEvents } from "../state.js";
import { setUserMovieDataAPI } from "../api.js";
import { CSS_CLASSES } from "../constants.js";
import { showToast } from "../ui.js";
import { triggerHapticFeedback, formatVotesUnified, getFriendlyErrorMessage } from "../utils.js";
import { Movie, UserMovieEntry, MovieCardElement } from "../types.js";

const MAX_VOTES = { FA: 220000, IMDB: 3200000 } as const;
const SQRT_MAX_VOTES = { FA: Math.sqrt(MAX_VOTES.FA), IMDB: Math.sqrt(MAX_VOTES.IMDB) } as const;

// =================================================================
//          1. REGLAS DE NEGOCIO (Domain Logic / State Helpers)
// =================================================================

export const LEVEL_TO_RATING_MAP = [5, 7, 9] as const;
const MIN_STAR_THRESHOLD = 5.5;

/**
 * Resuelve cuál será la siguiente nota al hacer clic en una estrella.
 * Implementa el ciclo de UX para el nivel 1 (suspenso -> aprobado -> limpiar) y toggles simples.
 */
export function resolveNextRating(currentRating: number | null | undefined, clickedLevel: number): number | null {
  if (clickedLevel === 1) {
    if (currentRating === 2) return 5;
    if (currentRating === 5) return null;
    return 2;
  }
  const potentialRating = LEVEL_TO_RATING_MAP[(clickedLevel - 1) as 0 | 1 | 2];
  const currentVisualStars = calculateUserStars(currentRating);
  
  if (clickedLevel === currentVisualStars) return null; // Toggle off
  return potentialRating;
}

/**
 * Reglas de exclusividad mutua entre Watchlist y Rating.
 */
export function resolveWatchlistMutationOnRate(newRating: number | null): boolean | undefined {
  if (newRating !== null) return false; // Si la marcamos como vista, ya no está en pendientes
  return undefined; // No mutar
}

export function resolveRatingMutationOnWatchlist(isOnWatchlist: boolean): number | null | undefined {
  if (isOnWatchlist) return null; // Si la añadimos a pendientes, borramos la nota
  return undefined; // No mutar
}

export interface RatingPresentationState {
  showUserRating: boolean;
  showAverageRating: boolean;
  showEmptyAverage: boolean;
  userRatingValue: number | null | undefined;
  averageRatingValue: number | null | undefined;
  visualUserStars: number;
  visualAverageStars: number;
}

/**
 * Helpers para decidir qué estado visual renderizar de forma determinista.
 */
export function getRatingPresentationState(
  movie: Movie | undefined,
  userData: UserMovieEntry | undefined,
  isLoggedIn: boolean
): RatingPresentationState {
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
export function calculateUserStars(rating: number | null | undefined): number {
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
export function calculateAverageStars(averageRating: number | null | undefined): number {
  if (averageRating === null || averageRating === undefined || averageRating <= MIN_STAR_THRESHOLD) return 0;
  if (averageRating >= 9) return 3;
  // Interpolación lineal entre 5.5 y 9 sobre 3 estrellas
  return ((averageRating - MIN_STAR_THRESHOLD) / 3.5) * 3;
}

// =================================================================
//          2. LÓGICA DE RENDERIZADO (DOM)
// =================================================================

interface RenderStarsOptions {
  hideUnfilled?: boolean;
  snapToInteger?: boolean;
}

/**
 * Renderiza el estado visual de las estrellas.
 * @param {HTMLElement} starContainer - Contenedor de las estrellas.
 * @param {number} filledAmount - Cantidad de estrellas a llenar (ej: 2.5).
 * @param {Object} options - Configuración.
 */
function renderStars(
  starContainer: HTMLElement,
  filledAmount: number,
  { hideUnfilled = false, snapToInteger = false }: RenderStarsOptions = {}
): void {
  // OPTIMIZACIÓN: starContainer.children es una colección instantánea O(1), mucho más rápida que querySelectorAll
  const stars = starContainer.children;
  
  const effectiveFill = snapToInteger ? Math.round(filledAmount) : filledAmount;

  for (let i = 0; i < stars.length; i++) {
    const star = stars[i] as HTMLElement;
    // Calcular cuánto se llena esta estrella específica (0 a 1)
    const fillValue = Math.max(0, Math.min(1, effectiveFill - i));
    
    // OPTIMIZACIÓN: Accedemos directamente al último hijo (el path relleno) sin buscar en el DOM
    const filledPath = star.lastElementChild as HTMLElement | null;

    if (filledPath) {
      if (hideUnfilled && fillValue === 0) {
        // OPTIMIZACIÓN: Solo escribimos en el DOM si el valor realmente cambió
        if (star.style.opacity !== "0") star.style.opacity = "0";
      } else {
        if (star.style.opacity !== "1") star.style.opacity = "1";
        
        // Técnica de recorte para estrellas parciales
        const clipPercentage = (1 - fillValue) * 100;
        const newClip = `inset(0 ${clipPercentage}% 0 0)`;
        if (filledPath.style.clipPath !== newClip) {
          filledPath.style.clipPath = newClip;
        }
      }
    }
  }
}

export const renderAverageStars = (container: HTMLElement, value: number): void => 
  renderStars(container, value, { hideUnfilled: true, snapToInteger: false });

export const renderUserStars = (container: HTMLElement, value: number, hideHollow = false): void => 
  renderStars(container, value, { hideUnfilled: hideHollow, snapToInteger: true });

// =================================================================
//          3. INTERACCIÓN (Eventos)
// =================================================================

/**
 * Maneja el hover sobre las estrellas (Feedback visual inmediato).
 */
function handleRatingMouseMove(event: MouseEvent): void {
  const target = event.target as HTMLElement;
  const starIcon = target.closest<HTMLElement>(".star-icon");
  if (!starIcon) return;
  
  const starContainer = event.currentTarget as HTMLElement;
  const hoverLevel = parseInt(starIcon.dataset.ratingLevel || "0", 10);
  
  // Renderizamos estado "potencial" (lo que pasaría si haces click)
  // hideHollowStars = false para que el usuario vea las estrellas vacías que va a rellenar
  renderUserStars(starContainer, hoverLevel, false);
}

/**
 * Restaura el estado original al salir del contenedor.
 */
function handleRatingMouseLeave(event: MouseEvent): void {
  // Disparamos evento para que 'card.js' refresque la UI con el estado real (store)
  // Esto desacopla rating.js del estado global.
  // Delegamos la restauración visual a card.js para mantener una única fuente de verdad
  const starContainer = event.currentTarget as HTMLElement;
  const cardElement = starContainer.closest<HTMLElement>(".movie-card");
  if (cardElement) {
    appEvents.emit("card:requestUpdate", { cardElement });
  }
}

export function setupRatingListeners(starContainer: HTMLElement, isInteractive: boolean): void {
  if (!isInteractive) return;

  // OPTIMIZACIÓN: Usamos 'mouseover' en el contenedor (burbujea) en lugar de 'mouseenter' en cada estrella.
  // Pasamos de tener 3 listeners por tarjeta a solo 1 (y sin usar querySelectorAll).
  starContainer.addEventListener("mouseover", handleRatingMouseMove as EventListener, { passive: true });

  // Listener en el contenedor para detectar cuando salimos del área de votación
  starContainer.addEventListener("mouseleave", handleRatingMouseLeave as EventListener, { passive: true });
}

// =================================================================
//          4. GESTIÓN DE ESTADO Y CLICS (Lógica de Negocio)
// =================================================================

async function setRating(movieId: number, value: number | null, card: MovieCardElement): Promise<void> {
  // 5.1 Mejora: Guardamos solo el rating anterior para un rollback preciso y robusto.
  // Usamos '?? null' para normalizar 'undefined' (sin datos) a 'null' (sin voto).
  const previousRating = getUserDataForMovie(movieId)?.rating ?? null;
  
  if (previousRating === value) return;

  const newState: Partial<UserMovieEntry> = { rating: value };

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
  } catch (err: unknown) {
    showToast(getFriendlyErrorMessage(err) || "No se pudo guardar la valoración.", "error");
    // Rollback: Restauramos explícitamente el rating anterior
    updateUserDataForMovie(movieId, { rating: previousRating });
    updateRatingUI(card);
  }
}

/**
 * Maneja el clic en elementos de valoración.
 * @returns {boolean} Devuelve true si el click fue manejado y debe detenerse la propagación.
 */
export function handleRatingClick(event: MouseEvent, card: MovieCardElement): boolean {
  const target = event.target as HTMLElement;
  const starEl = target.closest<HTMLElement>(".star-icon[data-rating-level]");
  const wallRatingEl = target.closest<HTMLElement>(".wall-rating-number");
  const ratingBlock = target.closest<HTMLElement>(".card-rating-block");
  
  if (starEl) {
    event.preventDefault(); event.stopPropagation();
    const movieId = parseInt(card.dataset.movieId || "0", 10);
    const currentRating = getUserDataForMovie(movieId)?.rating;
    const level = parseInt(starEl.dataset.ratingLevel || "0", 10);

    const newRating = resolveNextRating(currentRating, level);

    setRating(movieId, newRating, card);
    
    // Feedback visual post-tap (Animación de pulso)
    starEl.classList.add('just-rated');
    setTimeout(() => starEl.classList.remove('just-rated'), 400);
    
    return true; // Handled
  } else if (wallRatingEl || (ratingBlock && document.body.classList.contains(CSS_CLASSES.ROTATION_DISABLED))) {
    event.preventDefault(); event.stopPropagation();
    const movieId = parseInt(card.dataset.movieId || "0", 10);
    // Al pulsar el bloque o la nota, iniciamos el voto con "suspenso" (2)
    setRating(movieId, 2, card);
    return true;
  }
  return false; // Not handled
}

// =================================================================
//          5. ACTUALIZACIÓN DE UI (Estrellas y Barras)
// =================================================================

export function updateRatingUI(card: MovieCardElement): void {
  const movieId = parseInt(card.dataset.movieId || "0", 10);
  const movie = card.movieData;
  if (!movie) return;

  const userData = getUserDataForMovie(movieId);
  const isLoggedIn = document.body.classList.contains(CSS_CLASSES.USER_LOGGED_IN);

  const starCont = card.querySelector<HTMLElement>('[data-action="set-rating-estrellas"]');
  const circleEl = card.querySelector<HTMLElement>('[data-action="set-rating-suspenso"]');
  
  if (!starCont || !circleEl) return;

  const state = getRatingPresentationState(movie, userData, isLoggedIn);

  const hideExtraStars = (): void => {
    const stars = starCont.children; // Opt: Acceso directo sin querySelectorAll
    for (let i = 1; i < stars.length; i++) {
      const star = stars[i] as HTMLElement;
      if (star.style.opacity !== "0") star.style.opacity = "0";
    }
  };

  let starDisplay = "none";
  let circleDisplay = "none";
  let hasUserRatingClass = false;

  if (state.showUserRating) {
    hasUserRatingClass = true;
    
    starDisplay = "flex";
    if (state.userRatingValue === 2) {
      renderUserStars(starCont, 0, false);
      hideExtraStars();
    } else {
      renderUserStars(starCont, state.visualUserStars, true);
    }
  } else {
    if (state.showEmptyAverage) {
      if (isLoggedIn) {
        starDisplay = "flex";
        renderUserStars(starCont, 0);
        hideExtraStars();
      } else {
        circleDisplay = "block";
      }
    } else if (state.showAverageRating) {
      starDisplay = "flex";
      renderAverageStars(starCont, state.visualAverageStars);
    }
  }

  // OPTIMIZACIÓN (Layout Thrashing): Escribir en el DOM de golpe al final.
  starCont.classList.toggle("has-user-rating", hasUserRatingClass);
  circleEl.classList.toggle("has-user-rating", hasUserRatingClass);

  if (circleEl.style.display !== circleDisplay) circleEl.style.display = circleDisplay;
  if (starCont.style.display !== starDisplay) starCont.style.display = starDisplay;
}

export function setupCardRatings(container: HTMLElement, movie: Movie): void {
  const setup = (key: "fa" | "imdb", maxKey: "FA" | "IMDB"): void => {
    const link = container.querySelector<HTMLAnchorElement>(`[data-template="${key}-link"]`);
    if (!link) return;

    // 8.2 Mejora: Cachear referencias DOM para evitar queries repetidas y mejorar legibilidad
    const ratingEl = container.querySelector<HTMLElement>(`[data-template="${key}-rating"]`);
    const barCont = container.querySelector<HTMLElement>(`[data-template="${key}-votes-bar-container"]`);
    const barEl = container.querySelector<HTMLElement>(`[data-template="${key}-votes-bar"]`);
    const countEl = container.querySelector<HTMLElement>(`[data-template="${key}-votes-count"]`);

    const id = movie[`${key}_id` as keyof Movie] as string | null;
    const rating = movie[`${key}_rating` as keyof Movie] as number | null;
    const votes = (movie[`${key}_votes` as keyof Movie] as number | null) || 0;

    // 8.1 Mejora: Validación estricta de URL (evita falsos positivos como "http-fake")
    if (id && /^https?:\/\//.test(id)) {
      link.href = id;
      link.classList.remove("disabled");
      link.setAttribute("aria-label", `Nota ${key.toUpperCase()}: ${rating}`);
    } else {
      link.removeAttribute("href");
      link.classList.add("disabled");
    }

    if (ratingEl) {
      ratingEl.textContent = rating ? (String(rating).includes(".") ? String(rating) : `${rating}.0`) : "N/A";
    }
    
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
