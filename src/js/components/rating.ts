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
import { saveLocalEntryWithMovie } from "../localStore.js";
import { scheduleSync } from "../syncManager.js";
import { CSS_CLASSES } from "../constants.js";
import { showToast } from "../ui.js";
import { triggerHapticFeedback, formatVotesUnified, setupExternalLink } from "../utils.js";
import { normalizeMovieId } from "../contracts.js";
import { Movie, MappedMovie, UserMovieEntry, MovieCardElement } from "../types.js";

const MAX_VOTES = { FA: 220000, IMDB: 3200000 } as const;
const SQRT_MAX_VOTES = { FA: Math.sqrt(MAX_VOTES.FA), IMDB: Math.sqrt(MAX_VOTES.IMDB) } as const;

import {
  LEVEL_TO_RATING_MAP,
  MIN_STAR_THRESHOLD,
  calculateUserStars,
  calculateAverageStars,
} from "../../shared/formatters.js";
export { LEVEL_TO_RATING_MAP, MIN_STAR_THRESHOLD, calculateUserStars };


/**
 * Resuelve cuál será la siguiente nota al hacer clic en una estrella.
 * Implementa el ciclo de UX para el nivel 1 (suspenso -> aprobado -> limpiar) y toggles simples.
 */
export function resolveNextRating(currentRating: number | null | undefined, clickedLevel: number): number | null {
  if (clickedLevel === 1) {
    if (currentRating === 2) return 5;    // 2º clic: de suspenso (2) -> 1 estrella llena (5)
    if (currentRating === 5) return null; // 3er clic: de 1 estrella llena (5) -> sin voto (null)
    return 2;                             // 1er clic: de sin voto u otra nota -> estrella vacía suspenso (2)
  }

  const targetRating = LEVEL_TO_RATING_MAP[(clickedLevel - 1) as 0 | 1 | 2];
  const currentVisualStars = calculateUserStars(currentRating);

  if (clickedLevel === currentVisualStars && currentRating !== 2) {
    return null; // Toggle off
  }
  return targetRating;
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
  movie: Movie | MappedMovie | undefined,
  userData: UserMovieEntry | undefined,
  isLoggedIn: boolean
): RatingPresentationState {
  const userRating = userData?.rating;
  const hasUserVote = typeof userRating === 'number';
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
export function renderStars(
  starContainer: HTMLElement,
  filledAmount: number,
  { hideUnfilled = false, snapToInteger = false }: RenderStarsOptions = {}
): void {
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

export function renderUserStars(container: HTMLElement, value: number, hideHollow = false, isSuspenso = false): void {
  if (isSuspenso) {
    const stars = container.children;
    for (let i = 0; i < stars.length; i++) {
      const star = stars[i] as HTMLElement;
      const filledPath = star.lastElementChild as HTMLElement | null;

      if (i === 0) {
        // La 1.ª estrella se muestra como hueca dorada
        if (star.style.opacity !== "1") star.style.opacity = "1";
        if (filledPath) filledPath.style.clipPath = "inset(0 100% 0 0)";
      } else {
        // Las estrellas 2 y 3 se ocultan
        if (star.style.opacity !== "0") star.style.opacity = "0";
      }
    }
    return;
  }

  renderStars(container, value, { hideUnfilled: hideHollow });
}

// =================================================================
//          3. INTERACCIÓN (Eventos)
// =================================================================

/**
 * Maneja el hover y foco sobre las estrellas (Feedback visual inmediato).
 */
function handleRatingPreviewEnter(event: MouseEvent | FocusEvent, containerOverride?: HTMLElement): void {
  if (typeof document !== "undefined" && !document.body.classList.contains(CSS_CLASSES.USER_LOGGED_IN)) return;
  
  // En dispositivos táctiles no ejecutamos previsualización de hover para evitar estados pegajosos
  if (event.type === "mouseover" && typeof window !== "undefined" && window.matchMedia && !window.matchMedia("(hover: hover) and (pointer: fine)").matches) {
    return;
  }

  const target = event.target as HTMLElement;
  const starIcon = target.closest<HTMLElement>(".star-icon");
  if (!starIcon) return;
  
  const starContainer = containerOverride || (event.currentTarget as HTMLElement) || starIcon.closest<HTMLElement>('[data-action="set-rating-estrellas"]');
  if (!starContainer) return;

  const hoverLevel = parseInt(starIcon.dataset.ratingLevel || "0", 10);
  
  // Renderizamos estado "potencial" (lo que pasaría si haces click)
  starContainer.classList.add(CSS_CLASSES.IS_RATING_PREVIEW);
  renderUserStars(starContainer, hoverLevel, false, false);
}

/**
 * Restaura el estado original al salir del contenedor (blur o mouseout/mouseleave).
 */
function handleRatingPreviewLeave(eventOrContainer: (MouseEvent | FocusEvent) | HTMLElement): void {
  const starContainer = (eventOrContainer instanceof HTMLElement)
    ? eventOrContainer
    : (eventOrContainer.currentTarget as HTMLElement) || (eventOrContainer.target as HTMLElement)?.closest?.<HTMLElement>('[data-action="set-rating-estrellas"]');
  if (!starContainer) return;

  starContainer.classList.remove(CSS_CLASSES.IS_RATING_PREVIEW);
  const cardElement = starContainer.closest<HTMLElement>(".movie-card");
  if (cardElement) {
    appEvents.emit("card:requestUpdate", { cardElement });
  }
}

/**
 * Maneja la interacción por teclado sobre las estrellas (Enter / Espacio).
 */
function handleRatingKeyDown(event: KeyboardEvent): void {
  if (event.key !== "Enter" && event.key !== " ") return;
  const target = event.target as HTMLElement;
  const starIcon = target.closest<HTMLElement>(".star-icon[data-rating-level]");
  if (!starIcon) return;

  event.preventDefault();
  event.stopPropagation();

  if (typeof document !== "undefined" && !document.body.classList.contains(CSS_CLASSES.USER_LOGGED_IN)) {
    showToast("Identifícate para votar", "info");
    return;
  }

  const card = starIcon.closest<MovieCardElement>(".movie-card");
  if (!card) return;

  const starCont = card.querySelector<HTMLElement>('[data-action="set-rating-estrellas"]');
  if (starCont) {
    starCont.classList.remove(CSS_CLASSES.IS_RATING_PREVIEW);
  }

  const movieId = normalizeMovieId(card.dataset.movieId);
  if (!movieId) return;

  const currentRating = getUserDataForMovie(movieId)?.rating;
  const level = parseInt(starIcon.dataset.ratingLevel || "0", 10);
  const newRating = resolveNextRating(currentRating, level);

  setRating(movieId, newRating, card);
  triggerRatingAnimation(card, newRating, starIcon);
}

/**
 * Inicializa la delegación global de eventos de valoración (hover, foco y teclado)
 * en el contenedor raíz (ej: #grid-container o #quick-view-content).
 * Elimina la necesidad de registrar 5 listeners por cada tarjeta individual.
 */
export function initRatingInteractions(root: HTMLElement): () => void {
  if (!root) return () => {};

  const onMouseOver = (e: MouseEvent) => {
    const target = e.target as HTMLElement;
    const starIcon = target.closest<HTMLElement>(".star-icon");
    if (!starIcon) return;
    const starContainer = starIcon.closest<HTMLElement>('[data-action="set-rating-estrellas"]');
    if (starContainer && root.contains(starContainer)) {
      handleRatingPreviewEnter(e, starContainer);
    }
  };

  const onMouseOut = (e: MouseEvent) => {
    const target = e.target as HTMLElement;
    const starContainer = target.closest<HTMLElement>('[data-action="set-rating-estrellas"]');
    if (!starContainer || !root.contains(starContainer)) return;
    const related = e.relatedTarget as HTMLElement | null;
    if (!related || !starContainer.contains(related)) {
      handleRatingPreviewLeave(starContainer);
    }
  };

  const onFocusIn = (e: FocusEvent) => {
    const target = e.target as HTMLElement;
    const starIcon = target.closest<HTMLElement>(".star-icon");
    if (!starIcon) return;
    const starContainer = starIcon.closest<HTMLElement>('[data-action="set-rating-estrellas"]');
    if (starContainer && root.contains(starContainer)) {
      handleRatingPreviewEnter(e, starContainer);
    }
  };

  const onFocusOut = (e: FocusEvent) => {
    const target = e.target as HTMLElement;
    const starContainer = target.closest<HTMLElement>('[data-action="set-rating-estrellas"]');
    if (!starContainer || !root.contains(starContainer)) return;
    const related = e.relatedTarget as HTMLElement | null;
    if (!related || !starContainer.contains(related)) {
      handleRatingPreviewLeave(starContainer);
    }
  };

  const onKeyDown = (e: KeyboardEvent) => {
    const target = e.target as HTMLElement;
    if (target.closest('.star-icon[data-rating-level]')) {
      handleRatingKeyDown(e);
    }
  };

  root.addEventListener("mouseover", onMouseOver as EventListener, { passive: true });
  root.addEventListener("mouseout", onMouseOut as EventListener, { passive: true });
  root.addEventListener("focusin", onFocusIn as EventListener);
  root.addEventListener("focusout", onFocusOut as EventListener);
  root.addEventListener("keydown", onKeyDown as EventListener);

  return () => {
    root.removeEventListener("mouseover", onMouseOver as EventListener);
    root.removeEventListener("mouseout", onMouseOut as EventListener);
    root.removeEventListener("focusin", onFocusIn as EventListener);
    root.removeEventListener("focusout", onFocusOut as EventListener);
    root.removeEventListener("keydown", onKeyDown as EventListener);
  };
}

export function setupRatingListeners(starContainer: HTMLElement, isInteractive: boolean = true): void {
  if (!isInteractive) return;
  const isLoggedIn = typeof document !== "undefined" && document.body.classList.contains(CSS_CLASSES.USER_LOGGED_IN);
  starContainer.classList.toggle(CSS_CLASSES.IS_INTERACTIVE, isLoggedIn);
}

// =================================================================
//          4. GESTIÓN DE ESTADO Y CLICS (Lógica de Negocio)
// =================================================================

async function setRating(movieId: number, value: number | null, card: MovieCardElement): Promise<void> {
  if (typeof document !== "undefined" && !document.body.classList.contains(CSS_CLASSES.USER_LOGGED_IN)) {
    showToast("Identifícate para votar", "info");
    return;
  }

  const previousRating = getUserDataForMovie(movieId)?.rating ?? null;
  
  if (previousRating === value) return;

  const newState: Partial<UserMovieEntry> = { rating: value };

  const watchlistMutation = resolveWatchlistMutationOnRate(value);
  if (watchlistMutation !== undefined) {
    newState.onWatchlist = watchlistMutation;
  }

  // 1. Experiencia de usuario inmediata (0 ms de latencia)
  triggerHapticFeedback("light");
  updateUserDataForMovie(movieId, newState);
  updateRatingUI(card);

  // 2. Persistencia local inmediata (Local-First: nunca falla, nunca hace rollback)
  await saveLocalEntryWithMovie(movieId, newState, (card?.movieData as MappedMovie) || null);
  if (value !== null) triggerHapticFeedback("success");

  // 3. Sincronización en segundo plano hacia Supabase
  scheduleSync(200);
}

function triggerRatingAnimation(card: MovieCardElement, newRating: number | null, fallbackEl?: HTMLElement): void {
  if (newRating === null) return;

  const level = newRating === 2 ? 1 : newRating >= 9 ? 3 : newRating >= 7 ? 2 : 1;
  const targetToAnimate = card.querySelector<HTMLElement>(`.star-icon[data-rating-level="${level}"]`);

  const el = targetToAnimate || fallbackEl;
  if (el) {
    el.classList.remove('just-rated');
    void el.offsetWidth;
    el.classList.add('just-rated');
    setTimeout(() => el.classList.remove('just-rated'), 600);
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
  const isRotationDisabledBlock = target.closest<HTMLElement>(".card-rating-block") && document.body.classList.contains(CSS_CLASSES.ROTATION_DISABLED) && !starEl;
  
  if (!starEl && !wallRatingEl && !isRotationDisabledBlock) return false;

  event.preventDefault();
  event.stopPropagation();

  if (typeof document !== "undefined" && !document.body.classList.contains(CSS_CLASSES.USER_LOGGED_IN)) {
    showToast("Identifícate para votar", "info");
    if (typeof starEl?.blur === "function") starEl.blur();
    if (typeof target?.blur === "function") target.blur();
    return true;
  }

  const movieId = normalizeMovieId(card.dataset.movieId);
  if (!movieId) return false;

  const currentRating = getUserDataForMovie(movieId)?.rating;

  if (starEl) {
    const starCont = card.querySelector<HTMLElement>('[data-action="set-rating-estrellas"]');
    if (starCont) {
      starCont.classList.remove(CSS_CLASSES.IS_RATING_PREVIEW);
    }
    const level = parseInt(starEl.dataset.ratingLevel || "0", 10);
    const newRating = resolveNextRating(currentRating, level);

    setRating(movieId, newRating, card);
    triggerRatingAnimation(card, newRating, starEl);
    starEl.blur();
    return true;
  }

  if (wallRatingEl || isRotationDisabledBlock) {
    const starCont = card.querySelector<HTMLElement>('[data-action="set-rating-estrellas"]');
    if (starCont) {
      starCont.classList.remove(CSS_CLASSES.IS_RATING_PREVIEW);
    }
    const newRating = resolveNextRating(currentRating, 1);
    setRating(movieId, newRating, card);
    triggerRatingAnimation(card, newRating, undefined);
    target.blur();
    return true;
  }

  return false;
}

// =================================================================
//          5. ACTUALIZACIÓN DE UI (Estrellas y Barras)
// =================================================================

export function updateRatingUI(card: MovieCardElement, userDataInput?: UserMovieEntry): void {
  const movieId = normalizeMovieId(card.dataset.movieId);
  const movie = card.movieData;
  if (!movie || ("isPerson" in movie && movie.isPerson) || !movieId) return;
  const mappedMovie = movie as MappedMovie;

  const userData = userDataInput ?? getUserDataForMovie(movieId);
  const isLoggedIn = document.body.classList.contains(CSS_CLASSES.USER_LOGGED_IN);

  const starCont = card.querySelector<HTMLElement>('[data-action="set-rating-estrellas"]');
  if (!starCont) return;

  starCont.classList.remove(CSS_CLASSES.IS_RATING_PREVIEW);
  starCont.classList.toggle(CSS_CLASSES.IS_INTERACTIVE, isLoggedIn);

  const state = getRatingPresentationState(mappedMovie, userData, isLoggedIn);

  let starDisplay = "none";
  let hasUserRatingClass = false;

  if (state.showUserRating) {
    hasUserRatingClass = true;
    starDisplay = "flex";
    
    if (state.userRatingValue === 2) {
      // Suspenso de usuario: La 1.ª estrella se muestra hueca en el contenedor unificado de 3 estrellas
      renderUserStars(starCont, 0, true, true);
    } else {
      // 1, 2 o 3 estrellas llenas
      renderUserStars(starCont, state.visualUserStars, true, false);
    }
  } else {
    if (state.showEmptyAverage) {
      // Suspenso en nota media (promedio <= 5.5): Se muestra 1 estrella hueca
      starDisplay = "flex";
      renderUserStars(starCont, 0, true, true);
    } else if (state.showAverageRating) {
      starDisplay = "flex";
      renderAverageStars(starCont, state.visualAverageStars);
    } else {
      if (isLoggedIn) {
        starDisplay = "flex";
        renderUserStars(starCont, 0, false, false);
      }
    }
  }

  starCont.classList.toggle(CSS_CLASSES.HAS_USER_RATING, hasUserRatingClass);
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

    setupExternalLink(link, key.toUpperCase(), id, `Nota ${key.toUpperCase()}: ${rating}`);

    if (ratingEl) {
      ratingEl.textContent = rating ? (String(rating).includes(".") ? String(rating) : `${rating}.0`) : "N/A";
    }
    
    if (barCont) {
      barCont.style.display = votes > 0 ? "block" : "none";
      if (votes > 0 && barEl) {
        const width = Math.min((Math.sqrt(votes) / SQRT_MAX_VOTES[maxKey]) * 100, 100);
        barEl.style.width = `${width}%`;
        const formattedVotes = formatVotesUnified(votes);
        barCont.dataset.votes = formattedVotes;
        if (countEl) countEl.textContent = formattedVotes;

      }
    }
  };
  setup("fa", "FA");
  setup("imdb", "IMDB");
}
