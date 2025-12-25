// src/js/components/card.js

import { CONFIG } from "../constants.js";
import {
  formatRuntime,
  formatVotesUnified,
  createElement,
  triggerHapticFeedback,
  renderCountryFlag
} from "../utils.js";
import { CSS_CLASSES, SELECTORS, STUDIO_DATA } from "../constants.js";
import { openModal } from "./modal.js";
import { getUserDataForMovie, updateUserDataForMovie } from "../state.js";
import { setUserMovieDataAPI } from "../api.js";
import { showToast } from "../ui.js";
import {
  calculateAverageStars,
  renderAverageStars,
  calculateUserStars,
  renderUserStars,
  setupRatingListeners,
  LEVEL_TO_RATING_MAP,
} from "./rating.js";

import spriteUrl from "../../sprite.svg";

// --- Constantes y Estado ---
const MAX_VOTES = { FA: 220000, IMDB: 3200000 };
const SQRT_MAX_VOTES = {
  FA: Math.sqrt(MAX_VOTES.FA),
  IMDB: Math.sqrt(MAX_VOTES.IMDB),
};
const cardTemplate = document.querySelector(SELECTORS.MOVIE_CARD_TEMPLATE);
let renderedCardCount = 0;
let currentlyFlippedCard = null;
let currentRenderRequestId = 0; // Control de concurrencia para renderizado

// =================================================================
//          SISTEMA DE HOVER Y LOGICA UI
// =================================================================

let hoverTimeout;
let currentHoveredCard = null;
const HOVER_DELAY = 1000;
const INTERACTIVE_SELECTOR = ".card-rating-block, .front-director-info, .actors-expand-btn"; 

function startFlipTimer(cardElement) {
  if (document.body.classList.contains("rotation-disabled")) return;
  if (cardElement.querySelector(".flip-card-inner").classList.contains("is-flipped")) return;

  clearTimeout(hoverTimeout);
  hoverTimeout = setTimeout(() => {
    if (currentHoveredCard === cardElement) {
      cardElement.classList.add("is-hovered");
    }
  }, HOVER_DELAY);
}

function cancelFlipTimer() {
  clearTimeout(hoverTimeout);
}

function clearCardHoverState(cardElement) {
  cancelFlipTimer();
  if (cardElement) {
    cardElement.classList.remove("is-hovered");
    resetCardBackState(cardElement);
  }
}

export function initCardInteractions(gridContainer) {
  // =================================================================
  //    SISTEMA DE INTERACCIÓN UNIFICADO (POINTER EVENTS)
  // =================================================================
  
  // 1. GESTIÓN DE HOVER (Solo Punteros tipo Mouse)
  gridContainer.addEventListener("pointerover", (e) => {
      if (e.pointerType !== 'mouse') return;
      const target = e.target;
      const card = target.closest(".movie-card");
      if (!card) return;

      if (currentHoveredCard !== card) {
        if (currentHoveredCard) clearCardHoverState(currentHoveredCard);
        currentHoveredCard = card;
        startFlipTimer(card);
      } else {
        if (target.closest(INTERACTIVE_SELECTOR)) cancelFlipTimer();
        else startFlipTimer(card);
      }
  });

  gridContainer.addEventListener("pointerout", (e) => {
      if (e.pointerType !== 'mouse') return;
      if (!currentHoveredCard) return;
      if (!currentHoveredCard.contains(e.relatedTarget)) {
        clearCardHoverState(currentHoveredCard);
        currentHoveredCard = null;
      }
  });

  // 2. DOBLE CLICK (Nativo para Mouse)
  gridContainer.addEventListener("dblclick", (e) => {
    const card = e.target.closest(".movie-card");
    // Solo si estamos en modo rotación (si no, el click simple ya abre la modal)
    if (card && !document.body.classList.contains("rotation-disabled")) {
      openModal(card);
    }
  });

  // 3. TAP / DOUBLE-TAP (Táctil / Pen)
  // Implementación manual para eliminar el delay de 300ms y conflictos.
  let lastTapTime = 0;
  let tapTimeout = null;
  let startX = 0;
  let startY = 0;
  const DOUBLE_TAP_DELAY = 300; // ms
  const MOVE_THRESHOLD = 10; // px

  const handleSingleTap = (cardElement) => {
      if (!cardElement) return;
      const inner = cardElement.querySelector(".flip-card-inner");
      if (!inner) return;

      const isThisCardFlipped = inner.classList.contains("is-flipped");
      if (currentlyFlippedCard && currentlyFlippedCard !== cardElement) {
        unflipAllCards();
      }
      inner.classList.toggle("is-flipped");
      if (!isThisCardFlipped) {
        currentlyFlippedCard = cardElement;
        setTimeout(() => document.addEventListener("click", handleDocumentClick), 0);
      } else {
        currentlyFlippedCard = null;
        resetCardBackState(cardElement);
        document.removeEventListener("click", handleDocumentClick);
      }
  };

  gridContainer.addEventListener('pointerdown', e => {
      if (e.pointerType === 'mouse') return; // El ratón usa eventos nativos
      if (!e.isPrimary) return; // Ignorar toques multitáctiles secundarios

      startX = e.clientX;
      startY = e.clientY;
  }, { passive: true });

  gridContainer.addEventListener('pointerup', e => {
      if (e.pointerType === 'mouse') return;

      const card = e.target.closest('.movie-card');
      // Filtros de seguridad
      if (!card || document.body.classList.contains('rotation-disabled') || e.target.closest('[data-action], a, button, .expand-content-btn')) {
          return;
      }

      const diffX = Math.abs(e.clientX - startX);
      const diffY = Math.abs(e.clientY - startY);
      
      // Si hubo desplazamiento, es un scroll, no un tap
      if (diffX > MOVE_THRESHOLD || diffY > MOVE_THRESHOLD) return;

      // 🔥 CRÍTICO: Prevenir el evento 'click' de compatibilidad que el navegador dispara después
      if (e.cancelable) e.preventDefault();

      const currentTime = new Date().getTime();
      const tapLength = currentTime - lastTapTime;

      if (tapLength < DOUBLE_TAP_DELAY && tapLength > 0) {
          // Doble Tap -> Modal
          clearTimeout(tapTimeout);
          tapTimeout = null;
          lastTapTime = 0;
          openModal(card);
      } else {
          // Primer Tap -> Esperar posible segundo
          clearTimeout(tapTimeout);
          tapTimeout = setTimeout(() => {
              handleSingleTap(card);
          }, DOUBLE_TAP_DELAY);
      }
      lastTapTime = currentTime;
  });
}

const lazyLoadObserver = new IntersectionObserver(
  (entries, observer) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        const img = entry.target;
        img.src = img.dataset.src;
        img.decode()
          .then(() => img.classList.add(CSS_CLASSES.LOADED))
          .catch(() => img.classList.add(CSS_CLASSES.LOADED));
        observer.unobserve(img);
      }
    });
  },
  { rootMargin: "0px 0px 800px 0px" }
);

// ... (handleWatchlistClick y handleRatingClick se mantienen igual, omitidos por brevedad pero deben estar aquí)
// COPIA AQUÍ handleWatchlistClick y handleRatingClick del archivo original si no se modifican
async function handleWatchlistClick(event) {
  event.preventDefault(); event.stopPropagation();
  const interactiveContainer = this;
  const button = event.target.closest('[data-action="toggle-watchlist"]');
  if (!interactiveContainer || !button) return;
  const movieId = parseInt(interactiveContainer.dataset.movieId, 10);
  const wasOnWatchlist = button.classList.contains("is-active");
  const newUserData = { onWatchlist: !wasOnWatchlist };
  // FIX: Usar state como fuente de verdad para el rollback, no el DOM
  const previousUserData = getUserDataForMovie(movieId) || { onWatchlist: false, rating: null };
  triggerHapticFeedback("light");
  updateUserDataForMovie(movieId, newUserData);
  updateCardUI(interactiveContainer);
  try {
    await setUserMovieDataAPI(movieId, newUserData);
    triggerHapticFeedback("success");
  } catch (error) {
    showToast(error.message, "error");
    updateUserDataForMovie(movieId, previousUserData);
    updateCardUI(interactiveContainer);
  }
}

async function handleRatingClick(event) {
  event.preventDefault(); event.stopPropagation();
  const interactiveContainer = this;
  const movieId = parseInt(interactiveContainer.dataset.movieId, 10);
  if (!movieId) return;
  // FIX: Usar state como fuente de verdad. currentUserData es el estado actual antes del cambio.
  const previousUserData = getUserDataForMovie(movieId) || { rating: null, onWatchlist: false };
  const currentUserData = previousUserData;
  let newRating = null;
  const suspensoCircle = event.target.closest('[data-action="set-rating-suspenso"]');
  const starElement = event.target.closest(".star-icon[data-rating-level]");
  if (suspensoCircle) {
    if (currentUserData.rating === null) newRating = 2;
    else if (currentUserData.rating === 2) newRating = 3;
    else newRating = null;
  } else if (starElement) {
    const level = parseInt(starElement.dataset.ratingLevel, 10);
    const currentStars = calculateUserStars(currentUserData.rating);
    if (level === 1 && currentStars === 0) newRating = 2;
    else newRating = level === currentStars ? null : LEVEL_TO_RATING_MAP[level - 1];
  }
  if (newRating === currentUserData.rating) return;
  const newUserData = { rating: newRating };
  triggerHapticFeedback("light");
  updateUserDataForMovie(movieId, newUserData);
  updateCardUI(interactiveContainer);
  try {
    await setUserMovieDataAPI(movieId, newUserData);
    if (newRating !== null) triggerHapticFeedback("success");
  } catch (error) {
    showToast(error.message, "error");
    updateUserDataForMovie(movieId, previousUserData);
    updateCardUI(interactiveContainer);
  }
}

export function updateCardUI(cardElement) {
  const movieId = parseInt(cardElement.dataset.movieId, 10);
  const movieData = cardElement.movieData;
  if (!movieData) return;
  const userData = getUserDataForMovie(movieId);
  const userRating = userData?.rating;
  const starContainer = cardElement.querySelector('[data-action="set-rating-estrellas"]');
  const lowRatingCircle = cardElement.querySelector('[data-action="set-rating-suspenso"]');
  const watchlistButton = cardElement.querySelector('[data-action="toggle-watchlist"]');
  const isLoggedIn = document.body.classList.contains("user-logged-in");
  
  if (!starContainer || !lowRatingCircle || !watchlistButton) return;
  
  cardElement.dataset.previousUserData = JSON.stringify(userData || { onWatchlist: false, rating: null });
  const isOnWatchlist = userData?.onWatchlist ?? false;
  
  watchlistButton.classList.toggle("is-active", isOnWatchlist);
  watchlistButton.setAttribute("aria-label", isOnWatchlist ? "Quitar de mi lista" : "Añadir a mi lista");
  
  lowRatingCircle.style.display = "none";
  starContainer.style.display = "none";
  
  if (isLoggedIn && userRating !== null && userRating !== undefined) {
    starContainer.classList.add("has-user-rating");
    lowRatingCircle.classList.add("has-user-rating");
    if (userRating === 2) lowRatingCircle.style.display = "block";
    else if (userRating >= 3) {
      starContainer.style.display = "flex";
      renderUserStars(starContainer, calculateUserStars(userRating), true);
    }
} else {
    // ESTADO: NO LOGUEADO O SIN VOTO (Minimalista)
    starContainer.classList.remove("has-user-rating");
    lowRatingCircle.classList.remove("has-user-rating");
    
    const ratings = [movieData.fa_rating, movieData.imdb_rating].filter(r => r && r > 0);
    if (ratings.length > 0) {
      const average = ratings.reduce((a, b) => a + b, 0) / ratings.length;
      
      // Si la nota es mala, círculo. Si es buena, estrellas.
      if (average <= 5.5) {
        lowRatingCircle.style.display = "block";
      } else {
        starContainer.style.display = "flex";
        renderAverageStars(starContainer, calculateAverageStars(average));
      }
    }
  }
}

// =================================================================
//          LOGICA OPTIMIZADA (TRAVERSING & SCOPED LOOKUPS)
// =================================================================

function setupCardImage(imgElement, movieData) {
  const version = movieData.last_synced_at ? new Date(movieData.last_synced_at).getTime() : "1";
  const basePosterUrl = movieData.image && movieData.image !== "."
    ? `${CONFIG.POSTER_BASE_URL}${movieData.image}.webp`
    : `https://via.placeholder.com/400x496.png?text=${encodeURIComponent(movieData.title)}`;
  const highQualityPoster = `${basePosterUrl}?v=${version}`;
  
  imgElement.alt = `Póster de ${movieData.title}`;
  
  // Lógica LCP optimizada: cargamos eager las primeras 4 (suficiente para móvil y desktop)
  if (renderedCardCount < 4) {
    imgElement.src = highQualityPoster;
    imgElement.loading = "eager";
    imgElement.setAttribute("fetchpriority", "high");
  } else {
    if (movieData.thumbhash_st) {
      imgElement.src = movieData.thumbhash_st;
      imgElement.dataset.src = highQualityPoster;
      imgElement.classList.add(CSS_CLASSES.LAZY_LQIP);
      lazyLoadObserver.observe(imgElement);
    } else {
      imgElement.src = "data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs=";
      imgElement.dataset.src = highQualityPoster;
      lazyLoadObserver.observe(imgElement);
    }
  }
}

function formatActorsWithEllipsis(actorsString, maxLength = 85) {
  if (!actorsString || actorsString.trim() === "") return { truncated: "Reparto no disponible", full: [] };
  if (actorsString.toUpperCase() === "(A)") return { truncated: "Animación", full: [] };
  const allActors = actorsString.split(",").map(name => name.trim());
  if (actorsString.length <= maxLength) return { truncated: actorsString, full: allActors, isTruncated: false };
  
  let truncatedActors = [];
  let currentLength = 0;
  for (const actor of allActors) {
    const potentialLength = currentLength + (truncatedActors.length > 0 ? 2 : 0) + actor.length;
    if (potentialLength > maxLength) break;
    truncatedActors.push(actor);
    currentLength = potentialLength;
  }
  return { truncated: truncatedActors.join(", "), full: allActors, isTruncated: true };
}

// ✨ OPTIMIZACIÓN 2.A: Recibimos el elemento card y usamos lookups acotados
// En lugar de buscar en todo el clon, buscamos en contenedores específicos (frontContext, backContext)
function populateCardText(cardElement, movieData) {
  // Contextos de búsqueda (reduce el árbol de búsqueda)
  const frontContext = cardElement.querySelector('.movie-summary');
  const backContext = cardElement.querySelector('.flip-card-back');

  // --- FRONT ---
  const titleEl = frontContext.querySelector(SELECTORS.TITLE);
  titleEl.textContent = movieData.title || "Título no disponible";
  titleEl.title = movieData.title || "Título no disponible";

  const directorContainer = frontContext.querySelector(SELECTORS.DIRECTOR);
  directorContainer.textContent = "";
  if (movieData.directors) {
    movieData.directors.split(", ").forEach((name, index, arr) => {
      const link = createElement("a", { textContent: name.trim(), href: `#` });
      link.dataset.directorName = name.trim();
      directorContainer.appendChild(link);
      if (index < arr.length - 1) directorContainer.appendChild(document.createTextNode(", "));
    });
  }

  const isSeries = movieData.type?.toUpperCase().startsWith("S.");
  frontContext.querySelector(SELECTORS.YEAR).textContent = isSeries && movieData.year_end 
    ? (String(movieData.year_end).toUpperCase() === "M" ? `${movieData.year} (M)` : (String(movieData.year_end) === "-" ? `${movieData.year}-` : `${movieData.year}-${String(movieData.year_end).length === 4 ? String(movieData.year_end).substring(2) : movieData.year_end}`))
    : (movieData.year || "N/A");

  renderCountryFlag(
    frontContext.querySelector(SELECTORS.COUNTRY_CONTAINER),
    frontContext.querySelector(SELECTORS.COUNTRY_FLAG),
    movieData.country_code,
    movieData.country
  );

  // --- BACK ---
  const originalTitleWrapper = backContext.querySelector('.back-original-title-wrapper');
  if (movieData.original_title && movieData.original_title.trim() !== "") {
     originalTitleWrapper.querySelector('[data-template="original-title"]').textContent = movieData.original_title;
     originalTitleWrapper.style.display = 'flex';
  } else {
     originalTitleWrapper.style.display = 'none';
  }

  backContext.querySelector(SELECTORS.DURATION).textContent = formatRuntime(movieData.minutes, isSeries);
  
  const episodesEl = backContext.querySelector('[data-template="episodes"]');
  const formattedEpisodes = movieData.episodes ? movieData.episodes.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".") : "";
  const epText = isSeries && movieData.episodes ? `${formattedEpisodes} x` : "";
  episodesEl.textContent = epText;
  episodesEl.style.display = epText ? "inline" : "none";

  const jwLink = backContext.querySelector('[data-template="justwatch-link"]');
  if (movieData.justwatch) {
    jwLink.href = movieData.justwatch;
    jwLink.classList.remove('disabled');
  } else {
    jwLink.removeAttribute('href');
    jwLink.classList.add('disabled');
  }
  jwLink.style.display = 'flex';

  const wikiLink = backContext.querySelector('[data-template="wikipedia-link"]');
  if (movieData.wikipedia) {
    wikiLink.href = movieData.wikipedia;
    wikiLink.classList.remove('disabled');
  } else {
    wikiLink.removeAttribute('href');
    wikiLink.classList.add('disabled');
  }
  wikiLink.style.display = 'flex';

  backContext.querySelector(SELECTORS.GENRE).textContent = movieData.genres || "Género no disponible";
  
  // Actores
  const actorsEl = backContext.querySelector(SELECTORS.ACTORS);
  const actorsData = formatActorsWithEllipsis(movieData.actors);
  actorsEl.textContent = actorsData.truncated;
  
  const rawActors = movieData.actors ? movieData.actors.trim() : "";
  const hasInteractiveActors = rawActors.length > 0 && !["(a)", "animación", "animacion", "documental"].includes(rawActors.toLowerCase());

  if (hasInteractiveActors) {
    const actorsContainer = actorsEl.parentElement;
    if (!actorsContainer.querySelector(".actors-expand-btn")) {
        const expandBtn = createElement("button", { className: "actors-expand-btn", textContent: "+", attributes: { "aria-label": "Ver reparto completo" } });
        actorsContainer.appendChild(expandBtn);
    }
    const actorsOverlay = cardElement.querySelector('.actors-scrollable-content');
    if (actorsOverlay) {
       const actorsListHtml = movieData.actors.split(',').map(actor => `<button type="button" class="actor-list-item" data-actor-name="${actor.trim()}">${actor.trim()}</button>`).join(''); 
       actorsOverlay.innerHTML = `<h4>Reparto</h4><div class="actors-list-text">${actorsListHtml}</div>`;
    }
  } else {
    // Limpieza si no hay actores (reutilización de nodos)
    actorsEl.parentElement.querySelector(".actors-expand-btn")?.remove();
  }

  backContext.querySelector(SELECTORS.SYNOPSIS).textContent = movieData.synopsis || "Argumento no disponible.";
  
  const criticContainer = backContext.querySelector('[data-template="critic-container"]');
  if (movieData.critic?.trim()) {
    criticContainer.querySelector('[data-template="critic"]').textContent = movieData.critic;
    criticContainer.style.display = 'block';
  } else {
    criticContainer.style.display = 'none';
  }

  // Iconos Plataforma (Usa el contenedor del Front)
  const iconsContainer = frontContext.querySelector('.card-icons-line');
  if (iconsContainer) {
    iconsContainer.innerHTML = "";
    
    // Combinamos estudios y selecciones para mostrar iconos
    const codes = [
      ...(movieData.studios_list ? movieData.studios_list.split(",") : []),
      ...(movieData.selections_list ? movieData.selections_list.split(",") : [])
    ];

    if (codes.length > 0) {
      codes.forEach(code => {
        const config = STUDIO_DATA[code];
        if (config) {
          iconsContainer.appendChild(createElement('span', {
            className: config.class ? `platform-icon ${config.class}` : `platform-icon`,
            title: config.title,
            innerHTML: `<svg width="${config.w || 24}" height="${config.h || 24}" fill="currentColor" viewBox="${config.vb || '0 0 24 24'}"><use href="${spriteUrl}#${config.id}"></use></svg>`
          }));
        }
      });
    }
  }
}

// ✨ OPTIMIZACIÓN 2.A: Ahora acepta un CONTENEDOR, no un objeto de elementos
// Esto permite que 'createMovieCard' no tenga que buscar estos elementos previamente.
// La función busca solo lo que necesita DENTRO del contenedor pasado.
export function setupCardRatings(containerElement, movieData) {
  const setupRating = (platform, maxVotesKey) => {
    // Búsqueda eficiente (scoped)
    const link = containerElement.querySelector(`[data-template="${platform}-link"]`);
    // Si no existe el link, asumimos que el resto tampoco (fail fast)
    if (!link) return;

    const ratingEl = containerElement.querySelector(`[data-template="${platform}-rating"]`);
    const votesBarContainer = containerElement.querySelector(`[data-template="${platform}-votes-bar-container"]`);
    const votesBar = containerElement.querySelector(`[data-template="${platform}-votes-bar"]`);
    const votesCountEl = containerElement.querySelector(`[data-template="${platform}-votes-count"]`);
    
    const id = movieData[`${platform}_id`];
    const rating = movieData[`${platform}_rating`];
    const votes = movieData[`${platform}_votes`];
    
    if (id && (id.startsWith("http://") || id.startsWith("https://"))) {
      link.href = id;
      link.classList.remove("disabled");
    } else {
      link.removeAttribute("href");
      link.classList.add("disabled");
    }
    
    ratingEl.textContent = rating ? (String(rating).includes(".") ? rating : `${rating}.0`) : "N/A";
    
    const votesCount = parseInt(String(votes).replace(/\D/g, ""), 10) || 0;
    votesBarContainer.style.display = votesCount > 0 ? "block" : "none";
    if (votesCount > 0) {
      votesBar.style.width = `${Math.min((Math.sqrt(votesCount) / SQRT_MAX_VOTES[maxVotesKey]) * 100, 100)}%`;
      votesBarContainer.title = ""; // Tooltip eliminado
      votesBarContainer.dataset.votes = formatVotesUnified(votesCount, platform);
      if (votesCountEl) {
        votesCountEl.textContent = formatVotesUnified(votesCount, platform);
        votesCountEl.style.display = "flex";
      }
    } else {
      if (votesCountEl) votesCountEl.style.display = "none";
    }
  };

  setupRating("fa", "FA");
  setupRating("imdb", "IMDB");
}

function resetCardBackState(cardElement) {
  const flipCardBack = cardElement.querySelector(".flip-card-back");
  if (flipCardBack?.classList.contains("is-expanded")) {
    flipCardBack.classList.remove("is-expanded", "show-actors");
    const expandBtn = flipCardBack.querySelector(".expand-content-btn");
    if (expandBtn) {
      expandBtn.textContent = "+";
      expandBtn.setAttribute("aria-label", "Expandir sinopsis");
    }
    const scrolls = flipCardBack.querySelectorAll(".scrollable-content, .actors-scrollable-content");
    scrolls.forEach(el => el.scrollTop = 0);
  }
}

export function unflipAllCards() {
  if (currentlyFlippedCard) {
    currentlyFlippedCard.querySelector(".flip-card-inner")?.classList.remove("is-flipped");
    resetCardBackState(currentlyFlippedCard);
    currentlyFlippedCard = null;
    document.removeEventListener("click", handleDocumentClick);
  }
}

function handleDocumentClick(e) {
  if (currentlyFlippedCard && !currentlyFlippedCard.contains(e.target)) {
    unflipAllCards();
  }
}

export function handleCardClick(event) {
  // Ignorar si hay un gesto de pellizco reciente (evita abrir modal accidentalmente)
  if (document.body.dataset.gestureCooldown) {
    event.preventDefault();
    event.stopPropagation();
    return;
  }

  const cardElement = this;
  const target = event.target;

  // 1. Acciones de botones (Watchlist, Rating...)
  if (target.closest('[data-action="toggle-watchlist"]')) {
    handleWatchlistClick.call(cardElement, event);
    return;
  }
  if (target.closest('[data-action^="set-rating-"]')) {
    handleRatingClick.call(cardElement, event);
    return;
  }

  const flipCardBack = cardElement.querySelector(".flip-card-back");
  const mainExpandBtn = target.closest(".expand-content-btn");
  const actorsExpandBtn = target.closest(".actors-expand-btn");

  // 2. Lógica de Botones de Expansión (+ / -)
  if (actorsExpandBtn) {
    event.stopPropagation();
    flipCardBack.classList.add("is-expanded", "show-actors");
    const bottomBtn = flipCardBack.querySelector(".expand-content-btn");
    if (bottomBtn) {
      bottomBtn.textContent = "−";
      bottomBtn.setAttribute("aria-label", "Cerrar detalles");
    }
    return;
  }

  if (mainExpandBtn) {
    event.stopPropagation();
    const isExpanded = flipCardBack.classList.contains("is-expanded");
    if (isExpanded) {
      resetCardBackState(cardElement);
    } else {
      flipCardBack.classList.add("is-expanded");
      flipCardBack.classList.remove("show-actors");
      mainExpandBtn.textContent = "−";
      mainExpandBtn.setAttribute("aria-label", "Contraer sinopsis");
    }
    return;
  }

  // --- 🔥 FIX CRÍTICO: Bloquear volteo al interactuar con contenido expandido ---
  // Si estamos haciendo clic en el texto de la sinopsis expandida o en la lista de actores,
  // detenemos aquí para que no llegue a la lógica de "Flip".
  // Excepción: Los enlaces de actores (.actor-list-item) sí deben funcionar.
  const isInsideExpandedContent = 
    (target.closest('.scrollable-content') && flipCardBack.classList.contains('is-expanded')) ||
    target.closest('.actors-scrollable-content');

  if (isInsideExpandedContent) {
    // Si es un clic en un actor (filtro), dejamos que pase al siguiente bloque
    if (target.closest('.actor-list-item')) {
       // Pasa al siguiente if (lógica de filtro de actor)
    } else {
       // Si es solo texto o scroll, paramos.
       event.stopPropagation();
       return; 
    }
  }
  // -----------------------------------------------------------------------------

  // 3. Lógica de Enlaces (Director, Actor...)
  const directorLink = target.closest(".front-director-info a[data-director-name]");
  if (directorLink) {
    event.preventDefault();
    document.dispatchEvent(new CustomEvent("filtersReset", { 
      detail: { keepSort: true, newFilter: { type: "director", value: directorLink.dataset.directorName } } 
    }));
    return;
  }

  const actorBtn = target.closest(".actor-list-item");
  if (actorBtn) {
    event.preventDefault();
    document.dispatchEvent(new CustomEvent("filtersReset", { 
      detail: { keepSort: true, newFilter: { type: "actor", value: actorBtn.dataset.actorName } } 
    }));
    return;
  }

  const externalLink = target.closest("a");
  if (externalLink && externalLink.href && !externalLink.href.endsWith("#")) return;

  // 4. Lógica de Volteo (Flip)
  if (cardElement.id === 'quick-view-content') return;
  const isRotationDisabled = document.body.classList.contains("rotation-disabled");
  
  // La lógica de tap/double-tap en móvil se gestiona en `initCardInteractions`.
  // Este manejador ahora solo se preocupa por el modo muro.
  if (isRotationDisabled) {
    openModal(cardElement);
  }
}

export function initializeCard(cardElement) {
  const starContainer = cardElement.querySelector('[data-action="set-rating-estrellas"]');
  if (starContainer) {
    setupRatingListeners(starContainer, document.body.classList.contains("user-logged-in"));
  }
}

function createMovieCard(movieData) {
  if (!cardTemplate) return null;
  const cardClone = cardTemplate.content.cloneNode(true);
  const cardElement = cardClone.querySelector(`.${CSS_CLASSES.MOVIE_CARD}`);
  cardElement.dataset.movieId = movieData.id;
  cardElement.movieData = movieData;
  if (movieData.id) cardElement.style.viewTransitionName = `movie-${movieData.id}`;
  
  const backFace = cardClone.querySelector(".flip-card-back");
  if (backFace) {
    const actorsOverlay = createElement("div", { className: "actors-scrollable-content" });
    const expandBtn = backFace.querySelector(".expand-content-btn");
    backFace.insertBefore(actorsOverlay, expandBtn);
  }

  // ✨ MEJORA 2.A: ELIMINADO EL OBJETO GIGANTE 'elements'.
  // Pasamos directamente el cardElement para que las funciones busquen de forma 'scoped'.
  
  populateCardText(cardElement, movieData);
  setupCardImage(cardElement.querySelector("img"), movieData);
  
  // setupCardRatings ahora busca dentro del backFace, mucho más eficiente
  setupCardRatings(backFace, movieData);
  
  updateCardUI(cardElement);
  initializeCard(cardElement);
  
  return cardClone;
}

export function renderMovieGrid(gridContainer, movies) {
  const renderId = ++currentRenderRequestId; // Nuevo ID para esta ejecución
  renderedCardCount = 0; 
  unflipAllCards();
  if (!gridContainer) return;

  gridContainer.textContent = "";
  const BATCH_SIZE = 12;
  let currentIndex = 0;

  function renderBatch() {
    // Si ha empezado otro renderizado (esqueletos, otra página, etc.), detenemos este.
    if (renderId !== currentRenderRequestId) return;

    if (currentIndex >= movies.length || !document.body.contains(gridContainer)) return;
    const fragment = document.createDocumentFragment();
    const limit = Math.min(currentIndex + BATCH_SIZE, movies.length);

    for (let i = currentIndex; i < limit; i++) {
      const movie = movies[i];
      const cardNode = createMovieCard(movie);
      if (cardNode) {
        const cardElement = cardNode.querySelector(".movie-card");
        if (cardElement) {
          const staggerIndex = i;
          cardElement.style.setProperty("--card-index", staggerIndex);
          renderedCardCount++;
        }
        fragment.appendChild(cardNode);
      }
    }
    gridContainer.appendChild(fragment);
    currentIndex = limit;
    if (currentIndex < movies.length) requestAnimationFrame(renderBatch);
  }
  renderBatch();
}

// ... (renderSkeletons, renderNoResults, renderErrorState iguales)
// COPIA AQUÍ renderSkeletons, renderNoResults, renderErrorState del archivo original
export function renderSkeletons(gridContainer, paginationContainer) {
  currentRenderRequestId++; // Invalidar cualquier renderizado de películas en curso
  if (gridContainer) gridContainer.textContent = "";
  if (paginationContainer) paginationContainer.textContent = "";
  if (!gridContainer) return;
  const fragment = document.createDocumentFragment();
  for (let i = 0; i < CONFIG.ITEMS_PER_PAGE; i++) {
    fragment.appendChild(createElement("div", { className: "skeleton-card" }));
  }
  gridContainer.appendChild(fragment);
}

export function renderNoResults(gridContainer, paginationContainer, activeFilters) {
  currentRenderRequestId++; // Invalidar renders anteriores
  if (gridContainer) gridContainer.textContent = "";
  if (paginationContainer) paginationContainer.textContent = "";
  if (!gridContainer) return;
  const noResultsDiv = createElement("div", { className: "no-results", attributes: { role: "status" } });
  noResultsDiv.appendChild(createElement("h3", { textContent: "No se encontraron resultados" }));
  const hasActiveFilters = Object.values(activeFilters).some(value => value && value !== "id,asc" && value !== "all");
  if (activeFilters.searchTerm) {
    noResultsDiv.appendChild(createElement("p", { textContent: `Prueba a simplificar tu búsqueda para "${activeFilters.searchTerm}".` }));
  } else if (hasActiveFilters) {
    noResultsDiv.appendChild(createElement("p", { textContent: "Intenta eliminar algunos filtros para obtener más resultados." }));
  }
  noResultsDiv.appendChild(createElement("button", { id: "clear-filters-from-empty", className: "btn btn--outline", textContent: "Limpiar todos los filtros" }));
  gridContainer.appendChild(noResultsDiv);
}

export function renderErrorState(gridContainer, paginationContainer, message) {
  currentRenderRequestId++; // Invalidar renders anteriores
  if (gridContainer) gridContainer.textContent = "";
  if (paginationContainer) paginationContainer.textContent = "";
  if (!gridContainer) return;
  const errorDiv = createElement("div", { className: "no-results", attributes: { role: "alert" } });
  errorDiv.appendChild(createElement("h3", { textContent: "¡Vaya! Algo ha ido mal" }));
  errorDiv.appendChild(createElement("p", { textContent: message }));
  gridContainer.appendChild(errorDiv);
}