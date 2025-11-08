// =================================================================
//          SERVICE WORKER para videoclub.digital (v1)
// =================================================================
// Implementa una estrategia de caché multinivel para una PWA robusta.

const CACHE_STATIC_NAME = "videoclub-static-v1";
const CACHE_DYNAMIC_NAME = "videoclub-dynamic-v1";
const CACHE_API_NAME = "videoclub-api-v1";

// Recursos de la "cáscara" de la aplicación que se cachean en la instalación.
const STATIC_ASSETS = [
  "/",
  "/index.html", // Es bueno ser explícito
  "/src/css/main.css",
  "/src/js/main.js",
  "/src/js/ui.js",
  "/src/js/api.js",
  "/src/js/state.js",
  "/src/js/utils.js",
  "/manifest.webmanifest",
  // Puedes añadir aquí un icono principal o un logo si lo tienes
];

self.addEventListener("install", (event) => {
  console.log("[Service Worker] Instalando...");
  event.waitUntil(
    caches.open(CACHE_STATIC_NAME).then((cache) => {
      console.log("[Service Worker] Pre-cacheando la cáscara de la App");
      return cache.addAll(STATIC_ASSETS);
    })
  );
  self.skipWaiting();
});

// Limpia cachés antiguas cuando el Service Worker se activa.
self.addEventListener("activate", (event) => {
  console.log("[Service Worker] Activando...");
  event.waitUntil(
    caches.keys().then((keyList) => {
      return Promise.all(
        keyList.map((key) => {
          if (
            key !== CACHE_STATIC_NAME &&
            key !== CACHE_DYNAMIC_NAME &&
            key !== CACHE_API_NAME
          ) {
            console.log("[Service Worker] Eliminando caché antigua:", key);
            return caches.delete(key);
          }
        })
      );
    })
  );
  return self.clients.claim();
});

// Intercepta todas las peticiones de red.
self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // ESTRATEGIA 1: Peticiones a la API (Network First)
  if (url.pathname.includes("/functions/v1/search_movies_offset")) {
    event.respondWith(
      caches.open(CACHE_API_NAME).then(async (cache) => {
        try {
          const networkResponse = await fetch(request);
          // Si la petición de red es exitosa, la clonamos y la guardamos en caché
          // antes de devolverla al navegador.
          cache.put(request, networkResponse.clone());
          return networkResponse;
        } catch (error) {
          // Si la red falla (offline), intentamos servir desde la caché.
          console.log(
            "[Service Worker] Red falló, intentando servir desde caché API..."
          );
          const cachedResponse = await cache.match(request);
          return cachedResponse;
        }
      })
    );
  }
  // ESTRATEGIA 2: Imágenes, Fuentes (Stale-While-Revalidate)
  else if (request.destination === "image" || request.destination === "font") {
    event.respondWith(
      caches.open(CACHE_DYNAMIC_NAME).then(async (cache) => {
        const cachedResponse = await cache.match(request);
        const networkFetch = fetch(request).then((networkResponse) => {
          cache.put(request, networkResponse.clone());
          return networkResponse;
        });
        // Devuelve la respuesta del caché inmediatamente (si existe),
        // o espera a la red si no está en caché.
        return cachedResponse || networkFetch;
      })
    );
  }
  // ESTRATEGIA 3: Cáscara de la App y otros (Cache First)
  else {
    event.respondWith(
      caches.match(request).then((response) => {
        // Devuelve desde el caché estático, o va a la red si no lo encuentra.
        return response || fetch(request);
      })
    );
  }
});
