// =================================================================
//          COMPONENTE: Quick View (Vista Rápida / Modal)
// =================================================================
//
//  FICHERO:  src/js/components/quick-view.js
//  VERSIÓN:  3.7 (Mejora: Banderas SVG + Limpieza profunda)
//
// =================================================================

import { openAccessibleModal, closeAccessibleModal } from "../ui.js";
import { updateCardUI, initializeCard, unflipAllCards } from "./card.js";
import { formatRuntime, createElement } from "../utils.js"; 

// Importamos el sprite para las rutas de iconos dinámicos (Banderas y Plataformas)
import spriteUrl from "../../sprite.svg";
import flagSpriteUrl from "../../flags.svg";

// Cache de elementos DOM
const dom = {
  overlay: document.getElementById("quick-view-overlay"),
  modal: document.getElementById("quick-view-modal"),
  content: document.getElementById("quick-view-content"),
  template: document.getElementById("quick-view-template")?.content,
};

// --- Configuración de Iconos de Plataforma ---
const PLATFORM_DATA = {
  N: { id: "icon-netflix", class: "netflix-icon", title: "Original de Netflix", w: 16, h: 16, vb: "0 0 16 16" },
  H: { id: "icon-hbo", class: "hbo-icon", title: "Original de HBO", w: 24, h: 24, vb: "0 0 24 24" },
  D: { id: "icon-disney", class: "disney-icon", title: "Disney", w: 28, h: 22, vb: "0 0 22 18" },
  W: { id: "icon-wb", class: "wb-icon", title: "Warner Bros.", w: 20, h: 22, vb: "0 0 18 20" },
  U: { id: "icon-universal", class: "universal-icon", title: "Universal", w: 24, h: 26, vb: "0 0 24 26" },
  S: { id: "icon-sony", class: "sony-icon", title: "Sony-Columbia", w: 16, h: 25, vb: "0 0 16 25" },
  P: { id: "icon-paramount", class: "paramount-icon", title: "Paramount", w: 22, h: 22, vb: "0 0 22 22" },
  L: { id: "icon-lionsgate", class: "lionsgate-icon", title: "Lionsgate", w: 20, h: 20, vb: "0 0 20 20" },
  Z: { id: "icon-amazon", class: "amazon-icon", title: "Amazon", w: 22, h: 22, vb: "0 0 22 22" },
  F: { id: "icon-twenty", class: "twenty-icon", title: "20th Fox", w: 28, h: 28, vb: "0 0 24 24" }
};

// =================================================================
//          MANEJADORES DE EVENTOS INTERNOS
// =================================================================

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
//          LÓGICA PRINCIPAL (POBLADO DE DATOS)
// =================================================================

function populateModal(cardElement) {
  if (!dom.template) return;
  
  const movieData = cardElement.movieData;
  // Clonado profundo del template
  const clone = dom.template.cloneNode(true);

  // Asignamos datos al contenedor para que updateCardUI (estrellas/watchlist) funcione
  dom.content.movieData = movieData;
  dom.content.dataset.movieId = movieData.id;

  const front = clone.querySelector(".quick-view-front");
  const back = clone.querySelector(".quick-view-back");

  // --- 1. IMAGEN (Cache hit optimization) ---
  const frontImg = front.querySelector("img");
  const cardImg = cardElement.querySelector(".flip-card-front img");
  if (frontImg && cardImg) {
    frontImg.src = cardImg.src;
    frontImg.alt = cardImg.alt;
  }
  
  // --- 2. DATOS FRONTALES BÁSICOS ---
  front.querySelector("#quick-view-title").textContent = movieData.title;
  front.querySelector('[data-template="director"]').textContent = movieData.directors || "";
  front.querySelector('[data-template="year"]').textContent = movieData.year || "";
  
  // --- 3. BANDERAS (SVG INYECTADO) ---
  const countryContainer = front.querySelector('[data-template="country-container"]');
  const flagSpan = front.querySelector('[data-template="country-flag"]');
  if (movieData.country_code && flagSpan) {
    const countryCode = movieData.country_code.toLowerCase();
    countryContainer.style.display = 'flex';
    flagSpan.className = "country-flag-icon";
    flagSpan.title = movieData.country || ""; 
    flagSpan.innerHTML = `
      <svg width="16" height="16">
        <use href="${flagSpriteUrl}#flag-${countryCode}"></use>
      </svg>
    `;
  } else if (countryContainer) {
    countryContainer.style.display = 'none';
  }

  // --- 4. ICONOS DE PLATAFORMA ---
  const iconsContainer = front.querySelector('.card-icons-line');
  if (iconsContainer) {
    iconsContainer.innerHTML = ""; // Limpieza previa
    const collections = movieData.collections_list || "";
    
    if (collections) {
      collections.split(",").forEach(code => {
        const config = PLATFORM_DATA[code];
        if (config) {
          const span = createElement('span', {
            className: config.class ? `platform-icon ${config.class}` : `platform-icon`,
            title: config.title,
            innerHTML: `
              <svg width="${config.w}" height="${config.h}" fill="currentColor" viewBox="${config.vb}">
                <use href="${spriteUrl}#${config.id}"></use>
              </svg>
            `
          });
          // Compatibilidad legacy si fuera necesaria
          if (config.id === 'icon-hbo') span.setAttribute('data-template', 'hbo-icon');
          
          iconsContainer.appendChild(span);
        }
      });
    }
  }
  
  // --- 5. TÍTULO ORIGINAL ---
  const originalTitleWrapper = back.querySelector('.back-original-title-wrapper');
  if (movieData.original_title && movieData.original_title.trim() !== '') {
    originalTitleWrapper.querySelector('span').textContent = movieData.original_title;
    originalTitleWrapper.style.display = 'flex';
  } else {
    originalTitleWrapper.style.display = 'none';
  }

  // --- 6. DATOS TÉCNICOS (Duración / Episodios) ---
  const isSeries = movieData.type?.toUpperCase().startsWith("S.");
  back.querySelector('[data-template="duration"]').textContent = formatRuntime(movieData.minutes, isSeries);

  const episodesEl = back.querySelector('[data-template="episodes"]');
  if (isSeries && movieData.episodes) {
    episodesEl.textContent = `${movieData.episodes} x`;
    episodesEl.style.display = 'inline';
  } else {
    episodesEl.style.display = 'none';
  }

  // --- 7. WIKIPEDIA ---
  const wikipediaLink = back.querySelector('[data-template="wikipedia-link"]');
  if (movieData.wikipedia) {
    wikipediaLink.href = movieData.wikipedia;
    wikipediaLink.style.display = 'flex';
  } else {
    wikipediaLink.style.display = 'none';
  }

  // --- 8. RATINGS (Copia eficiente) ---
  // Clonamos el bloque de ratings ya calculado de la tarjeta origen para ahorrar proceso
  const ratingsSource = cardElement.querySelector('.ratings-container');
  const ratingsTarget = back.querySelector('.ratings-container');
  if (ratingsSource && ratingsTarget) {
      ratingsTarget.innerHTML = ratingsSource.innerHTML;
  }

  // --- 9. DETALLES DE TEXTO ---
  back.querySelector('[data-template="genre"]').textContent = movieData.genres || "No disponible";
  back.querySelector('[data-template="actors"]').textContent = movieData.actors || "No disponible";
  back.querySelector('[data-template="synopsis"]').textContent = movieData.synopsis || "No disponible";
  
  const criticContainer = back.querySelector('[data-template="critic-container"]');
  if (movieData.critic && movieData.critic.trim() !== '') {
    criticContainer.querySelector('[data-template="critic"]').textContent = movieData.critic;
    criticContainer.style.display = 'block';
  } else {
    criticContainer.style.display = 'none';
  }
  
  // --- 10. RENDERIZADO FINAL ---
  dom.content.textContent = "";
  dom.content.appendChild(clone);

  // Inicializamos interactividad (Listeners de estrellas y watchlist)
  updateCardUI(dom.content);
  initializeCard(dom.content);
  
  // Listener específico para el director dentro de la modal
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
  
  // Pequeño delay para permitir renderizado antes de la transición CSS
  requestAnimationFrame(() => {
    dom.modal.classList.add("is-visible");
    dom.overlay.classList.add("is-visible");
    
    openAccessibleModal(dom.modal, dom.overlay);
    
    // Listener de cierre con delay para evitar cierre inmediato por bubbling
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