// =================================================================
//          COMPONENTE: Movie Card (Tarjeta de Película)
// =================================================================
// Responsabilidades:
// - Crear el elemento DOM para una tarjeta de película a partir de una plantilla.
// - Poblar la tarjeta con los datos de la película (texto, imágenes, ratings).
// - Exportar los manejadores de eventos de clic para ser usados por un listener delegado.
// - Gestionar los listeners de eventos que no se pueden delegar (ej. hover, mousemove).
// - Manejar la lógica de las acciones del usuario (watchlist, rating) con UI optimista.
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
  setUpdateCardUIFn,
} from "./rating-stars.js";

// --- Constantes y Estado del Módulo ---

const MAX_VOTES = { FA: 220000, IMDB: 3200000 };
const SQRT_MAX_VOTES = {
  FA: Math.sqrt(MAX_VOTES.FA),
  IMDB: Math.sqrt(MAX_VOTES.IMDB),
};
const cardTemplate = document.getElementById(
  SELECTORS.MOVIE_CARD_TEMPLATE.substring(1)
);
let renderedCardCount = 0; // Para priorizar la carga de las primeras imágenes
let currentlyFlippedCard = null;
const isDesktop = window.matchMedia(
  "(hover: hover) and (pointer: fine)"
).matches;

/**
 * Observador de Intersección para cargar imágenes de forma diferida (lazy-loading).
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
 * @param {Event} event - El evento de clic.
 */
async function handleWatchlistClick(event) {
  event.preventDefault();
  event.stopPropagation();

  // 'this' es el cardElement, establecido por .call() en el listener delegado
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
  updateUserDataForMovie(movieId, newUserData);
  updateCardUI(interactiveContainer); // UI optimista

  try {
    await setUserMovieDataAPI(movieId, newUserData);
    triggerHapticFeedback("success");
  } catch (error) {
    showToast(error.message, "error");
    // Reversión en caso de error
    updateUserDataForMovie(movieId, previousUserData);
    updateCardUI(interactiveContainer);
  }
}

/**
 * Maneja el clic en las opciones de rating (suspenso y estrellas).
 * @param {Event} event - El evento de clic.
 */
async function handleRatingClick(event) {
  event.preventDefault();
  event.stopPropagation();

  const interactiveContainer = this; // 'this' es el cardElement
  const movieId = parseInt(interactiveContainer.dataset.movieId, 10);
  if (!movieId) return;

  const previousUserData = JSON.parse(
    interactiveContainer.dataset.previousUserData || "{}"
  );
  const currentUserData = getUserDataForMovie(movieId) || { rating: null };
  let newRating = null;

  // Determinar qué se clickeó y calcular la nueva nota
  const suspensoCircle = event.target.closest(
    '[data-action="set-rating-suspenso"]'
  );
  const starElement = event.target.closest(".star-icon[data-rating-level]");

  if (suspensoCircle) {
    // Ciclo de rating bajo: null -> suspenso (2) -> 1 estrella (3) -> null
    if (currentUserData.rating === null) newRating = 2;
    else if (currentUserData.rating === 2) newRating = 3;
    else newRating = null;
  } else if (starElement) {
    // ==========================================================
    //  ▼▼▼ CORRECCIÓN DE LÓGICA DE VOTACIÓN ▼▼▼
    //      Se restaura el ciclo de votación para "suspenso".
    // ==========================================================
    const level = parseInt(starElement.dataset.ratingLevel, 10);
    const currentStars = calculateUserStars(currentUserData.rating);

    if (level === 1 && currentStars === 0) {
      // Caso especial: Clic en la primera estrella sin tener nota -> Poner suspenso (2).
      newRating = 2;
    } else {
      // Comportamiento normal: si se hace clic en la misma estrella, se quita la nota. Si no, se establece la nueva.
      newRating = level === currentStars ? null : [3, 5, 7, 9][level - 1];
    }
  }

  if (newRating === currentUserData.rating) return; // No hubo cambios

  const newUserData = { rating: newRating };

  triggerHapticFeedback("light");
  updateUserDataForMovie(movieId, newUserData);
  updateCardUI(interactiveContainer); // UI Optimista

  try {
    await setUserMovieDataAPI(movieId, newUserData);
    if (newRating !== null) triggerHapticFeedback("success");
  } catch (error) {
    showToast(error.message, "error");
    updateUserDataForMovie(movieId, previousUserData);
    updateCardUI(interactiveContainer); // Reversión
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
  const starContainer = cardElement.querySelector(
    '[data-action="set-rating-estrellas"]'
  );
  const lowRatingCircle = cardElement.querySelector(
    '[data-action="set-rating-suspenso"]'
  );
  const watchlistButton = cardElement.querySelector(
    '[data-action="toggle-watchlist"]'
  );
  const isLoggedIn = document.body.classList.contains("user-logged-in");

  if (!starContainer || !lowRatingCircle || !watchlistButton) return;

  // Guardar estado previo para posible reversión
  cardElement.dataset.previousUserData = JSON.stringify(
    userData || { onWatchlist: false, rating: null }
  );

  // Actualizar UI de Watchlist
  const isOnWatchlist = userData?.onWatchlist ?? false;
  watchlistButton.classList.toggle("is-active", isOnWatchlist);
  watchlistButton.setAttribute(
    "aria-label",
    isOnWatchlist ? "Quitar de mi lista" : "Añadir a mi lista"
  );

  // Actualizar UI de Rating
  lowRatingCircle.style.display = "none";
  starContainer.style.display = "none";

  if (isLoggedIn && userRating !== null && userRating !== undefined) {
    // Hay una valoración del usuario
    starContainer.classList.add("has-user-rating");
    lowRatingCircle.classList.add("has-user-rating");

    if (userRating === 2) {
      // Suspenso
      lowRatingCircle.style.display = "block";
    } else if (userRating >= 3) {
      // 1 a 4 estrellas
      starContainer.style.display = "flex";
      renderUserStars(starContainer, calculateUserStars(userRating), true);
    }
  } else {
    // No hay valoración del usuario, mostrar nota media
    starContainer.classList.remove("has-user-rating");
    lowRatingCircle.classList.remove("has-user-rating");
    const ratings = [movieData.fa_rating, movieData.imdb_rating].filter(
      (r) => r && r > 0
    );
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
  const version = movieData.last_synced_at
    ? new Date(movieData.last_synced_at).getTime()
    : "1";
  const basePosterUrl =
    movieData.image && movieData.image !== "."
      ? `${CONFIG.POSTER_BASE_URL}${movieData.image}.webp`
      : `https://via.placeholder.com/500x750.png?text=${encodeURIComponent(
          movieData.title
        )}`;
  const highQualityPoster = `${basePosterUrl}?v=${version}`;

  imgElement.alt = `Póster de ${movieData.title}`;

  if (renderedCardCount < 6) {
    // Carga prioritaria para las primeras imágenes (LCP)
    imgElement.src = highQualityPoster;
    imgElement.loading = "eager";
    imgElement.setAttribute("fetchpriority", "high");
  } else {
    // Carga diferida para el resto
    if (movieData.thumbhash_st) {
      imgElement.src = movieData.thumbhash_st; // Placeholder
      imgElement.dataset.src = highQualityPoster;
      imgElement.classList.add(CSS_CLASSES.LAZY_LQIP);
      lazyLoadObserver.observe(imgElement);
    } else {
      imgElement.src =
        "data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs="; // Placeholder transparente
      imgElement.dataset.src = highQualityPoster;
      lazyLoadObserver.observe(imgElement);
    }
  }
}

/**
 * Formatea la lista de actores para que quepa en un espacio limitado sin cortar nombres.
 * @param {string} actorsString - La cadena de actores separada por comas.
 * @param {number} maxLength - La longitud máxima permitida para la cadena.
 * @returns {string} La cadena de actores formateada y truncada de forma inteligente.
 */
function formatActorsWithEllipsis(actorsString, maxLength = 85) {
  if (!actorsString || actorsString.trim() === "") {
    return {
      truncated: "Reparto no disponible",
      full: [],
      needsExpansion: false,
    };
  }
  if (actorsString.toUpperCase() === "(A)") {
    return { truncated: "Animación", full: [], needsExpansion: false };
  }

  const allActors = actorsString.split(",").map((name) => name.trim());

  if (actorsString.length <= maxLength) {
    return { truncated: actorsString, full: allActors, needsExpansion: false };
  }

  let truncatedActors = [];
  let currentLength = 0;

  for (const actor of allActors) {
    const separatorLength = truncatedActors.length > 0 ? 2 : 0; // ', '.length
    const potentialLength = currentLength + separatorLength + actor.length;

    if (potentialLength > maxLength) {
      break;
    }
    truncatedActors.push(actor);
    currentLength = potentialLength;
  }

  if (truncatedActors.length === 0 && allActors.length > 0) {
    truncatedActors.push(allActors[0]);
  }

  const truncatedString = truncatedActors.join(", ");
  const needsExpansion = truncatedActors.length < allActors.length;

  return {
    truncated: truncatedString,
    full: allActors,
    needsExpansion: needsExpansion,
  };
}

/**
 * Rellena los campos de texto y metadatos de la tarjeta.
 * @param {object} elements - Un objeto con referencias a los elementos DOM de la tarjeta.
 * @param {object} movieData - Los datos de la película.
 */
function populateCardText(elements, movieData) {
  elements.title.textContent = movieData.title || "Título no disponible";
  elements.title.title = movieData.title || "Título no disponible";
  const directorContainer = elements.director;
  directorContainer.textContent = "";
  const directorsString = movieData.directors || "Director no disponible";
  if (directorsString && directorsString !== "Director no disponible") {
    directorsString
      .split(", ")
      .map((name) => name.trim())
      .forEach((name, index, arr) => {
        const link = createElement("a", { textContent: name, href: `#` });
        link.dataset.directorName = name;
        directorContainer.appendChild(link);
        if (index < arr.length - 1)
          directorContainer.appendChild(document.createTextNode(", "));
      });
  } else {
    directorContainer.textContent = directorsString;
  }

  elements.duration.textContent = formatRuntime(movieData.minutes);
  const episodesText =
    movieData.type?.toUpperCase().startsWith("S.") && movieData.episodes
      ? `${movieData.episodes} x`
      : "";
  if (elements.episodes) {
    elements.episodes.textContent = episodesText;
    elements.episodes.style.display = episodesText ? "inline" : "none";
  }

  elements.genre.textContent = movieData.genres || "Género no disponible";
  elements.actors.textContent = formatActorsWithEllipsis(
    movieData.actors
  ).truncated;
  elements.synopsis.textContent =
    movieData.synopsis || "Argumento no disponible.";
  elements.criticContainer.style.display =
    movieData.critic && movieData.critic.trim() !== "" ? "block" : "none";
  if (elements.criticContainer.style.display === "block")
    elements.critic.textContent = movieData.critic;

  let displayYear = movieData.year || "N/A";
  if (movieData.type?.toUpperCase().startsWith("S.") && movieData.year_end) {
    const yearEnd = String(movieData.year_end).trim();
    if (yearEnd.toUpperCase() === "M") displayYear = `${movieData.year} (M)`;
    else if (yearEnd === "-") displayYear = `${movieData.year}-`;
    else if (!isNaN(yearEnd) && yearEnd.length === 4)
      displayYear = `${movieData.year}-${yearEnd.substring(2)}`;
    else displayYear = `${movieData.year} - ${yearEnd}`;
  }
  elements.year.textContent = displayYear;

  elements.countryContainer.style.display = movieData.country_code
    ? "flex"
    : "none";
  if (movieData.country_code)
    elements.countryFlag.className = `fi fi-${movieData.country_code}`;

  const collections = movieData.collections_list || "";
  const iconMap = {
    N: "netflixIcon",
    H: "hboIcon",
    D: "disneyIcon",
    W: "wbIcon",
    U: "universalIcon",
    S: "sonyIcon",
    P: "paramountIcon",
  };
  Object.values(iconMap).forEach((iconKey) => {
    if (elements[iconKey]) elements[iconKey].style.display = "none";
  });
  collections.split(",").forEach((code) => {
    const iconKey = iconMap[code];
    if (iconKey && elements[iconKey]) {
      elements[iconKey].style.display = "block";
    }
  });
}

/**
 * Configura los elementos de rating (Filmaffinity, IMDb) en la tarjeta.
 * @param {object} elements - Un objeto con referencias a los elementos DOM de la tarjeta.
 * @param {object} movieData - Los datos de la película.
 */
function setupCardRatings(elements, movieData) {
  const isValidHttpUrl = (s) =>
    s && (s.startsWith("http://") || s.startsWith("https://"));
  elements.faLink.href = isValidHttpUrl(movieData.fa_id)
    ? movieData.fa_id
    : "#";
  elements.faLink.classList.toggle(
    CSS_CLASSES.DISABLED,
    !isValidHttpUrl(movieData.fa_id)
  );
  elements.faRating.textContent = movieData.fa_rating
    ? `${movieData.fa_rating}`.includes(".")
      ? movieData.fa_rating
      : `${movieData.fa_rating}.0`
    : "N/A";
  const faVotesCount =
    parseInt(String(movieData.fa_votes).replace(/\D/g, ""), 10) || 0;
  elements.faVotesBarContainer.style.display =
    faVotesCount > 0 ? "block" : "none";
  if (faVotesCount > 0) {
    elements.faVotesBar.style.width = `${Math.min(
      (Math.sqrt(faVotesCount) / SQRT_MAX_VOTES.FA) * 100,
      100
    )}%`;
    elements.faVotesBarContainer.title = `${formatVotesUnified(
      faVotesCount
    )} votos`;
  }
  elements.imdbLink.href = isValidHttpUrl(movieData.imdb_id)
    ? movieData.imdb_id
    : "#";
  elements.imdbLink.classList.toggle(
    CSS_CLASSES.DISABLED,
    !isValidHttpUrl(movieData.imdb_id)
  );
  elements.imdbRating.textContent = movieData.imdb_rating
    ? `${movieData.imdb_rating}`.includes(".")
      ? movieData.imdb_rating
      : `${movieData.imdb_rating}.0`
    : "N/A";
  const imdbVotesCount =
    parseInt(String(movieData.imdb_votes).replace(/\D/g, ""), 10) || 0;
  elements.imdbVotesBarContainer.style.display =
    imdbVotesCount > 0 ? "block" : "none";
  if (imdbVotesCount > 0) {
    elements.imdbVotesBar.style.width = `${Math.min(
      (Math.sqrt(imdbVotesCount) / SQRT_MAX_VOTES.IMDB) * 100,
      100
    )}%`;
    elements.imdbVotesBarContainer.title = `${formatVotesUnified(
      imdbVotesCount
    )} votos`;
  }
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
    currentlyFlippedCard
      .querySelector(".flip-card-inner")
      ?.classList.remove("is-flipped");
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
 * Función principal que maneja los clics en una tarjeta.
 * Esta función es llamada por el listener delegado en main.js.
 * @param {Event} event - El evento de clic.
 */
export function handleCardClick(event) {
  const cardElement = this; // 'this' es establecido por .call()
  const e = event;

  // Se comprueba en qué parte de la tarjeta se ha hecho clic
  const directorLink = e.target.closest(
    ".front-director-info a[data-director-name]"
  );
  const watchlistBtn = e.target.closest('[data-action="toggle-watchlist"]');
  const ratingElement = e.target.closest('[data-action^="set-rating-"]');
  const expandBtn = e.target.closest(".expand-content-btn");
  const externalLink = e.target.closest("a");

  // PRIORIDAD 1: Acciones específicas que no deben voltear la tarjeta
  if (directorLink) {
    e.preventDefault();
    document.dispatchEvent(
      new CustomEvent("filtersReset", {
        detail: {
          keepSort: true,
          newFilter: {
            type: "director",
            value: directorLink.dataset.directorName,
          },
        },
      })
    );
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
    const scrollableContent = cardElement.querySelector(".scrollable-content");
    const isExpanded = flipCardBack.classList.toggle("is-expanded");
    expandBtn.textContent = isExpanded ? "−" : "+";
    expandBtn.setAttribute(
      "aria-label",
      isExpanded ? "Contraer sinopsis" : "Expandir sinopsis"
    );
    if (!isExpanded && scrollableContent) {
      scrollableContent.scrollTop = 0;
    }
    return;
  }
  if (externalLink && externalLink.href && !externalLink.href.endsWith("#")) {
    // Si es un enlace externo válido, dejamos que el navegador actúe.
    return;
  }

  // PRIORIDAD 2: Acción por defecto (voltear o abrir Quick View)
  const isRotationDisabled =
    document.body.classList.contains("rotation-disabled");
  if (!isDesktop && !isRotationDisabled) {
    // Lógica de volteo para móvil
    e.preventDefault();
    e.stopPropagation();
    const inner = cardElement.querySelector(".flip-card-inner");
    if (!inner) return;
    const isThisCardFlipped = inner.classList.contains("is-flipped");
    if (currentlyFlippedCard && currentlyFlippedCard !== cardElement) {
      unflipAllCards();
    }
    inner.classList.toggle("is-flipped");
    if (!isThisCardFlipped) {
      currentlyFlippedCard = cardElement;
      setTimeout(
        () => document.addEventListener("click", handleDocumentClick),
        0
      );
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
      if (cardElement.matches(":hover")) {
        // Doble check
        cardElement.classList.add("is-hovered");
      }
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

  const starContainer = cardElement.querySelector(
    '[data-action="set-rating-estrellas"]'
  );
  if (starContainer) {
    // setupRatingListeners es necesario para los efectos de hover sobre las estrellas
    setupRatingListeners(
      starContainer,
      document.body.classList.contains("user-logged-in")
    );
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
  if (movieData.id)
    cardElement.style.viewTransitionName = `movie-${movieData.id}`;

  const elements = {
    img: cardClone.querySelector("img"),
    title: cardClone.querySelector(SELECTORS.TITLE),
    director: cardClone.querySelector(SELECTORS.DIRECTOR),
    year: cardClone.querySelector(SELECTORS.YEAR),
    countryContainer: cardClone.querySelector(SELECTORS.COUNTRY_CONTAINER),
    countryFlag: cardClone.querySelector(SELECTORS.COUNTRY_FLAG),
    faLink: cardClone.querySelector(SELECTORS.FA_LINK),
    faRating: cardClone.querySelector(SELECTORS.FA_RATING),
    faVotesBarContainer: cardClone.querySelector(
      '[data-template="fa-votes-bar-container"]'
    ),
    faVotesBar: cardClone.querySelector('[data-template="fa-votes-bar"]'),
    imdbLink: cardClone.querySelector(SELECTORS.IMDB_LINK),
    imdbRating: cardClone.querySelector(SELECTORS.IMDB_RATING),
    imdbVotesBarContainer: cardClone.querySelector(
      '[data-template="imdb-votes-bar-container"]'
    ),
    imdbVotesBar: cardClone.querySelector('[data-template="imdb-votes-bar"]'),
    duration: cardClone.querySelector(SELECTORS.DURATION),
    episodes: cardClone.querySelector('[data-template="episodes"]'),
    netflixIcon: cardClone.querySelector('[data-template="netflix-icon"]'),
    hboIcon: cardClone.querySelector('[data-template="hbo-icon"]'),
    disneyIcon: cardClone.querySelector('[data-template="disney-icon"]'),
    wbIcon: cardClone.querySelector('[data-template="wb-icon"]'),
    universalIcon: cardClone.querySelector('[data-template="universal-icon"]'),
    sonyIcon: cardClone.querySelector('[data-template="sony-icon"]'),
    paramountIcon: cardClone.querySelector('[data-template="paramount-icon"]'),
    wikipediaLink: cardClone.querySelector('[data-template="wikipedia-link"]'),
    genre: cardClone.querySelector(SELECTORS.GENRE),
    actors: cardClone.querySelector(SELECTORS.ACTORS),
    synopsis: cardClone.querySelector(SELECTORS.SYNOPSIS),
    criticContainer: cardClone.querySelector(
      '[data-template="critic-container"]'
    ),
    critic: cardClone.querySelector('[data-template="critic"]'),
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
export function renderNoResults(
  gridContainer,
  paginationContainer,
  activeFilters
) {
  if (gridContainer) gridContainer.textContent = "";
  if (paginationContainer) paginationContainer.textContent = "";
  if (!gridContainer) return;
  const noResultsDiv = createElement("div", {
    className: "no-results",
    attributes: { role: "status" },
  });
  noResultsDiv.appendChild(
    createElement("h3", { textContent: "No se encontraron resultados" })
  );
  const hasActiveFilters = Object.values(activeFilters).some(
    (value) => value && value !== "id,asc" && value !== "all"
  );
  if (activeFilters.searchTerm) {
    noResultsDiv.appendChild(
      createElement("p", {
        textContent: `Prueba a simplificar tu búsqueda para "${activeFilters.searchTerm}".`,
      })
    );
  } else if (hasActiveFilters) {
    noResultsDiv.appendChild(
      createElement("p", {
        textContent:
          "Intenta eliminar algunos filtros para obtener más resultados.",
      })
    );
  }
  noResultsDiv.appendChild(
    createElement("button", {
      id: "clear-filters-from-empty",
      className: "btn btn--outline",
      textContent: "Limpiar todos los filtros",
    })
  );
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
  const errorDiv = createElement("div", {
    className: "no-results",
    attributes: { role: "alert" },
  });
  errorDiv.appendChild(
    createElement("h3", { textContent: "¡Vaya! Algo ha ido mal" })
  );
  errorDiv.appendChild(createElement("p", { textContent: message }));
  gridContainer.appendChild(errorDiv);
}

// Inyecta la función de actualización de UI en el módulo de estrellas para evitar dependencias circulares.
setUpdateCardUIFn(updateCardUI);
