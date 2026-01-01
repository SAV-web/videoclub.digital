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

const CACHE_STATIC_NAME = "videoclub-static-v4";
const CACHE_DYNAMIC_NAME = "videoclub-dynamic-v4";
const CACHE_API_NAME = "videoclub-api-v4";

// --- 1. ACTIVOS CRÍTICOS (Blocking) ---
// Sin esto, la app no arranca o se ve rota.
const CRITICAL_ASSETS = [
  "index.html",
  "manifest.webmanifest"
];

// --- 2. ACTIVOS SECUNDARIOS (Lazy) ---
// Se descargan en segundo plano. Si fallan, la app sigue funcionando.
const LAZY_ASSETS = [
  // Dejamos esta lista vacía para evitar errores 404 en consola.
  // Estos recursos se cachearán automáticamente gracias a la estrategia de runtime del SW.
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

  // 🛡️ EXCEPCIÓN CRÍTICA: Datos de Usuario y Autenticación
  // Nunca cachear peticiones REST (votos, watchlist) ni Auth. Deben ser siempre frescas.
  if (url.pathname.includes("/rest/v1/") || url.pathname.includes("/auth/v1/")) {
    return; // Salimos y dejamos que el navegador haga la petición de red normal
  }

  // === ESTRATEGIA NAVEGACIÓN: Network First (Para que index.html siempre esté fresco) ===
  // Esto asegura que si actualizas la app, el usuario reciba el nuevo index.html (y nuevos JS)
  // en lugar de la versión cacheada antigua.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).catch(() => caches.match(request))
    );
    return;
  }

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