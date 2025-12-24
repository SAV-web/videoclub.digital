// =================================================================
//              SERVICE WORKER OPTIMIZADO (v2.0)
// =================================================================
//
//  ESTRATEGIAS:
//    1. App Shell Crítica: Cache First (Instalación bloqueante).
//    2. Recursos Secundarios: Cache Lazy (Instalación no bloqueante).
//    3. API: Stale-While-Revalidate con ventana de frescura (30s).
//    4. Assets (Img/Fonts): Stale-While-Revalidate.
//
// =================================================================

const CACHE_STATIC_NAME = "videoclub-static-v2";
const CACHE_DYNAMIC_NAME = "videoclub-dynamic-v2";
const CACHE_API_NAME = "videoclub-api-v2";

// --- 1. ACTIVOS CRÍTICOS (Blocking) ---
// Sin esto, la app no arranca o se ve rota.
const CRITICAL_ASSETS = [
  "/index.html",
  "/src/css/main.css",
  "/src/css/base/variables.css",
  "/src/css/base/globals.css",
  "/src/css/components/button.css",
  "/src/css/components/card.css",
  "/src/css/components/header.css",
  "/src/css/components/modal.css",
  "/src/css/components/sidebar.css",
  "/src/css/components/ui.css",
  "/src/css/layout.css",
  "/src/js/main.js",    // IMPRESCINDIBLE para el arranque
  "/src/js/config.js",  // Configuración base
  "/src/js/utils.js",   // Utilidades base
  "/src/js/state.js",   // Estado global
  "/src/js/ui.js",      // Manejo del DOM crítico
  "/src/js/api.js",      // Lógica de red
  "/src/js/auth.js",
  "/src/js/components/card.js",
  "/src/js/components/sidebar.js",
  "/src/js/components/modal.js",
  "/src/js/components/rating.js"
];

// --- 2. ACTIVOS SECUNDARIOS (Lazy) ---
// Se descargan en segundo plano. Si fallan, la app sigue funcionando.
const LAZY_ASSETS = [
  "/manifest.webmanifest",
  // Iconos y recursos gráficos no vitales para el primer paint
  "/src/img/icons/sprite.svg" 
];

// --- INSTALACIÓN (Estrategia Híbrida) ---
self.addEventListener("install", (event) => {
  console.log("[Service Worker] Instalando...");
  
  event.waitUntil(
    caches.open(CACHE_STATIC_NAME).then(async (cache) => {
      console.log("[Service Worker] Cacheando App Shell Crítica...");
      
      // 1. Forzamos la carga de lo crítico. Si esto falla, el SW no se instala.
      await cache.addAll(CRITICAL_ASSETS);
      
      // 2. Intentamos cargar lo secundario sin bloquear.
      // Si falla, no pasa nada, se cacheará dinámicamente al usarse.
      console.log("[Service Worker] Iniciando caché background...");
      LAZY_ASSETS.forEach(url => {
        cache.add(url).catch(err => console.warn(`[SW] Fallo lazy asset ${url}`, err));
      });
    })
  );
  self.skipWaiting();
});

// --- ACTIVACIÓN (Limpieza) ---
self.addEventListener("activate", (event) => {
  console.log("[Service Worker] Activando y limpiando...");
  event.waitUntil(
    caches.keys().then((keyList) => {
      return Promise.all(
        keyList.map((key) => {
          if (
            key !== CACHE_STATIC_NAME &&
            key !== CACHE_DYNAMIC_NAME &&
            key !== CACHE_API_NAME
          ) {
            console.log("[Service Worker] Borrando caché antigua:", key);
            return caches.delete(key);
          }
        })
      );
    })
  );
  return self.clients.claim();
});

// --- INTERCEPTACIÓN DE RED (FETCH) ---
self.addEventListener("fetch", (event) => {
  const { request } = event;
  
  // Ignorar peticiones que no sean GET (POST, PUT, etc. no se cachean)
  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  // === ESTRATEGIA API: Stale-While-Revalidate con Ventana de Frescura ===
  if (url.pathname.includes("/functions/v1/")) {
    event.respondWith(
      caches.open(CACHE_API_NAME).then(async (cache) => {
        const cachedResponse = await cache.match(request);
        
        // Promesa de red (se ejecuta siempre para actualizar la caché)
        const networkFetch = fetch(request).then(response => {
          // Clonar y guardar solo si la respuesta es válida
          if (response.ok) {
            cache.put(request, response.clone());
          }
          return response;
        });

        // Lógica de Frescura
        if (cachedResponse) {
          const cacheDateHeader = cachedResponse.headers.get('date');
          
          if (cacheDateHeader) {
            const cacheDate = new Date(cacheDateHeader);
            const now = new Date();
            const ageInSeconds = (now - cacheDate) / 1000;

            // Si la caché tiene menos de 30 segundos, la consideramos "fresca"
            // y la devolvemos INMEDIATAMENTE sin esperar a la red.
            if (ageInSeconds < 30) {
              // Dejamos que la red actualice en background (sin 'await')
              // para que la próxima vez esté aún más fresca.
              networkFetch.catch(() => {}); 
              return cachedResponse;
            }
          }
          
          // Si es vieja (>30s) o no tiene fecha, usamos estrategia "Fastest/Hybrid":
          // Devolvemos la caché vieja para renderizar YA, pero la UI se actualizará
          // si implementas lógica reactiva, o simplemente la próxima vez.
          // Para ser conservadores y priorizar la velocidad:
          networkFetch.catch(() => {}); // Asegurar actualización background
          return cachedResponse; 
        }

        // Si no hay caché, esperamos a la red
        try {
          return await networkFetch;
        } catch (error) {
          // Fallback offline para API si fuera necesario
          return new Response(JSON.stringify({ error: "Offline" }), { 
            status: 503, 
            headers: { 'Content-Type': 'application/json' } 
          });
        }
      })
    );
  }
  
  // === ESTRATEGIA ASSETS: Stale-While-Revalidate (Imágenes y Fuentes) ===
  else if (request.destination === "image" || request.destination === "font") {
    event.respondWith(
      caches.open(CACHE_DYNAMIC_NAME).then(async (cache) => {
        const cachedResponse = await cache.match(request);
        const networkFetch = fetch(request).then((networkResponse) => {
          if(networkResponse.ok) cache.put(request, networkResponse.clone());
          return networkResponse;
        });
        return cachedResponse || networkFetch;
      })
    );
  }
  
  // === ESTRATEGIA APP SHELL: Cache First (Falling back to Network) ===
  else {
    event.respondWith(
      caches.match(request).then((cachedResponse) => {
        if (cachedResponse) {
          return cachedResponse;
        }
        return fetch(request).then((networkResponse) => {
          return caches.open(CACHE_DYNAMIC_NAME).then((cache) => {
            // Cacheamos dinámicamente nuevos archivos JS/CSS visitados
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