// =================================================================
//                      MÓDULO DE NOTIFICACIONES (TOAST)
// =================================================================
// ✨ CORRECCIÓN: La ruta de importación ahora es './constants.js' porque está en la misma carpeta.
import { SELECTORS } from "./constants.js";

const TOAST_DURATION = 5000; // Duración de la notificación en milisegundos.

/**
 * Muestra una notificación toast en la esquina de la pantalla.
 * @param {string} message - El mensaje a mostrar.
 * @param {string} [type='error'] - El tipo de toast ('error' o 'success').
 */
export function showToast(message, type = "error") {
  // Usamos querySelector con la constante centralizada.
  const container = document.querySelector(SELECTORS.TOAST_CONTAINER);
  if (!container) {
    console.error("El contenedor de toast no se encuentra en el DOM.");
    return;
  }

  // Creamos el nuevo elemento de la notificación.
  const toastElement = document.createElement("div");

  // Le añadimos las clases CSS necesarias para darle estilo.
  toastElement.className = `toast toast--${type}`;
  toastElement.textContent = message;
  toastElement.setAttribute("role", "alert");

  // Añadimos la notificación al contenedor para que aparezca en pantalla.
  container.appendChild(toastElement);

  // Programamos su autodestrucción.
  setTimeout(() => {
    toastElement.remove();
  }, TOAST_DURATION);
}
