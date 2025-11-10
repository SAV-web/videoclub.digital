// =================================================================
//
//              SERVICE WORKER para videoclub.digital (v1.1)
//
// =================================================================
//
//  FICHERO:  sw.js
//  AUTOR:    Tu Mentor Experto
//  VERSIÓN:  1.1
//
//  ESTRATEGIAS DE CACHÉ IMPLEMENTADAS:
//    1.  API (`/functions/...`): Network First, falling back to Cache.
//        Prioriza datos frescos. Si hay red, obtiene los últimos datos y
//        actualiza la caché. Si no hay red, sirve los últimos datos cacheados.
//        Ideal para contenido dinámico.
//
//    2.  Imágenes y Fuentes: Stale-While-Revalidate.
//        Sirve el asset desde la caché inmediatamente para una carga ultra-rápida.
//        En segundo plano, solicita una versión actualizada y la guarda para
//        la próxima visita. El equilibrio perfecto entre velocidad y frescura.
//
//    3.  App Shell (HTML, CSS, JS): Cache First, falling back to Network.
//        Sirve la "cáscara" de la aplicación directamente desde la caché.
//        Si un recurso no está en la caché (por ejemplo, un nuevo script),
//        lo busca en la red y lo añade a la caché dinámica para futuras visitas.
//
// =================================================================

const CACHE_STATIC_NAME = "videoclub-static-v1";
const CACHE_DYNAMIC_NAME = "videoclub-dynamic-v1";
const CACHE_API_NAME = "videoclub-api-v1";

// Recursos de la "cáscara" de la aplicación que se cachean en la instalación.
// Son los archivos mínimos necesarios para que la aplicación "arranque".
const STATIC_ASSETS = [
  "/",
  "/index.html",
  "/src/css/main.css",
  "/src/js/main.js",
  "/src/js/ui.js",
  "/src/js/api.js",
  "/src/js/state.js",
  "/src/js/utils.js",
  "/manifest.webmanifest",
  // Se podría añadir aquí el logo principal o un icono SVG sprite.
  // '/src/img/icons/sprite.svg'
];

// Evento 'install': Se dispara una sola vez cuando el Service Worker se instala.
// Ideal para pre-cachear los assets estáticos.
self.addEventListener("install", (event) => {
  console.log("[Service Worker] Instalando...");
  event.waitUntil(
    caches.open(CACHE_STATIC_NAME).then((cache) => {
      console.log("[Service Worker] Pre-cacheando la App Shell...");
      return cache.addAll(STATIC_ASSETS);
    })
  );
  self.skipWaiting(); // Fuerza al nuevo SW a activarse inmediatamente.
});

// Evento 'activate': Se dispara cuando el Service Worker se activa.
// Perfecto para limpiar cachés antiguas de versiones anteriores.
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
  return self.clients.claim(); // Toma el control de todas las pestañas abiertas.
});

// Evento 'fetch': Se dispara para cada petición de red que hace la página.
// Aquí es donde interceptamos las peticiones y aplicamos nuestras estrategias.
self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // === ESTRATEGIA 1: API (Network First, falling back to Cache) ===
  if (url.pathname.includes("/functions/v1/")) {
    event.respondWith(
      caches.open(CACHE_API_NAME).then(async (cache) => {
        try {
          const networkResponse = await fetch(request);
          // Clonamos la respuesta porque un stream solo puede ser leído una vez.
          cache.put(request, networkResponse.clone());
          return networkResponse;
        } catch (error) {
          console.log(
            `[Service Worker] Red falló para API. Sirviendo desde caché para: ${request.url}`
          );
          const cachedResponse = await cache.match(request);
          return cachedResponse; // Puede ser 'undefined' si nunca se cacheó, lo cual es correcto.
        }
      })
    );
  }
  // === ESTRATEGIA 2: Imágenes y Fuentes (Stale-While-Revalidate) ===
  else if (request.destination === "image" || request.destination === "font") {
    event.respondWith(
      caches.open(CACHE_DYNAMIC_NAME).then(async (cache) => {
        const cachedResponse = await cache.match(request);
        const networkFetch = fetch(request)
          .then((networkResponse) => {
            cache.put(request, networkResponse.clone());
            return networkResponse;
          })
          .catch((err) =>
            console.warn(
              `[Service Worker] Fallo al buscar en red para ${request.url}:`,
              err
            )
          );

        // Devuelve la respuesta del caché inmediatamente si existe, si no, espera a la red.
        return cachedResponse || networkFetch;
      })
    );
  }
  // === ESTRATEGIA 3: App Shell y otros (Cache First, falling back to Network) ===
  else {
    event.respondWith(
      caches.match(request).then((cachedResponse) => {
        if (cachedResponse) {
          return cachedResponse; // Sirve desde la caché estática.
        }

        // ✨ MEJORA: Si no está en la caché estática, búscalo en la red
        // Y AÑÁDELO a la caché dinámica para futuras visitas.
        return fetch(request).then((networkResponse) => {
          return caches.open(CACHE_DYNAMIC_NAME).then((cache) => {
            // No cacheamos peticiones de extensiones de Chrome, etc.
            if (request.url.startsWith("http")) {
              cache.put(request, networkResponse.clone());
            }
            return networkResponse;
          });
        });
      })
    );
  }
});
