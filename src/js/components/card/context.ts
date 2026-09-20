import { CSS_CLASSES } from "../../constants.js";
import type { MovieCardElement } from "../../types.js";

// --- Registro de precarga de imágenes ---
// Array y Set exportados directamente: solo se mutan (push/shift/
// add/delete/clear), nunca se reasignan por completo, así que no 
// necesitan funciones de acceso.
export const preloadedLinkElements: HTMLLinkElement[] = [];
export const prefetchedUrls = new Set<string>();

// --- Observer de lazy loading compartido ---
// Singleton: se crea una sola vez y no se reasigna nunca (solo se 
// llama a .observe()/.unobserve() sobre él).
export const lazyLoadObserver: IntersectionObserver | null =
  typeof IntersectionObserver !== "undefined"
    ? new IntersectionObserver(
        (entries, obs) => {
          entries.forEach((entry) => {
            if (entry.isIntersecting) {
              const img = entry.target as HTMLImageElement;
              if (img.dataset.src) {
                img.src = img.dataset.src;
                img.onload = () => img.classList.add(CSS_CLASSES.LOADED);
                img.onerror = () => img.classList.add(CSS_CLASSES.LOADED);
                if (img.complete) {
                  img.classList.add(CSS_CLASSES.LOADED);
                }
              }
              obs.unobserve(img);
            }
          });
        },
        {
          rootMargin: "500px",
        }
      )
    : null;

// --- Estado de interacción (se reasigna desde varias funciones,
//     por eso necesita accesores en vez de exportarse como `let`) ---
let currentlyFlippedCard: MovieCardElement | null = null;
export function getFlippedCard(): MovieCardElement | null {
  return currentlyFlippedCard;
}
export function setFlippedCard(card: MovieCardElement | null): void {
  currentlyFlippedCard = card;
}

let hoverTimeout: ReturnType<typeof setTimeout> | undefined;
export function getHoverTimeout(): ReturnType<typeof setTimeout> | undefined {
  return hoverTimeout;
}
export function setHoverTimeout(id: ReturnType<typeof setTimeout> | undefined): void {
  hoverTimeout = id;
}

let singleTapTimeout: ReturnType<typeof setTimeout> | undefined;
export function getSingleTapTimeout(): ReturnType<typeof setTimeout> | undefined {
  return singleTapTimeout;
}
export function setSingleTapTimeout(id: ReturnType<typeof setTimeout> | undefined): void {
  singleTapTimeout = id;
}

let currentHoveredCard: MovieCardElement | null = null;
export function getHoveredCard(): MovieCardElement | null {
  return currentHoveredCard;
}
export function setHoveredCard(card: MovieCardElement | null): void {
  currentHoveredCard = card;
}
