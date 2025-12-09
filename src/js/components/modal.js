// =================================================================
//          COMPONENTE: Quick View (Vista Rápida / Modal)
// =================================================================
//  FICHERO:  src/js/components/modal.js
//  VERSIÓN:  3.8 (Refactor Final)
// =================================================================

import { openAccessibleModal, closeAccessibleModal } from "../ui.js";
import { updateCardUI, initializeCard, unflipAllCards, setupCardRatings } from "./card.js";
import { formatRuntime, createElement, renderCountryFlag } from "../utils.js"; 
import { PLATFORM_DATA } from "../constants.js";
import spriteUrl from "../../sprite.svg";

const dom = {
  overlay: document.getElementById("quick-view-overlay"),
  modal: document.getElementById("quick-view-modal"),
  content: document.getElementById("quick-view-content"),
  template: document.getElementById("quick-view-template")?.content,
};

function handleOutsideClick(event) {
  const isClickInsideCard = event.target.closest(".movie-card");
  if (
    dom.modal.classList.contains("is-visible") &&
    !dom.modal.contains(event.target) &&
    !isClickInsideCard
  ) {
    closeModal();
  }
}

function handleDirectorClick(event) {
  const directorLink = event.target.closest(".front-director-info a[data-director-name]");
  if (!directorLink) return;
  
  event.preventDefault();
  closeModal();
  
  document.dispatchEvent(
    new CustomEvent("filtersReset", {
      detail: { keepSort: true, newFilter: { type: "director", value: directorLink.dataset.directorName } },
    })
  );
}

// =================================================================
//          LÓGICA PRINCIPAL
// =================================================================

function populateModal(cardElement) {
  if (!dom.template) return;
  
  const movieData = cardElement.movieData;
  const clone = dom.template.cloneNode(true);

  dom.content.movieData = movieData;
  dom.content.dataset.movieId = movieData.id;

  const front = clone.querySelector(".quick-view-front");
  const back = clone.querySelector(".quick-view-back");

  // 1. Imagen
  const frontImg = front.querySelector("img");
  const cardImg = cardElement.querySelector(".flip-card-front img");
  if (frontImg && cardImg) {
    frontImg.src = cardImg.src;
    frontImg.alt = cardImg.alt;
  }
  
// --- 2. DATOS FRONTALES BÁSICOS (Con ajuste de fuente inteligente) ---
  const titleEl = front.querySelector("#quick-view-title");
  titleEl.textContent = movieData.title;
  
  // Limpiamos clases de longitud previas
  titleEl.classList.remove("title-long", "title-xl-long");
  
  // Aplicamos heurística de longitud
  if (movieData.title.length > 40) {
    titleEl.classList.add("title-xl-long");
  } else if (movieData.title.length > 20) {
    titleEl.classList.add("title-long");
  }
  front.querySelector('[data-template="director"]').textContent = movieData.directors || "";
  front.querySelector('[data-template="year"]').textContent = movieData.year || "";
  
  // 3. Bandera (Helper compartido)
  const countryContainer = front.querySelector('[data-template="country-container"]');
  const flagSpan = front.querySelector('[data-template="country-flag"]');
  renderCountryFlag(countryContainer, flagSpan, movieData.country_code, movieData.country);

  // 4. Iconos Plataforma (Constante compartida)
  const iconsContainer = front.querySelector('.card-icons-line');
  if (iconsContainer) {
    iconsContainer.innerHTML = "";
    const collections = movieData.collections_list || "";
    if (collections) {
      collections.split(",").forEach(code => {
        const config = PLATFORM_DATA[code];
        if (config) {
          const span = createElement('span', {
            className: config.class ? `platform-icon ${config.class}` : `platform-icon`,
            title: config.title,
            innerHTML: `<svg width="${config.w}" height="${config.h}" fill="currentColor" viewBox="${config.vb}"><use href="${spriteUrl}#${config.id}"></use></svg>`
          });
          iconsContainer.appendChild(span);
        }
      });
    }
  }
  
// --- 5. TÍTULO ORIGINAL Y TEXTOS ---
  const originalTitleWrapper = back.querySelector('.back-original-title-wrapper');
  const originalTitleSpan = originalTitleWrapper.querySelector('span');

  if (movieData.original_title && movieData.original_title.trim() !== '') {
    originalTitleSpan.textContent = movieData.original_title;
    
    // Reset de clases de tamaño
    originalTitleSpan.classList.remove("title-long", "title-xl-long");

    // Lógica heurística de tamaño basada en longitud
    const len = movieData.original_title.length;
    if (len > 40) {
      originalTitleSpan.classList.add("title-xl-long");
    } else if (len > 20) {
      originalTitleSpan.classList.add("title-long");
    }

    originalTitleWrapper.style.display = 'flex';
  } else {
    originalTitleWrapper.style.display = 'none';
  }

  const isSeries = movieData.type?.toUpperCase().startsWith("S.");
  back.querySelector('[data-template="duration"]').textContent = formatRuntime(movieData.minutes, isSeries);

  const episodesEl = back.querySelector('[data-template="episodes"]');
  if (isSeries && movieData.episodes) {
    episodesEl.textContent = `${movieData.episodes} x`;
    episodesEl.style.display = 'inline';
  } else {
    episodesEl.style.display = 'none';
  }

  const wikipediaLink = back.querySelector('[data-template="wikipedia-link"]');
  if (movieData.wikipedia) {
    wikipediaLink.href = movieData.wikipedia;
    wikipediaLink.style.display = 'flex';
  } else {
    wikipediaLink.style.display = 'none';
  }

  // 6. Ratings (Lógica compartida)
  const ratingElements = {
    faLink: back.querySelector('[data-template="fa-link"]'),
    faRating: back.querySelector('[data-template="fa-rating"]'),
    faVotesBarContainer: back.querySelector('[data-template="fa-votes-bar-container"]'),
    faVotesBar: back.querySelector('[data-template="fa-votes-bar"]'),
    imdbLink: back.querySelector('[data-template="imdb-link"]'),
    imdbRating: back.querySelector('[data-template="imdb-rating"]'),
    imdbVotesBarContainer: back.querySelector('[data-template="imdb-votes-bar-container"]'),
    imdbVotesBar: back.querySelector('[data-template="imdb-votes-bar"]'),
  };
  setupCardRatings(ratingElements, movieData);

  // 7. Textos Largos
  back.querySelector('[data-template="genre"]').textContent = movieData.genres || "No disponible";
  back.querySelector('[data-template="actors"]').textContent = movieData.actors || "No disponible";
  back.querySelector('[data-template="synopsis"]').textContent = movieData.synopsis || "No disponible";
  
  const criticContainer = back.querySelector('[data-template="critic-container"]');
  if (movieData.critic?.trim()) {
    criticContainer.querySelector('[data-template="critic"]').textContent = movieData.critic;
    criticContainer.style.display = 'block';
  } else {
    criticContainer.style.display = 'none';
  }
  
  // 8. Render y Eventos
  dom.content.textContent = "";
  dom.content.appendChild(clone);

  updateCardUI(dom.content);
  initializeCard(dom.content);
  
  dom.content.addEventListener("click", handleDirectorClick);
}

// =================================================================
//          API PÚBLICA
// =================================================================

export function closeModal() {
  if (!dom.modal.classList.contains("is-visible")) return;
  
  dom.modal.classList.remove("is-visible");
  dom.overlay.classList.remove("is-visible");
  document.body.classList.remove("modal-open");
  
  closeAccessibleModal(dom.modal, dom.overlay);
  document.removeEventListener("click", handleOutsideClick);
}

export function openModal(cardElement) {
  if (!cardElement) return;
  
  unflipAllCards();
  dom.content.scrollTop = 0;
  populateModal(cardElement);
  document.body.classList.add("modal-open");
  
  requestAnimationFrame(() => {
    dom.modal.classList.add("is-visible");
    dom.overlay.classList.add("is-visible");
    openAccessibleModal(dom.modal, dom.overlay);
    setTimeout(() => document.addEventListener("click", handleOutsideClick), 50);
  });
}

export function initQuickView() {
  if (!dom.modal) {
    console.error("Quick View modal element not found.");
    return;
  }
  window.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && dom.modal.classList.contains("is-visible")) {
      closeModal();
    }
  });
}