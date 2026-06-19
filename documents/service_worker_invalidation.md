# Estrategia de Invalidación del Service Worker

Este documento define cómo se invalidan las cachés controladas por `public/sw.js` y qué pasos deben seguirse en cada despliegue. La regla principal es simple: el navegador solo elimina cachés antiguas cuando cambia `VERSION` en el Service Worker.

## 1. Caches Actuales

`public/sw.js` crea tres namespaces versionados:

```js
const VERSION = "v9";
const CACHE_STATIC = `videoclub-static-${VERSION}`;
const CACHE_DYNAMIC = `videoclub-dynamic-${VERSION}`;
const CACHE_API = `videoclub-api-${VERSION}`;
```

Cada cambio de `VERSION` crea cachés nuevas y elimina todas las cachés cuyo nombre no coincida con las tres actuales durante el evento `activate`.

## 2. Política por Tipo de Recurso

| Recurso | Estrategia | Invalidación |
| --- | --- | --- |
| Navegación HTML | `Network First` | Se actualiza desde red siempre que haya conexión. Fallback a caché offline. |
| `index.html` y críticos | Precarga en `install` | Requiere subida de `VERSION` si cambia el shell crítico. |
| JS/CSS/fuentes/iconos | `Stale While Revalidate` | Vite genera filenames con hash; el HTML nuevo referencia assets nuevos. |
| Pósters Supabase Storage | `Cache First` | Persisten hasta cambio de `VERSION` o expulsión FIFO por límite. |
| RPC / Functions | Cache API con ventana de frescura | Si hay caché, se devuelve rápido y se revalida en background. |
| Auth / REST directo | Sin caché | Nunca se interceptan para evitar datos privados obsoletos. |

## 3. Cuándo Incrementar `VERSION`

Incrementa `VERSION` en `public/sw.js` cuando ocurra cualquiera de estos casos:

1. Cambia la lógica del Service Worker.
2. Cambia la estrategia de caché de cualquier tipo de recurso.
3. Cambia `CRITICAL_ASSETS`.
4. Cambia el formato de respuestas cacheadas de RPC.
5. Cambian rutas públicas de Storage que puedan mantener assets antiguos con el mismo nombre.
6. Necesitas forzar limpieza global de cachés de usuarios.

No es obligatorio incrementar `VERSION` para cambios normales de JS/CSS generados por Vite, porque los assets salen con hash y `index.html` se resuelve con `Network First`.

## 4. TTL y Límites

La caché de API usa una ventana de frescura de `15 minutos`:

- Si hay respuesta cacheada con cabecera `Date` menor a 15 minutos, se devuelve inmediatamente.
- La red se dispara en background para refrescar la próxima lectura.
- Si la respuesta cacheada está vieja, también se devuelve como `stale` para mantener velocidad y se revalida detrás.
- Si no hay caché y la red falla, se devuelve JSON `503` con `{ "error": "Sin conexión" }`.

La caché dinámica limita imágenes y assets de Storage a unas `200` entradas mediante eliminación FIFO. Esta política protege móviles con cuota baja, pero no garantiza LRU estricto.

## 5. Flujo de Activación

El Service Worker usa:

- `self.skipWaiting()` en `install`: activa la versión nueva sin esperar a cerrar pestañas.
- `self.clients.claim()` en `activate`: toma control inmediato de clientes abiertos.
- Limpieza por allowlist: conserva solo `CACHE_STATIC`, `CACHE_DYNAMIC` y `CACHE_API` de la versión actual.

Implicación: un usuario puede recibir la nueva estrategia durante una sesión activa. Por eso cualquier cambio incompatible debe ir acompañado de subida de `VERSION`.

## 6. Checklist de Despliegue

Antes de desplegar:

1. Ejecuta `npm run build`.
2. Si cambió `public/sw.js`, sube `VERSION`.
3. Si cambian contratos de RPC cacheadas, sube `VERSION`.
4. Comprueba en DevTools > Application > Service Workers que la nueva versión queda activa.
5. Comprueba en DevTools > Application > Cache Storage que solo quedan caches `videoclub-*-vX` actuales tras `activate`.
6. Haz una prueba offline de navegación básica.

## 7. Riesgos Conocidos

- Los pósters usan `Cache First`; si se reemplaza una imagen manteniendo la misma ruta, el usuario puede conservar la versión antigua hasta limpieza por versión o FIFO.
- La caché RPC prioriza velocidad sobre consistencia fuerte. No debe usarse para endpoints privados o altamente volátiles.
- `Auth` y `REST` directo quedan fuera de caché; mantener esta excepción es obligatorio para evitar fugas o estados privados obsoletos.

## 8. Relación con Otras Cachés

`CONFIG.STORAGE_VERSION` en `src/js/constants.js` afecta a `localStorage` gestionado por `LocalStore`, no a Cache Storage del Service Worker. Si cambia el formato de datos locales y también la respuesta cacheada por SW, deben incrementarse ambos mecanismos cuando corresponda.
