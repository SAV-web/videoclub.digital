import { CONFIG, CSS_CLASSES, SELECTORS, STUDIO_DATA } from "../constants.js";
import {
  formatRuntime,
  formatVotesUnified,
  createElement,
  triggerHapticFeedback,
  renderCountryFlag
} from "../utils.js";
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

// --- Constantes y Helpers Locales ---
const MAX_VOTES = { FA: 220000, IMDB: 3200000 };
const SQRT_MAX_VOTES = {
  FA: Math.sqrt(MAX_VOTES.FA),
  IMDB: Math.sqrt(MAX_VOTES.IMDB),
};

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

export class MovieCard extends HTMLElement {
  constructor() {
    super();
    this._data = null;
    this._observer = null;
    this._hoverTimeout = null;
    
    // Bindings para asegurar el contexto 'this' en los eventos
    this.handleClick = this.handleClick.bind(this);
    this.handleMouseEnter = this.handleMouseEnter.bind(this);
    this.handleMouseLeave = this.handleMouseLeave.bind(this);
  }

  /**
   * Setter principal: Al asignar datos, se dispara el renderizado.
   * Uso: element.data = movieObject;
   */
  set data(movie) {
    if (this._data === movie) return;
    this._data = movie;
    this.dataset.movieId = movie.id;
    // View Transitions API nativa
    this.style.viewTransitionName = `movie-${movie.id}`;
    this.render();
  }

  get data() {
    return this._data;
  }

  get movieData() {
    return this._data; // Compatibilidad con código existente que busca .movieData
  }

  /**
   * Ciclo de vida: Se ejecuta cuando el elemento entra en el DOM.
   */
  connectedCallback() {
    this.classList.add(CSS_CLASSES.MOVIE_CARD);
    this.addEventListener('click', this.handleClick);
    
    // Sistema de Hover (Solo Desktop)
    const isPointerDevice = window.matchMedia("(hover: hover) and (pointer: fine)").matches;
    if (isPointerDevice) {
        this.addEventListener('mouseenter', this.handleMouseEnter);
        this.addEventListener('mouseleave', this.handleMouseLeave);
    }

    // Inicializar Lazy Load si la imagen existe y no está cargada
    const img = this.querySelector('img.lazy-image');
    if (img && !img.classList.contains(CSS_CLASSES.LOADED)) {
        this.initLazyLoad(img);
    }
  }

  /**
   * Ciclo de vida: Se ejecuta cuando el elemento sale del DOM.
   * Limpieza automática de memoria y listeners.
   */
  disconnectedCallback() {
    this.removeEventListener('click', this.handleClick);
    this.removeEventListener('mouseenter', this.handleMouseEnter);
    this.removeEventListener('mouseleave', this.handleMouseLeave);
    if (this._observer) this._observer.disconnect();
    clearTimeout(this._hoverTimeout);
  }

  initLazyLoad(img) {
      if (this._observer) this._observer.disconnect();
      
      this._observer = new IntersectionObserver((entries) => {
          entries.forEach(entry => {
              if (entry.isIntersecting) {
                  img.src = img.dataset.src;
                  img.decode()
                      .then(() => img.classList.add(CSS_CLASSES.LOADED))
                      .catch(() => img.classList.add(CSS_CLASSES.LOADED));
                  this._observer.disconnect();
              }
          });
      }, { rootMargin: "0px 0px 800px 0px" });
      
      this._observer.observe(this);
  }

  render() {
    if (!this._data) return;

    const template = document.getElementById('movie-card-template');
    if (!template) return;

    // Clonamos el contenido del template
    const content = template.content.cloneNode(true);
    
    // Extraemos el contenido interno del div.movie-card del template
    // para evitar anidamiento redundante <movie-card><div class="movie-card">...</div></movie-card>
    const innerWrapper = content.querySelector('.movie-card');
    if (innerWrapper) {
        this.replaceChildren(...innerWrapper.childNodes);
    } else {
        this.replaceChildren(content);
    }

    // Añadimos overlay de actores si es necesario
    const backFace = this.querySelector(".flip-card-back");
    if (backFace) {
        const actorsOverlay = createElement("div", { className: "actors-scrollable-content" });
        const expandBtn = backFace.querySelector(".expand-content-btn");
        if (expandBtn) backFace.insertBefore(actorsOverlay, expandBtn);
    }

    // Poblamos datos
    this.populateContent();
    this.setupImage();
    this.setupRatings();
    this.updateUIState();
    
    // Inicializamos listeners de estrellas
    const starContainer = this.querySelector('[data-action="set-rating-estrellas"]');
    if (starContainer) {
        setupRatingListeners(starContainer, document.body.classList.contains("user-logged-in"));
    }
  }

  populateContent() {
    const movieData = this._data;
    const frontContext = this.querySelector('.movie-summary');
    const backContext = this.querySelector('.flip-card-back');

    if (!frontContext || !backContext) return;

    // --- FRONT ---
    const titleEl = frontContext.querySelector(SELECTORS.TITLE);
    if (titleEl) {
        titleEl.textContent = movieData.title || "Título no disponible";
        titleEl.title = movieData.title || "Título no disponible";
    }

    const directorContainer = frontContext.querySelector(SELECTORS.DIRECTOR);
    if (directorContainer) {
        directorContainer.textContent = "";
        if (movieData.directors) {
            movieData.directors.split(", ").forEach((name, index, arr) => {
            const link = createElement("a", { textContent: name.trim(), href: `#` });
            link.dataset.directorName = name.trim();
            directorContainer.appendChild(link);
            if (index < arr.length - 1) directorContainer.appendChild(document.createTextNode(", "));
            });
        }
    }

    const isSeries = movieData.type?.toUpperCase().startsWith("S.");
    const yearEl = frontContext.querySelector(SELECTORS.YEAR);
    if (yearEl) {
        yearEl.textContent = isSeries && movieData.year_end 
            ? (String(movieData.year_end).toUpperCase() === "M" ? `${movieData.year} (M)` : (String(movieData.year_end) === "-" ? `${movieData.year}-` : `${movieData.year}-${String(movieData.year_end).length === 4 ? String(movieData.year_end).substring(2) : movieData.year_end}`))
            : (movieData.year || "N/A");
    }

    renderCountryFlag(
        frontContext.querySelector(SELECTORS.COUNTRY_CONTAINER),
        frontContext.querySelector(SELECTORS.COUNTRY_FLAG),
        movieData.country_code,
        movieData.country
    );

    // --- BACK ---
    const originalTitleWrapper = backContext.querySelector('.back-original-title-wrapper');
    if (originalTitleWrapper) {
        if (movieData.original_title && movieData.original_title.trim() !== "") {
            const otEl = originalTitleWrapper.querySelector('[data-template="original-title"]');
            if (otEl) otEl.textContent = movieData.original_title;
            originalTitleWrapper.style.display = 'flex';
        } else {
            originalTitleWrapper.style.display = 'none';
        }
    }

    const durationEl = backContext.querySelector(SELECTORS.DURATION);
    if (durationEl) durationEl.textContent = formatRuntime(movieData.minutes, isSeries);
    
    const episodesEl = backContext.querySelector('[data-template="episodes"]');
    if (episodesEl) {
        const formattedEpisodes = movieData.episodes ? movieData.episodes.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".") : "";
        const epText = isSeries && movieData.episodes ? `${formattedEpisodes} x` : "";
        episodesEl.textContent = epText;
        episodesEl.style.display = epText ? "inline" : "none";
    }

    const jwLink = backContext.querySelector('[data-template="justwatch-link"]');
    if (jwLink) {
        if (movieData.justwatch) {
            jwLink.href = movieData.justwatch;
            jwLink.classList.remove('disabled');
        } else {
            jwLink.removeAttribute('href');
            jwLink.classList.add('disabled');
        }
        jwLink.style.display = 'flex';
    }

    const wikiLink = backContext.querySelector('[data-template="wikipedia-link"]');
    if (wikiLink) {
        if (movieData.wikipedia) {
            wikiLink.href = movieData.wikipedia;
            wikiLink.classList.remove('disabled');
        } else {
            wikiLink.removeAttribute('href');
            wikiLink.classList.add('disabled');
        }
        wikiLink.style.display = 'flex';
    }

    const genreEl = backContext.querySelector(SELECTORS.GENRE);
    if (genreEl) genreEl.textContent = movieData.genres || "Género no disponible";
    
    // Actores
    const actorsEl = backContext.querySelector(SELECTORS.ACTORS);
    if (actorsEl) {
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
            const actorsOverlay = this.querySelector('.actors-scrollable-content');
            if (actorsOverlay) {
                const actorsListHtml = movieData.actors.split(',').map(actor => `<button type="button" class="actor-list-item" data-actor-name="${actor.trim()}">${actor.trim()}</button>`).join(''); 
                actorsOverlay.innerHTML = `<h4>Reparto</h4><div class="actors-list-text">${actorsListHtml}</div>`;
            }
        } else {
            actorsEl.parentElement.querySelector(".actors-expand-btn")?.remove();
        }
    }

    const synopsisEl = backContext.querySelector(SELECTORS.SYNOPSIS);
    if (synopsisEl) synopsisEl.textContent = movieData.synopsis || "Argumento no disponible.";
    
    const criticContainer = backContext.querySelector('[data-template="critic-container"]');
    if (criticContainer) {
        if (movieData.critic?.trim()) {
            const criticEl = criticContainer.querySelector('[data-template="critic"]');
            if (criticEl) criticEl.textContent = movieData.critic;
            criticContainer.style.display = 'block';
        } else {
            criticContainer.style.display = 'none';
        }
    }

    // Iconos Plataforma
    const iconsContainer = frontContext.querySelector('.card-icons-line');
    if (iconsContainer) {
        iconsContainer.innerHTML = "";
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

  setupImage() {
    const movieData = this._data;
    const imgElement = this.querySelector("img");
    if (!imgElement) return;

    const version = movieData.last_synced_at ? new Date(movieData.last_synced_at).getTime() : "1";
    const basePosterUrl = movieData.image && movieData.image !== "."
        ? `${CONFIG.POSTER_BASE_URL}${movieData.image}.webp`
        : `https://via.placeholder.com/400x496.png?text=${encodeURIComponent(movieData.title)}`;
    const highQualityPoster = `${basePosterUrl}?v=${version}`;
    
    imgElement.alt = `Póster de ${movieData.title}`;
    
    // Lógica LCP: Si el índice es bajo (primeras 4), eager load.
    const index = parseInt(this.style.getPropertyValue('--card-index') || "999", 10);
    
    if (index < 4) {
        imgElement.src = highQualityPoster;
        imgElement.loading = "eager";
        imgElement.setAttribute("fetchpriority", "high");
    } else {
        if (movieData.thumbhash_st) {
            imgElement.src = movieData.thumbhash_st;
            imgElement.dataset.src = highQualityPoster;
            imgElement.classList.add(CSS_CLASSES.LAZY_LQIP);
            this.initLazyLoad(imgElement);
        } else {
            imgElement.src = "data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs=";
            imgElement.dataset.src = highQualityPoster;
            this.initLazyLoad(imgElement);
        }
    }
  }

  setupRatings() {
    const movieData = this._data;
    const containerElement = this.querySelector('.flip-card-back');
    if (!containerElement) return;

    const setupRating = (platform, maxVotesKey) => {
        const link = containerElement.querySelector(`[data-template="${platform}-link"]`);
        if (!link) return;

        const ratingEl = containerElement.querySelector(`[data-template="${platform}-rating"]`);
        const votesBarContainer = containerElement.querySelector(`[data-template="${platform}-votes-bar-container"]`);
        const votesBar = containerElement.querySelector(`[data-template="${platform}-votes-bar"]`);
        const votesCountEl = containerElement.querySelector(`[data-template="${platform}-votes-count"]`);
        
        const id = movieData[`${platform}_id`];
        const rating = movieData[`${platform}_rating`];
        const votes = movieData[`${platform}_votes`];
        
        link.href = (id && (id.startsWith("http://") || id.startsWith("https://"))) ? id : "#";
        link.classList.toggle("disabled", !link.href.startsWith("http"));
        
        if (ratingEl) ratingEl.textContent = rating ? (String(rating).includes(".") ? rating : `${rating}.0`) : "N/A";
        
        const votesCount = parseInt(String(votes).replace(/\D/g, ""), 10) || 0;
        if (votesBarContainer) votesBarContainer.style.display = votesCount > 0 ? "block" : "none";
        
        if (votesCount > 0) {
            if (votesBar) votesBar.style.width = `${Math.min((Math.sqrt(votesCount) / SQRT_MAX_VOTES[maxVotesKey]) * 100, 100)}%`;
            if (votesBarContainer) {
                votesBarContainer.title = "";
                votesBarContainer.dataset.votes = formatVotesUnified(votesCount, platform);
            }
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

  updateUIState() {
    const movieId = this._data.id;
    const userData = getUserDataForMovie(movieId);
    const userRating = userData?.rating;
    const starContainer = this.querySelector('[data-action="set-rating-estrellas"]');
    const lowRatingCircle = this.querySelector('[data-action="set-rating-suspenso"]');
    const watchlistButton = this.querySelector('[data-action="toggle-watchlist"]');
    const isLoggedIn = document.body.classList.contains("user-logged-in");
    
    if (!starContainer || !lowRatingCircle || !watchlistButton) return;
    
    this.dataset.previousUserData = JSON.stringify(userData || { onWatchlist: false, rating: null });
    const isOnWatchlist = userData?.onWatchlist ?? false;
    
    watchlistButton.classList.toggle("is-active", isOnWatchlist);
    watchlistButton.setAttribute("aria-label", isOnWatchlist ? "Quitar de mi lista" : "Añadir a mi lista");
    
    lowRatingCircle.style.display = "none";
    starContainer.style.display = "none";
    
    if (isLoggedIn && userRating !== null && userRating !== undefined) {
        starContainer.classList.add("has-user-rating");
        lowRatingCircle.classList.add("has-user-rating");
        
        if (userRating === 2) {
            lowRatingCircle.style.display = "block";
            lowRatingCircle.style.opacity = "1";
            lowRatingCircle.style.visibility = "visible";
            lowRatingCircle.setAttribute("tabindex", "0");
            lowRatingCircle.removeAttribute("aria-hidden");
            starContainer.style.display = "none";
        } else if (userRating >= 3) {
            starContainer.style.display = "flex";
            renderUserStars(starContainer, calculateUserStars(userRating), true);
            
            // Invisible pero interactivo
            lowRatingCircle.style.display = "block";
            lowRatingCircle.style.opacity = "0";
            lowRatingCircle.style.visibility = "visible";
            lowRatingCircle.setAttribute("tabindex", "-1");
            lowRatingCircle.setAttribute("aria-hidden", "true");
        }
    } else {
        starContainer.classList.remove("has-user-rating");
        lowRatingCircle.classList.remove("has-user-rating");
        
        const ratings = [this._data.fa_rating, this._data.imdb_rating].filter(r => r && r > 0);
        if (ratings.length > 0) {
            const average = ratings.reduce((a, b) => a + b, 0) / ratings.length;
            if (average <= 5.5) {
                lowRatingCircle.style.display = "block";
                lowRatingCircle.style.opacity = "1";
                lowRatingCircle.style.visibility = "visible";
                lowRatingCircle.setAttribute("tabindex", "0");
                lowRatingCircle.removeAttribute("aria-hidden");
            } else {
                starContainer.style.display = "flex";
                renderAverageStars(starContainer, calculateAverageStars(average));
            }
        }
    }
  }

  // --- Event Handlers ---

  handleMouseEnter() {
    if (document.body.classList.contains("rotation-disabled")) return;
    if (this.querySelector(".flip-card-inner").classList.contains("is-flipped")) return;

    clearTimeout(this._hoverTimeout);
    this._hoverTimeout = setTimeout(() => {
        this.classList.add("is-hovered");
    }, 1000); // HOVER_DELAY
  }

  handleMouseLeave() {
    clearTimeout(this._hoverTimeout);
    this.classList.remove("is-hovered");
    this.resetBackState();
  }

  resetBackState() {
    const flipCardBack = this.querySelector(".flip-card-back");
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

  async handleClick(event) {
    // Ignorar si hay un gesto de pellizco reciente
    if (document.body.dataset.gestureCooldown) {
        event.preventDefault();
        event.stopPropagation();
        return;
    }

    const target = event.target;

    // 1. Acciones de botones (Watchlist, Rating...)
    if (target.closest('[data-action="toggle-watchlist"]')) {
        await this.handleWatchlistClick(event);
        return;
    }
    if (target.closest('[data-action^="set-rating-"]')) {
        await this.handleRatingClick(event);
        return;
    }

    const flipCardBack = this.querySelector(".flip-card-back");
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
            this.resetBackState();
        } else {
            flipCardBack.classList.add("is-expanded");
            flipCardBack.classList.remove("show-actors");
            mainExpandBtn.textContent = "−";
            mainExpandBtn.setAttribute("aria-label", "Contraer sinopsis");
        }
        return;
    }

    // Bloquear volteo al interactuar con contenido expandido
    const isInsideExpandedContent = 
        (target.closest('.scrollable-content') && flipCardBack.classList.contains('is-expanded')) ||
        target.closest('.actors-scrollable-content');

    if (isInsideExpandedContent) {
        if (!target.closest('.actor-list-item')) {
            event.stopPropagation();
            return; 
        }
    }

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

    // 4. Lógica de Volteo (Flip) / Modal
    const isRotationDisabled = document.body.classList.contains("rotation-disabled");
    
    if (isRotationDisabled) {
        openModal(this);
    }
  }

  async handleWatchlistClick(event) {
    event.preventDefault(); event.stopPropagation();
    const button = event.target.closest('[data-action="toggle-watchlist"]');
    if (!button) return;
    
    const movieId = this._data.id;
    const wasOnWatchlist = button.classList.contains("is-active");
    const newUserData = { onWatchlist: !wasOnWatchlist };
    const previousUserData = JSON.parse(this.dataset.previousUserData || "{}");
    
    triggerHapticFeedback("light");
    updateUserDataForMovie(movieId, newUserData);
    this.updateUIState();
    
    try {
        await setUserMovieDataAPI(movieId, newUserData);
        triggerHapticFeedback("success");
    } catch (error) {
        showToast(error.message, "error");
        updateUserDataForMovie(movieId, previousUserData);
        this.updateUIState();
    }
  }

  async handleRatingClick(event) {
    event.preventDefault(); event.stopPropagation();
    const movieId = this._data.id;
    const previousUserData = JSON.parse(this.dataset.previousUserData || "{}");
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
        else newRating = level === currentStars ? null : LEVEL_TO_RATING_MAP[level - 1];
    }
    
    if (newRating === currentUserData.rating) return;
    
    const newUserData = { rating: newRating };
    triggerHapticFeedback("light");
    updateUserDataForMovie(movieId, newUserData);
    this.updateUIState();
    
    try {
        await setUserMovieDataAPI(movieId, newUserData);
        if (newRating !== null) triggerHapticFeedback("success");
    } catch (error) {
        showToast(error.message, "error");
        updateUserDataForMovie(movieId, previousUserData);
        this.updateUIState();
    }
  }
}

// Registro del componente
customElements.define('movie-card', MovieCard);
