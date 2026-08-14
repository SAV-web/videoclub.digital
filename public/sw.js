// =================================================================
//              SERVICE WORKER OPTIMIZADO (v2.2)
// =================================================================

const VERSION = "dev"; // Generado automáticamente en build time por swVersionPlugin en vite.config.js
const CACHE_STATIC = `videoclub-static-${VERSION}`;
const CACHE_DYNAMIC = `videoclub-dynamic-${VERSION}`;

// --- 1. ACTIVOS CRÍTICOS (Instalación) ---
const CRITICAL_ASSETS = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
];

// --- 2. HELPERS DE ESTRATEGIAS ---

/**
 * Limita el tamaño de la caché para evitar exceder la cuota del navegador (FIFO).
 */
const limitCacheSize = async (cacheName, maxItems) => {
  const cache = await caches.open(cacheName);
  const keys = await cache.keys();
  if (keys.length > maxItems) {
    const itemsToDelete = keys.slice(0, keys.length - maxItems);
    await Promise.all(itemsToDelete.map(key => cache.delete(key)));
  }
};

/**
 * Helper para guardar en caché asíncronamente sin bloquear la respuesta
 */
const cacheResponse = async (cacheName, request, response) => {
  if (!response || response.status !== 200 || (response.type !== 'basic' && response.type !== 'cors')) {
    return;
  }
  const cache = await caches.open(cacheName);
  await cache.put(request, response.clone());
};

/**
 * ESTRATEGIA: Network First (Prioridad Red, fallback Caché)
 * Ideal para index.html para asegurar que siempre se carga la última versión de la app.
 */
async function networkFirst(request) {
  try {
    const networkResponse = await fetch(request);
    cacheResponse(CACHE_STATIC, request, networkResponse.clone());
    return networkResponse;
  } catch (error) {
    const cachedResponse = await caches.match(request);
    if (cachedResponse) return cachedResponse;
    throw error;
  }
}

/**
 * ESTRATEGIA: Stale While Revalidate (Caché rápido, actualiza en segundo plano)
 * Ideal para assets estáticos (CSS, JS, Fuentes).
 */
async function staleWhileRevalidate(request, cacheName = CACHE_DYNAMIC) {
  const cache = await caches.open(cacheName);
  const cachedResponse = await cache.match(request);
  
  const networkFetch = fetch(request).then(response => {
    if (response.ok) {
      cache.put(request, response.clone()).then(() => {
        if (request.destination === 'image' || request.url.includes('/storage/v1/object/public/')) {
          limitCacheSize(cacheName, 200);
        }
      });
    }
    return response;
  });

  return cachedResponse || networkFetch;
}

/**
 * ESTRATEGIA: Cache First (Prioridad Caché, fallback Red)
 * Ideal para imágenes estáticas (Pósters) que nunca cambian.
 */
async function cacheFirst(request, cacheName = CACHE_DYNAMIC) {
  const cache = await caches.open(cacheName);
  const cachedResponse = await cache.match(request);
  if (cachedResponse) return cachedResponse;
  
  const networkResponse = await fetch(request);
  if (networkResponse.ok) {
    cache.put(request, networkResponse.clone()).then(() => limitCacheSize(cacheName, 200));
  }
  return networkResponse;
}

// --- CICLO DE VIDA ---

self.addEventListener("install", (event) => {
  console.log(`[SW ${VERSION}] Instalando...`);
  self.skipWaiting(); 
  
  event.waitUntil(
    caches.open(CACHE_STATIC).then((cache) => {
      return cache.addAll(CRITICAL_ASSETS);
    })
  );
});

self.addEventListener("activate", (event) => {
  console.log(`[SW ${VERSION}] Activando y limpiando...`);
  event.waitUntil(
    caches.keys().then((keyList) => {
      return Promise.all(
        keyList.map((key) => {
          if (key !== CACHE_STATIC && key !== CACHE_DYNAMIC) {
            console.log(`[SW] Borrando caché antigua: ${key}`);
            return caches.delete(key);
          }
        })
      );
    })
  );
  return self.clients.claim();
});

// --- INTERCEPTACIÓN DE RED ---

self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);

  // 1. Ignorar métodos no-GET y esquemas no-http
  if (request.method !== 'GET' || !url.protocol.startsWith('http')) return;

  // 2. EXCEPCIONES: Datos dinámicos de Supabase (Auth y API REST/RPC)
  // NOTA DE ARQUITECTURA:
  // - Supabase Auth (/auth/v1/) y tablas REST (/rest/v1/) manejan datos vivos de sesión y usuario.
  // - Las consultas RPC (/rest/v1/rpc/) viajan en HTTP POST (estándar de PostgREST para filtros complejos).
  // - La API CacheStorage del navegador prohíbe métodos no-GET (W3C spec).
  // - Por tanto, la caché de búsquedas y filtros se gestiona en memoria LRU en el cliente (src/js/api.ts),
  //   mientras el Service Worker se enfoca en hacer offline el App Shell y los pósters.
  if (url.pathname.includes("/auth/v1/") || url.pathname.includes("/rest/v1/")) {
    return;
  }

  // 3. ESTRATEGIA: Navegación (HTML)
  if (request.mode === 'navigate') {
    event.respondWith(networkFirst(request));
    return;
  }

  // 4. ESTRATEGIA: Imágenes de Supabase Storage (Posters)
  if (url.pathname.includes("/storage/v1/object/public/")) {
    event.respondWith(cacheFirst(request, CACHE_DYNAMIC));
    return;
  }

  // 5. ESTRATEGIA: Assets Estáticos (JS, CSS, Fuentes, Iconos)
  if (
    request.destination === "script" ||
    request.destination === "style" ||
    request.destination === "image" ||
    request.destination === "font"
  ) {
    event.respondWith(staleWhileRevalidate(request, CACHE_DYNAMIC));
    return;
  }

  // 6. Fallback por defecto (Cache First simple)
  event.respondWith(
    caches.match(request).then((response) => {
      return response || fetch(request).then((networkResponse) => {
        return caches.open(CACHE_DYNAMIC).then((cache) => {
          if (networkResponse.ok) {
            cache.put(request, networkResponse.clone());
          }
          return networkResponse;
        });
      });
    })
  );
});
