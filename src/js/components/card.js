// =================================================================
//          COMPONENTE: Movie Card (Tarjeta de Película)
// =================================================================
//  FICHERO:  src/js/components/card.js
//  VERSIÓN:  3.6 (Fix: Ruta de iconos con Base Path)
// =================================================================

import {
  formatRuntime,
  formatVotesUnified,
  createElement,
  triggerHapticFeedback,
} from "../utils.js";
import { CSS_CLASSES, SELECTORS, CONFIG } from "../constants.js";
import { openModal } from "./quick-view.js";
import { getUserDataForMovie, updateUserDataForMovie } from "../state.js";
import { setUserMovieDataAPI } from "../api.js";
import { showToast } from "../ui.js";
import {
  calculateAverageStars,
  renderAverageStars,
  calculateUserStars,
  renderUserStars,
  setupRatingListeners,
} from "./rating-stars.js";

// ✨ FIX: Importamos el sprite para que Vite resuelva la URL correcta con la base
import spriteUrl from "../../img/icons/sprite.svg";

// --- Constantes y Estado del Módulo ---

const MAX_VOTES = { FA: 220000, IMDB: 3200000 };
const SQRT_MAX_VOTES = {
  FA: Math.sqrt(MAX_VOTES.FA),
  IMDB: Math.sqrt(MAX_VOTES.IMDB),
};
const cardTemplate = document.querySelector(SELECTORS.MOVIE_CARD_TEMPLATE);
let renderedCardCount = 0;
let currentlyFlippedCard = null;

const isPointerDevice = window.matchMedia("(hover: hover) and (pointer: fine)").matches;
const isTouchDevice = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
const isDesktop = isPointerDevice && !isTouchDevice;

// --- Configuración de Iconos de Plataforma (SVG Data) ---
const PLATFORM_DATA = {
  N: { id: "icon-netflix", class: "netflix-icon", title: "Netflix", w: 16, h: 16, vb: "0 0 16 16" },
  H: { id: "icon-hbo", class: "hbo-icon", title: "Original de HBO", w: 24, h: 24, vb: "0 0 24 24" },
  D: { id: "icon-disney", class: "disney-icon", title: "Disney", w: 25, h: 18, vb: "0 0 22 18" },
  W: { id: "icon-wb", class: "wb-icon", title: "Warner Bros.", w: 20, h: 22, vb: "0 0 18 20" },
  U: { id: "icon-universal", class: "universal-icon", title: "Universal", w: 24, h: 26, vb: "0 0 24 26" },
  S: { id: "icon-sony", class: "sony-icon", title: "Sony-Columbia", w: 18, h: 25, vb: "0 0 16 25" },
  P: { id: "icon-paramount", class: "paramount-icon", title: "Paramount", w: 22, h: 22, vb: "0 0 22 22" },
  L: { id: "icon-lionsgate", class: "lionsgate-icon", title: "Lionsgate", w: 20, h: 20, vb: "0 0 20 20" },
  Z: { id: "icon-amazon", class: "amazon-icon", title: "Amazon", w: 22, h: 22, vb: "0 0 22 22" },
  F: { id: "icon-twenty", class: "twenty-icon", title: "20th Century Fox", w: 23, h: 23, vb: "0 0 24 24" }
};

// =================================================================
//          SISTEMA DE HOVER DELEGADO
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

export function initGridHoverSystem(gridContainer) {
  if (isTouchDevice || !isPointerDevice) {
    return;
  }
  gridContainer.addEventListener("mouseover", (e) => {
    const target = e.target;
    const card = target.closest(".movie-card");

    if (!card) return;

    if (currentHoveredCard !== card) {
      if (currentHoveredCard) clearCardHoverState(currentHoveredCard);
      currentHoveredCard = card;
      startFlipTimer(card);
    } else {
      if (target.closest(INTERACTIVE_SELECTOR)) {
        cancelFlipTimer();
      } else {
        startFlipTimer(card);
      }
    }
  });

  gridContainer.addEventListener("mouseout", (e) => {
    if (!currentHoveredCard) return;
    if (!currentHoveredCard.contains(e.relatedTarget)) {
      clearCardHoverState(currentHoveredCard);
      currentHoveredCard = null;
    }
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

async function handleWatchlistClick(event) {
  event.preventDefault(); event.stopPropagation();
  const interactiveContainer = this;
  const button = event.target.closest('[data-action="toggle-watchlist"]');
  if (!interactiveContainer || !button) return;
  const movieId = parseInt(interactiveContainer.dataset.movieId, 10);
  const wasOnWatchlist = button.classList.contains("is-active");
  const newUserData = { onWatchlist: !wasOnWatchlist };
  const previousUserData = JSON.parse(interactiveContainer.dataset.previousUserData || "{}");
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
  const previousUserData = JSON.parse(interactiveContainer.dataset.previousUserData || "{}");
  const currentUserData = getUserDataForMovie(movieId) || { rating: null };
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
    else newRating = level === currentStars ? null : [3, 5, 7, 9][level - 1];
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
    starContainer.classList.remove("has-user-rating");
    lowRatingCircle.classList.remove("has-user-rating");
    const ratings = [movieData.fa_rating, movieData.imdb_rating].filter(r => r && r > 0);
    if (ratings.length > 0) {
      const average = ratings.reduce((a, b) => a + b, 0) / ratings.length;
      if (average <= 5.5) lowRatingCircle.style.display = "block";
      else {
        starContainer.style.display = "flex";
        renderAverageStars(starContainer, calculateAverageStars(average));
      }
    }
  }
  starContainer.classList.toggle("is-interactive", isLoggedIn);
  lowRatingCircle.classList.toggle("is-interactive", isLoggedIn);
}

function setupCardImage(imgElement, movieData) {
  const version = movieData.last_synced_at ? new Date(movieData.last_synced_at).getTime() : "1";
  const basePosterUrl = movieData.image && movieData.image !== "."
    ? `${CONFIG.POSTER_BASE_URL}${movieData.image}.webp`
    : `https://via.placeholder.com/400x496.png?text=${encodeURIComponent(movieData.title)}`;
  const highQualityPoster = `${basePosterUrl}?v=${version}`;
  imgElement.alt = `Póster de ${movieData.title}`;
  if (renderedCardCount < 6) {
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

// =================================================================
//          LOGICA DE TEXTOS Y EXPANSION
// =================================================================

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

function populateCardText(elements, movieData, cardElement) {
  elements.title.textContent = movieData.title || "Título no disponible";
  elements.title.title = movieData.title || "Título no disponible";
  
  if (elements.originalTitleWrapper && movieData.original_title && movieData.original_title.trim() !== "") {
    elements.originalTitle.textContent = movieData.original_title;
    elements.originalTitleWrapper.style.display = 'flex';
  } else if (elements.originalTitleWrapper) {
    elements.originalTitleWrapper.style.display = 'none';
  }
  
  const directorContainer = elements.director;
  directorContainer.textContent = "";
  const directorsString = movieData.directors || "Director no disponible";
  if (directorsString && directorsString !== "Director no disponible") {
    directorsString.split(", ").forEach((name, index, arr) => {
      const link = createElement("a", { textContent: name.trim(), href: `#` });
      link.dataset.directorName = name.trim();
      directorContainer.appendChild(link);
      if (index < arr.length - 1) directorContainer.appendChild(document.createTextNode(", "));
    });
  } else {
    directorContainer.textContent = directorsString;
  }
  
  const isSeries = movieData.type?.toUpperCase().startsWith("S.");
  elements.duration.textContent = formatRuntime(movieData.minutes, isSeries);
  const episodesText = isSeries && movieData.episodes ? `${movieData.episodes} x` : "";
  if (elements.episodes) {
    elements.episodes.textContent = episodesText;
    elements.episodes.style.display = episodesText ? "inline" : "none";
  }
  
  elements.genre.textContent = movieData.genres || "Género no disponible";

  // --- ACTORES ---
  const actorsData = formatActorsWithEllipsis(movieData.actors);
  elements.actors.textContent = actorsData.truncated;
  
  const rawActors = movieData.actors ? movieData.actors.trim() : "";
  const lowerActors = rawActors.toLowerCase();
  const nonActorValues = ["(a)", "animación", "animacion", "documental"];
  const hasInteractiveActors = rawActors.length > 0 && !nonActorValues.includes(lowerActors);

  if (hasInteractiveActors) {
    const expandBtn = createElement("button", {
      className: "actors-expand-btn",
      textContent: "+",
      attributes: { "aria-label": "Ver reparto completo" }
    });
    const actorsContainer = elements.actors.parentElement;
    const existingBtn = actorsContainer.querySelector(".actors-expand-btn");
    if (existingBtn) existingBtn.remove();
    actorsContainer.appendChild(expandBtn);

    const actorsOverlay = cardElement.querySelector('.actors-scrollable-content');
    if (actorsOverlay) {
      const actorsListHtml = movieData.actors
        .split(',')
        .map(actor => {
          const name = actor.trim();
          return `<button type="button" class="actor-list-item" data-actor-name="${name}">${name}</button>`;
        })
        .join(''); 
      actorsOverlay.innerHTML = `<h4>Reparto</h4><div class="actors-list-text">${actorsListHtml}</div>`;
    }
  } else {
    const actorsContainer = elements.actors.parentElement;
    const existingBtn = actorsContainer.querySelector(".actors-expand-btn");
    if (existingBtn) existingBtn.remove();
  }

  elements.synopsis.textContent = movieData.synopsis || "Argumento no disponible.";
  elements.criticContainer.style.display = movieData.critic && movieData.critic.trim() !== "" ? "block" : "none";
  if (elements.criticContainer.style.display === "block") elements.critic.textContent = movieData.critic;
  
  let displayYear = movieData.year || "N/A";
  if (movieData.type?.toUpperCase().startsWith("S.") && movieData.year_end) {
    const yearEnd = String(movieData.year_end).trim();
    if (yearEnd.toUpperCase() === "M") displayYear = `${movieData.year} (M)`;
    else if (yearEnd === "-") displayYear = `${movieData.year}-`;
    else if (!isNaN(yearEnd) && yearEnd.length === 4) displayYear = `${movieData.year}-${yearEnd.substring(2)}`;
    else displayYear = `${movieData.year} - ${yearEnd}`;
  }
  elements.year.textContent = displayYear;
  elements.countryContainer.style.display = movieData.country_code ? "flex" : "none";
  if (movieData.country_code) elements.countryFlag.className = `fi fi-${movieData.country_code}`;
  
  // --- INYECCIÓN DE ICONOS DE PLATAFORMA (DOM OPTIMIZADO) ---
  const iconsContainer = cardElement.querySelector('.card-icons-line');
  if (iconsContainer) {
    iconsContainer.innerHTML = ""; // Limpieza: Solo hay nodos si es necesario
    const collections = movieData.collections_list || "";
    
    if (collections) {
      collections.split(",").forEach(code => {
        const config = PLATFORM_DATA[code];
        if (config) {
          const span = document.createElement('span');
          // Si tiene clase específica la usa, sino usa la base y asume color en CSS
          span.className = config.class ? `platform-icon ${config.class}` : `platform-icon`;
          span.title = config.title;
          
          // ✨ FIX: Usamos spriteUrl importado para que Vite resuelva la ruta completa
          span.innerHTML = `
            <svg width="${config.w}" height="${config.h}" fill="currentColor" viewBox="${config.vb}">
              <use href="${spriteUrl}#${config.id}"></use>
            </svg>
          `;
          iconsContainer.appendChild(span);
        }
      });
    }
  }

  if (elements.wikipediaLink && movieData.wikipedia) {
    elements.wikipediaLink.href = movieData.wikipedia;
    elements.wikipediaLink.style.display = 'flex';
  } else if (elements.wikipediaLink) {
    elements.wikipediaLink.style.display = 'none';
  }
}

function setupCardRatings(elements, movieData) {
  const setupRating = (platform, maxVotesKey) => {
    const link = elements[`${platform}Link`];
    const ratingEl = elements[`${platform}Rating`];
    const votesBarContainer = elements[`${platform}VotesBarContainer`];
    const votesBar = elements[`${platform}VotesBar`];
    const id = movieData[`${platform}_id`];
    const rating = movieData[`${platform}_rating`];
    const votes = movieData[`${platform}_votes`];
    link.href = (id && (id.startsWith("http://") || id.startsWith("https://"))) ? id : "#";
    link.classList.toggle("disabled", !link.href.startsWith("http"));
    ratingEl.textContent = rating ? (String(rating).includes(".") ? rating : `${rating}.0`) : "N/A";
    const votesCount = parseInt(String(votes).replace(/\D/g, ""), 10) || 0;
    votesBarContainer.style.display = votesCount > 0 ? "block" : "none";
    if (votesCount > 0) {
      votesBar.style.width = `${Math.min((Math.sqrt(votesCount) / SQRT_MAX_VOTES[maxVotesKey]) * 100, 100)}%`;
      votesBarContainer.title = `${formatVotesUnified(votesCount)} votos`;
    }
  };
  setupRating("fa", "FA");
  setupRating("imdb", "IMDB");
}

// =================================================================
//          GESTIÓN DE ESTADO (EXPANSIÓN)
// =================================================================

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

/**
 * Manejador centralizado de clics en la tarjeta
 */
export function handleCardClick(event) {
  const cardElement = this;
  const target = event.target;

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
      detail: { 
        keepSort: true, 
        newFilter: { type: "actor", value: actorBtn.dataset.actorName } 
      } 
    }));
    return;
  }

  const externalLink = target.closest("a");
  if (externalLink && externalLink.href && !externalLink.href.endsWith("#")) return;

  if (cardElement.id === 'quick-view-content') return;
  const isRotationDisabled = document.body.classList.contains("rotation-disabled");
  if (!isDesktop && !isRotationDisabled) {
    event.preventDefault(); event.stopPropagation();
    const inner = cardElement.querySelector(".flip-card-inner");
    const isThisCardFlipped = inner.classList.contains("is-flipped");
    if (currentlyFlippedCard && currentlyFlippedCard !== cardElement) unflipAllCards();
    inner.classList.toggle("is-flipped");
    if (!isThisCardFlipped) {
      currentlyFlippedCard = cardElement;
      setTimeout(() => document.addEventListener("click", handleDocumentClick), 0);
    } else {
      currentlyFlippedCard = null;
      resetCardBackState(cardElement);
    }
    return;
  }
  if (isRotationDisabled) openModal(cardElement);
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

  const elements = {
    img: cardClone.querySelector("img"),
    title: cardClone.querySelector(SELECTORS.TITLE),
    director: cardClone.querySelector(SELECTORS.DIRECTOR),
    year: cardClone.querySelector(SELECTORS.YEAR),
    countryContainer: cardClone.querySelector(SELECTORS.COUNTRY_CONTAINER),
    countryFlag: cardClone.querySelector(SELECTORS.COUNTRY_FLAG),
    faLink: cardClone.querySelector(SELECTORS.FA_LINK),
    faRating: cardClone.querySelector(SELECTORS.FA_RATING),
    faVotesBarContainer: cardClone.querySelector('[data-template="fa-votes-bar-container"]'),
    faVotesBar: cardClone.querySelector('[data-template="fa-votes-bar"]'),
    imdbLink: cardClone.querySelector(SELECTORS.IMDB_LINK),
    imdbRating: cardClone.querySelector(SELECTORS.IMDB_RATING),
    imdbVotesBarContainer: cardClone.querySelector('[data-template="imdb-votes-bar-container"]'),
    imdbVotesBar: cardClone.querySelector('[data-template="imdb-votes-bar"]'),
    duration: cardClone.querySelector(SELECTORS.DURATION),
    episodes: cardClone.querySelector('[data-template="episodes"]'),
    wikipediaLink: cardClone.querySelector('[data-template="wikipedia-link"]'),
    genre: cardClone.querySelector(SELECTORS.GENRE),
    actors: cardClone.querySelector(SELECTORS.ACTORS),
    synopsis: cardClone.querySelector(SELECTORS.SYNOPSIS),
    criticContainer: cardClone.querySelector('[data-template="critic-container"]'),
    critic: cardClone.querySelector('[data-template="critic"]'),
    originalTitle: cardClone.querySelector('[data-template="original-title"]'),
    originalTitleWrapper: cardClone.querySelector('.back-original-title-wrapper'),
  };
  populateCardText(elements, movieData, cardElement);
  setupCardImage(elements.img, movieData);
  setupCardRatings(elements, movieData);
  updateCardUI(cardElement);
  initializeCard(cardElement);
  return cardClone;
}

export function renderMovieGrid(gridContainer, movies) {
  renderedCardCount = 0; 
  unflipAllCards();
  
  if (!gridContainer) return;

  gridContainer.textContent = "";
  
  const BATCH_SIZE = 12;
  let currentIndex = 0;

  function renderBatch() {
    if (currentIndex >= movies.length || !document.body.contains(gridContainer)) {
      return;
    }

    const fragment = document.createDocumentFragment();
    const limit = Math.min(currentIndex + BATCH_SIZE, movies.length);

    for (let i = currentIndex; i < limit; i++) {
      const movie = movies[i];
      const cardNode = createMovieCard(movie);
      
      if (cardNode) {
        const cardElement = cardNode.querySelector(".movie-card");
        if (cardElement) {
          const staggerIndex = i % BATCH_SIZE;
          cardElement.style.setProperty("--card-index", staggerIndex);
          renderedCardCount++;
        }
        fragment.appendChild(cardNode);
      }
    }

    gridContainer.appendChild(fragment);
    currentIndex = limit;

    if (currentIndex < movies.length) {
      requestAnimationFrame(renderBatch);
    }
  }

  renderBatch();
}

export function renderSkeletons(gridContainer, paginationContainer) {
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
  if (gridContainer) gridContainer.textContent = "";
  if (paginationContainer) paginationContainer.textContent = "";
  if (!gridContainer) return;
  const errorDiv = createElement("div", { className: "no-results", attributes: { role: "alert" } });
  errorDiv.appendChild(createElement("h3", { textContent: "¡Vaya! Algo ha ido mal" }));
  errorDiv.appendChild(createElement("p", { textContent: message }));
  gridContainer.appendChild(errorDiv);
}