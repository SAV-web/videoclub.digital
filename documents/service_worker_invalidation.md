# Estrategia de Invalidación del Service Worker

Este documento define cómo se invalidan las cachés controladas por `public/sw.js` y qué pasos deben seguirse en cada despliegue. La regla principal es simple: el navegador solo elimina cachés antiguas cuando cambia `VERSION` en el Service Worker.

## 1. Caches Actuales

`public/sw.js` define dos namespaces versionados:

```js
const VERSION = "vYYYYMMDDHHMM"; // Inyectado automáticamente en cada `npm run build` vía plugin Vite
const CACHE_STATIC = `videoclub-static-${VERSION}`;
const CACHE_DYNAMIC = `videoclub-dynamic-${VERSION}`;
```

Cada cambio de `VERSION` crea cachés nuevas y elimina todas las cachés cuyo nombre no coincida con las dos actuales durante el evento `activate`.

## 2. Política por Tipo de Recurso

| Recurso | Estrategia | Cache / Destino | Invalidación |
| --- | --- | --- | --- |
| Navegación HTML | `Network First` | `CACHE_STATIC` | Se actualiza desde red siempre que haya conexión. Fallback a caché offline. |
| `index.html` y manifiesto | Precarga en `install` | `CACHE_STATIC` | Requiere subida de `VERSION` (automatizado en el build). |
| JS/CSS/fuentes/iconos | `Stale While Revalidate` | `CACHE_DYNAMIC` | Vite genera filenames con hash; el HTML nuevo referencia assets nuevos. |
| Pósters Supabase Storage | `Cache First` | `CACHE_DYNAMIC` | Persisten hasta cambio de `VERSION` o expulsión FIFO por límite (200 items). |
| Supabase RPC / Búsquedas | Memoria LRU Cliente | `src/js/api.ts` (`lru-cache`) | Excluidas de SW (viajan en POST, prohibido por W3C CacheStorage). Caché en memoria cliente multiescala (`queryCache` 30 min / 300 páginas, `suggestionsCache` 5 min / 100 items, `personCache` 1 h / 150 items) con deduplicación de peticiones en vuelo (`inFlightRequests`). |
| Auth / REST directo | Sin caché | Directo a red | Nunca se interceptan para evitar fugas o datos privados obsoletos. |
| Service Worker Script (`sw.js`) | Automática vía Vite | `public/sw.js` -> `dist/sw.js` | `vite.config.js` incluye un plugin (`injectSwVersion`) que reemplaza la constante `VERSION` con una marca temporal (`vYYYYMMDDHHMM`) en cada compilación. |

## 3. Cuándo y Cómo se Incrementa `VERSION`

La inyección de versión está **automatizada en el pipeline de Vite** (`vite.config.js`):

- Cada vez que ejecutas `npm run build`, el plugin `injectSwVersion` sustituye `const VERSION = "dev"` en `dist/sw.js` por una firma única basada en la fecha y hora UTC (`vYYYYMMDDHHMM`).
- Esto garantiza que en cada nuevo despliegue en producción los clientes invaliden de forma limpia y transparente las cachés anteriores de assets estáticos y App Shell.

Si deseas realizar un cambio manual durante desarrollo local sin compilación completa:
1. Puedes actualizar manualmente la cadena `VERSION` en `dist/sw.js`.

## 4. Límites y Gestión de Memoria

- **Caché Dinámica de Service Worker (`CACHE_DYNAMIC`)**: Limita imágenes y assets de Storage a unas `200` entradas mediante eliminación FIFO (`limitCacheSize`). Esta política protege dispositivos móviles con almacenamiento limitado.
- **Cachés en Memoria Cliente (`src/js/api.ts`)**: Se gestionan en la capa de datos mediante `lru-cache` diferenciando tres niveles de caducidad según la volatilidad de los datos:
  1. **`queryCache` (Páginas y Resultados del Catálogo)**: Capacidad máxima de **300 páginas**, TTL de **30 minutos** (con `updateAgeOnGet` y autopurga activa) para navegación instantánea por paginación y filtros.
  2. **`suggestionsCache` (Autocompletado de Búsqueda)**: Capacidad máxima de **100 consultas**, TTL de **5 minutos** para optimizar la escritura del usuario sin retener búsquedas pasajeras.
  3. **`personCache` (Fichas VIP de Actores / Directores)**: Capacidad máxima de **150 registros**, TTL de **1 hora** para evitar reconsultas recurrentes de biografías y filmografías.


## 5. Flujo de Activación

El Service Worker usa:

- `self.skipWaiting()` en `install`: activa la versión nueva sin esperar a cerrar pestañas.
- `self.clients.claim()` en `activate`: toma control inmediato de clientes abiertos.
- Limpieza por allowlist: conserva solo `CACHE_STATIC` y `CACHE_DYNAMIC` de la versión actual.

Implicación: un usuario puede recibir la nueva estrategia durante una sesión activa. Por eso cualquier cambio incompatible debe ir acompañado de subida de `VERSION`.

## 6. Checklist de Despliegue

Antes de desplegar:

1. Ejecuta `npm run build` (el plugin de Vite inyectará automáticamente el nuevo `VERSION` en `dist/sw.js`).
2. Comprueba en la consola la salida del build: `✓ Service Worker version injected: vYYYYMMDDHHMM in dist/sw.js`.
3. Comprueba en DevTools > Application > Service Workers que la nueva versión queda activa.
4. Comprueba en DevTools > Application > Cache Storage que solo quedan caches `videoclub-*-vYYYYMMDDHHMM` actuales tras `activate`.
5. Haz una prueba offline de navegación básica.

## 7. Riesgos Conocidos

- Los pósters usan `Cache First`; si se reemplaza una imagen manteniendo la misma ruta, el usuario puede conservar la versión antigua hasta limpieza por versión o FIFO.
- `Auth` y `REST/RPC` directo quedan fuera de la caché del Service Worker; mantener esta excepción es obligatorio para evitar fugas, estados privados obsoletos y respetar la especificación W3C (métodos no-GET).

## 8. Relación con Otras Cachés

`CONFIG.STORAGE_VERSION` en `src/js/constants.ts` afecta a `localStorage` gestionado por `LocalStore`, no a Cache Storage del Service Worker. Si cambia el formato de datos locales y también la respuesta cacheada por SW, deben incrementarse ambos mecanismos cuando corresponda.
