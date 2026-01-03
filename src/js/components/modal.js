// =================================================================
//          COMPONENTE: Quick View (Modal & Bottom Sheet)
// =================================================================
//  FICHERO: src/js/components/modal.js
//  RESPONSABILIDAD: Gestión de vista detallada, navegación y gestos.
// =================================================================

import { openAccessibleModal, closeAccessibleModal } from "../ui.js";
import { updateCardUI, initializeCard, unflipAllCards, setupCardRatings } from "./card.js";
import { formatRuntime, createElement, renderCountryFlag } from "../utils.js"; 
import { STUDIO_DATA, IGNORED_ACTORS } from "../constants.js";
import spriteUrl from "../../sprite.svg";

// --- Referencias DOM (Lazy Getter para seguridad) ---
const getDom = () => ({
  overlay: document.getElementById("quick-view-overlay"),
  modal: document.getElementById("quick-view-modal"),
  content: document.getElementById("quick-view-content"),
  template: document.getElementById("movie-card-template")?.content,
  prevBtn: document.getElementById("modal-prev-btn"),
  nextBtn: document.getElementById("modal-next-btn"),
});

// --- Estado de Gestos Táctiles ---
const touchState = {
  startY: 0,
  startX: 0,
  currentY: 0,
  isDragging: false,
  isHorizontalSwipe: false
};

// =================================================================
//          1. GESTIÓN DE EVENTOS (Navegación y Cierre)
// =================================================================

function handleOutsideClick(event) {
  const { modal } = getDom();
  const isClickInsideCard = event.target.closest(".movie-card");
  
  if (modal.classList.contains("is-visible") && !modal.contains(event.target) && !isClickInsideCard) {
    closeModal();
  }
}

function handleMetadataClick(event) {
  const directorLink = event.target.closest(".front-director-info a[data-director-name]");
  const actorLink = event.target.closest('[data-template="actors"] a[data-actor-name]');

  if (directorLink || actorLink) {
    event.preventDefault();
    closeModal();
    
    const filterType = directorLink ? "director" : "actor";
    const filterValue = directorLink ? directorLink.dataset.directorName : actorLink.dataset.actorName;

    document.dispatchEvent(new CustomEvent("filtersReset", {
      detail: { keepSort: true, newFilter: { type: filterType, value: filterValue } },
    }));
  }
}

// =================================================================
//          2. LÓGICA DE GESTOS (Swipe to Dismiss / Navigate)
// =================================================================

function handleTouchStart(e) {
  const { modal } = getDom();
  touchState.startY = e.touches[0].clientY;
  touchState.startX = e.touches[0].clientX;
  touchState.isDragging = false;
  touchState.isHorizontalSwipe = false;
  
  modal.classList.remove("is-dragging"); // Reactivar transición CSS si estaba desactivada
}

function handleTouchMove(e) {
  // Salir rápido si no es un gesto válido o ya está cancelado
  if (!touchState.isDragging && !touchState.isHorizontalSwipe && e.defaultPrevented) return;

  const { modal, content } = getDom();
  const currentY = e.touches[0].clientY;
  const currentX = e.touches[0].clientX;
  const deltaY = currentY - touchState.startY;
  const deltaX = currentX - touchState.startX;

  // 1. Detección de Intención (Primera vez)
  if (!touchState.isDragging && !touchState.isHorizontalSwipe) {
    if (Math.abs(deltaX) < 5 && Math.abs(deltaY) < 5) return; // Umbral de ruido

    // Gesto Vertical (Cierre): Solo si estamos arriba del todo y arrastramos hacia abajo
    if (Math.abs(deltaY) > Math.abs(deltaX) && deltaY > 0 && content.scrollTop <= 0) {
      if (window.innerWidth <= 700) { // Solo móvil
        touchState.isDragging = true;
        modal.classList.add("is-dragging"); // Desactivar transición para seguir el dedo
      }
    } 
    // Gesto Horizontal (Navegación)
    else if (Math.abs(deltaX) > Math.abs(deltaY)) {
      touchState.isHorizontalSwipe = true;
    }
  }

  // 2. Ejecución
  if (touchState.isDragging) {
    if (e.cancelable) e.preventDefault();
    modal.style.transform = `translate(-50%, ${deltaY}px)`;
    touchState.currentY = deltaY;
  } else if (touchState.isHorizontalSwipe) {
    if (e.cancelable) e.preventDefault(); // Evitar "Atrás/Adelante" del navegador
  }
}

function handleTouchEnd(e) {
  const { modal } = getDom();

  // A. Navegación Horizontal
  if (touchState.isHorizontalSwipe) {
    const deltaX = e.changedTouches[0].clientX - touchState.startX;
    if (Math.abs(deltaX) > 80) { // Umbral de swipe
      navigateToSibling(deltaX < 0 ? 1 : -1);
    }
    touchState.isHorizontalSwipe = false;
    return;
  }

  // B. Cierre Vertical
  if (!touchState.isDragging) return;
  
  modal.classList.remove("is-dragging"); // Reactivar transición CSS

  if (touchState.currentY > 120) { // Umbral de cierre
    closeModal();
  } else {
    modal.style.transform = ""; // Rebote elástico
  }
  
  touchState.currentY = 0;
  touchState.isDragging = false;
}

// =================================================================
//          3. NAVEGACIÓN ENTRE FICHAS
// =================================================================

function navigateToSibling(direction) {
  const { content } = getDom();
  const currentId = content.dataset.movieId;
  if (!currentId) return;

  const currentCard = document.querySelector(`.movie-card[data-movie-id="${currentId}"]`);
  if (!currentCard) return;

  const sibling = direction === 1 ? currentCard.nextElementSibling : currentCard.previousElementSibling;
  
  if (sibling && sibling.classList.contains('movie-card')) {
    openModal(sibling);
  }
}

function updateNavButtons(currentId) {
  const { prevBtn, nextBtn } = getDom();
  const currentCard = document.querySelector(`.movie-card[data-movie-id="${currentId}"]`);
  if (!currentCard) return;

  const prev = currentCard.previousElementSibling;
  const next = currentCard.nextElementSibling;
  const hasPrev = prev && prev.classList.contains('movie-card');
  const hasNext = next && next.classList.contains('movie-card');

  if (prevBtn) {
    prevBtn.disabled = !hasPrev;
    prevBtn.style.opacity = hasPrev ? "1" : "0";
    prevBtn.style.pointerEvents = hasPrev ? "auto" : "none";
  }
  if (nextBtn) {
    nextBtn.disabled = !hasNext;
    nextBtn.style.opacity = hasNext ? "1" : "0";
    nextBtn.style.pointerEvents = hasNext ? "auto" : "none";
  }
}

// =================================================================
//          4. RENDERIZADO (POBLADO DE DATOS)
// =================================================================

// Helpers de Renderizado
const createLink = (text, type) => createElement("a", { 
  textContent: text, href: "#", dataset: { [type === 'director' ? 'directorName' : 'actorName']: text } 
});

function setupModalHeader(front, movie) {
  // Imagen
  const frontImg = front.querySelector("img");
  if (frontImg) {
    // Usar imagen HQ (dataset.src) si está disponible
    frontImg.src = movie.image_hq || movie.image; 
    frontImg.alt = `Póster de ${movie.title}`;
  }

  // Título
  const titleEl = front.querySelector('[data-template="title"]');
  titleEl.textContent = movie.title;
  titleEl.className = ""; // Reset clases
  if (movie.title.length > 45) titleEl.classList.add("title-xl-long");
  else if (movie.title.length > 25) titleEl.classList.add("title-long");

  // Director
  const dirContainer = front.querySelector('[data-template="director"]');
  dirContainer.textContent = "";
  if (movie.directors) {
    movie.directors.split(", ").forEach((name, i, arr) => {
      dirContainer.appendChild(createLink(name.trim(), 'director'));
      if (i < arr.length - 1) dirContainer.append(", ");
    });
  }

  // Año y País
  front.querySelector('[data-template="year"]').textContent = movie.year || "";
  renderCountryFlag(
    front.querySelector('[data-template="country-container"]'),
    front.querySelector('[data-template="country-flag"]'),
    movie.country_code,
    movie.country
  );

  // Iconos Plataforma
  const iconsContainer = front.querySelector('.card-icons-line');
  if (iconsContainer) {
    iconsContainer.innerHTML = "";
    const codes = [...(movie.studios_list?.split(",") || []), ...(movie.selections_list?.split(",") || [])];
    
    codes.forEach(code => {
      const conf = STUDIO_DATA[code];
      if (conf) {
        iconsContainer.appendChild(createElement('span', {
          className: `platform-icon ${conf.class || ''}`, title: conf.title,
          innerHTML: `<svg width="${conf.w || 24}" height="${conf.h || 24}" fill="currentColor" viewBox="${conf.vb || '0 0 24 24'}"><use href="${spriteUrl}#${conf.id}"></use></svg>`
        }));
      }
    });
  }
}

function setupModalDetails(back, movie) {
  // Título Original
  const origTitle = back.querySelector('.back-original-title-wrapper');
  const hasOrig = movie.original_title && movie.original_title.trim() && 
                  movie.original_title.toLowerCase() !== movie.title.toLowerCase();
  
  if (hasOrig) {
    const span = origTitle.querySelector('span');
    span.textContent = movie.original_title;
    span.className = ""; // Reset
    if (movie.original_title.length > 40) span.classList.add("title-xl-long");
    else if (movie.original_title.length > 20) span.classList.add("title-long");
    origTitle.style.display = 'flex';
  } else {
    origTitle.style.display = 'none';
  }

  // Duración y Episodios
  const isSeries = movie.type?.toUpperCase().startsWith("S.");
  back.querySelector('[data-template="duration"]').textContent = formatRuntime(movie.minutes, isSeries);
  
  const epEl = back.querySelector('[data-template="episodes"]');
  const epText = isSeries && movie.episodes ? `${movie.episodes} x` : "";
  epEl.textContent = epText;
  epEl.style.display = epText ? "inline" : "none";

  // Links Externos
  const setupLink = (key, url) => {
    const el = back.querySelector(`[data-template="${key}-link"]`);
    if (url) {
      el.href = url; el.classList.remove('disabled'); el.setAttribute("aria-label", `Ver en ${key}`);
    } else {
      el.removeAttribute('href'); el.classList.add('disabled'); el.removeAttribute("aria-label");
    }
    el.style.display = 'flex';
  };
  setupLink('justwatch', movie.justwatch);
  setupLink('wikipedia', movie.wikipedia);

  // Textos Largos
  back.querySelector('[data-template="genre"]').textContent = movie.genres || "N/A";
  back.querySelector('[data-template="synopsis"]').textContent = movie.synopsis || "N/A";
  
  const critic = back.querySelector('[data-template="critic-container"]');
  if (movie.critic?.trim()) {
    critic.querySelector('[data-template="critic"]').textContent = movie.critic;
    critic.style.display = 'block';
  } else { critic.style.display = 'none'; }

  // Actores
  const actorsCont = back.querySelector('[data-template="actors"]');
  actorsCont.textContent = "";
  if (movie.actors) {
    movie.actors.split(",").forEach((name, i, arr) => {
      const actorName = name.trim();
      if (IGNORED_ACTORS.includes(actorName.toLowerCase())) {
        actorsCont.append(actorName);
      } else {
        actorsCont.appendChild(createLink(actorName, 'actor'));
      }
      if (i < arr.length - 1) actorsCont.append(", ");
    });
  } else {
    actorsCont.textContent = "N/A";
  }
}

function populateModal(cardElement) {
  const { template, content, modal } = getDom();
  if (!template) return;
  
  const movie = cardElement.movieData;
  // Extraemos URL HQ si ya se cargó en la card para evitar parpadeo
  const cardImg = cardElement.querySelector("img");
  movie.image_hq = cardImg ? (cardImg.dataset.src || cardImg.src) : null;

  const clone = template.cloneNode(true);
  const cardClone = clone.querySelector('.movie-card');
  cardClone.classList.add('is-quick-view');

  // Reset UI
  if (!modal.classList.contains("is-visible")) modal.classList.remove("hide-arrows");
  
  // Binding de Datos
  content.movieData = movie;
  content.dataset.movieId = movie.id;

  const front = clone.querySelector(".flip-card-front");
  const back = clone.querySelector(".flip-card-back");

  setupModalHeader(front, movie);
  setupModalDetails(back, movie);
  setupCardRatings(back, movie); // Reutilizado de card.js

  // Montaje
  content.textContent = "";
  content.appendChild(clone);

  // Inicializar interactividad
  updateCardUI(content);
  initializeCard(content);
  updateNavButtons(movie.id);
}

// =================================================================
//          5. API PÚBLICA
// =================================================================

export function closeModal() {
  const { modal, overlay } = getDom();
  if (!modal.classList.contains("is-visible")) return;
  
  modal.classList.remove("is-visible");
  overlay.classList.remove("is-visible");
  document.body.classList.remove("modal-open");
  
  // Limpieza
  setTimeout(() => modal.style.transform = "", 300);
  closeAccessibleModal(modal, overlay);
  document.removeEventListener("click", handleOutsideClick);
}

export function openModal(cardElement) {
  if (!cardElement) return;
  const { modal, overlay, content } = getDom();
  
  unflipAllCards();
  populateModal(cardElement);
  document.body.classList.add("modal-open");
  
  requestAnimationFrame(() => {
    modal.classList.add("is-visible");
    overlay.classList.add("is-visible");
    openAccessibleModal(modal, overlay, true);
    if (content) content.scrollTop = 0;
    setTimeout(() => document.addEventListener("click", handleOutsideClick), 50);
  });
}

export function initQuickView() {
  const { modal, content, prevBtn, nextBtn } = getDom();
  if (!modal) return;

  // Delegación de eventos en contenido
  if (content) {
    content.addEventListener("click", (e) => {
      handleMetadataClick(e);
      // Toggle flechas en móvil al tocar póster
      if (window.innerWidth <= 700 && e.target.closest(".poster-container")) {
        modal.classList.toggle("hide-arrows");
      }
    });
  }

  // Teclado
  window.addEventListener("keydown", (e) => {
    if (!modal.classList.contains("is-visible")) return;
    if (e.key === "Escape") closeModal();
    else if (e.key === "ArrowLeft") navigateToSibling(-1);
    else if (e.key === "ArrowRight") navigateToSibling(1);
  });

  // Botones
  prevBtn?.addEventListener("click", (e) => { e.stopPropagation(); navigateToSibling(-1); });
  nextBtn?.addEventListener("click", (e) => { e.stopPropagation(); navigateToSibling(1); });

  // Gestos
  if (navigator.maxTouchPoints > 0) {
    modal.addEventListener("touchstart", handleTouchStart, { passive: true });
    modal.addEventListener("touchmove", handleTouchMove, { passive: false });
    modal.addEventListener("touchend", handleTouchEnd, { passive: true });
  }
}