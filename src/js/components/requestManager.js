// src/js/utils/requestManager.js

const requestControllers = new Map();

/**
 * Cancela una petición en curso asociada a una clave.
 * @param {string} key La clave única de la petición.
 */
function cancelRequest(key) {
  const controller = requestControllers.get(key);
  if (controller) {
    controller.abort();
    requestControllers.delete(key);
  }
}

/**
 * Crea un nuevo AbortController para una clave, cancelando cualquier
 * petición anterior con la misma clave.
 * @param {string} key La clave única para la nueva petición.
 * @returns {AbortController} El nuevo controlador.
 */
export function createAbortableRequest(key) {
  cancelRequest(key); // Cancela la anterior con la misma clave
  const controller = new AbortController();
  requestControllers.set(key, controller);
  
  // Limpieza automática: cuando la señal se usa (se completa o se aborta),
  // eliminamos el controlador del Map para no acumular memoria.
  controller.signal.addEventListener('abort', () => {
      requestControllers.delete(key);
  }, { once: true });

  return controller;
}