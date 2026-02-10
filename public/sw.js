// =================================================================
//              SERVICE WORKER OPTIMIZADO (v2.1)
// =================================================================

const VERSION = "v7"; // Incrementado para invalidar cachés anteriores
const CACHE_STATIC = `videoclub-static-${VERSION}`;
const CACHE_DYNAMIC = `videoclub-dynamic-${VERSION}`;
const CACHE_API = `videoclub-api-${VERSION}`;

// --- 1. ACTIVOS CRÍTICOS (Instalación) ---
const CRITICAL_ASSETS = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  // Añade aquí tu CSS/JS compilado si no usas inyección de Vite, 
  // pero con Vite normalmente index.html es suficiente entry point.
];

// --- 2. HELPERS DE ESTRATEGIAS ---

/**
 * Helper para guardar en caché asíncronamente sin bloquear la respuesta
 */
const cacheResponse = async (cacheName, request, response) => {
  if (!response || response.status !== 200 || response.type !== 'basic' && response.type !== 'cors') {
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
    // Guardamos copia fresca
    cacheResponse(CACHE_STATIC, request, networkResponse);
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
      cache.put(request, response.clone());
    }
    return response;
  });

  return cachedResponse || networkFetch;
}

/**
 * ESTRATEGIA: API con Ventana de Frescura (Lógica personalizada)
 * - Si la caché tiene < 30s: Retorna caché (muy rápido).
 * - Si es vieja o no existe: Retorna caché (si hay) Y actualiza en background, o espera red.
 */
async function handleApiRequest(request) {
  const cache = await caches.open(CACHE_API);
  const cachedResponse = await cache.match(request);
  
  const networkFetch = fetch(request).then(response => {
    if (response.ok) cache.put(request, response.clone());
    return response;
  });

  if (cachedResponse) {
    const dateHeader = cachedResponse.headers.get('date');
    
    // Si existe la cabecera Date, comprobamos frescura.
    // Si no existe (CORS opaco), asumimos que es viejo y dejamos que networkFetch actualice.
    if (dateHeader) {
      const ageMs = new Date() - new Date(dateHeader);
      // Si es "fresco" (< 15m), devolvemos caché y NO esperamos a la red
      // (aunque la red se dispara en background para la próxima vez)
      if (ageMs < 900000) {
        networkFetch.catch(() => {}); // Evitar errores de promesa no manejada
        return cachedResponse;
      }
    }
    // Si es "viejo", devolvemos lo que tenemos (stale) para velocidad,
    // mientras se actualiza detrás.
    networkFetch.catch(() => {}); // Evitar errores de promesa no manejada
    return cachedResponse; 
  }

  // Si no hay caché, esperamos a la red
  try {
    return await networkFetch;
  } catch (error) {
    // Fallback JSON offline
    return new Response(JSON.stringify({ error: "Sin conexión" }), {
      status: 503,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

// --- CICLO DE VIDA ---

self.addEventListener("install", (event) => {
  console.log(`[SW ${VERSION}] Instalando...`);
  // skipWaiting fuerza a este SW a activarse inmediatamente, no espera a cerrar pestañas
  self.skipWaiting(); 
  
  event.waitUntil(
    caches.open(CACHE_STATIC).then((cache) => {
      // addAll es atómico: si uno falla, falla toda la instalación.
      // Es bueno para asegurar integridad crítica.
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
          if (key !== CACHE_STATIC && key !== CACHE_DYNAMIC && key !== CACHE_API) {
            console.log(`[SW] Borrando caché antigua: ${key}`);
            return caches.delete(key);
          }
        })
      );
    })
  );
  return self.clients.claim(); // Controlar clientes inmediatamente
});

// --- INTERCEPTACIÓN DE RED ---

self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);

  // 1. Ignorar métodos no-GET y esquemas no-http
  if (request.method !== 'GET' || !url.protocol.startsWith('http')) return;

  // 2. EXCEPCIONES: Nunca cachear Auth ni REST directo (datos vivos)
  if (url.pathname.includes("/auth/v1/") || url.pathname.includes("/rest/v1/")) {
    return;
  }

  // 3. ESTRATEGIA: Navegación (HTML)
  if (request.mode === 'navigate') {
    event.respondWith(networkFirst(request));
    return;
  }

  // 4. ESTRATEGIA: API RPC (Supabase Functions)
  if (url.pathname.includes("/functions/v1/") || url.pathname.includes("rpc/")) {
    event.respondWith(handleApiRequest(request));
    return;
  }

  // 5. ESTRATEGIA: Imágenes de Supabase Storage (Posters)
  // Las tratamos como assets dinámicos con caché agresiva
  if (url.pathname.includes("/storage/v1/object/public/")) {
    event.respondWith(staleWhileRevalidate(request, CACHE_DYNAMIC));
    return;
  }

  // 6. ESTRATEGIA: Assets Estáticos (JS, CSS, Fuentes, Iconos)
  // Vite suele versionar los archivos (ej: index.a3b4c.js), así que CacheFirst
  // o StaleWhileRevalidate son seguros.
  if (
    request.destination === "script" ||
    request.destination === "style" ||
    request.destination === "image" ||
    request.destination === "font"
  ) {
    event.respondWith(staleWhileRevalidate(request, CACHE_DYNAMIC));
    return;
  }

  // 7. Fallback por defecto (Cache First simple)
  // Para cualquier otro recurso no contemplado
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