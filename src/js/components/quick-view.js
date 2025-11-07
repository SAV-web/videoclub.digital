// =================================================================
//          COMPONENTE QUICK VIEW (VISTA RÁPIDA) - v3 (Gestos Nativos)
// =================================================================
// v3.0 - Añadida lógica de gestos para un comportamiento de Bottom Sheet nativo en móvil.
//      - Permite arrastrar para cerrar el panel.
//      - Integrado con el gestor de modales accesibles.
// =================================================================

import { openAccessibleModal, closeAccessibleModal } from "./modal-manager.js";
import { updateCardUI, initializeCard, unflipAllCards } from "./card.js";

const dom = {
  overlay: document.getElementById("quick-view-overlay"),
  modal: document.getElementById("quick-view-modal"),
  content: document.getElementById("quick-view-content"),
  closeBtn: document.getElementById("quick-view-close-btn"),
  template: document.getElementById("quick-view-template")?.content,
};

// --- Estado del Gesto del Bottom Sheet ---
let isDragging = false;
let startY = 0;
let startTransform = 0;
const isMobile = () => window.innerWidth <= 768;

function handlePointerDown(e) {
  // Solo activamos el arrastre en móvil y si el origen es el propio modal
  // pero no el contenido scrolleable (para permitir el scroll del contenido).
  if (!isMobile() || e.target.closest('.quick-view-content')) {
    return;
  }
  
  isDragging = true;
  startY = e.clientY;
  
  const currentStyle = window.getComputedStyle(dom.modal);
  const matrix = new DOMMatrix(currentStyle.transform);
  startTransform = matrix.m42; // m42 es el valor de translateY

  dom.modal.classList.remove('is-snapping');
  dom.modal.setPointerCapture(e.pointerId);
}

function handlePointerMove(e) {
  if (!isDragging) return;
  
  const currentY = e.clientY;
  const deltaY = currentY - startY;
  let newTransform = startTransform + deltaY;

  // Limitar el arrastre para que no suba más allá de un pequeño tope
  const topLimit = window.innerHeight * 0.05; // 5% desde arriba
  newTransform = Math.max(newTransform, topLimit);

  dom.modal.style.transform = `translateY(${newTransform}px)`;
}

function handlePointerEnd(e) {
  if (!isDragging) return;
  isDragging = false;
  dom.modal.releasePointerCapture(e.pointerId);
  dom.modal.classList.add('is-snapping');

  const endY = e.clientY;
  const deltaY = endY - startY;
  const screenHeight = window.innerHeight;
  
  const currentTransformStyle = window.getComputedStyle(dom.modal).transform;
  const currentTransform = new DOMMatrix(currentTransformStyle).m42;

  // Lógica de decisión:
  // Si se arrastró más allá del 75% de la pantalla, o si fue un swipe rápido hacia abajo, cerrar.
  if (currentTransform > screenHeight * 0.75 || deltaY > 100) {
    closeModal();
  } else if (currentTransform < screenHeight * 0.3) {
    // Si se arrastró más allá del 30% hacia arriba, anclar arriba.
    dom.modal.style.transform = `translateY(${window.innerHeight * 0.05}px)`;
  } else {
    // Si no, volver a la posición de media altura.
    dom.modal.style.transform = `translateY(50dvh)`;
  }
}

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
  if (!dom.modal || !dom.modal.classList.contains("is-visible")) return;

  dom.modal.classList.add('is-snapping');
  dom.modal.classList.remove("is-visible");
  dom.overlay.classList.remove("is-visible");
  document.body.classList.remove("modal-open");
  
  if(isMobile()) {
      dom.modal.style.transform = 'translateY(100dvh)';
  }

  closeAccessibleModal(dom.modal, dom.overlay);
  document.removeEventListener("click", handleOutsideClick);
}

function handleDirectorClick(event) {
    const directorLink = event.target.closest(".front-director-info a[data-director-name]");
    if (!directorLink) return;
    event.preventDefault();
    closeModal();
    document.dispatchEvent(
      new CustomEvent("filtersReset", {
        detail: {
          keepSort: true,
          newFilter: { type: "director", value: directorLink.dataset.directorName },
        },
      })
    );
}

/**
 * Rellena la ventana de Vista Rápida con los datos de una tarjeta específica.
 * @param {HTMLElement} cardElement - El elemento de la tarjeta desde donde se leerán los datos.
 */
function populateModal(cardElement) {
  if (!dom.template) return;
  const clone = dom.template.cloneNode(true);
  
  dom.content.movieData = cardElement.movieData;
  dom.content.dataset.movieId = cardElement.dataset.movieId;

  const front = clone.querySelector(".quick-view-front");
  const back = clone.querySelector(".quick-view-back");

  // --- Rellenar Cara Frontal ---
  const frontImg = front.querySelector("img");
  const cardImg = cardElement.querySelector(".flip-card-front img");
  frontImg.src = cardImg.src;
  frontImg.alt = cardImg.alt;

  // Función segura para copiar texto
  const copyTextContent = (sourceSelector, targetSelector, parent) => {
    const source = cardElement.querySelector(sourceSelector);
    const target = parent.querySelector(targetSelector);
    if (source && target) target.textContent = source.textContent;
  };

  // Función segura para copiar HTML
  const copyInnerHTML = (sourceSelector, targetSelector, parent) => {
    const source = cardElement.querySelector(sourceSelector);
    const target = parent.querySelector(targetSelector);
    if (source && target) target.innerHTML = source.innerHTML;
  };
  
  copyTextContent('[data-template="title"]', "#quick-view-title", front);
  copyInnerHTML('[data-template="director"]', '[data-template="director"]', front);
  copyTextContent('[data-template="year"]', '[data-template="year"]', front);
  copyInnerHTML('[data-template="country-container"]', '[data-template="country-container"]', front);

  // Copia de iconos de plataforma
  [
    '[data-template="netflix-icon"]',
    '[data-template="hbo-icon"]',
    '[data-template="disney-icon"]',
    '[data-template="wb-icon"]',
    '[data-template="universal-icon"]',
    '[data-template="sony-icon"]',
    '[data-template="paramount-icon"]',
  ].forEach((selector) => {
    const sourceIcon = cardElement.querySelector(selector);
    const targetIcon = front.querySelector(selector);
    if (sourceIcon && targetIcon) {
      targetIcon.style.display = sourceIcon.style.display;
    }
  });

  // --- Rellenar Cara Trasera ---
  copyInnerHTML(".ratings-container", ".ratings-container", back);
  copyInnerHTML(".details-list", ".details-list", back);
  copyTextContent('[data-template="synopsis"]', '[data-template="synopsis"]', back);

  const wikipediaLinkTarget = back.querySelector('[data-template="wikipedia-link"]');
  const wikipediaLinkSource = cardElement.querySelector('[data-template="wikipedia-link"]');
  if (wikipediaLinkTarget && wikipediaLinkSource) {
    wikipediaLinkTarget.href = wikipediaLinkSource.href;
    wikipediaLinkTarget.style.display = wikipediaLinkSource.style.display;
  }

  copyTextContent('[data-template="duration"]', '[data-template="duration"]', back);
  const episodesTarget = back.querySelector('[data-template="episodes"]');
  const episodesSource = cardElement.querySelector('[data-template="episodes"]');
  if (episodesTarget && episodesSource) {
    episodesTarget.textContent = episodesSource.textContent;
    episodesTarget.style.display = episodesSource.textContent ? "inline" : "none";
  }

  copyInnerHTML('[data-template="critic-container"]', '[data-template="critic-container"]', back);

  dom.content.textContent = "";
  dom.content.appendChild(clone);
  
  updateCardUI(dom.content);
  initializeCard(dom.content);
  
  dom.content.addEventListener("click", handleDirectorClick);
}

export function openModal(cardElement) {
  if (!cardElement || !dom.modal) return;

  unflipAllCards();
  dom.content.scrollTop = 0;
  populateModal(cardElement);
  document.body.classList.add("modal-open");

  setTimeout(() => {
    dom.modal.classList.add('is-snapping');
    dom.modal.classList.add("is-visible");
    dom.overlay.classList.add("is-visible");
    openAccessibleModal(dom.modal, dom.overlay);

    // Añadir listener de clic exterior después de un breve retardo
    setTimeout(() => document.addEventListener("click", handleOutsideClick), 0);
  }, 10);
}

export function initQuickView() {
  if (!dom.modal) {
    console.error("Quick View modal element not found. Initialization failed.");
    return;
  }
  
  // Añadimos los listeners para el gesto de arrastre
  dom.modal.addEventListener('pointerdown', handlePointerDown);
  dom.modal.addEventListener('pointermove', handlePointerMove);
  dom.modal.addEventListener('pointerend', handlePointerEnd);
  
  // Prevenimos el comportamiento de "pull-to-refresh" en iOS/Android cuando se arrastra el modal
  dom.modal.addEventListener('touchmove', e => {
      if (isDragging) {
          e.preventDefault();
      }
  }, { passive: false });

  window.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && dom.modal.classList.contains("is-visible")) {
      closeModal();
    }
  });

  if (dom.closeBtn) {
    dom.closeBtn.addEventListener("click", closeModal);
  }
}