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

import { CONFIG } from "../config.js";
import {
  formatRuntime,
  formatVotesUnified,
  createElement,
  triggerHapticFeedback,
} from "../utils.js";
import { CSS_CLASSES, SELECTORS } from "../constants.js";
import { openModal, closeModal } from "./quick-view.js";
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
 * Empieza a cargar las imágenes cuando están a 800px de entrar en el viewport.
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
//          LÓGICA DE ACCIONES DEL USUARIO (CON UI OPTIMISTA)
// =================================================================

/**
 * Actualiza la UI del botón de watchlist basándose en el estado global.
 * @param {HTMLElement} cardElement - El elemento de la tarjeta.
 */
function updateWatchlistActionUI(cardElement) {
  const movieId = parseInt(cardElement.dataset.movieId, 10);
  const userData = getUserDataForMovie(movieId);
  const watchlistButton = cardElement.querySelector(
    '[data-action="toggle-watchlist"]'
  );
  if (watchlistButton) {
    const isOnWatchlist = userData?.onWatchlist ?? false;
    watchlistButton.classList.toggle("is-active", isOnWatchlist);
    watchlistButton.setAttribute(
      "aria-label",
      isOnWatchlist ? "Quitar de mi lista" : "Añadir a mi lista"
    );
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
  // ▼▼▼ CAMBIO CLAVE ▼▼▼
  // Generalizamos la búsqueda del contenedor para que funcione en la tarjeta y en la Quick View.
  const interactiveContainer = button.closest("[data-movie-id]");
  if (!interactiveContainer) return;

  const movieId = parseInt(interactiveContainer.dataset.movieId, 10);
  const wasOnWatchlist = button.classList.contains("is-active");
  const newUserData = { onWatchlist: !wasOnWatchlist };
  // Guardamos el estado previo completo para una reversión precisa.
  const previousUserData = JSON.parse(
    interactiveContainer.dataset.previousUserData || "{}"
  );

  triggerHapticFeedback("light");
  updateUserDataForMovie(movieId, newUserData);
  // Actualizamos la UI inmediatamente para una respuesta optimista.
  updateCardUI(interactiveContainer);

  try {
    await setUserMovieDataAPI(movieId, newUserData);
    triggerHapticFeedback("success");
  } catch (error) {
    showToast(error.message, "error");
    // Si la API falla, revertimos el estado y la UI.
    updateUserDataForMovie(movieId, previousUserData);
    updateCardUI(interactiveContainer);
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
  // ▼▼▼ CAMBIO CLAVE ▼▼▼
  // Hacemos la búsqueda del contenedor más genérica, igual que en rating-stars.js.
  const interactiveContainer = event.currentTarget.closest("[data-movie-id]");
  if (!interactiveContainer) return;

  const movieId = parseInt(interactiveContainer.dataset.movieId, 10);
  if (!movieId) return;

  const currentUserData = getUserDataForMovie(movieId) || { rating: null };
  const currentRating = currentUserData.rating;

  let newRating;
  if (currentRating === null) {
    newRating = 2;
  } else if (currentRating === 2) {
    newRating = 3;
  } else if (currentRating === 3) {
    newRating = null;
  } else {
    newRating = 3;
  } // Si tiene otra nota, se establece a 1 estrella (rating 3)

  const newUserData = { rating: newRating };
  const previousUserData = JSON.parse(
    interactiveContainer.dataset.previousUserData || "{}"
  ); // Aseguramos que se lee el estado previo correcto

  triggerHapticFeedback("light");
  updateUserDataForMovie(movieId, newUserData);
  updateCardUI(interactiveContainer); // Actualizamos la UI inmediatamente

  try {
    await setUserMovieDataAPI(movieId, newUserData);
    triggerHapticFeedback("success");
  } catch (error) {
    showToast(error.message, "error");
    updateUserDataForMovie(movieId, previousUserData);
    updateCardUI(interactiveContainer); // Revertimos la UI si hay error
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
  const starContainer = cardElement.querySelector(
    '[data-action="set-rating-estrellas"]'
  );
  const lowRatingCircle = cardElement.querySelector(
    '[data-action="set-rating-suspenso"]'
  );
  if (!starContainer || !lowRatingCircle) return;

  const isLoggedIn = document.body.classList.contains("user-logged-in");
  cardElement.dataset.previousUserData = JSON.stringify(
    userData || { onWatchlist: false, rating: null }
  );

  lowRatingCircle.style.display = "none";
  starContainer.style.display = "none";

  if (isLoggedIn && userRating !== null && userRating !== undefined) {
    starContainer.classList.add("has-user-rating");
    lowRatingCircle.classList.add("has-user-rating");

    if (userRating === 2) {
      lowRatingCircle.style.display = "block";
    } else if (userRating >= 3) {
      starContainer.style.display = "flex";
      renderUserStars(starContainer, calculateUserStars(userRating), true);
    }
  } else {
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

  if (movieData.thumbhash_st) {
    imgElement.src = movieData.thumbhash_st;
    imgElement.dataset.src = highQualityPoster;
    imgElement.classList.add(CSS_CLASSES.LAZY_LQIP);
    lazyLoadObserver.observe(imgElement);
  } else {
    imgElement.src = highQualityPoster;
    imgElement.loading = renderedCardCount < 6 ? "eager" : "lazy";
  }

  imgElement.alt = `Póster de ${movieData.title}`;
  if (renderedCardCount < 6) {
    imgElement.setAttribute("fetchpriority", "high");
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
    // Longitud que tendría la cadena si añadiéramos el nuevo actor
    const potentialLength = currentLength + separatorLength + actor.length;

    if (potentialLength > maxLength) {
      break; // No cabe el siguiente actor, así que paramos.
    }
    truncatedActors.push(actor);
    currentLength = potentialLength;
  }

  if (truncatedActors.length === 0 && allActors.length > 0) {
    // Si ni siquiera el primer actor cabe, es un caso extremo.
    // Devolvemos solo el primero para evitar un campo vacío.
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

  // ==========================================================
  //  ▼▼▼ LÓGICA DE ICONOS REFACTORIZADA PARA MÚLTIPLES ICONOS ▼▼▼
  // ==========================================================

  const collections = movieData.collections_list || "";

  // 1. Ocultamos todos los iconos al principio para limpiar el estado anterior.
  elements.netflixIcon?.style.setProperty("display", "none");
  elements.hboIcon?.style.setProperty("display", "none");
  elements.disneyIcon?.style.setProperty("display", "none");
  elements.wbIcon?.style.setProperty("display", "none");
  elements.universalIcon?.style.setProperty("display", "none");
  elements.sonyIcon?.style.setProperty("display", "none");
  elements.paramountIcon?.style.setProperty("display", "none");

  // 2. Usamos una serie de 'if' independientes. Cada uno se evalúa
  //    sin importar si los anteriores fueron verdaderos o no.
  if (collections.includes("N") && elements.netflixIcon) {
    elements.netflixIcon.style.setProperty("display", "block");
  }
  if (collections.includes("H") && elements.hboIcon) {
    elements.hboIcon.style.setProperty("display", "block");
  }
  if (collections.includes("D") && elements.disneyIcon) {
    elements.disneyIcon.style.setProperty("display", "block");
  }
  if (collections.includes("W") && elements.wbIcon) {
    elements.wbIcon.style.setProperty("display", "block");
  }
  if (collections.includes("U") && elements.universalIcon) {
    elements.universalIcon.style.setProperty("display", "block");
  }
  if (collections.includes("S") && elements.sonyIcon) {
    elements.sonyIcon.style.setProperty("display", "block");
  }
  if (collections.includes("P") && elements.paramountIcon) {
    elements.paramountIcon.style.setProperty("display", "block");
  }
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

/**
 * Resetea el estado de la cara trasera de una tarjeta a su estado inicial.
 * (Contrae la sinopsis, resetea el botón y el scroll).
 * @param {HTMLElement} cardElement - La tarjeta a resetear.
 */
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

/**
 * Voltea todas las tarjetas que estén mostrando su cara trasera.
 */
export function unflipAllCards() {
  if (currentlyFlippedCard) {
    currentlyFlippedCard
      .querySelector(".flip-card-inner")
      ?.classList.remove("is-flipped");
    resetCardBackState(currentlyFlippedCard); // <-- REINICIAMOS ESTADO
    currentlyFlippedCard = null;
    document.removeEventListener("click", handleDocumentClick);
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

  const directorLink = e.target.closest(
    ".front-director-info a[data-director-name]"
  );
  if (directorLink) {
    e.preventDefault();
    const eventDetail = {
      keepSort: true,
      newFilter: { type: "director", value: directorLink.dataset.directorName },
    };
    document.dispatchEvent(
      new CustomEvent("filtersReset", { detail: eventDetail })
    );
    return;
  }
  if (e.target.closest("a")) return;

  const isRotationDisabled =
    document.body.classList.contains("rotation-disabled");
  if (!isDesktop && !isRotationDisabled) {
    e.preventDefault();
    e.stopPropagation();
    const inner = cardElement.querySelector(".flip-card-inner");
    if (!inner) return;
    const isThisCardFlipped = inner.classList.contains("is-flipped");
    if (currentlyFlippedCard && currentlyFlippedCard !== cardElement) {
      unflipAllCards();
    }
    inner.classList.toggle("is-flipped");
    // ▼▼▼ MEJORA: Reiniciar el scroll al voltear la tarjeta ▼▼▼
    // Si la tarjeta se va a mostrar (no estaba volteada), nos aseguramos
    // de que el contenido de la cara trasera empiece desde arriba.
    if (!isThisCardFlipped) {
      cardElement.querySelector(".scrollable-content").scrollTop = 0;
    }
    if (!isThisCardFlipped) {
      currentlyFlippedCard = cardElement;
      setTimeout(
        () => document.addEventListener("click", handleDocumentClick),
        0
      );
    } else {
      currentlyFlippedCard = null;
      resetCardBackState(cardElement); // <-- REINICIAMOS ESTADO
    }
    return;
  }

  if (isRotationDisabled) {
    if (
      document
        .getElementById("quick-view-modal")
        ?.classList.contains("is-visible")
    ) {
      closeModal();
      return;
    }
    openModal(cardElement);
  }
}

/**
 * Configura el botón de expansión para la sinopsis/crítica.
 * @param {HTMLElement} cardElement - El elemento de la tarjeta o modal.
 */
function setupSynopsisExpansion(cardElement) {
  const expandBtn = cardElement.querySelector(".expand-content-btn");
  const flipCardBack = cardElement.querySelector(".flip-card-back");
  const scrollableContent = cardElement.querySelector(".scrollable-content");

  if (!expandBtn || !flipCardBack || !scrollableContent) return;

  expandBtn.addEventListener("click", (e) => {
    e.stopPropagation(); // Evita que el clic se propague y voltee la tarjeta
    const isExpanded = flipCardBack.classList.toggle("is-expanded");

    // Cambia el texto del botón y la etiqueta ARIA
    expandBtn.textContent = isExpanded ? "−" : "+";
    expandBtn.setAttribute(
      "aria-label",
      isExpanded ? "Contraer sinopsis" : "Expandir sinopsis"
    );

    // Si se contrae, resetea el scroll
    if (!isExpanded) {
      scrollableContent.scrollTop = 0;
    }
  });
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
    clearTimeout(hoverTimeout); // Asegurarse de que no hay timers duplicados
    hoverTimeout = setTimeout(
      () => cardElement.classList.add("is-hovered"),
      HOVER_DELAY
    );
  };

  const cancelFlipTimer = () => {
    clearTimeout(hoverTimeout);
  };

  cardElement.addEventListener("mouseenter", startFlipTimer);
  cardElement.addEventListener("mouseleave", () => {
    cancelFlipTimer();
    resetCardBackState(cardElement); // <-- REINICIAMOS ESTADO AL SALIR EL RATÓN
    cardElement.classList.remove("is-hovered");
  });

  if (ratingBlock) {
    ratingBlock.addEventListener("mouseenter", cancelFlipTimer);
    ratingBlock.addEventListener("mouseleave", startFlipTimer);
  }
}

/**
 * Inicializa los listeners de eventos que son específicos de una tarjeta individual
 * y no pueden ser delegados (ej. mouseenter/mouseleave).
 * @param {HTMLElement} cardElement
 */
export function initializeCard(cardElement) {
  setupIntentionalHover(cardElement);
  setupSynopsisExpansion(cardElement); // <-- NUEVA LÓGICA DE EXPANSIÓN

  const isLoggedIn = document.body.classList.contains("user-logged-in");
  if (isLoggedIn) {
    cardElement
      .querySelector('[data-action="toggle-watchlist"]')
      ?.addEventListener("click", handleWatchlistClick);
    const starContainer = cardElement.querySelector(
      '[data-action="set-rating-estrellas"]'
    );
    if (starContainer) {
      setupRatingListeners(starContainer, true);
      starContainer
        .querySelector('[data-rating-level="1"]')
        ?.addEventListener("click", handleFirstOptionClick);
    }
    cardElement
      .querySelector('[data-action="set-rating-suspenso"]')
      ?.addEventListener("click", handleFirstOptionClick);
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
    wbIcon: cardClone.querySelector('[data-template="wb-icon"]'), // <-- Añadido
    universalIcon: cardClone.querySelector('[data-template="universal-icon"]'), // <-- Añadido
    sonyIcon: cardClone.querySelector('[data-template="sony-icon"]'), // <-- Añadido
    paramountIcon: cardClone.querySelector('[data-template="paramount-icon"]'), // <-- Añadido
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
  elements.wikipediaLink.href =
    movieData.wikipedia && movieData.wikipedia.startsWith("http")
      ? movieData.wikipedia
      : "#";
  elements.wikipediaLink.style.display =
    movieData.wikipedia && movieData.wikipedia.startsWith("http")
      ? "inline-flex"
      : "none";

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
