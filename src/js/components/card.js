// =================================================================
//          COMPONENTE: Movie Card (Tarjeta de Película)
// =================================================================
//
//  FICHERO:  src/js/components/card.js
//  VERSIÓN:  3.1 (Lógica de Título Original Simplificada)
//
//  RESPONSABILIDADES:
//    - Crear y poblar el DOM de una tarjeta de película.
//    - Gestionar el lazy-loading de imágenes y placeholders.
//    - Exportar manejadores de eventos delegados para acciones (watchlist, rating).
//    - Inicializar listeners no delegables (hover, mousemove).
//    - Implementar lógica de UI optimista para acciones de usuario.
//
// =================================================================

import { CONFIG } from "../config.js";
import {
  formatRuntime,
  formatVotesUnified,
  createElement,
  triggerHapticFeedback,
} from "../utils.js";
import { CSS_CLASSES, SELECTORS } from "../constants.js";
import { openModal } from "./quick-view.js";
import { getUserDataForMovie, updateUserDataForMovie } from "../state.js";
import { setUserMovieDataAPI } from "../api-user.js";
import { showToast } from "../toast.js";
import {
  calculateAverageStars,
  renderAverageStars,
  calculateUserStars,
  renderUserStars,
  setupRatingListeners,
} from "./rating-stars.js";

// --- Constantes y Estado del Módulo ---

const MAX_VOTES = { FA: 220000, IMDB: 3200000 };
const SQRT_MAX_VOTES = {
  FA: Math.sqrt(MAX_VOTES.FA),
  IMDB: Math.sqrt(MAX_VOTES.IMDB),
};
const cardTemplate = document.querySelector(SELECTORS.MOVIE_CARD_TEMPLATE);
let renderedCardCount = 0;
let currentlyFlippedCard = null;
const isDesktop = window.matchMedia(
  "(hover: hover) and (pointer: fine)"
).matches;

/**
 * Observador de Intersección para cargar imágenes de forma diferida (lazy-loading).
 * Empieza a cargar imágenes cuando están a 800px de entrar en el viewport.
 */
const lazyLoadObserver = new IntersectionObserver(
  (entries, observer) => {
    entries.forEach((entry) => {
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
  },
  { rootMargin: "0px 0px 800px 0px" }
);

// =================================================================
//          MANEJADORES DE ACCIONES (EXPORTADOS PARA DELEGACIÓN)
// =================================================================

/**
 * Maneja el clic en el botón de watchlist de forma optimista.
 * 'this' es el cardElement, establecido por .call() en el listener delegado.
 * @param {Event} event - El evento de clic.
 */
async function handleWatchlistClick(event) {
  event.preventDefault();
  event.stopPropagation();

  const interactiveContainer = this;
  const button = event.target.closest('[data-action="toggle-watchlist"]');
  if (!interactiveContainer || !button) return;

  const movieId = parseInt(interactiveContainer.dataset.movieId, 10);
  const wasOnWatchlist = button.classList.contains("is-active");
  const newUserData = { onWatchlist: !wasOnWatchlist };
  const previousUserData = JSON.parse(
    interactiveContainer.dataset.previousUserData || "{}"
  );

  triggerHapticFeedback("light");
  updateUserDataForMovie(movieId, newUserData); // UI optimista: actualiza el estado local
  updateCardUI(interactiveContainer);         // UI optimista: renderiza el cambio inmediatamente

  try {
    await setUserMovieDataAPI(movieId, newUserData); // Llama a la API para persistir el cambio
    triggerHapticFeedback("success");
  } catch (error) {
    showToast(error.message, "error");
    // Reversión en caso de error: restaura el estado y la UI
    updateUserDataForMovie(movieId, previousUserData);
    updateCardUI(interactiveContainer);
  }
}

/**
 * Maneja el clic en las opciones de rating (suspenso y estrellas).
 * 'this' es el cardElement.
 * @param {Event} event - El evento de clic.
 */
async function handleRatingClick(event) {
  event.preventDefault();
  event.stopPropagation();

  const interactiveContainer = this;
  const movieId = parseInt(interactiveContainer.dataset.movieId, 10);
  if (!movieId) return;

  const previousUserData = JSON.parse(
    interactiveContainer.dataset.previousUserData || "{}"
  );
  const currentUserData = getUserDataForMovie(movieId) || { rating: null };
  let newRating = null;

  const suspensoCircle = event.target.closest('[data-action="set-rating-suspenso"]');
  const starElement = event.target.closest(".star-icon[data-rating-level]");

  if (suspensoCircle) {
    // Ciclo de rating bajo: null -> suspenso (2) -> 1 estrella (3) -> null
    if (currentUserData.rating === null) newRating = 2;
    else if (currentUserData.rating === 2) newRating = 3;
    else newRating = null;
  } else if (starElement) {
    const level = parseInt(starElement.dataset.ratingLevel, 10);
    const currentStars = calculateUserStars(currentUserData.rating);

    if (level === 1 && currentStars === 0) {
      newRating = 2; // Clic en primera estrella sin nota -> suspenso
    } else {
      newRating = level === currentStars ? null : [3, 5, 7, 9][level - 1];
    }
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

// =================================================================
//          RENDERIZADO Y ACTUALIZACIÓN DE LA UI DE LA TARJETA
// =================================================================

/**
 * Actualiza todos los elementos visuales de una tarjeta que dependen del estado del usuario.
 * @param {HTMLElement} cardElement - El elemento de la tarjeta a actualizar.
 */
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
    // Hay valoración del usuario: muestra su rating.
    starContainer.classList.add("has-user-rating");
    lowRatingCircle.classList.add("has-user-rating");
    if (userRating === 2) {
      lowRatingCircle.style.display = "block";
    } else if (userRating >= 3) {
      starContainer.style.display = "flex";
      renderUserStars(starContainer, calculateUserStars(userRating), true);
    }
  } else {
    // No hay valoración: muestra la nota media de la crítica.
    starContainer.classList.remove("has-user-rating");
    lowRatingCircle.classList.remove("has-user-rating");
    const ratings = [movieData.fa_rating, movieData.imdb_rating].filter(r => r && r > 0);
    if (ratings.length > 0) {
      const average = ratings.reduce((a, b) => a + b, 0) / ratings.length;
      if (average <= 5.5) {
        lowRatingCircle.style.display = "block";
      } else {
        starContainer.style.display = "flex";
        renderAverageStars(starContainer, calculateAverageStars(average));
      }
    }
  }

  starContainer.classList.toggle("is-interactive", isLoggedIn);
  lowRatingCircle.classList.toggle("is-interactive", isLoggedIn);
}

/**
 * Configura la imagen del póster con lazy-loading y placeholders.
 * @param {HTMLImageElement} imgElement - El elemento <img> de la tarjeta.
 * @param {object} movieData - Los datos de la película.
 */
function setupCardImage(imgElement, movieData) {
  const version = movieData.last_synced_at ? new Date(movieData.last_synced_at).getTime() : "1";
  const basePosterUrl = movieData.image && movieData.image !== "."
    ? `${CONFIG.POSTER_BASE_URL}${movieData.image}.webp`
    : `https://via.placeholder.com/500x750.png?text=${encodeURIComponent(movieData.title)}`;
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

/**
 * Formatea la lista de actores para truncarla de forma inteligente.
 * @param {string} actorsString - La cadena de actores.
 * @returns {object} - Objeto con la cadena truncada y la completa.
 */
function formatActorsWithEllipsis(actorsString, maxLength = 85) {
  if (!actorsString || actorsString.trim() === "") return { truncated: "Reparto no disponible", full: [] };
  if (actorsString.toUpperCase() === "(A)") return { truncated: "Animación", full: [] };

  const allActors = actorsString.split(",").map(name => name.trim());
  if (actorsString.length <= maxLength) return { truncated: actorsString, full: allActors };

  let truncatedActors = [];
  let currentLength = 0;
  for (const actor of allActors) {
    const potentialLength = currentLength + (truncatedActors.length > 0 ? 2 : 0) + actor.length;
    if (potentialLength > maxLength) break;
    truncatedActors.push(actor);
    currentLength = potentialLength;
  }
  return { truncated: truncatedActors.join(", "), full: allActors };
}

/**
 * Rellena los campos de texto y metadatos de la tarjeta.
 * @param {object} elements - Referencias a los elementos DOM de la tarjeta.
 * @param {object} movieData - Los datos de la película.
 */
function populateCardText(elements, movieData) {
  elements.title.textContent = movieData.title || "Título no disponible";
  elements.title.title = movieData.title || "Título no disponible";
  
  // Lógica para el Título Original: mostrar siempre si existe.
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
  
  elements.duration.textContent = formatRuntime(movieData.minutes);
  const episodesText = movieData.type?.toUpperCase().startsWith("S.") && movieData.episodes ? `${movieData.episodes} x` : "";
  if (elements.episodes) {
    elements.episodes.textContent = episodesText;
    elements.episodes.style.display = episodesText ? "inline" : "none";
  }

  elements.genre.textContent = movieData.genres || "Género no disponible";
  elements.actors.textContent = formatActorsWithEllipsis(movieData.actors).truncated;
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

  const collections = movieData.collections_list || "";
  const iconMap = { N: "netflixIcon", H: "hboIcon", D: "disneyIcon", W: "wbIcon", U: "universalIcon", S: "sonyIcon", P: "paramountIcon", L: "lionsgateIcon" };
  Object.values(iconMap).forEach(iconKey => { if (elements[iconKey]) elements[iconKey].style.display = "none"; });
  collections.split(",").forEach(code => {
    const iconKey = iconMap[code];
    if (iconKey && elements[iconKey]) elements[iconKey].style.display = "block";
  });

  if (elements.wikipediaLink && movieData.wikipedia) {
    elements.wikipediaLink.href = movieData.wikipedia;
    elements.wikipediaLink.style.display = 'flex';
  } else if (elements.wikipediaLink) {
    elements.wikipediaLink.style.display = 'none';
  }
}

/**
 * Configura los elementos de rating (Filmaffinity, IMDb) en la tarjeta.
 * @param {object} elements - Referencias a los elementos DOM de la tarjeta.
 * @param {object} movieData - Los datos de la película.
 */
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
//          MANEJO DE EVENTOS Y CREACIÓN DE TARJETAS
// =================================================================

function resetCardBackState(cardElement) {
  const flipCardBack = cardElement.querySelector(".flip-card-back");
  if (flipCardBack?.classList.contains("is-expanded")) {
    flipCardBack.classList.remove("is-expanded");
    const expandBtn = flipCardBack.querySelector(".expand-content-btn");
    if (expandBtn) {
      expandBtn.textContent = "+";
      expandBtn.setAttribute("aria-label", "Expandir sinopsis");
    }
    const scrollableContent = flipCardBack.querySelector(".scrollable-content");
    if (scrollableContent) scrollableContent.scrollTop = 0;
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
 * Manejador principal para todos los clics en una tarjeta (usado con delegación).
 * 'this' es el cardElement.
 * @param {Event} event - El evento de clic.
 */
export function handleCardClick(event) {
  const cardElement = this;
  const e = event;

  const directorLink = e.target.closest(".front-director-info a[data-director-name]");
  const watchlistBtn = e.target.closest('[data-action="toggle-watchlist"]');
  const ratingElement = e.target.closest('[data-action^="set-rating-"]');
  const expandBtn = e.target.closest(".expand-content-btn");
  const externalLink = e.target.closest("a");

  if (directorLink) {
    e.preventDefault();
    document.dispatchEvent(new CustomEvent("filtersReset", { detail: { keepSort: true, newFilter: { type: "director", value: directorLink.dataset.directorName } } }));
    return;
  }
  if (watchlistBtn) {
    handleWatchlistClick.call(cardElement, e);
    return;
  }
  if (ratingElement) {
    handleRatingClick.call(cardElement, e);
    return;
  }
  if (expandBtn) {
    e.stopPropagation();
    const flipCardBack = cardElement.querySelector(".flip-card-back");
    const isExpanded = flipCardBack.classList.toggle("is-expanded");
    expandBtn.textContent = isExpanded ? "−" : "+";
    expandBtn.setAttribute("aria-label", isExpanded ? "Contraer sinopsis" : "Expandir sinopsis");
    if (!isExpanded) cardElement.querySelector(".scrollable-content").scrollTop = 0;
    return;
  }
  if (externalLink && externalLink.href && !externalLink.href.endsWith("#")) {
    return;
  }
  if (cardElement.id === 'quick-view-content') {
    return;
  }
  const isRotationDisabled = document.body.classList.contains("rotation-disabled");
  if (!isDesktop && !isRotationDisabled) {
    e.preventDefault();
    e.stopPropagation();
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

  if (isRotationDisabled) {
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
  const ratingBlock = cardElement.querySelector(".card-rating-block");

  const startFlipTimer = () => {
    if (document.body.classList.contains("rotation-disabled")) return;
    clearTimeout(hoverTimeout);
    hoverTimeout = setTimeout(() => {
      if (cardElement.matches(":hover")) cardElement.classList.add("is-hovered");
    }, HOVER_DELAY);
  };

  const cancelFlipTimer = () => clearTimeout(hoverTimeout);

  cardElement.addEventListener("mouseenter", startFlipTimer);
  cardElement.addEventListener("mouseleave", () => {
    cancelFlipTimer();
    cardElement.classList.remove("is-hovered");
    resetCardBackState(cardElement);
  });

  if (ratingBlock) {
    ratingBlock.addEventListener("mouseenter", cancelFlipTimer);
    ratingBlock.addEventListener("mouseleave", startFlipTimer);
  }
}

/**
 * Inicializa los listeners de eventos que NO pueden ser delegados (hover, mousemove).
 * @param {HTMLElement} cardElement
 */
export function initializeCard(cardElement) {
  setupIntentionalHover(cardElement);

  const starContainer = cardElement.querySelector('[data-action="set-rating-estrellas"]');
  if (starContainer) {
    setupRatingListeners(starContainer, document.body.classList.contains("user-logged-in"));
  }
}

/**
 * Crea una nueva tarjeta de película y la configura.
 * @param {object} movieData - Los datos de la película.
 * @returns {DocumentFragment | null} - Un fragmento con la tarjeta.
 */
function createMovieCard(movieData) {
  if (!cardTemplate) return null;
  const cardClone = cardTemplate.content.cloneNode(true);
  const cardElement = cardClone.querySelector(`.${CSS_CLASSES.MOVIE_CARD}`);
  cardElement.dataset.movieId = movieData.id;
  cardElement.movieData = movieData;
  if (movieData.id) cardElement.style.viewTransitionName = `movie-${movieData.id}`;

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
    netflixIcon: cardClone.querySelector('[data-template="netflix-icon"]'),
    hboIcon: cardClone.querySelector('[data-template="hbo-icon"]'),
    disneyIcon: cardClone.querySelector('[data-template="disney-icon"]'),
    wbIcon: cardClone.querySelector('[data-template="wb-icon"]'),
    universalIcon: cardClone.querySelector('[data-template="universal-icon"]'),
    sonyIcon: cardClone.querySelector('[data-template="sony-icon"]'),
    lionsgateIcon: cardClone.querySelector('[data-template="lionsgate-icon"]'),
    paramountIcon: cardClone.querySelector('[data-template="paramount-icon"]'),
    wikipediaLink: cardClone.querySelector('[data-template="wikipedia-link"]'),
    genre: cardClone.querySelector(SELECTORS.GENRE),
    actors: cardClone.querySelector(SELECTORS.ACTORS),
    synopsis: cardClone.querySelector(SELECTORS.SYNOPSIS),
    criticContainer: cardClone.querySelector('[data-template="critic-container"]'),
    critic: cardClone.querySelector('[data-template="critic"]'),
    originalTitle: cardClone.querySelector('[data-template="original-title"]'),
    originalTitleWrapper: cardClone.querySelector('.back-original-title-wrapper'),
  };

  populateCardText(elements, movieData);
  setupCardImage(elements.img, movieData);
  setupCardRatings(elements, movieData);
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

  gridContainer.textContent = "";
  const fragment = document.createDocumentFragment();

  movies.forEach((movie, index) => {
    const cardNode = createMovieCard(movie);
    if (cardNode) {
      const cardElement = cardNode.querySelector(".movie-card");
      if (cardElement) {
        cardElement.style.setProperty("--card-index", index);
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
  if (gridContainer) gridContainer.textContent = "";
  if (paginationContainer) paginationContainer.textContent = "";
  if (!gridContainer) return;
  const fragment = document.createDocumentFragment();
  for (let i = 0; i < CONFIG.ITEMS_PER_PAGE; i++) {
    fragment.appendChild(createElement("div", { className: "skeleton-card" }));
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

/**
 * Renderiza un mensaje de error en la parrilla.
 * @param {HTMLElement} gridContainer
 * @param {HTMLElement} paginationContainer
 * @param {string} message
 */
export function renderErrorState(gridContainer, paginationContainer, message) {
  if (gridContainer) gridContainer.textContent = "";
  if (paginationContainer) paginationContainer.textContent = "";
  if (!gridContainer) return;
  const errorDiv = createElement("div", { className: "no-results", attributes: { role: "alert" } });
  errorDiv.appendChild(createElement("h3", { textContent: "¡Vaya! Algo ha ido mal" }));
  errorDiv.appendChild(createElement("p", { textContent: message }));
  gridContainer.appendChild(errorDiv);
}