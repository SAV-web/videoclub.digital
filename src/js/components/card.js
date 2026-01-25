// src/js/components/card.js

import { CONFIG, CSS_CLASSES, SELECTORS, STUDIO_DATA, IGNORED_ACTORS, ICONS } from "../constants.js";
import { formatRuntime, createElement, triggerHapticFeedback, renderCountryFlag } from "../utils.js";
import { getUserDataForMovie, updateUserDataForMovie, hasActiveMeaningfulFilters, getCurrentPage } from "../state.js";
import { setUserMovieDataAPI } from "../api.js";
import { showToast } from "../ui.js";
import { setupRatingListeners, handleRatingClick, updateRatingUI, setupCardRatings } from "./rating.js";
import spriteUrl from "../../sprite.svg";

// =================================================================
//          CONSTANTES Y ESTADO
// =================================================================

// Cachear template una sola vez
const cardTemplate = document.querySelector(SELECTORS.MOVIE_CARD_TEMPLATE);

// Estado de Renderizado
let renderedCardCount = 0;
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

function startFlipTimer(cardElement) {
  if (document.body.classList.contains(CSS_CLASSES.ROTATION_DISABLED)) return;
  if (cardElement.querySelector(".flip-card-inner").classList.contains("is-flipped")) return;

  clearTimeout(hoverTimeout);
  hoverTimeout = setTimeout(() => {
    if (currentHoveredCard === cardElement) {
      cardElement.classList.add("is-hovered");
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

  // Lógica de exclusividad: Si se añade a watchlist (pendiente), se borra la nota (ya no es "vista")
  if (newState.onWatchlist) {
    newState.rating = null;
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
  // Contrato Global: Respetar el cooldown de gestos gestionado por sidebar.js
  // (Evita clicks accidentales durante pinch-to-zoom o swipes globales)
  if ("gestureCooldown" in document.body.dataset) { event.preventDefault(); event.stopPropagation(); return; }

  const card = this;
  const target = event.target;
  const movieId = parseInt(card.dataset.movieId, 10);

  // 1. Botones de Acción
  const watchlistBtn = target.closest('[data-action="toggle-watchlist"]');
  if (watchlistBtn) {
    event.preventDefault(); event.stopPropagation();
    toggleWatchlist(movieId, watchlistBtn, card);
    return;
  }

  // 2. Rating (Estrellas o Suspenso)
  if (handleRatingClick(event, card)) return;

  // 3. Expansión de Contenido
  const flipBack = card.querySelector(".flip-card-back");
  const expandBtn = target.closest(".expand-content-btn");
  const actorsExpandBtn = target.closest(".actors-expand-btn");

  if (actorsExpandBtn) {
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
  if ((target.closest('.scrollable-content') && flipBack.classList.contains('is-expanded')) ||
      target.closest('.actors-scrollable-content')) {
    if (!target.closest('.actor-list-item')) {
      event.stopPropagation(); return;
    }
  }

  // 5. Enlaces Filtros
  const filterLink = target.closest("[data-director-name], [data-actor-name]");
  if (filterLink) {
    // FIX: Si estamos en el modal, ignoramos este handler para evitar doble dispatch
    // y permitir que modal.js maneje el cierre del modal.
    if (card.id === 'quick-view-content') return;

    event.preventDefault();
    const type = filterLink.dataset.directorName ? "director" : "actor";
    const value = filterLink.dataset.directorName || filterLink.dataset.actorName;
    // Evento global: resetea filtros y aplica uno nuevo (usado por sidebar/main).
    document.dispatchEvent(new CustomEvent("filtersReset", { detail: { keepSort: true, newFilter: { type, value } } }));
    return;
  }

  // 6. Enlaces Externos
  const link = target.closest("a");
  if (link && link.href && link.origin !== location.origin) return;

  // 7. Apertura Modal (Modo Muro)
  if (document.body.classList.contains(CSS_CLASSES.ROTATION_DISABLED) && card.id !== 'quick-view-content') {
    loadAndOpenModal(card);
  }
}

// =================================================================
//          4. RENDERIZADO (Builders)
// =================================================================

// Observer de Lazy Load (Reutilizado)
const isMobile = window.matchMedia("(max-width: 768px)").matches;
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
  rootMargin: "200px" // Margen unificado y conservador para evitar sobrecarga en scroll rápido (especialmente en Modo Muro)
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
  const hqPoster = `${CONFIG.POSTER_BASE_URL}${movie.image}.webp`;
  
  img.alt = `Póster de ${movie.title}`;
  
  // LCP & Viewport Optimization
  // En móvil (<=768px) mostramos 6 cartas (aprox 3 filas) eager. En desktop 2.
  const isMobileViewport = window.innerWidth <= 768;
  const priorityCount = isMobileViewport ? 6 : 2;
  const isFirstPage = getCurrentPage() === 1;

  if (isFirstPage && index < priorityCount) {
    // Above the fold: Carga inmediata sin esperar al observer
    card.style.animation = "none";
    img.loading = "eager";
    img.decoding = "async";
    img.classList.remove(CSS_CLASSES.LAZY_LQIP);
    // Solo la primera imagen (LCP candidato) lleva prioridad alta explícita
    img.setAttribute("fetchpriority", index === 0 ? "high" : "auto");
    img.src = hqPoster;
  } else {
    img.src = movie.thumbhash_st || "data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs=";
    img.dataset.src = hqPoster;
    img.loading = "lazy";
    img.decoding = "async";
    img.removeAttribute("fetchpriority");
    img.classList.add(movie.thumbhash_st ? CSS_CLASSES.LAZY_LQIP : "");
    lazyLoadObserver.observe(img);
  }

  // --- TEXTOS BÁSICOS ---
  const titleEl = front.querySelector(SELECTORS.TITLE);
  titleEl.textContent = movie.title;
  titleEl.title = movie.title; // Tooltip nativo
  titleEl.className = ""; // Reset clases

  const tLen = movie.title.length;
  if (tLen > 40) titleEl.classList.add("title-xl-long");
  else if (tLen > 25) titleEl.classList.add("title-long");
  else if (tLen > 15) titleEl.classList.add("title-medium");

  // Directores (Fragmento para evitar innerHTML excesivo)
  const dirCont = front.querySelector(SELECTORS.DIRECTOR);
  dirCont.textContent = "";
  if (movie.directors) {
    movie.directors.split(", ").forEach((name, i, arr) => {
      const link = createElement("a", { textContent: name.trim(), href: "#", dataset: { directorName: name.trim() } });
      dirCont.append(link, i < arr.length - 1 ? ", " : "");
    });
  }

  // Año y País
  const isSeries = movie.type?.toUpperCase().startsWith("S.");
  let yearText = movie.year || "N/A";
  if (isSeries && movie.year_end) {
    yearText += movie.year_end === "M" ? " (M)" : (movie.year_end === "-" ? "-" : `-${movie.year_end.toString().slice(-2)}`);
  }
  front.querySelector(SELECTORS.YEAR).textContent = yearText;
  
  renderCountryFlag(
    front.querySelector(SELECTORS.COUNTRY_CONTAINER),
    front.querySelector(SELECTORS.COUNTRY_FLAG),
    movie.country_code,
    movie.country
  );

  // Iconos
  const iconCont = front.querySelector('.card-icons-line');
  if (iconCont) {
    iconCont.innerHTML = ""; // Limpieza rápida
    const codes = movie.studios_list?.split(",") || [];
    
    // Si hay 3 o más estudios, aplicar clase compacta (iconos más pequeños)
    iconCont.classList.toggle('compact', codes.filter(c => STUDIO_DATA[c]).length >= 3);

    codes.forEach(code => {
      const conf = STUDIO_DATA[code];
      if (conf) {
        const span = createElement('span', { className: `platform-icon ${conf.class || ''}`, title: conf.title });
        const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
        svg.setAttribute("width", conf.w || "24"); svg.setAttribute("height", conf.h || "24");
        svg.setAttribute("fill", "currentColor"); svg.setAttribute("viewBox", conf.vb || "0 0 24 24");
        const use = document.createElementNS("http://www.w3.org/2000/svg", "use");
        use.setAttribute("href", `${spriteUrl}#${conf.id}`);
        svg.appendChild(use); span.appendChild(svg);
        iconCont.appendChild(span);
      }
    });
  }

  // Nota numérica para modo muro
  const wallRatingEl = card.querySelector('[data-template="wall-rating"]');
  if (wallRatingEl) {
    wallRatingEl.textContent = movie.avg_rating ? movie.avg_rating.toFixed(1) : "";
  }

  // --- BACK ---
  // Título Original
  const origWrap = back.querySelector('.back-original-title-wrapper');
  if (movie.original_title && movie.original_title.trim()) {
    const origEl = origWrap.querySelector('[data-template="original-title"]');
    origEl.textContent = movie.original_title;
    origEl.className = ""; // Reset clases
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
    el.hidden = false; // Siempre visible (habilitado o deshabilitado)
  };
  setupLink('justwatch', movie.justwatch);
  setupLink('wikipedia', movie.wikipedia);

  // Textos Largos
  back.querySelector(SELECTORS.GENRE).textContent = movie.genres || "Género no disponible";
  back.querySelector(SELECTORS.SYNOPSIS).textContent = movie.synopsis || "Sinopsis no disponible.";
  
  const criticEl = back.querySelector('[data-template="critic-container"]');
  if (movie.critic?.trim()) {
    criticEl.querySelector('[data-template="critic"]').textContent = movie.critic;
    criticEl.hidden = false;
  } else { criticEl.hidden = true; }

  // Actores
  const actorsEl = back.querySelector(SELECTORS.ACTORS);
  const actors = movie.actors ? movie.actors.split(",").map(a => a.trim()) : [];
  
  // Truncado simple
  let shortActors = actors.slice(0, 4).join(", ");
  if (actors.length > 4) shortActors += "...";
  if (movie.actors === "(A)") shortActors = "Animación";
  
  actorsEl.textContent = shortActors || "Reparto no disponible";

  // Lógica de "Ver más actores"
  const hasActors = actors.length > 0 && actors.some(a => !IGNORED_ACTORS.includes(a.toLowerCase()));
  const expandBtn = actorsEl.parentElement.querySelector(".actors-expand-btn");
  
  if (hasActors) {
    if (!expandBtn) actorsEl.parentElement.appendChild(createElement("button", { className: "actors-expand-btn", textContent: "+", attributes: { "aria-label": "Ver reparto" } }));
    
    // Lazy creation del overlay de actores (solo si se necesita)
    let actorsOverlay = back.querySelector('.actors-scrollable-content');
    if (!actorsOverlay) {
        actorsOverlay = createElement("div", { className: "actors-scrollable-content" });
        // Poblar lista solo una vez (DOM seguro)
        const h4 = createElement("h4", { textContent: "Reparto" });
        const list = createElement("div", { className: "actors-list-text" });
        actorsOverlay.replaceChildren(h4, list);

        actors.forEach(name => {
           if (IGNORED_ACTORS.includes(name.toLowerCase())) {
             list.appendChild(createElement("span", { className: "actor-list-item", textContent: name, style: "cursor:default; pointer-events:none" }));
           } else {
             list.appendChild(createElement("button", { type: "button", className: "actor-list-item", textContent: name, dataset: { actorName: name } }));
           }
        });
        back.insertBefore(actorsOverlay, back.querySelector(".expand-content-btn"));
    }
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
  if (!movie) return;

  const userData = getUserDataForMovie(movieId);
  const userRating = userData?.rating; // Esto puede ser: número, null, o undefined
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

export function renderMovieGrid(container, movies) {
  const renderId = ++currentRenderRequestId;
  renderedCardCount = 0;
  unflipAllCards();
  if (!container) return;

  cleanupLazyImages(container);
  container.textContent = "";
  const BATCH_SIZE = CONFIG.CARD_BATCH_SIZE || 12;
  let index = 0;

  function renderBatch() {
    if (renderId !== currentRenderRequestId) return; // Cancelado por nueva petición
    if (index >= movies.length || !document.body.contains(container)) return;

    const fragment = document.createDocumentFragment();
    const limit = Math.min(index + BATCH_SIZE, movies.length);

    for (let i = index; i < limit; i++) {
      const movie = movies[i];
      const clone = cardTemplate.content.cloneNode(true);
      const card = clone.querySelector(`.${CSS_CLASSES.MOVIE_CARD}`);
      
      card.dataset.movieId = movie.id;
      card.movieData = movie;
      // OPTIMIZACIÓN: view-transition-name se asigna dinámicamente al hacer clic (ver modal.js)
      card.style.setProperty("--card-index", i); // Para animación staggered

      populateCard(card, movie, i);
      updateCardUI(card);
      initializeCard(card);
      
      renderedCardCount++;
      fragment.appendChild(clone);
    }

    container.appendChild(fragment);
    index = limit;
    if (index < movies.length) requestAnimationFrame(renderBatch);
  }

  renderBatch();
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