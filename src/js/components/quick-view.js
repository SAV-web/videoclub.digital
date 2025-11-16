// =================================================================
//          COMPONENTE QUICK VIEW (VISTA RÁPIDA) - v3.1 (Corregido)
// =================================================================
//
//  FICHERO:  src/js/components/quick-view.js
//  VERSIÓN:  3.1
//
//  HISTORIAL:
//    v3.1 - CORRECCIÓN CRÍTICA: Se usan los nombres de propiedad correctos
//           (ej. `movieData.genres` en vez de `movieData.genres_list`) para
//           coincidir con los alias de la API, solucionando el bug de "No disponible".
//    v3.0 - REFACTORIZACIÓN COMPLETA de `populateModal`.
//
// =================================================================

import { openAccessibleModal, closeAccessibleModal } from "./modal-manager.js";
import { updateCardUI, initializeCard, unflipAllCards } from "./card.js";
import { formatRuntime } from "../utils.js"; 

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

export function closeModal() {
  if (!dom.modal.classList.contains("is-visible")) return;
  dom.modal.classList.remove("is-visible");
  dom.overlay.classList.remove("is-visible");
  document.body.classList.remove("modal-open");
  closeAccessibleModal(dom.modal, dom.overlay);
  document.removeEventListener("click", handleOutsideClick);
}

function handleDirectorClick(event) {
  const directorLink = event.target.closest(".front-director-info a[data-director-name]");
  if (!directorLink) return;
  event.preventDefault();
  const directorName = directorLink.dataset.directorName;
  closeModal();
  document.dispatchEvent(
    new CustomEvent("filtersReset", {
      detail: { keepSort: true, newFilter: { type: "director", value: directorName } },
    })
  );
}

function populateModal(cardElement) {
  if (!dom.template) return;
  const clone = dom.template.cloneNode(true);
  const movieData = cardElement.movieData;

  dom.content.movieData = movieData;
  dom.content.dataset.movieId = movieData.id;

  const front = clone.querySelector(".quick-view-front");
  const back = clone.querySelector(".quick-view-back");

  const frontImg = front.querySelector("img");
  const cardImg = cardElement.querySelector(".flip-card-front img");
  if (frontImg && cardImg) {
    frontImg.src = cardImg.src;
    frontImg.alt = cardImg.alt;
  }
  
  front.querySelector("#quick-view-title").textContent = movieData.title;
  front.querySelector('[data-template="director"]').textContent = movieData.directors || "";
  front.querySelector('[data-template="year"]').textContent = movieData.year || "";
  if (movieData.country_code) {
    front.querySelector('[data-template="country-flag"]').className = `fi fi-${movieData.country_code}`;
  } else {
    front.querySelector('[data-template="country-container"]').style.display = 'none';
  }
  
  const originalTitleWrapper = back.querySelector('.back-original-title-wrapper');
  if (movieData.original_title && movieData.original_title.trim() !== '') {
    originalTitleWrapper.querySelector('span').textContent = movieData.original_title;
    originalTitleWrapper.style.display = 'flex';
  } else {
    originalTitleWrapper.style.display = 'none';
  }

  back.querySelector('[data-template="duration"]').textContent = formatRuntime(movieData.minutes);
  const episodesEl = back.querySelector('[data-template="episodes"]');
  if (movieData.type?.toUpperCase().startsWith("S.") && movieData.episodes) {
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

  const ratingsSource = cardElement.querySelector('.ratings-container');
  const ratingsTarget = back.querySelector('.ratings-container');
  if (ratingsSource && ratingsTarget) {
      ratingsTarget.innerHTML = ratingsSource.innerHTML;
  }

  // ▼▼▼ CORRECCIÓN: Usar los alias correctos de la API (`.genres`, `.actors`) ▼▼▼
  back.querySelector('[data-template="genre"]').textContent = movieData.genres || "No disponible";
  back.querySelector('[data-template="actors"]').textContent = movieData.actors || "No disponible";
  // ▲▲▲ FIN DE LA CORRECCIÓN ▲▲▲

  back.querySelector('[data-template="synopsis"]').textContent = movieData.synopsis || "No disponible";
  
  const criticContainer = back.querySelector('[data-template="critic-container"]');
  if (movieData.critic && movieData.critic.trim() !== '') {
    criticContainer.querySelector('[data-template="critic"]').textContent = movieData.critic;
    criticContainer.style.display = 'block';
  } else {
    criticContainer.style.display = 'none';
  }
  
  dom.content.textContent = "";
  dom.content.appendChild(clone);

  updateCardUI(dom.content);
  initializeCard(dom.content);
  dom.content.addEventListener("click", handleDirectorClick);
}

export function openModal(cardElement) {
  if (!cardElement) return;
  unflipAllCards();
  dom.content.scrollTop = 0;
  populateModal(cardElement);
  document.body.classList.add("modal-open");
  setTimeout(() => {
    dom.modal.classList.add("is-visible");
    dom.overlay.classList.add("is-visible");
    openAccessibleModal(dom.modal, dom.overlay);
    setTimeout(() => document.addEventListener("click", handleOutsideClick), 0);
  }, 10);
}

export function initQuickView() {
  if (!dom.modal) {
    console.error("Quick View modal element not found. Initialization failed.");
    return;
  }
  window.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && dom.modal.classList.contains("is-visible")) {
      closeModal();
    }
  });
}