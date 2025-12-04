// =================================================================
//          COMPONENTE: Quick View (Vista Rápida / Modal)
// =================================================================
//
//  FICHERO:  src/js/components/quick-view.js
//  VERSIÓN:  3.4 (Optimización DOM: Inyección dinámica de iconos)
//
// =================================================================

import { openAccessibleModal, closeAccessibleModal } from "../ui.js";
import { updateCardUI, initializeCard, unflipAllCards } from "./card.js";
import { formatRuntime } from "../utils.js"; 

// ✨ FIX: Importamos el sprite para las rutas de iconos dinámicos
import spriteUrl from "../../img/icons/sprite.svg";

// Cache de elementos DOM (Se llenan al inicializar o al usar)
const dom = {
  overlay: document.getElementById("quick-view-overlay"),
  modal: document.getElementById("quick-view-modal"),
  content: document.getElementById("quick-view-content"),
  template: document.getElementById("quick-view-template")?.content,
};

// --- Configuración de Iconos de Plataforma (Igual que en card.js) ---
const PLATFORM_DATA = {
  N: { id: "icon-netflix", class: "netflix-icon", title: "Original de Netflix", w: 16, h: 16, vb: "0 0 16 16" },
  H: { id: "icon-hbo", class: "", title: "Original de HBO", w: 24, h: 24, vb: "0 0 24 24", color: true },
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

/**
 * Cierra la modal si se hace clic fuera del contenido (en el overlay).
 * Ignora clics originados dentro de una tarjeta para evitar conflictos de apertura.
 */
function handleOutsideClick(event) {
  const isClickInsideCard = event.target.closest(".movie-card");
  // Si la modal está visible Y el clic NO fue en la modal Y NO fue en una tarjeta (apertura)
  if (
    dom.modal.classList.contains("is-visible") &&
    !dom.modal.contains(event.target) &&
    !isClickInsideCard
  ) {
    closeModal();
  }
}

/**
 * Gestiona el clic en el nombre del director dentro de la modal.
 * Cierra la modal y lanza un filtro por ese director.
 */
function handleDirectorClick(event) {
  const directorLink = event.target.closest(".front-director-info a[data-director-name]");
  if (!directorLink) return;
  
  event.preventDefault();
  const directorName = directorLink.dataset.directorName;
  
  closeModal();
  
  // Disparamos el evento global para filtrar
  document.dispatchEvent(
    new CustomEvent("filtersReset", {
      detail: { keepSort: true, newFilter: { type: "director", value: directorName } },
    })
  );
}

// =================================================================
//          LÓGICA PRINCIPAL
// =================================================================

/**
 * Rellena la modal con los datos de la tarjeta seleccionada.
 * @param {HTMLElement} cardElement - El elemento .movie-card origen.
 */
function populateModal(cardElement) {
  if (!dom.template) return;
  
  const movieData = cardElement.movieData;
  const clone = dom.template.cloneNode(true);

  // Asignamos datos al contenedor para que updateCardUI funcione
  dom.content.movieData = movieData;
  dom.content.dataset.movieId = movieData.id;

  const front = clone.querySelector(".quick-view-front");
  const back = clone.querySelector(".quick-view-back");

  // 1. IMAGEN (Reutilizamos la URL ya cargada en la tarjeta para cache hit)
  const frontImg = front.querySelector("img");
  const cardImg = cardElement.querySelector(".flip-card-front img");
  if (frontImg && cardImg) {
    frontImg.src = cardImg.src;
    frontImg.alt = cardImg.alt;
  }
  
  // 2. DATOS FRONTALES (Título, Director, Año, País)
  front.querySelector("#quick-view-title").textContent = movieData.title;
  front.querySelector('[data-template="director"]').textContent = movieData.directors || "";
  front.querySelector('[data-template="year"]').textContent = movieData.year || "";
  
  if (movieData.country_code) {
    front.querySelector('[data-template="country-flag"]').className = `fi fi-${movieData.country_code}`;
  } else {
    front.querySelector('[data-template="country-container"]').style.display = 'none';
  }

  // --- INYECCIÓN DE ICONOS DE PLATAFORMA (OPTIMIZADO) ---
  const iconsContainer = front.querySelector('.card-icons-line');
  if (iconsContainer) {
    iconsContainer.innerHTML = ""; // Limpieza: Solo hay nodos si es necesario
    const collections = movieData.collections_list || "";
    
    if (collections) {
      collections.split(",").forEach(code => {
        const config = PLATFORM_DATA[code];
        if (config) {
          const span = document.createElement('span');
          span.className = config.class ? `platform-icon ${config.class}` : `platform-icon`;
          // Atributo data-template para compatibilidad CSS si fuera necesario (ej. HBO)
          if (config.id === 'icon-hbo') span.setAttribute('data-template', 'hbo-icon');
          span.title = config.title;
          
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
  
  // 3. TÍTULO ORIGINAL
  const originalTitleWrapper = back.querySelector('.back-original-title-wrapper');
  if (movieData.original_title && movieData.original_title.trim() !== '') {
    originalTitleWrapper.querySelector('span').textContent = movieData.original_title;
    originalTitleWrapper.style.display = 'flex';
  } else {
    originalTitleWrapper.style.display = 'none';
  }

  // 4. METADATOS TÉCNICOS (Duración y Episodios)
  const isSeries = movieData.type?.toUpperCase().startsWith("S.");
  back.querySelector('[data-template="duration"]').textContent = formatRuntime(movieData.minutes, isSeries);

  const episodesEl = back.querySelector('[data-template="episodes"]');
  if (isSeries && movieData.episodes) {
    episodesEl.textContent = `${movieData.episodes} x`;
    episodesEl.style.display = 'inline';
  } else {
    episodesEl.style.display = 'none';
  }

  // 5. WIKIPEDIA
  const wikipediaLink = back.querySelector('[data-template="wikipedia-link"]');
  if (movieData.wikipedia) {
    wikipediaLink.href = movieData.wikipedia;
    wikipediaLink.style.display = 'flex';
  } else {
    wikipediaLink.style.display = 'none';
  }

  // 6. RATINGS (Clonación directa para eficiencia)
  const ratingsSource = cardElement.querySelector('.ratings-container');
  const ratingsTarget = back.querySelector('.ratings-container');
  if (ratingsSource && ratingsTarget) {
      ratingsTarget.innerHTML = ratingsSource.innerHTML;
  }

  // 7. DETALLES DE TEXTO (Género, Actores, Sinopsis, Crítica)
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
  
  // Limpiamos e inyectamos el nuevo contenido
  dom.content.textContent = "";
  dom.content.appendChild(clone);

  // Inicializamos interactividad (Botón Watchlist, Estrellas)
  updateCardUI(dom.content);
  initializeCard(dom.content);
  
  // Listener para filtro de director dentro de la modal
  dom.content.addEventListener("click", handleDirectorClick);
}

// =================================================================
//          API PÚBLICA
// =================================================================

export function closeModal() {
  if (!dom.modal.classList.contains("is-visible")) return;
  
  // Animación de salida
  dom.modal.classList.remove("is-visible");
  dom.overlay.classList.remove("is-visible");
  document.body.classList.remove("modal-open");
  
  // Gestión de accesibilidad (Focus Trap)
  closeAccessibleModal(dom.modal, dom.overlay);
  
  // Limpieza de listener global para evitar memory leaks
  document.removeEventListener("click", handleOutsideClick);
}

export function openModal(cardElement) {
  if (!cardElement) return;
  
  // Aseguramos estado limpio
  unflipAllCards();
  dom.content.scrollTop = 0;
  
  // Rellenamos datos
  populateModal(cardElement);
  
  // Bloqueo de scroll del body
  document.body.classList.add("modal-open");
  
  // Secuencia de apertura con delay mínimo para permitir renderizado
  setTimeout(() => {
    dom.modal.classList.add("is-visible");
    dom.overlay.classList.add("is-visible");
    
    // Activamos trampas de foco accesibles
    openAccessibleModal(dom.modal, dom.overlay);
    
    // Activamos cierre por clic fuera (con delay para no capturar el clic de apertura)
    setTimeout(() => document.addEventListener("click", handleOutsideClick), 0);
  }, 10);
}

export function initQuickView() {
  if (!dom.modal) {
    console.error("Quick View modal element not found. Initialization failed.");
    return;
  }
  // Listener para cierre con tecla ESC
  window.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && dom.modal.classList.contains("is-visible")) {
      closeModal();
    }
  });
}