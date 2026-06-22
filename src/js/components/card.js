// src/js/components/card.js

import { CONFIG, CSS_CLASSES, SELECTORS, STUDIO_DATA, IGNORED_ACTORS, ICONS, FILTER_CONFIG } from "../constants.js";
import { formatRuntime, createElement, triggerHapticFeedback, renderCountryFlag, scheduleWork, LocalStore, isMovieSeries, formatYearRange, getHqPosterUrl, debounce } from "../utils.js";
import { getUserDataForMovie, updateUserDataForMovie, hasActiveMeaningfulFilters, getCurrentPage, appEvents } from "../state.js";
import { setUserMovieDataAPI } from "../api.js";
import { showToast, areInteractionsLocked } from "../ui.js";
import { setupRatingListeners, handleRatingClick, updateRatingUI, setupCardRatings, resolveRatingMutationOnWatchlist } from "./rating.js";
import spriteUrl from "../../sprite.svg";

// =================================================================
//          CONSTANTES Y ESTADO
// =================================================================

// Cachear template una sola vez
const cardTemplate = document.querySelector(SELECTORS.MOVIE_CARD_TEMPLATE);
const personTemplate = document.querySelector(SELECTORS.PERSON_CARD_TEMPLATE);
const collectionTemplate = document.querySelector("#collection-card-template");

// Estado de Renderizado
let currentRenderRequestId = 0;

// Estado de Interacción
let currentlyFlippedCard = null;
// Invariant: hoverTimeout solo es válido para currentHoveredCard
let hoverTimeout;
let currentHoveredCard = null;
const HOVER_DELAY = 1000;
// Nota: INTERACTIVE_SELECTOR solo aplica a hover-delay, no a tap/click logic
const INTERACTIVE_SELECTOR = ".card-rating-block, .front-director-info, .actors-expand-btn";
const QUICK_VIEW_INIT_FLAG = "_quickViewInitialized";

// Caché del Viewport para evitar Layout Thrashing (Forced Synchronous Layout) en renderizados masivos
let cachedIsMobileViewport = window.innerWidth <= 768;
window.addEventListener('resize', debounce(() => { cachedIsMobileViewport = window.innerWidth <= 768; }, 250));

// =================================================================
//          0. LAZY LOADING (Modal)
// =================================================================

async function loadAndOpenModal(cardElement) {
  const { openModal, initQuickView } = await import("./modal.js");
  // Asegurar inicialización única (idempotente en la práctica, pero seguro)
  if (!window[QUICK_VIEW_INIT_FLAG]) { initQuickView(); window[QUICK_VIEW_INIT_FLAG] = true; }
  openModal(cardElement);
}

// =================================================================
//          1. GESTIÓN DE ESTADO VISUAL (Flip/Back)
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
    // Reset scroll positions
    const scrolls = flipCardBack.querySelectorAll(".scrollable-content, .actors-scrollable-content");
    scrolls.forEach(el => el.scrollTop = 0);
  }
}

export function unflipAllCards() {
  clearTimeout(hoverTimeout);
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

// =================================================================
//          2. LÓGICA DE INTERACCIÓN (Pointer Events)
// =================================================================

function prefetchCardResources(card) {
  if (card.dataset.prefetched) return;
  card.dataset.prefetched = "true";

  // 1. Intención de detalle: Cargar lógica del modal
  import("./modal.js");

  // 2. Intención visual: Cargar imagen HQ
  const img = card.querySelector("img");
  if (img && img.dataset.src) {
    const link = document.createElement("link");
    link.rel = "preload"; link.as = "image"; link.href = img.dataset.src;
    document.head.appendChild(link);
  }
}

function startFlipTimer(cardElement) {
  if (document.body.classList.contains(CSS_CLASSES.ROTATION_DISABLED)) return;
  if (cardElement.querySelector(".flip-card-inner").classList.contains("is-flipped")) return;

  clearTimeout(hoverTimeout);
  hoverTimeout = setTimeout(() => {
    if (currentHoveredCard === cardElement) {
      cardElement.classList.add("is-hovered");
      prefetchCardResources(cardElement); // Señal: Hover prolongado
    }
  }, HOVER_DELAY);
}

const handleSingleTap = (cardElement) => {
  if (!cardElement) return;
  const inner = cardElement.querySelector(".flip-card-inner");
  if (!inner) return;

  const isFlipped = inner.classList.contains("is-flipped");
  
  if (currentlyFlippedCard && currentlyFlippedCard !== cardElement) {
    unflipAllCards();
  }
  
  triggerHapticFeedback("light");
  inner.classList.toggle("is-flipped");
  prefetchCardResources(cardElement); // Señal: Interacción directa (Flip)
  
  if (!isFlipped) {
    currentlyFlippedCard = cardElement;
    // Fix: Race condition check. Si la tarjeta se cierra antes de que este timeout se ejecute
    // (por ejemplo, doble tap rápido o renderizado), no debemos añadir el listener.
    // Se difiere el listener para evitar que el click actual cierre inmediatamente la card.
    setTimeout(() => {
      if (currentlyFlippedCard === cardElement) {
        document.addEventListener("click", handleDocumentClick);
      }
    }, 0);
  } else {
    currentlyFlippedCard = null;
    resetCardBackState(cardElement);
    document.removeEventListener("click", handleDocumentClick);
  }
};

export function initCardInteractions(gridContainer) {
  // --- Hover (Desktop) ---
  gridContainer.addEventListener("pointerover", (e) => {
    if (e.pointerType !== 'mouse') return;
    const card = e.target.closest(".movie-card");
    if (!card) return;

    if (currentHoveredCard !== card) {
      if (currentHoveredCard) {
        clearTimeout(hoverTimeout);
        currentHoveredCard.classList.remove("is-hovered");
        resetCardBackState(currentHoveredCard);
      }
      currentHoveredCard = card;
      startFlipTimer(card);
    } else if (!e.target.closest(INTERACTIVE_SELECTOR)) {
      startFlipTimer(card); // Reiniciar si salimos de zona interactiva pero seguimos en card
    } else {
      clearTimeout(hoverTimeout); // Pausar si estamos interactuando
    }
  });

  gridContainer.addEventListener("pointerout", (e) => {
    if (e.pointerType !== 'mouse' || !currentHoveredCard) return;
    if (!currentHoveredCard.contains(e.relatedTarget)) {
      clearTimeout(hoverTimeout);
      currentHoveredCard.classList.remove("is-hovered");
      resetCardBackState(currentHoveredCard);
      currentHoveredCard = null;
    }
  });

  // --- Doble Click (Desktop) ---
  gridContainer.addEventListener("dblclick", (e) => {
    const card = e.target.closest(".movie-card");
    if (card && !document.body.classList.contains(CSS_CLASSES.ROTATION_DISABLED)) {
      loadAndOpenModal(card);
    }
  });

  // --- Tap / Doble Tap (Táctil) ---
  let lastTapTime = 0;
  let tapTimeout = null;
  let startX = 0, startY = 0;
  const DOUBLE_TAP_DELAY = 250;
  const MOVE_THRESHOLD = 10;

  gridContainer.addEventListener('pointerdown', e => {
    if (e.pointerType === 'mouse' || !e.isPrimary) return;
    startX = e.clientX;
    startY = e.clientY;
  }, { passive: true });

  gridContainer.addEventListener('pointerup', e => {
    if (e.pointerType === 'mouse') return;

    const card = e.target.closest('.movie-card');
    
    // Zona Segura Inteligente: Solo bloquear doble tap en elementos interactivos específicos
    // Se incluyen botones de actores y expansión para evitar que e.preventDefault() rompa su clic
    const criticalElements = '[data-action="toggle-watchlist"], [data-action^="set-rating"], a[href], .expand-content-btn, .actors-expand-btn, .actor-list-item';
    if (!card || document.body.classList.contains(CSS_CLASSES.ROTATION_DISABLED) || e.target.closest(criticalElements)) return;

    // Detectar si fue un tap o un scroll
    if (Math.abs(e.clientX - startX) > MOVE_THRESHOLD || Math.abs(e.clientY - startY) > MOVE_THRESHOLD) return;

    if (e.cancelable) e.preventDefault();

    const currentTime = performance.now();
    const tapLength = currentTime - lastTapTime;

    if (lastTapTime > 0 && tapLength < DOUBLE_TAP_DELAY) {
      // Doble Tap -> Modal
      clearTimeout(tapTimeout);
      loadAndOpenModal(card);
    } else {
      // Primer Tap -> Esperar
      clearTimeout(tapTimeout);
      tapTimeout = setTimeout(() => handleSingleTap(card), DOUBLE_TAP_DELAY);
    }
    lastTapTime = currentTime;
  });
}

// =================================================================
//          3. MANEJADORES DE CLICS (Acciones)
// =================================================================

async function toggleWatchlist(movieId, btn, card) {
  const wasActive = btn.classList.contains("is-active");
  const newState = { onWatchlist: !wasActive };
  const prevState = getUserDataForMovie(movieId) || { onWatchlist: false, rating: null };

  const ratingMutation = resolveRatingMutationOnWatchlist(newState.onWatchlist);
  if (ratingMutation !== undefined) {
    newState.rating = ratingMutation;
  }

  triggerHapticFeedback("light");
  updateUserDataForMovie(movieId, newState); // Optimistic Update
  updateCardUI(card);

  try {
    await setUserMovieDataAPI(movieId, newState);
    triggerHapticFeedback("success");
  } catch (err) {
    showToast(err.message, "error");
    updateUserDataForMovie(movieId, prevState); // Rollback
    updateCardUI(card);
  }
}

export function handleCardClick(event) {
  // Contrato Global: Respetar el cooldown de gestos
  if (areInteractionsLocked()) { event.preventDefault(); event.stopPropagation(); return; }

  const card = this;
  const isPerson = card.classList.contains('person-card');
  const target = event.target;

  // 1. Botones de Acción
  const watchlistBtn = target.closest('[data-action="toggle-watchlist"]');
  if (watchlistBtn) {
    event.preventDefault(); event.stopPropagation();
    if (isPerson) return; // Bloquear watchlist en personas/VIPs
    const movieId = parseInt(card.dataset.movieId, 10);
    toggleWatchlist(movieId, watchlistBtn, card);
    return;
  }

  // 2. Rating (Estrellas o Suspenso)
  if (!isPerson && handleRatingClick(event, card)) return;
  if (isPerson && target.closest('[data-action^="set-rating"]')) {
    event.preventDefault(); event.stopPropagation();
    return; // Bloquear votaciones de estrellas en personas/VIPs
  }

  // 3. Expansión de Contenido (Películas o Personas)
  const flipBack = card.querySelector(".flip-card-back");
  const expandBtn = target.closest(".expand-content-btn");
  const actorsExpandBtn = target.closest(".actors-expand-btn");

  if (actorsExpandBtn) {
    // Optimización JIT: Renderizado Perezoso del reparto.
    let actorsOverlay = flipBack.querySelector('.actors-scrollable-content');
    if (!actorsOverlay) {
      actorsOverlay = createElement("div", { className: "actors-scrollable-content" });

      const actors = card.movieData?.parsedActors || [];
      let html = `<h4>Reparto</h4><div class="actors-list-text">`;
      actors.forEach(name => {
        if (IGNORED_ACTORS.includes(name.toLowerCase())) {
          html += `<span class="actor-list-item" style="cursor:default; pointer-events:none">${name}</span>`;
        } else {
          html += `<button type="button" class="actor-list-item" data-actor-name="${name}">${name}</button>`;
        }
      });
      html += `</div>`;
      actorsOverlay.innerHTML = html;
      flipBack.insertBefore(actorsOverlay, flipBack.querySelector(".expand-content-btn"));
    }

    event.stopPropagation();
    flipBack.classList.add("is-expanded", "show-actors");
    const bottomBtn = flipBack.querySelector(".expand-content-btn");
    if(bottomBtn) { bottomBtn.textContent = "−"; bottomBtn.setAttribute("aria-label", "Cerrar detalles"); }
    return;
  }

  if (expandBtn) {
    event.stopPropagation();
    const isExpanded = flipBack.classList.contains("is-expanded");
    if (isExpanded) {
      resetCardBackState(card);
    } else {
      flipBack.classList.add("is-expanded");
      flipBack.classList.remove("show-actors");
      expandBtn.textContent = "−";
      expandBtn.setAttribute("aria-label", "Contraer sinopsis");
    }
    return;
  }

  // 4. Bloqueo de Flip en Scroll
  if ((target.closest('.scrollable-content') && flipBack?.classList.contains('is-expanded')) ||
      target.closest('.actors-scrollable-content')) {
    if (!target.closest('.actor-list-item')) {
      event.stopPropagation(); return;
    }
  }

  // 5. Enlaces Filtros
  const filterLink = target.closest("[data-director-name], [data-actor-name], [data-year-value]");
  if (filterLink) {
    if (card.id === 'quick-view-content') return;
    if (event.ctrlKey || event.metaKey || event.shiftKey || event.button === 1) return;

    event.preventDefault();
    event.stopPropagation();
    let type, value;
    if (filterLink.dataset.directorName) { type = "director"; value = filterLink.dataset.directorName; }
    else if (filterLink.dataset.actorName) { type = "actor"; value = filterLink.dataset.actorName; }
    else if (filterLink.dataset.yearValue) { type = "year"; value = filterLink.dataset.yearValue; }

    appEvents.emit("filtersReset", { keepSort: true, newFilter: { type, value } });
    return;
  }

  // 6. Enlaces Externos
  const link = target.closest("a");
  if (link && link.href && link.origin !== location.origin) return;

  // 7. Apertura Modal (Modo Muro / Clic general en VIP)
  if (card.id !== 'quick-view-content') {
    if (document.body.classList.contains(CSS_CLASSES.ROTATION_DISABLED)) {
      loadAndOpenModal(card);
    }
  }
}

// =================================================================
//          4. RENDERIZADO (Builders)
// =================================================================

// Observer de Lazy Load
const lazyLoadObserver = new IntersectionObserver((entries, obs) => {
  entries.forEach(entry => {
    if (entry.isIntersecting) {
      const img = entry.target;
      img.src = img.dataset.src;
      img.onload = () => img.classList.add(CSS_CLASSES.LOADED);
      img.onerror = () => img.classList.add(CSS_CLASSES.LOADED);
      obs.unobserve(img);
    }
  });
}, { 
  rootMargin: "200px"
});

function cleanupLazyImages(container) {
  if (!container) return;
  container.querySelectorAll("img[data-src]").forEach(img => lazyLoadObserver.unobserve(img));
}

function populateCard(card, movie, index) {
  const front = card.querySelector('.movie-summary');
  const back = card.querySelector('.flip-card-back');

  // --- IMAGEN ---
  const img = card.querySelector("img");
  const hqPoster = getHqPosterUrl(movie.image);
  
  img.alt = `Póster de ${movie.title}`;
  
  const priorityCount = cachedIsMobileViewport ? 6 : 2;
  const isFirstPage = getCurrentPage() === 1;

  if (isFirstPage && index < priorityCount) {
    card.style.animation = "none";
    img.loading = "eager";
    img.decoding = "async";
    img.classList.remove(CSS_CLASSES.LAZY_LQIP);
    img.setAttribute("fetchpriority", index === 0 ? "high" : "auto");
    img.src = hqPoster;
  } else {
    img.src = movie.thumbhash_st || "data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs=";
    img.dataset.src = hqPoster;
    img.loading = "lazy";
    img.decoding = "async";
    img.removeAttribute("fetchpriority");
    if (movie.thumbhash_st) img.classList.add(CSS_CLASSES.LAZY_LQIP);
    lazyLoadObserver.observe(img);
  }

  // --- TEXTOS BÁSICOS ---
  const titleEl = front.querySelector(SELECTORS.TITLE);
  titleEl.textContent = movie.title;
  titleEl.title = movie.title;
  titleEl.className = "";

  const tLen = movie.title.length;
  if (tLen > 40) titleEl.classList.add("title-xl-long");
  else if (tLen > 25) titleEl.classList.add("title-long");
  else if (tLen > 12) titleEl.classList.add("title-medium");

  // Directores
  const dirCont = front.querySelector(SELECTORS.DIRECTOR);
  dirCont.textContent = "";
  if (movie.parsedDirectors && movie.parsedDirectors.length > 0) {
    const showOnlyLastName = movie.parsedDirectors.length > 2;
    
    movie.parsedDirectors.forEach((name, i, arr) => {
      let displayText = name;
      
      if (showOnlyLastName) {
        const nameParts = name.split(" ");
        if (nameParts.length > 1) displayText = nameParts.pop();
      }
      
      const link = createElement("a", { 
        textContent: displayText, 
        href: `?dir=${encodeURIComponent(name)}`, 
        dataset: { directorName: name } 
      });
      dirCont.append(link, i < arr.length - 1 ? ", " : "");
    });
  }

  // Año y País
  const isSeries = movie.isSeries;
  const yearContainer = front.querySelector(SELECTORS.YEAR);
  yearContainer.textContent = "";
  const displayYear = movie.displayYear || "N/A";
  if (movie.year) {
    const yearLink = createElement("a", {
      textContent: movie.year,
      href: `?year=${movie.year}`,
      className: "year-link",
      dataset: { yearValue: `${movie.year}` }
    });
    yearContainer.appendChild(yearLink);
    if (displayYear.length > String(movie.year).length) {
      const suffix = displayYear.substring(String(movie.year).length);
      yearContainer.appendChild(document.createTextNode(suffix));
    }
  } else {
    yearContainer.textContent = displayYear;
  }
  
  renderCountryFlag(
    front.querySelector(SELECTORS.COUNTRY_CONTAINER),
    front.querySelector(SELECTORS.COUNTRY_FLAG),
    movie.country_code,
    movie.country
  );

  // Iconos
  const iconCont = front.querySelector('.card-icons-line');
  if (iconCont) {
    iconCont.innerHTML = "";
    const codes = movie.studios_list?.split(",") || [];
    
    iconCont.classList.toggle('compact', codes.filter(c => STUDIO_DATA[c]).length >= 3);

    let iconsHtml = "";
    codes.forEach(code => {
      const conf = STUDIO_DATA[code];
      if (conf) {
        iconsHtml += `<span class="platform-icon ${conf.class || ''}" title="${conf.title}">
          <svg width="${conf.w || 24}" height="${conf.h || 24}" fill="currentColor" viewBox="${conf.vb || "0 0 24 24"}">
            <use href="${spriteUrl}#${conf.id}"></use>
          </svg>
        </span>`;
      }
    });
    iconCont.innerHTML = iconsHtml;
  }

  // Nota numérica para modo muro
  const wallRatingEl = card.querySelector('[data-template="wall-rating"]');
  if (wallRatingEl) {
    wallRatingEl.textContent = movie.avg_rating ? movie.avg_rating.toFixed(1) : "";
  }

  // --- BACK ---
  const origWrap = back.querySelector('.back-original-title-wrapper');
  if (movie.original_title && movie.original_title.trim()) {
    const origEl = origWrap.querySelector('[data-template="original-title"]');
    origEl.textContent = movie.original_title;
    origEl.className = "";
    const oLen = movie.original_title.length;
    if (oLen > 40) origEl.classList.add("title-xl-long");
    else if (oLen > 30) origEl.classList.add("title-long");
    else if (oLen > 20) origEl.classList.add("title-medium");
    origWrap.hidden = false;
  } else { origWrap.hidden = true; }

  // Duración y Episodios
  back.querySelector(SELECTORS.DURATION).textContent = formatRuntime(movie.minutes, isSeries);
  const epEl = back.querySelector('[data-template="episodes"]');
  const epText = isSeries && movie.episodes ? `${movie.episodes} x` : "";
  epEl.textContent = epText;
  epEl.hidden = !epText;

  // Links Externos
  const setupLink = (key, url) => {
    const el = back.querySelector(`[data-template="${key}-link"]`);
    if (url) {
      el.href = url;
      el.classList.remove('disabled');
      el.setAttribute("aria-label", `Ver en ${key}`);
    } else {
      el.removeAttribute('href');
      el.classList.add('disabled');
      el.removeAttribute("aria-label");
    }
    el.hidden = false;
  };
  setupLink('justwatch', movie.justwatch);
  setupLink('wikipedia', movie.wikipedia);

  // Textos Largos
  back.querySelector(SELECTORS.GENRE).textContent = movie.genres || "Género no disponible";
  back.querySelector(SELECTORS.SYNOPSIS).textContent = movie.synopsis || "Sinopsis no disponible.";
  
  // Actores
  const actorsEl = back.querySelector(SELECTORS.ACTORS);
  const actors = movie.parsedActors || [];
  
  let shortActors = actors.slice(0, 4).join(", ");
  if (actors.length > 4) shortActors += "...";
  if (movie.actors === "(A)") shortActors = "Animación";
  
  actorsEl.textContent = shortActors || "Reparto no disponible";

  const hasActors = actors.length > 0 && actors.some(a => !IGNORED_ACTORS.includes(a.toLowerCase()));
  const expandBtn = actorsEl.parentElement.querySelector(".actors-expand-btn");
  
  if (hasActors) {
    if (!expandBtn) actorsEl.parentElement.appendChild(createElement("button", { className: "actors-expand-btn", textContent: "+", attributes: { "aria-label": "Ver reparto" } }));
  } else {
    expandBtn?.remove();
    back.querySelector('.actors-scrollable-content')?.remove();
  }

  // Ratings
  setupCardRatings(back, movie);
}

export function updateCardUI(card) {
  const movieId = parseInt(card.dataset.movieId, 10);
  const movie = card.movieData;
  if (!movie || movie.isPerson) return; // Las tarjetas de persona no tienen interacciones de watchlist/voto

  const userData = getUserDataForMovie(movieId);
  const userRating = userData?.rating;
  const isOnWatchlist = userData?.onWatchlist ?? false;

  // Botón Watchlist
  const watchlistBtn = card.querySelector('[data-action="toggle-watchlist"]');
  if (watchlistBtn) {
    watchlistBtn.classList.toggle("is-active", isOnWatchlist);
    watchlistBtn.setAttribute("aria-label", isOnWatchlist ? "Quitar de lista" : "Añadir a lista");
  }

  // Estrellas
  updateRatingUI(card);
}

export function initializeCard(card) {
  const starCont = card.querySelector('[data-action="set-rating-estrellas"]');
  if (starCont) setupRatingListeners(starCont, document.body.classList.contains(CSS_CLASSES.USER_LOGGED_IN));
}

// =================================================================
//          5. GESTIÓN DE GRID (Renderizado Masivo)
// =================================================================

export async function renderMovieGrid(container, movies, vipData = null) {
  const renderId = ++currentRenderRequestId;
  unflipAllCards();
  if (!container) return;

  const BATCH_SIZE = CONFIG.CARD_BATCH_SIZE || 12;
  let index = 0;

  function renderBatch() {
    if (renderId !== currentRenderRequestId) return;
    if (index >= movies.length || !document.body.contains(container)) return;

    const limit = Math.min(index + BATCH_SIZE, movies.length);
    const isFirstBatch = index === 0;

    scheduleWork(() => {
      if (renderId !== currentRenderRequestId) return;
      const fragment = document.createDocumentFragment();

      for (let i = index; i < limit; i++) {
        fragment.appendChild(createCardElement(movies[i], i));
      }

      if (isFirstBatch) {
        cleanupLazyImages(container);
        container.textContent = "";
        
        if (vipData) {
          if (vipData.type === 'person' && vipData.data) {
            container.appendChild(createPersonCardElement(vipData.data));
          } else if (vipData.type === 'collection') {
            container.appendChild(createCollectionCardElement(vipData.code, vipData.total));
          } else if (vipData.type === 'studio') {
            container.appendChild(createStudioCardElement(vipData.code, vipData.total));
          }
        }
      }

      container.appendChild(fragment);
      index = limit;
      
      if (index < movies.length) {
        renderBatch();
      }
    }, isFirstBatch ? 'user-visible' : 'background');
  }

  renderBatch();
}

function createCardElement(movie, index) {
  const clone = cardTemplate.content.cloneNode(true);
  const card = clone.querySelector(`.${CSS_CLASSES.MOVIE_CARD}`);
  
  card.dataset.movieId = movie.id;
  card.movieData = movie;
  card.style.setProperty("--card-index", Math.min(index, 20));

  populateCard(card, movie, index);
  updateCardUI(card);
  initializeCard(card);
  
  return clone;
}

function createPersonCardElement(person) {
  const clone = personTemplate.content.cloneNode(true);
  const card = clone.querySelector('.person-card');
  
  card.dataset.movieId = `person-${person.id}`;
  card.movieData = { ...person, isPerson: true };
  
  const img = card.querySelector('img');
  
  // Lógica Exclusiva: Supabase Storage (photo)
  if (person.photo && person.photo !== 'NOT_FOUND') {
    let photoName = person.photo;
    if (/\.(jpg|jpeg|png)$/i.test(photoName)) {
      photoName = photoName.replace(/\.(jpg|jpeg|png)$/i, ".webp");
    } else if (!photoName.endsWith(".webp")) {
      photoName += ".webp";
    }
    img.src = `${CONFIG.PROFILE_BASE_URL}${photoName}`;
  } else {
    img.src = `${CONFIG.PROFILE_BASE_URL}collection_default.webp`;
  }
  
  img.alt = `Foto de ${person.name}`;
  img.loading = "eager";
  img.decoding = "async";
  img.setAttribute("fetchpriority", "high");
  img.onerror = () => { img.src = `${CONFIG.PROFILE_BASE_URL}collection_default.webp`; img.onerror = null; };
  
  const titleEl = card.querySelector('[data-template="title"]');
  titleEl.textContent = person.name;
  const tLen = person.name.length;
  if (tLen > 40) titleEl.classList.add("title-xl-long");
  else if (tLen > 25) titleEl.classList.add("title-long");
  else if (tLen > 12) titleEl.classList.add("title-medium");
  
  card.querySelector('[data-template="birthplace"]').textContent = person.place_of_birth || "";
  
  const getYear = (dateStr) => dateStr ? dateStr.split('-')[0] : '';
  const bYear = getYear(person.birthday);
  const dYear = getYear(person.deathday);
  
  let ageStr = "";
  if (person.birthday) {
    const bDate = new Date(person.birthday);
    const eDate = person.deathday ? new Date(person.deathday) : new Date();
    let age = eDate.getFullYear() - bDate.getFullYear();
    const m = eDate.getMonth() - bDate.getMonth();
    if (m < 0 || (m === 0 && eDate.getDate() < bDate.getDate())) age--;
    ageStr = person.deathday ? `(${age} ✝)` : `(${age})`;
  }
  
  card.querySelector('[data-template="age"]').textContent = ageStr;
  card.querySelector('[data-template="dates"]').textContent = bYear ? (dYear ? `${bYear}-${dYear}` : `${bYear}-`) : "";
  
  let wallName = person.name;
  if (wallName.length > 14) {
    const parts = wallName.split(" ");
    if (parts.length >= 2) {
      wallName = `${parts[0][0]}. ${parts.slice(1).join(" ")}`;
    }
  }
  
  const wallNameEl = card.querySelector('[data-template="wall-name"]');
  if (wallNameEl) wallNameEl.textContent = wallName;
 
  renderCountryFlag(
    card.querySelector(SELECTORS.COUNTRY_CONTAINER),
    card.querySelector(SELECTORS.COUNTRY_FLAG),
    person.countries?.code,
    person.countries?.name
  );
  
  const biographyEl = card.querySelector('[data-template="biography"]');
  if (biographyEl) {
    biographyEl.textContent = person.biography || "Biografía no disponible en el catálogo.";
  }
  
  return clone;
}

function createCollectionCardElement(selectionCode, totalMovies) {
  const clone = collectionTemplate.content.cloneNode(true);
  const card = clone.querySelector('.collection-card');
  
  const img = card.querySelector('img');
  const config = FILTER_CONFIG.selection;
  const fullName = config.titles?.[selectionCode] || config.items[selectionCode] || selectionCode;
  const shortName = config.items[selectionCode] || fullName;
  
  img.src = `${CONFIG.PROFILE_BASE_URL}collection_${selectionCode.toLowerCase()}.webp`;
  img.alt = `Colección ${fullName}`;
  img.loading = "eager";
  img.decoding = "async";
  img.setAttribute("fetchpriority", "high");
  img.onerror = () => { img.src = `${CONFIG.PROFILE_BASE_URL}collection_default.webp`; img.onerror = null; };
  
  const titleEl = card.querySelector('[data-template="title"]');
  titleEl.textContent = fullName;
  if (fullName.length > 40) titleEl.classList.add("title-xl-long");
  else if (fullName.length > 25) titleEl.classList.add("title-long");
  else if (fullName.length > 12) titleEl.classList.add("title-medium");
  
  card.querySelector('[data-template="subtitle"]').textContent = "Selección / Saga";
  card.querySelector('[data-template="count"]').textContent = `${totalMovies} títulos`;
  
  const wallNameEl = card.querySelector('[data-template="wall-name"]');
  if (wallNameEl) wallNameEl.textContent = shortName;

  return clone;
}

function createStudioCardElement(studioCode, totalMovies) {
  const clone = collectionTemplate.content.cloneNode(true);
  const card = clone.querySelector('.collection-card');
  
  const img = card.querySelector('img');
  const config = STUDIO_DATA[studioCode];
  const fullName = config ? config.title : studioCode;
  
  img.src = `${CONFIG.PROFILE_BASE_URL}studio_${studioCode.toLowerCase()}.webp`;
  img.alt = `Estudio ${fullName}`;
  img.loading = "eager";
  img.decoding = "async";
  img.setAttribute("fetchpriority", "high");
  img.onerror = () => { img.src = `${CONFIG.PROFILE_BASE_URL}collection_default.webp`; img.onerror = null; };
  
  const titleEl = card.querySelector('[data-template="title"]');
  titleEl.textContent = fullName;
  if (fullName.length > 40) titleEl.classList.add("title-xl-long");
  else if (fullName.length > 25) titleEl.classList.add("title-long");
  else if (fullName.length > 12) titleEl.classList.add("title-medium");
  
  card.querySelector('[data-template="subtitle"]').textContent = "Estudio / Productora";
  card.querySelector('[data-template="count"]').textContent = `${totalMovies} títulos`;
  
  const wallNameEl = card.querySelector('[data-template="wall-name"]');
  if (wallNameEl) wallNameEl.textContent = fullName;

  return clone;
}

// Skeletons y Estados Vacíos (Reutilizan createElement optimizado)
export function renderSkeletons(container, pagContainer) {
  currentRenderRequestId++;
  if (container) {
    cleanupLazyImages(container);
    container.textContent = "";
  }
  if (pagContainer) pagContainer.textContent = "";
  if (!container) return;
  
  const isWallMode = document.body.classList.contains(CSS_CLASSES.ROTATION_DISABLED);
  const count = isWallMode ? CONFIG.WALL_MODE_ITEMS_PER_PAGE : CONFIG.ITEMS_PER_PAGE;

  const frag = document.createDocumentFragment();
  for (let i = 0; i < count; i++) {
    frag.appendChild(createElement("div", { className: "skeleton-card" }));
  }
  container.appendChild(frag);
}

export function renderNoResults(container, pagContainer, filters) {
  currentRenderRequestId++;
  if (container) {
    cleanupLazyImages(container);
    container.textContent = "";
  }
  if (pagContainer) pagContainer.textContent = "";
  if (!container) return;

  const div = createElement("div", { className: "no-results", attributes: { role: "status" } });
  
  // Micro-ilustración editorial (SVG Inline)
  div.appendChild(createElement("div", { className: "no-results-icon", innerHTML: ICONS.POPCORN }));

  div.appendChild(createElement("h3", { textContent: "No se encontraron resultados" }));
  
  const hasFilters = hasActiveMeaningfulFilters();
  const msg = filters.searchTerm 
    ? `Prueba a simplificar tu búsqueda para "${filters.searchTerm}".`
    : hasFilters ? "Intenta eliminar algunos filtros." : "";
    
  if (msg) div.appendChild(createElement("p", { textContent: msg }));
  
  div.appendChild(createElement("button", { 
    id: "clear-filters-from-empty", className: "btn btn--outline", textContent: "Limpiar filtros" 
  }));
  
  container.appendChild(div);
}

export function renderErrorState(container, pagContainer, message) {
  currentRenderRequestId++;
  if (container) {
    cleanupLazyImages(container);
    container.textContent = "";
  }
  if (pagContainer) pagContainer.textContent = "";
  
  const div = createElement("div", { className: "no-results", attributes: { role: "alert" } });
  
  div.appendChild(createElement("h3", { textContent: "¡Vaya! Algo ha ido mal" }));
  div.appendChild(createElement("p", { textContent: message }));
  
  container?.appendChild(div);
}

// =================================================================
//          6. ONBOARDING (Educación de Usuario)
// =================================================================

export function runFlipOnboarding(container) {
  const seenCount = LocalStore.get("flipTutorialCount") || 0;
  const MAX_SHOWS = 3;

  if (seenCount >= MAX_SHOWS || document.body.classList.contains(CSS_CLASSES.ROTATION_DISABLED)) return;

  setTimeout(() => {
    const firstCard = container.querySelector(`.${CSS_CLASSES.MOVIE_CARD}`);
    if (!firstCard || !firstCard.isConnected) return;

    const inner = firstCard.querySelector(".flip-card-inner");
    if (inner && !inner.classList.contains("is-flipped")) {
      inner.classList.add("is-flipped");
      
      setTimeout(() => {
        if (inner.isConnected && inner.classList.contains("is-flipped")) {
          inner.classList.remove("is-flipped");
          LocalStore.set("flipTutorialCount", seenCount + 1);
        }
      }, 1200);
    }
  }, 1500);
}