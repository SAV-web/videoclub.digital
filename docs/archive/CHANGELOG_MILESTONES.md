# Registro Histórico de Hitos y Decisiones de Arquitectura (Changelog Técnico)

Este documento preserva la memoria técnica íntegra, el razonamiento analítico y el registro exhaustivo de los **60 hitos de ingeniería y refactorización** ejecutados en **videoclub.digital**.

> [!NOTE]
> Este archivo actúa como registro de archivo histórico. Para la arquitectura viva y las directrices vigentes de ingeniería, consultar [docs/project_context.md](file:///docs/project_context.md) y los contratos normativos en [docs/contracts.md](file:///docs/contracts.md).

---

## 📜 1. Bitácora Completa de Hitos Técnicos (Hitos 1 al 60)

1. **Prevención de Layout Thrashing:**
   Separación estricta de las lecturas del DOM (ej. `.offsetHeight`, `.scrollY`) de las escrituras del DOM (ej. `.classList.add`). Se orquesta con `requestAnimationFrame` en el scroll y en `handleCardVisibilityChange` desacoplando la fase de lectura geométrica en lote (`getBoundingClientRect`) de la mutación de `src` y desvinculación de observers.
2. **DOM Lazy Loading:**
   Las secciones pesadas como el listado completo de actores en la parte trasera de una tarjeta no se renderizan al crear la tarjeta. Se insertan dinámicamente mediante `DocumentFragment` solo cuando el usuario pulsa "Ver Reparto".
3. **In-Flight Deduplication & AbortControllers:**
   Si el usuario pulsa repetidamente un filtro, las peticiones HTTP previas se abortan automáticamente para evitar sobrecarga de red y _race conditions_ visuales.
4. **View Transitions API:**
   Animaciones nativas para transicionar del grid a la vista de detalle, con fallback seguro para navegadores antiguos.
5. **Aislamiento de Renderizado CSS:**
   Uso intensivo de la propiedad `contain` y `will-change: transform` para evitar que las animaciones locales provoquen recálculos globales en la pantalla.
6. **Gestión de Ciclo de Vida y Limpieza de Memoria (Teardown):**
   Todos los módulos (`card/`, `modal.ts`, `sidebar/`, `main.ts`) implementan funciones de desmontaje explícito (`disposeCardEvents`, `disposeModalEvents`, `disposeSidebarEvents`, `disposeMainEvents`, `disposeApp`) y un bus de eventos global con desuscripción limpia (`appEvents.off`, `appEvents.clearAll`) para prevenir _memory leaks_ y listeners huérfanos.
7. **Desacoplamiento Crítico de Conteo (Pintar Primero → Contar Después) y Liberación Inmediata de UI:**
   La primera carga de catálogo solicita `get_count = false` para no bloquear el First/Largest Contentful Paint esperando el cálculo secuencial del `COUNT(*)` en PostgreSQL. El grid se pinta inmediatamente y el bloque `finally` de `loadAndRenderMovies` retira de inmediato `.is-fetching` y `aria-busy`, devolviendo la opacidad al 100% y liberando los clics sin esperar al conteo. El total se resuelve en segundo plano de forma no bloqueante, actualizando paginación y contadores atómicamente (`applyResolvedTotal`) con cero flicker y cero reconstrucción de tarjetas.
8. **Navegación Fluida sin Parpadeo de Skeletons (*In-Flight Stale Grid*):**
   Al cambiar de página o filtro con contenido ya visible, se conserva temporalmente el grid anterior con estado visual de carga discreto (`.grid-container.is-fetching`, opacidad 0.6 y `aria-busy="true"`), sustituyendo el DOM de una sola vez al llegar la nueva respuesta y reservando el esqueleto únicamente para la primera carga o contenedores vacíos.
9. **Camino LCP Optimizado y Gestión de Preloads:**
   Garantía de que exactamente una sola imagen en pantalla (tarjeta VIP en posición 0 o primera película) ostente `fetchpriority="high"` y `loading="eager"`. Eliminación de instancias redundantes de `new Image()` en `applyLqipImage` (reutilizado tanto en catálogo como en la modal y fichas de personas VIP), unificando el ThumbHash como `backgroundImage` directo y conectando el `src` al elemento `<img>` del DOM. Reutilización higiénica de un único elemento `<link data-lcp-preload="true">` en `<head>` para evitar preloads huérfanos acumulativos.
10. **Determinación Certera de Estado VIP y Consistencia de Offset:**
   Para personas (directores/actores), la condición VIP (`vip === 1` o `birthday`) se resuelve con certeza antes de calcular los parámetros de paginación del catálogo (`personCache` en 0 ms si ya está en memoria). Si la persona no es VIP, se solicita el `fetchLimit` íntegro en pág. 1 y el offset estándar `(page - 1) * basePageSize` en pág. 2+, previniendo la pérdida de una película en la primera página o la duplicación de la última película en páginas sucesivas. En grupos (colección/estudio), la tarjeta VIP es determinista y su metadata se paraleliza con `Promise.all`.
11. **Consolidación Canónica de Facetas y Directivas Robots:**
   Colapso estricto de parámetros secundarios y efímeros (`page`, `sort`, filtros combinados) hacia la URL canónica de la categoría base limpia (`getCanonicalUrl`), resolviendo el problema de dispersión de rastreo e indexación duplicada en navegación facetada. Asignación determinista de `noindex, follow` en búsquedas libres y listas privadas, junto a `index, follow, max-image-preview:large` en vistas de catálogo público.
12. **Escalonado Fluido de Cuadrícula con Container Queries Multi-Navegador:**
   Implementación de escalones graduados mediante Container Queries (`@container (min-width: 600px)` para 4 columnas y `@container (min-width: 760px)` para 5 columnas) en el modo exploración, asegurando una densidad visual y tamaño de tarjetas idéntico entre navegadores que integran barras de herramientas fijas (como Opera) y navegadores con viewport despejado (como Chrome).
13. **Optimización de Transición Modal y Depuración de Tooltips:**
   Ajuste de tiempos y aceleración en las transiciones de apertura y cierre de la modal de detalle desde las fichas del grid para una respuesta táctil y visual instantánea, junto con la retirada de atributos redundantes `title="Sinopsis"` en plantillas del cliente y SSR.
14. **Desacoplamiento Modular de Eventos y Prevención de Doble Renderizado (SRP en DOM):**
    Delegación exclusiva de la actualización de fichas al ámbito del propio componente (`card/lifecycle.ts` para `#grid-container` y `modal/events.ts` para la vista rápida), eliminando consultas globales `document.querySelectorAll(".movie-card")` en `main.ts` y dobles invocaciones de `updateCardUI` y `handleCardClick`. Las consultas `window.matchMedia` se cachean a nivel de módulo en $O(1)$, evitando la instanciación de objetos en bucles de alta frecuencia de scroll y touch.
15. **Caché de Proxies Reactivos y Congelación Inmutable (`state.ts` y `contracts.ts`):**
    Uso de `WeakMap` (`proxyCache`) en `makeReactive` para reutilizar proxies hijos en $O(1)$ sin asignaciones de memoria repetidas en lecturas frecuentes del estado (`activeFilters`, `userMovieData`). Congelación atómica (`Object.freeze`) en `normalizeUserMovieEntry` para eludir envolturas reactivas profundas innecesarias en diccionarios voluminosos.
16. **Deduplicación en Vuelo y Marcado Preventivo de Caché de Usuario (`syncManager.ts` y `checkedIds.ts`):**
    Protección contra colisiones paralelas en `mergeOnLogin(userId)` mediante `inFlightMergePromise`, compartiendo la misma promesa de red. Marcado proactivo de los IDs de películas descargadas y consolidadas (`markMovieIdAsChecked`) para que `fetchUserMovieDataForIds` en `renderEngine.ts` omita consultas redundantes a Supabase en la página inicial.
17. **Unificación de Emisiones Reactivas (*SSOT Event Emission*):**
    Centralización estricta de la emisión de `userDataUpdated` exclusivamente dentro de `setUserMovieData` en `state.ts`, eliminando emisiones duplicadas en `syncManager.ts` y `main.ts` que provocaban hasta 3 re-renderizados consecutivos del grid de tarjetas.
18. **Unificación de Temporizadores de Reposo de Scroll (`scrollWatcher.ts`):**
    Fusión de temporizadores independientes de guardado de scroll y prefetch predictivo en un único `scrollIdleTimer` con umbral balanceado a 200 ms, reduciendo al 50% las llamadas a `clearTimeout`/`setTimeout` durante desplazamientos táctiles a 60–120 Hz.
19. **Blindaje de Almacenamiento y Mocking Resiliente (`supabaseClient.ts` y `router.ts`):**
    Encapsulamiento defensivo de `localStorage` y `sessionStorage` en `customAuthStorage` con comprobaciones de entorno y `try / catch` ante restricciones de seguridad (modo incógnito estricto, bloqueo de almacenamiento). Saneamiento de `modalOpen` en History API dentro de `router.ts` y completado de stubs (`.delete()`, `.match()`, `signInWithOtp`) en `mockClient` para ejecuciones de prueba sin credenciales.
20. **Sincronización Simétrica del Estado Contraído del Sidebar (`sidebar/context.ts`, `gestures.ts` e `index.ts`):**
    Unificación SSOT mediante `isSidebarCollapsed()` y `setSidebarCollapsed(collapsed)` que sincroniza simultáneamente `document.documentElement` y `document.body`. Corrige el bloqueo permanente a 65px provocado por el selector `:is(html.sidebar-collapsed, body.sidebar-collapsed)` cuando solo se alternaba en `document.body`, restableciendo la alternancia fluida de ancho (65px ↔ 200px), el icono interactivo (`ICONS.FORWARD` `>>` vs `ICONS.REWIND` `<<`) y el registro de eventos tempranos antes del vencimiento del *idle timer*.
21. **Depuración y Alineación Crítica de `index.html` (Anti-FOUC y Cero CLS):**
    - **Alineación de CSS Crítico (*Above the Fold*)**: Ajuste de `.grid-container` en móviles (`repeat(2, minmax(0, 1fr))` por debajo de 400px), unificación de breakpoints de padding horizontal (`var(--space-lg)` en 769px–1199px y `var(--space-xxl)` a partir de 1200px en `.main-header` y `.content`) y sincronización de variables de radio `--radius-lg`, `--radius-xl` y `--radius-xxl` con `variables.css`, erradicando saltos acumulativos de diseño (*Cumulative Layout Shift* = 0.000).
    - **Eliminación de Código Muerto en DOM y CSS**: Supresión de la plantilla huérfana `#sidebar-skeleton-template` y sus clases en `ui.css`, retirada de `#active-filters-container` y `#total-results-sidebar` (junto con la regla `#total-results-sidebar { display: none !important; }`), y eliminación del control invisible e inaccesible `<select id="sort-select">` con su manejador `handleSortChange` y selectores en `ui.ts` y `constants.ts`.
    - **Saneamiento Accesible y Limpieza de Estilos**: Asignación de `id="quick-view-title"` en `<template id="quick-view-person-template">` para satisfacer `aria-labelledby="quick-view-title"` en la modal rápida de fichas VIP (WCAG 2.1 AA) y retirada de estilos `style` inline redundantes en `.bio-headline` de las plantillas de personas.
22. **Auditoría Integral de Iconos Vectoriales y Optimización de Sprites SVG (`src/sprite.svg`, `src/flags.svg`, `scripts/sync-sprites.mjs`, `vite.config.js` y `src/js/constants.ts`):**
    - **Saneamiento Estructural y Supresión de Huérfanos**: Cierre de la etiqueta `</symbol>` faltante en `#icon-bbc`, supresión de símbolos obsoletos no referenciados (`#icon-film` y `#icon-hbo`), incorporación de `#icon-eye-off` para alternancia de visibilidad de contraseñas, y renombrado de gradientes `<linearGradient id="a|b">` a `id="nf-a|nf-b"` en `#icon-netflix` para prevenir colisiones en el espacio de nombres global del DOM.
    - **Unificación DOM e Instanciación SSOT (`<use href="#...">`)**: En `src/js/constants.ts`, sustitución de cadenas de geometría inline duplicada en `ICONS` (`PAUSE`, `REWIND`, `FORWARD`, `PLAY`, `CHEVRON_RIGHT`, `LIST`) por referencias directas al sprite SVG, garantizando consistencia estructural con el HTML inicial y reduciendo el peso del bundle JS. Unificación análoga en `#sort-dropdown-trigger` y en el botón de visibilidad de contraseña en formularios de autenticación y perfil.
    - **Depuración de Comentarios en Doble Canal (-5,6 KB)**: Despojado automático de 166 comentarios XML (`/<!--[\s\S]*?-->/g`) y líneas vacías redundantes tanto en el plugin de inyección SPA (`inlineSvgSpritesPlugin` en `vite.config.js`) como en la generación de assets públicos para CDN/SSR (`copyCleanSprites` en `scripts/sync-sprites.mjs`), preservando los comentarios y documentación íntegros en los archivos fuente de desarrollo.
    - **Corrección de Estados de Calificación en Modal Móvil (`rating.ts` y `rating.css`)**: Implementación de las clases canónicas `.has-user-rating` e `.is-rating-preview` para evitar que las estrellas queden teñidas de amarillo al desvotar en dispositivos táctiles sin evento `mouseleave`, restableciendo el tono gris neutro de la calificación comunitaria.
23. **Paridad Funcional, Seguridad de Enlaces y Optimización Perimetral (`cloudflare/`, `src/shared/`, `src/js/`):**
    - **Normalización de Texto y $O(1)$ en Slugs y Actores Ignorados**: Unificación de `toSlug` en `slugs.ts` delegando en `normalizeText` de `formatters.ts` (eliminando 14 llamadas regex encadenadas duplicadas), simplificación $O(1)$ en `genreToSlug` y migración a `IGNORED_ACTORS_SET.has()` en componentes (`cardElement.ts`, `modal/renderer.ts`, `api.ts`).
    - **Depuración de Plantillas y Coherencia de Iconografía**: Retirada de referencia huérfana `starsText` en `profile.ts`, unificación del botón de cierre con `<use href="#icon-close">` en `profileModal.ts` (igual que `legalModal.ts`), icono `#icon-trash` unificado en botón de eliminar cuenta y alternancia reactiva `#icon-eye` / `#icon-eye-off` en contraseña de perfil. Corrección técnica en la tabla de cookies de `legalModal.ts` (`localStorage y Cookie técnica` para Zero-Flicker theme).
    - **Sanitización Estricta de Enlaces Externos en Edge SSR**: Incorporación de `sanitizeExternalUrl` en `render-taxonomy.js` y `render-movie.js`, blindando enlaces a JustWatch, Wikipedia, FilmAffinity e IMDb contra esquemas inseguros o Stored XSS, y aplicando clase `.disabled` sin `href` interactivo ante obras sin identificador externo (idéntico a la SPA).
    - **Modulación Tipográfica de Duración y Paridad en Quick View (`render-movie.js`)**: Adopción de `formatModalDuration` junto al nuevo helper `formatMetaUnitsHtml` en `seo-types.js`, encapsulando palabras y unidades (`ep.`, `min.`, `h.`, `x`, `Película`, `Serie TV`) en `<span class="meta-unit">` con `font-weight: 560` en el SSR de `/titulo/:slug/`.
    - **Corrección Canónica de Breadcrumbs y Eliminación de Redundancia 301**: Reestructuración del `BreadcrumbList` JSON-LD en `render-movie.js` para enlazar exclusivamente a URLs reales que devuelven HTTP 200 OK (`Inicio` $\to$ `/genero/:slug/` $\to$ `/titulo/:slug/`), eliminando enlaces a rutas inexistentes 404 (`/peliculas/` o `/genero/.../peliculas/`). Eliminación de comprobación 301 redundante en Paso 4 de `worker.js`.
    - **Centralización DRY de Helpers y Regeneración de CSS Perimetral**: Traslado de `computePersonAgeInfo` a `seo-types.js` (purgando 50 líneas duplicadas en `render-person.js`), blindaje de desacoplamiento de JS nativo en Node para el Worker, y recompilación perimetral minificada con `build-seo-css.mjs` reduciendo el bundle CSS a 126,9 KB (-57 KB netos).
24. **Robustez PWA, Sincronización de Contratos LLM y Purgado de CSS Perimetral (`public/sw.js`, `src/js/syncManager.ts`, `scripts/`, `cloudflare/seo/`):**
    - **Aislamiento Estricto por Origen en Service Worker (`public/sw.js`)**: Guarda perimetral `if (request.method !== 'GET' || !url.protocol.startsWith('http') || url.origin !== self.location.origin) return;` que asegura aislamiento estricto por origen, evitando que peticiones a Supabase, esquemas `chrome-extension://` o recursos cross-origin queden interceptados indebidamente por las estrategias de caché dinámica del SW.
    - **Receptor Reactivo de Background Sync (`src/js/syncManager.ts`)**: Suscripción al mensaje `{ type: "SYNC_PENDING_ENTRIES" }` emitido por el Service Worker durante el evento `sync`, disparando `scheduleSync(100)` con desuscripción simétrica e idempotente en `initSyncListeners()`.
    - **Sincronización Canónica de Rutas en Especificación de Agentes (`scripts/generate-llms.mjs`)**: Documentación fidedigna de las rutas canónicas del Edge Worker con prefijo dimensional (`/genero/:slug/`, `/estudio/:slug/`, `/seleccion/:slug/`, `/pais/:slug/`) y personas VIP en la raíz canónica (`/:vip-slug/`), distinguiéndolas formalmente de las rutas interactivas de la SPA (`/director/:slug/`, `/actor/:slug/`, combinadas y filtros `no-`). Regeneración sincronizada de `public/llms.txt`, `public/llms-full.txt` y validación estricta en `tests/llms-spec.test.mjs`.
    - **Limpieza de Reglas Muertas y Purgado CSS en Edge (`scripts/build-seo-css.mjs`)**: Eliminación de 143 líneas de selectores duplicados u obsoletos (`.brand-text`, `.mark-v`, `.brand-dot`, `.mark-dot`, `.movie-seo-header`, `.total-results-container`, `.btn-open-spa-subtle`, `.btn-header-cta`, etc.), reduciendo el bundle minificado en memoria de Cloudflare (`cloudflare/seo/seo-card-css.js`) y `public/seo-card-v7.css` a 124.397 bytes (-2,8 KB adicionales).
25. **Optimización de Base de Datos y Aceleración de Filtros en RPC (`database/functions/search_movies_offset.sql`):**
    - **Aislamiento del Daily Showcase en Portada Limpia**: Restricción del barajado diario determinista por fecha exclusivamente a la portada general (`v_has_filters = false`). En cualquier navegación filtrada (géneros, países, estudios, selecciones, años o medios), el orden por relevancia pasa a ser `relevance ASC, id ASC` canónico directo.
    - **Desbloqueo de Early Stop y Latencia Ultra-Baja**: Supresión de las funciones de ventana `COUNT(*) OVER ()` y `ROW_NUMBER() OVER ()` en consultas filtradas, permitiendo que PostgreSQL aproveche escaneos por índice con parada temprana (`LIMIT 42`). La estrategia *Pintar Primero -> Contar Después* pasa a ejecutarse en ~3 ms reales en lugar de los ~40-85 ms previos.
26. **Unificación de Conteo en Filtros y Supresión de RPC Duplicada (`src/js/renderEngine.ts`):**
    - **Petición Unificada con Conteo (`get_count = true`)**: En navegaciones con filtros activos (`hasActiveMeaningfulFilters() || mediaType !== 'all'`), la primera llamada al catálogo solicita directamente el conteo exacto junto con las películas. Esto elimina por completo la segunda petición RPC diferida en segundo plano, reduciendo al 50% las llamadas de red y el consumo de CPU en Supabase/PostgreSQL.
    - **Preservación del Fast-Path en Portada Limpia (`/`)**: En el catálogo general limpio sin filtros se preserva `get_count = false` en la primera carga para aprovechar el Fast-Path (~1.5 ms), manteniendo el conteo diferido en segundo plano exclusivamente para poblar la paginación general.
27. **Paralelización de Personas y Catálogo en Página 1 (`src/js/renderEngine.ts`):**
    - **Supresión de Waterfall en Caché Fría**: Lanzamiento concurrente de `fetchPersonDetails` y `fetchMovies` (`page_limit: 44`, `page_offset: 0`) vía `Promise.all` en la primera página de directores y actores. Ahorra un RTT completo (~80-120 ms) en frío al abrir cualquier autor o intérprete.
    - **Poda Dinámica en Memoria y Blindaje de Offset en Pág > 1**: Si al resolver la persona se confirma estatus VIP, se poda el ítem 44 en memoria a 43 (`firstPageLimit - 1`) antes de evaluar la orfandad y renderizar. En páginas posteriores (`page > 1`), se preserva la resolución previa del estatus (instantánea desde `personCache` en 0 ms) para calcular con precisión absoluta el offset con decremento (`41` o `42`), erradicando duplicados o desfases inter-página.
28. **Consolidación de Desambiguación Autoral en Base de Datos (`src/js/api.ts`):**
    - **Retirada de Filtrado Redundante en Cliente**: Supresión de la post-verificación manual en JavaScript (`result.items.filter(...)`) sobre `parsedDirectors` y `parsedActors`. La desambiguación de homónimos cortos y colectivos se consolida como responsabilidad exclusiva de PostgreSQL (Fases 3.6/3.7 en `search_movies_offset.sql` con índice GIN y `EXISTS unnest`), garantizando coherencia absoluta entre el conteo exacto de la base de datos y los elementos pintados en pantalla, y erradicando el descarte indebido de títulos en autores con nombres de colectivo (ej. Hermanos Russo).
29. **Arquitectura Local-First SWR en "Mi Lista" (`src/js/api.ts`):**
    - **Render Instantáneo a 0 ms**: Consulta prioritaria a `getLocalMyListResponse` contra `cached_movies` en IndexedDB. Si todas las películas de la lista/página están disponibles en el dispositivo, se devuelven de inmediato sin bloquear al usuario en la red.
    - **Revalidación Asíncrona en Segundo Plano**: Si el usuario está conectado y con sesión, `revalidateMyListInBackground` verifica novedades contra Supabase de forma no bloqueante, sincronizando las fichas en caché y actualizando la interfaz únicamente si existen diferencias reales de datos o conteo. En caso de caché fría incompleta, se conmuta de forma transparente a la consulta de red.
30. **Carga Perezosa Condicional de Supabase SDK y Dieta Crítica del Bundle JS (`src/js/supabaseClient.ts`, `src/js/auth.ts`, `src/js/api.ts`, `src/js/main.ts`, `vite.config.js`):**
    - **Aislamiento en Chunk Dinámico de `@supabase/supabase-js`**: Transición del import estático superior a importación dinámica (`const { createClient } = await import("@supabase/supabase-js")`) dentro de `getSupabase()`, junto con la partición explícita de `manualChunks` en Vite (`supabase-vendor`).
    - **Detección de Sesión Sincrónica en 0 ms (`hasStoredAuthSessionOrHash`)**: Comprobación sin coste de red ni parseo de librerías para verificar si existen tokens activos (`sb-*-auth-token`) en `localStorage`/`sessionStorage` o parámetros entrantes de autenticación (`#access_token`, `#refresh_token`, `#type=recovery`, `#error_code`) en la URL.
    - **Arranque Limpio y Desacoplado para Visitantes Anónimos**: Para el 95% de visitantes no logueados, `setupAuthSystem()` se posterga por completo hasta que el usuario hace clic en "Entrar" o se dispara el evento `auth:requested`, eliminando la descarga del SDK pesado en el camino crítico.
    - **Consumo 100% Nativo en Catálogo Público**: Desvinculación de `getSupabase()` en `fetchMovies` para el catálogo público ordinario, delegando exclusivamente en `fetch("/api/rpc/search_movies_offset")` perimetral con fallback resiliente bajo demanda.
    - **Reducción Masiva del Vendor Crítico**: El chunk vendor inicial descargado por el navegador se reduce drásticamente de **241,9 kB (64 kB gzip)** a tan solo **18,1 kB (5,7 kB gzip)** (-223,8 kB raw / -58,3 kB gzip), mejorando sustancialmente las métricas Core Web Vitals (TBT, FCP y LCP) en dispositivos móviles.
31. **Delegación Global de Eventos en Tarjetas y Contenedor de Valoraciones (`src/js/components/card/lifecycle.ts`, `src/js/components/card/cardElement.ts`, `src/js/components/rating.ts`, `src/js/components/modal/events.ts`):**
    - **Supresión de Listeners Individuales en Tarjetas**: Eliminación de `addEventListener("click", handleCardClick)` en cada ficha individual y en tarjetas VIP, delegando el manejo de clics al ancestro `#grid-container` y al contenedor `#quick-view-content` del modal.
    - **Delegación Unificada de Valoraciones (`initRatingInteractions`)**: Centralización de los 5 eventos de calificación (`mouseover`, `mouseout`, `focusin`, `focusout`, `keydown`) en un único grupo de escuchadores fijos a nivel de contenedor.
    - **Reducción a Cero del Tiempo de `initializeCard`**: Las 42 (o 72) tarjetas se montan en el DOM sin ningún listener individual, reduciendo de entre 252 y 432 registros dinámicos por página a únicamente 6 escuchadores delegados persistentes en toda la aplicación, reduciendo la presión sobre el recolector de basura (*Garbage Collector*) y previniendo fugas de memoria en navegaciones rápidas.
32. **Retirada del Subsistema Obsoleto de Lazy Sync por IDs (`src/js/checkedIds.ts`, `src/js/api.ts`, `src/js/renderEngine.ts`, `src/js/components/modal/renderer.ts`):**
    - **Eliminación Total de `checkedIds.ts`**: Fichero íntegro eliminado junto con su caché en memoria `checkedUserMovieIds` y sus funciones `markMovieIdAsChecked`, `isMovieIdChecked` y `clearCheckedUserMovieIds`.
    - **Supresión de `fetchUserMovieDataForIds` en `src/js/api.ts`**: Retirada del endpoint residual y de las consultas fraccionadas `user_movie_entries.in('movie_id', ...)`.
    - **Consolidación Local-First sin Peticiones Fantasma**: El renderizado del grid (`renderEngine.ts`) y la apertura del modal (`renderer.ts`) leen instantáneamente las notas y estados de watchlist desde `state.userMovieData` (hidratado a 0 ms desde IndexedDB con `getAllLocalEntries` y sincronizado en `mergeOnLogin`), eliminando 1 petición de red en cada cambio de página y 1 en cada apertura de modal, y erradicando cualquier riesgo de flicker o layout thrashing.
33. **Desacoplamiento y Diferimiento de Metadatos JSON-LD en la SPA (`src/js/renderEngine.ts`):**
    - **Supresión de JSON-LD en Navegación Interactiva**: Eliminación de la regeneración síncrona de `ItemList` (20 películas) y `BreadcrumbList` en cada cambio de filtro, paginación o desplazamiento del control de años.
    - **Preservación Instantánea de Metadatos de Usuario**: `updatePageTitle()` mantiene la sincronización en tiempo real de `document.title`, `<link rel="canonical">`, OpenGraph y directivas `meta robots` para el usuario y navegador.
    - **Diferimiento Asíncrono no bloqueante en Arranque en Frío (`scheduleInitialSeo`)**: Los esquemas Schema.org se inyectan única y exclusivamente una vez durante la carga inicial desvinculados del camino crítico mediante `runWhenIdle()`, reduciendo a cero el bloqueo del hilo principal (TBT e INP) y eliminando la presión innecesaria sobre el recolector de basura (*Garbage Collector*).
34. **Curaduría Estática en Cliente y Cierre de Fuga del SDK de Supabase (`src/js/constants.ts`, `src/js/utils.ts`, `src/js/components/sidebar/index.ts`, `src/js/api.ts`):**
    - **Eliminación Total de Peticiones RPC de Descubrimiento**: Supresión de `fetchRandomTopActors` y `fetchRandomTopDirectors` en `api.ts`, ahorrando 2 llamadas RPC (`get_random_top_actors` y `get_random_top_directors`) en cada inicio de sesión.
    - **Blindaje Absoluto del Bundle Diet de Auth**: Erradicado el "Caballo de Troya" que activaba `getSupabase()` a los 500 ms de arrancar la aplicación, garantizando que el paquete pesado de Supabase jamás se descargue para visitantes anónimos en la carga inicial ni en el sidebar.
    - **Piscinas Curadas de 100 Directores y 100 Actores (`CURATED_DIRECTORS` / `CURATED_ACTORS`)**: Definición en `constants.ts` de 100 directores y 100 actores legendarios e icónicos (100% verificados contra la base de datos de personas).
    - **Poblado Síncrono a 0 ms con Barajado Local $O(k)$ (`getRandomSubarray`)**: El sidebar selecciona 5 nombres al azar de forma instantánea y uniforme al montar los filtros, eliminando tareas diferidas en `runWhenIdle`, parpadeos visuales al desplegar los acordeones y garantizando operatividad 100% Local-First / Offline.
35. **Control de Frecuencia y Aleatoriedad del Flip Onboarding (`src/js/components/card/index.ts`, `src/js/renderEngine.ts`):**
    - **Restricción a Portada Limpia (`isCleanHome`)**: La animación de aprendizaje 3D solo se agenda en la página 1 limpia del catálogo general (`/`), erradicando giros molestos cuando el usuario filtra por género, país, estudio, autor o búsquedas.
    - **Límite Estricto de 10 Ejecuciones con Persistencia (`videoclub:flip_onboarding_count`)**: Contador en `localStorage` que desconecta por completo la lógica a 0 ms tras 10 giros, eliminando temporizadores residuales y repintados 3D para usuarios consolidados.
    - **Selección Aleatoria Dinámica entre las Primeras 4 Fichas**: El objetivo del giro se elige uniformemente al azar entre las 4 primeras tarjetas de la fila superior, aportando una experiencia de descubrimiento orgánica y no monótona.
36. **Optimización de GPU en Overlays y Toasts (Híbrido Quirúrgico de `backdrop-filter`, `src/css/components/`):**
    - **Coste Cero en Dispositivos Móviles (`<= 768px`) y Táctiles**: Supresión de `backdrop-filter: blur(...)` en `.quick-view-overlay`, `.auth-overlay`, `.profile-overlay`, `.legal-overlay` y `.sidebar-overlay`, sustituyéndolo por un scrim oscuro cinematográfico (`rgba(0, 0, 0, 0.68)`). Elimina por completo los pases de convolución gaussiana en GPU durante el arrastre táctil (*swipe-down*) y aperturas de modales a 120 FPS.
    - **Purga Universal en Toasts**: Eliminación de `backdrop-filter` en `.toast`, erradicando el cálculo de sombreado invisible bajo fondos con 95% de opacidad.
    - **Preservación del Glassmorphism en Escritorio (`> 768px`)**: Mantenimiento del desenfoque sofisticado en modales centradas de sobremesa con soporte para aceleración de hardware y respeto estricto a `prefers-reduced-transparency`.
37. **Optimización 2D y Poda Estructural de Layout en Modo Muro (`src/css/components/card.css`):**
    - **Poda de Layout y Render Tree (`display: none !important`)**: En Modo Muro (`body.rotation-disabled`), se suprime por completo `.flip-card-back` del árbol de renderizado. Esto elimina más de 1.500 nodos DOM invisibles (sinopsis, repartos, directores, botones de acción) del flujo de cálculo geométrico en las 72 tarjetas simultáneas.
    - **Aplanamiento a 2D y Liberación de VRAM (`perspective: none` y `transform-style: flat`)**: Se anula el contexto de perspectiva 3D en `.movie-card:not(.is-quick-view)` y se aplana `.flip-card-inner` a 2D (`transform: none !important`), permitiendo que el compositor de la GPU gestione las 72 carátulas como texturas planas ordinarias. Reduce drásticamente la ocupación de memoria de vídeo (VRAM) y garantiza scroll ultra-fluido a 120 FPS sin matrices de transformación 3D activas.

38. **Poda de Pseudo-Ripple y Liberación de Contextos de Apilamiento en Botones (`src/css/components/button.css`):**
    - **Supresión de Pseudo-Ondas (`&::after`)**: Eliminación del efecto de onda expansiva (*ripple*) centrado en `.btn`, erradicando transiciones de 0,6 s y nodos DOM espurios en el árbol de renderizado de cada botón de la aplicación.
    - **Liberación de Aislamiento y Desbordamiento (`isolation: isolate` y `overflow: hidden`)**: Eliminación de la creación forzada de contextos de apilamiento independientes en GPU por botón y desbloqueo del desbordamiento para garantizar que anillos de foco accesibles (`:focus-visible`) no queden recortados.
    - **Consolidación del Feedback Táctil Mecánico (`:active`)**: Unificación de la microinteracción de pulsación con escala limpia (`scale(0.97)`), hundimiento de 1 px y sombra interna a 50 ms, reforzando la coherencia con el diseño *Quiet Luxury*.

39. **Congelación de Animación del Hero en Scroll (`src/css/layout.css`):**
    - **Supresión de Ticks en Compositor**: Cuando `#landing-hero` pasa al estado `.is-scrolled-away` al descender por el catálogo, se aplica `animation-play-state: paused` sobre `.landing-hero-description`.
    - **Ahorro de GPU y Batería**: Congela los cálculos del bucle infinito de 30s (`heroTaglineCrossfade`) sobre los 6 párrafos cuando el Hero está oculto, liberando a la GPU de animar capas invisibles y reanudando la rotación de forma fluida al volver a la parte superior de la portada.

40. **Carga Diferida de CSS en Modales de Autenticación y Perfil (`src/css/main.css`, `src/js/`):**
    - **Poda del CSS Crítico Inicial (-24,8 KB raw / ~19 KB minificado)**: Retirada de `@import "components/auth.css"` y `@import "components/profile.css"` del archivo CSS bloqueante principal (`main.css`), reduciendo un ~14% el peso del bundle que compite por el First Contentful Paint.
    - **Carga Asíncrona sin FOUC (`loadAuthStyles` y `profile.css`)**: `openAuthModal` asegura la resolución asíncrona de los estilos antes de retirar el atributo `hidden` del modal, garantizando cero destellos de contenido sin estilos.
    - **Pre-carga en Inactividad (*Idle Prefetch*)**: Invocación en segundo plano durante periodos ociosos del navegador (`runWhenIdle` a 1000 ms) para pre-calentar `auth.css` y, si el usuario tiene sesión activa, el chunk de `profile.js` + `profile.css`, asegurando apertura instantánea a 0 ms.

41. **Supresión de Máscaras Alfa en Scroll de la Modal (`src/css/components/modal.css`, `src/js/components/modal/`):**
    - **Scroll 100% Nativo en GPU**: Eliminación de `-webkit-mask-image` y `mask-image` lineales en `.quick-view-content` y `.quick-view-column`, erradicando la recomposición obligatoria de texturas en superficies intermedias (*Render Targets*) durante el desplazamiento táctil.
    - **Poda de Listeners y Clases Fantasma**: Supresión de la conmutación de `.is-scrolled` y de falsas transiciones CSS sobre degradados de máscara en `modal/events.ts` y `modal/renderer.ts`.
    - **Fluidez y Legibilidad**: Desplazamiento nativo a 120 FPS sin tirones (*zero jank*) en WebKit (iOS) y Blink (Android), garantizando nitidez tipográfica total sin degradados que emborronen el texto.

42. **Acabado Editorial de "Placa Inaugural" en Tarjetas VIP (`src/css/components/card.css`):**
    - **Invariante Geométrica de Imagen (1:1 con Películas)**: Eliminación de la sobreescritura de bordes en `.person-card .poster-container img`, garantizando que el retrato ocupe exactamente las mismas dimensiones (250px × 318px), passepartout (`var(--space-xxs) solid var(--color-surface)`) y radio de curvatura (`var(--radius-xxl)`) que los carteles del catálogo.
    - **Encuadre y Textura "Quiet Luxury" Exclusivo en CSS**: Distinción visual de autor sin añadir nodos HTML mediante filete perimetral en oro viejo de 2px (`rgba(var(--color-brand-gold-rgb), 0.85)`), ribete interior en el retrato (`outline-offset: -2px`), halo lumínico de exposición, iluminación cenital radial sobre fondo carbón noble (`#151619`) y haz divisorio cinematográfico.
    - **Jerarquía Tipográfica y Modo Muro**: Tipografía de autor reforzada (`font-weight: 800; letter-spacing: 0.015em;`), titular de biografía en oro (`.bio-headline`), botón de rol dual (D/A) estilizado y nombre destacado en oro envejecido en Modo Muro (`.wall-person-name`).

43. **Punto Único de Entrada e Inicialización Idempotente en Auth Modal (`src/js/ui.ts`, `src/js/main.ts`, `src/js/auth.ts`):**
    - **Resolución de Carrera y Cobertura Total**: Integración de la llamada a `initAuthForms()` directamente dentro de `openAuthModal()` tras `ensureAuthModalMounted()`, garantizando que tanto los clics directos como las aperturas inducidas (voto o watchlist de usuarios anónimos) dispongan de formularios enlazados con sus submit listeners y conmutadores de contraseña.
    - **Poda de Listener Duplicado**: Eliminación del listener asíncrono redundante sobre `#login-button` en `main.ts` que podía ejecutarse antes del montaje del DOM.
    - **Blindaje de Idempotencia**: Incorporación del flag `authFormsInitialized` en `auth.ts` para evitar la duplicación de listeners ante aperturas sucesivas del modal.

44. **Paridad de Ordenación por Relevancia y Cero Parpadeo en Mi Lista (`src/js/api.ts`, `database/functions/search_movies_offset.sql`, `src/shared/types.ts`):**
    - **Inclusión de `relevance` en Proyecciones**: Incorporación de la columna `relevance` en las dos consultas `.select(...)` de `api.ts`, en el tipo canónico `Movie` / `SupabaseMovieRow` y en las dos ramas SELECT de `search_movies_offset.sql`.
    - **Desempate Canónico por ID (`a.id - b.id`)**: Actualización de la función de ordenación local en `getLocalMyListResponse` con control seguro de nulos y desempate por `id`, reflejando exactamente el `.order('id', { ascending: true })` en las consultas de Supabase.
    - **Erradicación de Falsos Positivos en SWR**: Al coincidir la ordenación local con la remota, `revalidateMyListInBackground` deja de detectar discrepancias espurias (`hasDifferences = true`), eliminando parpadeos y re-renderizados fantasma tras 50 ms.

45. **Extensión del Fast-Path de Portada Limpia a Conteo Directo (`database/functions/search_movies_offset.sql`):**
    - **Desacoplamiento de `get_count` en Fase 1.6**: Retirada de la restricción `AND NOT get_count` en la condición del Fast-Path del escaparate diario limpio (portada sin filtros dentro de los 378 títulos del pool).
    - **Conteo Index-Only Instantáneo (~2 ms)**: Resolución de `total` mediante `CASE WHEN get_count THEN (SELECT count(*) FROM public.movies) ELSE -1 END`, sustituyendo el costoso desvío a la Fase 4 (que ejecutaba `ROW_NUMBER() OVER ()`, `COUNT(*) OVER ()` y `hashtext()` sobre las 14.564 filas) por un escaneo directo de índice sin degradar la latencia de la llamada en segundo plano (50 ms).

46. **Extensión de Modo Muro a Colecciones y Estudios (`src/css/components/card.css`, `src/js/components/card/cardElement.ts`):**
    - **Generalización de Selectores de Modo Muro**: Sustitución de `.movie-card.person-card` por la tríada `:is(.person-card, .collection-card, .studio-card)` en las reglas de `card.css` que gestionan `.card-rating-block` y `.wall-person-name` bajo `body.rotation-disabled`.
    - **Identidad Semántica en Estudios**: `createGroupCardElement` reemplaza dinámicamente `collection-card` por `studio-card` en nodos de estudio, asegurando alineación visual perfecta del título en oro (`var(--color-brand-gold)`) bajo el cartel y supresión limpia de estrellas en todas las tarjetas de cabecera #0.

47. **Paridad Geométrica y Cero CLS en Esqueletos de Modo Muro (`src/css/components/ui.css`):**
    - **Unificación de Relación de Aspecto (`aspect-ratio: 2 / 3`)**: Corrección del ratio en `.skeleton-card` bajo `body.rotation-disabled` (anteriormente `2 / 3.2`), igualando con exactitud matemática el ratio de las tarjetas hidratadas reales (`card.css`).
    - **Erradicación de Saltos Visuales**: Elimina la contracción del 6,67% en la altura de fila durante la transición de carga a catálogo en Modo Muro, asegurando estabilidad visual absoluta (*Cumulative Layout Shift* = 0).

48. **Resolución de Condición de Carrera en Recarga de Mi Lista (`src/js/api.ts`, `src/js/main.ts`):**
    - **Auto-hidratación Local-First Inmediata en `getLocalMyListResponse`**: Si la memoria reactiva (`state.userMovieData`) arranca vacía durante una recarga en frío o F5, la función lee y puebla directamente las entradas desde IndexedDB (`await getAllLocalEntries()`) antes de evaluar los IDs de películas, erradicando falsos positivos de lista vacía.
    - **Fallback Transparente a Red ante Sesión Activa**: Si la base local no dispone de registros pero el usuario cuenta con token de sesión (`hasStoredAuthSessionOrHash()`), `getLocalMyListResponse` retorna `null` para que `fetchMovies` consulte Supabase y descargue el catálogo privado en lugar de mostrar «No se encontraron resultados».
    - **Desacoplamiento de Renderizado en `handleDataRefresh`**: La hidratación en `getLocalMyListResponse` alimenta directamente la carga inicial legítima sin requerir re-renderizados superpuestos desde `handleDataRefresh`, previniendo colisiones de aborto y congelaciones en modo pálido.

49. **Evolución Quiet Luxury de Píldoras de Filtros en Sidebar (`src/css/components/sidebar.css`):**
    - **Poda de Degradados Obsoletos**: Supresión del gradiente diagonal a 45° y de la inversión a texto negro en modo oscuro (`color: var(--color-bg)`), sustituyéndolos por superficies nobles con texto blanco nítido y micro-bordes de precisión.
    - **Encuadre de Oro Viejo en Modo Oscuro**: En tema oscuro, `.filter-pill` adopta fondo carbón (`var(--color-surface-2)`) con ribete fino en oro viejo (`1px solid rgba(var(--color-brand-gold-rgb), 0.5)`), alineando la identidad del sidebar con los botones de ordenación y el Bento Grid.
    - **Microinteracción Reactiva en Botón de Retirada (`×`)**: `.remove-filter-btn` transiciona su aspa hacia oro envejecido (`var(--color-brand-gold)`) en *hover*, con opacidad y escalado balanceados. Píldoras de exclusión armonizadas con fondo óxido translúcido y borde carmín.

50. **Tipografía Cinematográfica y Proporción del Año en Modal de Vista Rápida (`src/js/components/modal/renderer.ts`, `src/css/components/modal.css`):**
    - **Normalización Ortográfica y Escala del Año (`1994` a `1.65rem`)**: Eliminación del separador de millar artificioso (`1.994`) en `renderer.ts`, restaurando el formato cinematográfico estándar de 4 dígitos. Reducción de la escala tipográfica en `modal.css` de `2.4rem` a `1.65rem`, devolviendo la jerarquía visual de cabecera al título de la película (`2.05rem`).
    - **Preservación de Versalitas y Estilo Clásico en Metadatos**: Mantenimiento de la identidad visual de catálogo con versalitas (`font-variant: small-caps`) y punto final en los encabezados `Género.`, `Reparto.` y `Sinopsis.`.

51. **Erradicación de Doble Carga y Descongelación del Modo Pálido en Mi Lista (`src/js/main.ts`):**
    - **Poda de Re-renderizado Parásito en `handleDataRefresh`**: Supresión de la invocación redundante a `loadAndRenderMovies` dentro de `handleDataRefresh` al escuchar `userDataUpdated`. La carga legítima inicial del catálogo (`init`) ya dispone de todas las películas locales desde el primer milisegundo gracias a `getLocalMyListResponse` (`api.ts`).
    - **Eliminación de Abortos en Vuelo y Limpieza de `.is-fetching`**: Al no dispararse una segunda carga superpuesta sobre la primera, la señal de aborto (`signal.aborted`) permanece en `false`, permitiendo que el bloque `finally` de `renderEngine.ts` retire limpiamente la clase `.is-fetching`, restaurando el brillo al 100% y eliminando el parpadeo y la congelación en modo pálido.

52. **Paridad Completa de Tarjetas de Estudio en CSS e Interacciones JS (`src/css/components/card.css`, `src/js/components/card/cardElement.ts`, `src/js/components/card/lifecycle.ts`):**
    - **Inclusión de `.studio-card` en Reglas de Centrado y Metadatos**: Actualización de selectores en `card.css` con `:is(.collection-card, .studio-card):not(.is-quick-view)` para `.movie-summary`, `.movie-meta`, `.poster-container img` y el efecto LQIP de desenfoque progresivo.
    - **Guardas de No-Rotación en Interacciones Táctiles y Hover**: Integración de la comprobación `card.classList.contains('studio-card')` en `startFlipTimer`, `handleSingleTap` (`cardElement.ts`), `handlePointerOver` y `handlePointerUp` (`lifecycle.ts`), blindando a las tarjetas de estudio frente a giros indeseados y caras traseras vacías.

53. **Paridad del Año Sin Punto en Edge SSR (`cloudflare/seo/render-movie.js`):**
    - **Alineación con Contrato 22.1**: Simplificación de la plantilla de año en `render-movie.js`, erradicando la inyección obsoleta de punto de millar (`1.994`) y garantizando paridad exacta del año cinematográfico estándar de 4 dígitos (`1994`) entre la SPA interactiva y el renderizado SSR en Cloudflare Workers.

54. **Reconciliación SWR en Caliente para Mi Lista ante Discrepancias Remotas (`src/js/api.ts`, `src/js/state.ts`, `src/js/main.ts`):**
    - **Evento Desacoplado `'myList:revalidated'`**: Si la revalidación en segundo plano (`revalidateMyListInBackground`) detecta diferencias reales entre la nube y la caché local (`hasDifferences`), sincroniza las entradas en memoria/IndexedDB, guarda la respuesta remota en `queryCache` y emite el evento `'myList:revalidated'`.
    - **Consumo Efímero de Caché en `fetchMovies`**: El motor de API permite consumir entradas de `queryCache` para `myList` purgándolas inmediatamente de un solo uso, lo que permite que `loadAndRenderMovies` refresque suavemente el catálogo sin esqueletos (`forceSkeleton: false`) cuando hay cambios remotos, sin dispararse jamás en arranques ordinarios ni abortar la carga inicial limpia de F5.

55. **Corrección de Cast Numérico en Ingesta ETL de Personas (`database/script.sql`):**
    - **Causa Raíz (Evaluación No Cortocircuitada en PostgreSQL)**: En `process_staging_data()`, la condición `(p.country_id ~ '^[0-9]+$' AND c.id = p.country_id::int)` fallaba con `ERROR: 22P02: invalid input syntax for type integer: "francia"` porque el optimizador (*query planner*) de PostgreSQL reordena las subexpresiones del `LEFT JOIN`, intentando castear `p.country_id::int` sobre nombres textuales antes de evaluar la expresión regular.
    - **Resolución con `CASE WHEN` Estricto**: Sustitución por `c.id = CASE WHEN TRIM(p.country_id) ~ '^[0-9]{1,5}$' THEN TRIM(p.country_id)::int END`, garantizando que la conversión entera sólo se intente cuando la cadena consta exclusivamente de dígitos, permitiendo resolver códigos ISO y nombres de países (como 'Francia' $\to$ `name_norm = 'francia'`) con total inmunidad a excepciones.

56. **Resolución Canónica y Supresión de Slugs en Píldoras de Directores y Actores (`src/js/components/sidebar/filters.ts`, `src/js/renderEngine.ts`, `src/js/api.ts`, `database/script.sql`):**
    - **Regla Estricta de Negocio ("Nombre Bien Escrito o No Salir")**: Las píldoras de directores y actores en la barra lateral solo deben contener el nombre canónico y correctamente capitalizado de la persona (ej. "Juan Antonio Bardem") o no renderizarse en absoluto si se trata de un slug crudo no verificado (ej. `juan-antonio-bardem`) o un nombre inexistente.
    - **Normalización de Guiones en Sugerencias y Selección (`api.ts`, `filters.ts`)**: `fetchDirectorSuggestions` y `fetchActorSuggestions` ahora resuelven términos con guiones normalizándolos a espacios como alternativa automática si el término directo no arroja coincidencias. En `selectCandidate`, si las sugerencias no devuelven resultado, se invoca `fetchPersonDetails` contra la base de datos para recuperar el nombre canónico oficial antes de aplicar el filtro. Si no existe en la base de datos, no se aplica ningún filtro ni se dibuja píldora alguna.
    - **Filtrado de Slugs en Píldoras (`isRawPersonSlug`) y Re-renderizado Reactivo**: `renderFilterPills` suprime la generación de etiquetas para cadenas que cumplan el patrón de slug crudo (`val === val.toLowerCase() && val.includes('-') && !val.includes(' ')`) a menos que ya exista un nombre canónico en `personCache`. Al resolver los detalles en `renderEngine.ts`, se emite `updateSidebarUI` para refrescar reactivamente la píldora al nombre oficial ("Juan Antonio Bardem") o retirarla si la persona resulta ser inexistente.

57. **Búsquedas de Personas con Iniciales Sin Punto (`src/js/api.ts`, `src/js/components/sidebar/filters.ts`, `database/script.sql`):**
    - **Generador de Variantes Ortográficas y Fonéticas (`getAlternativeSearchTerms`)**: Admite patrones como "j j abrams" o "jj abrams" expandiéndolos de forma no destructiva a variantes con punto canónicas (`j.j. abrams`, `j. j. abrams`), al igual que iniciales intermedias ("david o russell" $\to$ `david o. russell`) o iniciales solitarias ("m night shyamalan" $\to$ `m. night shyamalan`).
    - **Tolerancia a Puntuación en Base de Datos**: Las funciones SQL `get_actor_suggestions` y `get_director_suggestions` incorporan cláusulas para emparejar registros con iniciales abreviadas (`replace(name_norm, '.', ' ')` y `replace(name_norm, '.', '')`) permitiendo que la sugerencia canónica "J.J. Abrams" aparezca en tiempo real en el autocompletado mientras el usuario teclea sin puntos.

58. **Erradicación del Retardo y Salto Visual en Tooltip de Votos de Trasera (`src/css/components/rating.css`):**
    - **Causa Raíz (Conflicto de Sobrescritura de `transform` en `@keyframes`)**: El selector `&[data-votes]:hover::after` declaraba `transform: translateX(-50%) translateY(-5px)` junto a `animation: fade-in-subtle 0.2s ease-out`. Dado que `@keyframes fade-in-subtle` solo definía `transform: translateY(...)`, el motor de renderizado del navegador anulaba `translateX(-50%)` durante los 200 ms de la animación. El tooltip se desplazaba temporalmente hacia la derecha sobre el borde de `.flip-card-back` (`overflow: hidden`), recortando la palabra `" votos"`. Al culminar la animación, la recuperación súbita del centrado horizontal causaba un desagradable parpadeo escalonado donde parecía cargar primero el número y luego la palabra.
    - **Solución Desacoplada y Atómica (`tooltip-fade-in`)**: Sustitución por `bottom: calc(100% + 5px)` y `transform: translateX(-50%)` invariante en CSS estático, junto con una animación dedicada `tooltip-fade-in` de 0.12s que actúa exclusivamente sobre `opacity` sin alterar la matriz de transformación en ningún fotograma, garantizando sincronía milimétrica y centrado instantáneo sin recortes.

59. **Paridad Cromática y Coherencia de Marca en Fichas VIP (`src/css/components/card.css`, `src/css/variables.css`, `docs/contracts.md`):**
    - **Paridad de Superficie con Fichas de Película**: Eliminación del degradado radial cenital con matiz dorado/carbón en `.flip-card-front`. La tríada VIP (`.person-card`, `.collection-card`, `.studio-card`) unifica su superficie a `background-color: var(--color-surface-1)` (blanco `#ffffff` en modo claro, gris carbón `#242424` en modo oscuro), replicando al 100% el fondo de las fichas de película.
    - **Borde y Ribete en Color Corporativo Invariante**: Erradicación del filete y halo dorado en el marco exterior (`box-shadow: 0 0 0 2px var(--color-accent)`) y en la foto interior (`outline: 2px solid var(--color-accent); outline-offset: -2px;`).
    - **Coherencia Bimodal (Claro y Oscuro)**: Los acentos de ficha VIP emplean automáticamente la variable de marca `var(--color-accent)` (`#37474f` pizarra oscuro en tema claro; `#b0bec5` pizarra plateado en tema oscuro), extendiéndose homogéneamente a la línea divisoria inferior, el botón de rol dual (D/A), el titular biográfico de la trasera (`.bio-headline`) y el nombre en Modo Muro (`.wall-person-name`).

60. **Invariante de Espaciado No Colapsable en Miniseries `(M)` (`src/js/components/card/cardElement.ts`, `src/js/components/modal/renderer.ts`, `src/css/components/card.css`, `src/css/components/modal.css`, `cloudflare/seo/`):**
    - **Causa Raíz (Colapso de Espacios ASCII en Flexbox Anónimo)**: El contenedor `[data-template="year"]` utiliza `display: inline-flex` para alinear verticalmente el año con la bandera del país. En la especificación W3C de CSS Flexbox, los espacios en blanco iniciales en nodos de texto secundarios (*anonymous flex items*) se colapsan a 0, provocando que `(M)` quedara visualmente pegado al año (`2019(M)`).
    - **Solución No Divisible Bimodal (`\u00A0` + `white-space: pre`)**: Sustitución sistemática por espacio no divisible (`\u00A0` en DOM SPA y `&nbsp;` en Edge SSR) junto con `white-space: pre` en `[data-template="year"]`. El espacio se renderiza con total nitidez métrica (`2019 (M)` y `2019-20 (M)`) en todas las tarjetas del catálogo, modal y páginas SEO perimetrales.

---

## 📐 2. Registro Histórico de Micro-Contratos y Decisiones UI

A continuación se preservan las especificaciones técnicas puntuales desarrolladas durante la evolución de componentes y micro-interacciones:

## 5. Contrato de Autenticación Diferida (Lazy-Loading de Auth y Supabase SDK)

1. **Detección Instantánea de Sesión (`hasStoredAuthSessionOrHash`)**:
   - Comprobación síncrona en 0 ms que precede a cualquier carga de librerías.
   - Evalúa `localStorage` y `sessionStorage` buscando claves de token (`auth-token` o `sb-`).
   - Evalúa `window.location.hash` buscando parámetros de redirección OAuth, Magic Link o recuperación de contraseña (`access_token=`, `refresh_token=`, `error_code=`, `error=`, `type=recovery`).
   - Si no existen indicios de sesión, el usuario se clasifica como visitante anónimo puro.

2. **Diferimiento del SDK (`@supabase/supabase-js`)**:
   - Para visitantes anónimos, la ejecución de `setupAuthSystem()` y la importación del paquete `supabase-vendor` se postergan hasta que el usuario realiza una acción autenticada: clic en el botón *"Entrar"* (`#login-button`) o emisión del evento global `auth:requested` (ej. al abrir el modal de autenticación vía `openAuthModal()`).
   - La navegación general, filtrado por facetas y ordenación en el catálogo público se ejecutan exclusivamente contra el endpoint nativo `/api/rpc/search_movies_offset` sin requerir la presencia ni inicialización del cliente de Supabase.
   - En caso de usuarios con sesión previa o retorno de enlaces mágicos, la inicialización es inmediata en el arranque (`init()`), preservando el flujo continuo de autenticación y la sincronización Local-First.


## 6. Contrato de Delegación de Eventos en Tarjetas y Calificaciones

1. **Desacoplamiento Estructural de Tarjetas**:
   - Las tarjetas generadas mediante `createCardElement` y `createPersonCardElement` son nodos pasivos que no registran escuchadores `click` ni de valoración individuales.
   - La función `initializeCard(card)` opera como un no-op de compatibilidad a 0 ms.

2. **Delegación a Nivel de Contenedor Ancestral**:
   - `#grid-container` (en la vista de cuadrícula) y `#quick-view-content` (en la vista modal) asumen la orquestación centralizada de eventos mediante burbujeo (*Event Bubbling*).
   - **Clics**: `handleCardClick` resuelve dinámicamente la tarjeta contextual mediante `event.target.closest(".movie-card")`.
   - **Valoraciones (`initRatingInteractions`)**: Los eventos `mouseover`, `mouseout`, `focusin`, `focusout` y `keydown` se gestionan en el contenedor raíz, resolviendo `.star-icon` y `[data-action="set-rating-estrellas"]` dinámicamente.
   - Al sustituir la cuadrícula con `replaceChildren`, los nodos se destruyen de forma limpia sin requerir desmontaje manual de escuchadores ni generar presión sobre el recolector de basura.


## 7. Contrato de Sincronización Local-First de Datos de Usuario (Supresión de Lazy Sync por IDs)

1. **Estado Canónico en Memoria e IndexedDB (Zero Lazy Sync)**:
   - Los datos de usuario (valoraciones `rating`, estado de seguimiento `is_watchlist`, etc.) se gestionan exclusivamente bajo arquitectura Local-First.
   - Al arrancar la aplicación o completar el inicio de sesión, el estado local (`state.userMovieData`) se hidrata a 0 ms desde IndexedDB (`getAllLocalEntries`) y se sincroniza en bloque con Supabase mediante `mergeOnLogin()`.
   - Queda terminantemente prohibido reintroducir consultas fragmentadas de red por lotes de IDs (`fetchUserMovieDataForIds`) o cachés de comprobación parcial (`checkedIds.ts`).

2. **Renderizado Reactivo sin Peticiones Fantasma**:
   - Tanto el renderizado del catálogo (`renderEngine.ts`) como la apertura de la modal de vista rápida (`modal/renderer.ts`) obtienen los datos de interacción del usuario sincrónicamente desde `state.userMovieData[movieId]`.
   - Las mutaciones de notas o watchlist actualizan en primer lugar la memoria y la base de datos local IndexedDB, encolando la sincronización en segundo plano con el servidor perimetral/Supabase de forma transparente sin bloquear la UI ni incurrir en parpadeos visuales (*flicker*) o saltos de layout (*Layout Thrashing*).


## 8. Contrato de Metadatos SEO y Esquemas Estructurados en la SPA

1. **Aislamiento de la Navegación Interactiva (Zero JSON-LD Re-generation)**:
   - Durante la navegación interactiva ordinaria (cambio de facetas, filtros, slider de años, paginación o búsqueda), queda prohibida la regeneración de esquemas JSON-LD (`ItemList` o `BreadcrumbList`) en el `<head>`.
   - La interacción del usuario solo actualiza síncronamente `updatePageTitle()`: `document.title`, `<link rel="canonical">`, `meta[name="description"]`, `meta[property="og:*"]` y directivas `meta[name="robots"]`.

2. **Diferimiento Asíncrono no bloqueante en Arranque Frío**:
   - Para cubrir rastreadores web en rutas SPA que no dispongan de SSR perimetral directo, `updateStructuredData` y `updateBreadcrumbData` se programan exclusivamente una única vez en la carga inicial (`scheduleInitialSeo`).
   - La inyección se delega a periodos de inactividad del navegador mediante `runWhenIdle()` (utilizando `requestIdleCallback` con fallback a `setTimeout`), impidiendo que la serialización de strings JSON compita con el primer renderizado visual (*First Contentful Paint*) y protegiendo las métricas de interactividad (TBT e INP).


## 9. Contrato de Filtros de Descubrimiento en el Menú Lateral (Sidebar)

1. **Piscinas Curadas Estáticas (Zero Network Discovery)**:
   - Los acordeones de "Directores" y "Actores" del sidebar se nutren de colecciones curadas estáticas (`CURATED_DIRECTORS` y `CURATED_ACTORS`) en `constants.ts`, compuestas por 100 referentes cinematográficos mundiales verificados contra la base de datos de personas.
   - Queda prohibido lanzar consultas RPC dinámicas (`get_random_top_actors`, `get_random_top_directors`) para poblar estas sugerencias.

2. **Poblado Síncrono a 0 ms**:
   - Al montar el sidebar (`initSidebar`), se seleccionan uniformemente 5 elementos de cada piscina en $O(k)$ mediante `getRandomSubarray` y se insertan síncronamente en el primer pase de `populateFilterSection`.
   - Se erradica el parpadeo de contenido diferido (*Layout Shift*) y se garantiza que el SDK de Supabase permanezca desacoplado y descargado al 0% para visitantes anónimos.
   - La búsqueda y autocompletado en los campos *"Otro director..."* y *"Otro actor..."* preservan su funcionamiento asíncrono nativo por demanda exclusivamente cuando el usuario introduce 2 o más caracteres.


## 10. Contrato de Flip Onboarding en Tarjetas de Catálogo

1. **Restricción a Portada Limpia (`isCleanHome`)**:
   - El temporizador de aprendizaje (`runFlipOnboarding`) solo puede programarse cuando la aplicación se encuentra en la portada inicial limpia: primera página (`currentPage === 1`), sin filtros significativos activos (`!hasActiveMeaningfulFilters()`) y en tipo de medio general (`mediaType === 'all'`).
   - Se prohíbe terminantemente agendar giros automáticos durante navegaciones filtradas por géneros, países, estudios, selecciones, años o autores.

2. **Frecuencia Máxima de 10 Ejecuciones (`MAX_ONBOARDING_FLIPS = 10`)**:
   - Se mantiene un contador persistente en `localStorage` (`videoclub:flip_onboarding_count`).
   - Una vez alcanzadas las 10 ejecuciones, `runFlipOnboarding()` opera como un no-op inmediato a 0 ms sin registrar temporizadores en el bucle de eventos ni provocar repintados de capas 3D.

3. **Selección Aleatoria entre las Primeras 4 Fichas**:
   - Para evitar monotonía visual, la tarjeta objetivo se escoge uniformemente al azar entre las 4 primeras fichas de película reales (`:not(.person-card):not(.collection-card):not(.studio-card)`).
   - Si la tarjeta se encuentra en rotación manual por el usuario, el modo muro está activo (`ROTATION_DISABLED`) o una modal está desplegada (`MODAL_OPEN`), la ejecución se descarta de forma segura.


## 11. Contrato de Sombreadores de Fondo y Overlays (Rendimiento GPU)

1. **Desactivación de `backdrop-filter` en Móviles y Dispositivos Táctiles (`<= 768px`)**:
   - En viewports móviles y dispositivos con puntero grueso (`hover: none and pointer: coarse`), queda prohibido aplicar `backdrop-filter: blur(...)` sobre overlays de modales (`.quick-view-overlay`, `.auth-overlay`, `.profile-overlay`, `.legal-overlay`) y cajón lateral (`.sidebar-overlay`).
   - La capa de oscurecimiento se implementa con fondo semitransparente sólido `rgba(0, 0, 0, 0.68)`, garantizando 0 ms de readback de textura y coste cero de GPU durante gestos táctiles de arrastre (*swipe-down*) a 120 FPS.

2. **Supresión Universal en Notificaciones Toast**:
   - Los elementos `.toast` prescinden de `backdrop-filter` en todas las plataformas, confiando en sus fondos de alta opacidad (95%) para garantizar legibilidad sin forzar pases de sombreado en la GPU.

3. **Preservación de Glassmorphism en Escritorio (`> 768px`)**:
   - En pantallas grandes con puntero fino, se preserva el desenfoque sutil (`blur(6px) saturate(85%)`) en modales flotantes centradas, manteniendo compatibilidad con `prefers-reduced-transparency: reduce`.


## 12. Contrato de Renderizado y Perspectiva en Modo Muro (Wall Mode GPU & Layout Optimization)

1. **Poda Estricta de Caras Traseras en el Render Tree (`display: none !important`)**:
   - En Modo Muro (`body.rotation-disabled`), las tarjetas de películas (`.movie-card:not(.is-quick-view)`) son pósters visuales 2D que abren directamente la modal al interactuar, prescindiendo por diseño de cualquier rotación sobre su eje vertical.
   - La cara trasera `.flip-card-back` debe evaluarse obligatoriamente con `display: none !important` para erradicar sus nodos DOM del árbol de renderizado (*Render Tree*) del navegador, evitando que el motor de layout calcule estilos, fuentes o geometrías de elementos que jamás serán visibles.

2. **Aplanamiento de Contextos 3D (`perspective: none` y `transform-style: flat`)**:
   - Queda prohibido mantener contextos de apilamiento 3D activos sobre las 72 tarjetas de una página en Modo Muro.
   - `.movie-card:not(.is-quick-view)` debe declarar `perspective: none` y `.flip-card-inner` debe declarar `transform-style: flat` y `transform: none !important`.
   - La GPU debe tratar la cuadrícula del muro de exploración como un plano 2D continuo de alto rendimiento, optimizando la asignación de buffers de memoria de vídeo (VRAM) y blindando la tasa de refresco a 60-120 FPS durante el scroll vertical rápido.


## 13. Contrato de Interacción y Composición de Botones (Button Stacking & Tactile Feedback)

1. **Supresión de Pseudo-Ondas y Capas de Aislamiento (Zero Ripple & Zero Isolation)**:
   - Queda prohibido el uso de pseudo-elementos (`&::after` / `&::before`) para simular ondas o efectos de agua (*ripple effects*) sobre los botones base (`.btn`).
   - Se erradican las declaraciones `isolation: isolate` y `overflow: hidden` del selector base `.btn`, evitando la creación forzada de contextos de apilamiento en la GPU y previniendo el truncamiento de contornos accesibles (*focus outlines*) o elementos flotantes adyacentes.

2. **Feedback Mecánico Instantáneo en `:active`**:
   - La respuesta háptica y táctil a la interacción del usuario se vehicula mediante micro-hundimiento mecánico a escala (`transform: translateY(1px) scale(0.97)`) y sombra interna de presión (`inset 0 1px 1px rgba(0, 0, 0, 0.05)`).
   - La duración de la transición en estado presionado debe ser inmediata (<= 50 ms) con retorno elástico suave (300 ms mediante `--ease-luxury`), garantizando una respuesta táctil sólida y cinemática acorde a la identidad *Quiet Luxury* de la aplicación.

## 14. Contrato de Animación y Suspensión del Hero de Portada (Hero Animation Freezing on Scroll)

1. **Suspensión Obligatoria en Scroll (`animation-play-state: paused`)**:
   - Cuando el Hero de bienvenida se desplaza fuera del viewport activo (`.landing-hero.is-scrolled-away`), es imperativo pausar de inmediato las animaciones internas mediante `animation-play-state: paused` en `.landing-hero-description`.
   - Queda prohibido mantener bucles infinitos de fotogramas (`infinite crossfade`) ejecutándose en segundo plano sobre elementos con `opacity: 0` o inaccesibles visualmente.

2. **Reanudación Transparente y Ahorro Energético**:
   - Al regresar a la parte superior de la página (`scrollY < 15px`), el estado `is-scrolled-away` se retira y el bucle de rotación reanuda su ciclo natural en el mismo punto de lectura sin saltos bruscos.
   - Este mecanismo protege la tasa de refresco a 120 FPS y la autonomía de batería en dispositivos móviles durante la exploración prolongada de películas.

## 15. Contrato de Carga Diferida de Estilos en Modales (Lazy CSS Architecture)

1. **Aislamiento de Hojas CSS Secundarias (Zero Unused CSS on Startup)**:
   - Las hojas de estilo correspondientes a vistas o modales diferidos que no forman parte del App Shell ni del catálogo visible inicial (`auth.css`, `profile.css`) quedan terminantemente excluidas del fichero bloqueante de renderizado (`src/css/main.css`).
   - El CSS crítico inicial debe limitarse exclusivamente a la infraestructura global, layout, navegación, tarjetas del catálogo y modal de vista rápida.

2. **Invariante de Cero FOUC (Async Style Guard)**:
   - Todo componente modal cuyo CSS se cargue bajo demanda debe garantizar que la promesa de importación (`import("../../css/components/...")`) se resuelva antes de hacer visible el contenedor modal en el DOM.
   - Queda prohibido desocultar modales en estado no estilizado.

3. **Precalentamiento en Inactividad (*Idle Warmup*)**:
   - Los estilos diferidos se pre-cargan en segundo plano aprovechando periodos de inactividad del navegador mediante `runWhenIdle()`, garantizando que cuando el usuario interactúe con los disparadores correspondientes, el recurso ya resida en la caché del navegador para una respuesta visual instantánea.

4. **Punto Único de Inicialización de Lógica y Formularios (SSOT en `openAuthModal`)**:
   - Toda la secuencia de orquestación diferida del modal de autenticación (emisión de `auth:requested`, carga asíncrona de estilos `loadAuthStyles`, montaje del DOM `ensureAuthModalMounted`, enlace idempotente de formularios `initAuthForms` y listeners de modal `initAuthModalListeners`) reside de forma centralizada en `openAuthModal()`.
   - Queda prohibido asociar escuchadores de carga parcial o duplicados en disparadores individuales (como botones del sidebar), garantizando que cualquier vía de apertura (botón de login, valoración no autenticada, guardado en lista o flujo de recuperación) disponga de formularios funcionales e interactivos al 100%.

## 16. Contrato de Desplazamiento y Scroll en Modales (Native GPU Scrolling & Zero Masking)

1. **Scroll Acelerado por Hardware Puro (Zero `mask-image`)**:
   - Queda estrictamente prohibido el uso de `-webkit-mask-image` o `mask-image` sobre contenedores con desplazamiento (`overflow-y: auto`), incluyendo `.quick-view-content`, `.quick-view-column` y `.quick-view-details`.
   - El scroll debe delegarse de forma pura al compositor nativo del navegador (*Off-Thread Compositor Scrolling*), evitando la creación de superficies intermedias (*FBO / Offscreen Buffers*) en cada fotograma táctil.

2. **Supresión de Conmutación Dinámica de Estados de Scroll**:
   - Queda prohibido asociar escuchadores de eventos `scroll` continuos para alternar clases de máscara visual (como `.is-scrolled`).
   - La contención y los límites visuales se resuelven mediante espaciado (*padding*) y cajas delimitadoras estáticas.

## 17. Contrato de Diseño y Jerarquía de Tarjetas VIP (Inaugural Plaque Specification)

1. **Invariante Dimensional y Cero CLS (1:1 con Películas)**:
   - Las tarjetas VIP (`.person-card`, `.collection-card`, `.studio-card`) deben mantener estrictamente el mismo ratio dimensional, encuadre de imagen (`border: var(--space-xxs) solid var(--color-surface); border-radius: var(--radius-xxl);`) y modelo de caja que las tarjetas de películas (`.movie-card:not(.is-quick-view)`), garantizando un ritmo de cuadrícula perfecto y cero saltos de diseño (*Cumulative Layout Shift* = 0).
   - Queda terminantemente prohibido alterar el grosor de borde o el tamaño del contenedor `.poster-container` o su imagen con bordes que rompan la alineación métrica de la cuadrícula.

2. **Diferenciación Semiótica y Paridad Cromática en Fichas VIP**:
   - **Paridad de Superficie con Fichas de Película**: La superficie de las fichas VIP (`.flip-card-front` y `.flip-card-back`) utiliza el mismo fondo institucional `var(--color-surface-1)` (blanco `#ffffff` en claro, gris carbón `#242424` en oscuro), erradicando fondos disonantes o matices dorados en la superficie.
   - **Encuadre y Ribete en Color Corporativo**:
     a) Filete perimetral en color corporativo de 2px (`box-shadow: 0 0 0 2px var(--color-accent)`) en `.flip-card-inner`, junto con filete interior (`outline: 2px solid var(--color-accent); outline-offset: -2px`) en la foto sin alterar sus cotas métricas ni generar CLS.
     b) Coherencia automática en modo claro (`--color-accent: #37474f`, pizarra profundo) y modo oscuro (`--color-accent: #b0bec5`, pizarra plateado).
     c) Divisor horizontal cinematográfico armonizado con gradiente corporativo (`linear-gradient(90deg, transparent 0%, var(--color-accent) 50%, transparent 100%)`).
     d) Tipografía de autor con empaque editorial (`font-weight: 800; letter-spacing: 0.015em`) y paridad cromática con el título de película (`color: var(--color-text-primary)`).
     e) Botón de rol (D/A), trasera de biografía (`.bio-headline`) y nombre en Modo Muro (`.wall-person-name`) armonizados en `var(--color-accent)`.

3. **Paridad Estructural en Modo Muro (`body.rotation-disabled`)**:
   - Las reglas de ocultación de `.card-rating-block` y presentación de `.wall-person-name` en color corporativo aplican homogéneamente a toda la tríada VIP (`:is(.person-card, .collection-card, .studio-card)`), asegurando que tanto personas como colecciones y estudios muestren su cabecera tipográfica en la cuadrícula plana sin discrepancias de estilo.

## 18. Contrato de Consistencia de Ordenación y Caché en Mi Lista (Local-First Relevance Parity)

1. **Paridad de Proyección de Datos (Columna `relevance`)**:
   - Tanto las consultas directas en `src/js/api.ts` (`revalidateMyListInBackground` y `fetchMovies`) como la función perimetral SQL `search_movies_offset.sql` deben incluir obligatoriamente la columna `relevance` en sus proyecciones de campos.
   - De este modo, las películas cacheadas en IndexedDB (`cached_movies`) preservan su puntuación canónica de relevancia asignada en PostgreSQL.

2. **Desempate Determinista en Servidor y Cliente (`id ASC`)**:
   - Tanto en el ordenamiento local en JavaScript (`getLocalMyListResponse`) como en las consultas a Supabase (`.order(...)`), cualquier ordenación por `relevance` (u otro campo de criterio múltiple) debe incluir un desempate unívoco por `id ASC` (`a.id - b.id`).
   - Esto erradica falsos positivos en `hasDifferences` durante la revalidación en segundo plano (`revalidateMyListInBackground`), previniendo parpadeos (*re-renders*) innecesarios al entrar en Mi Lista.

3. **Invariante de Auto-hidratación en Carga en Frío / F5**:
   - `getLocalMyListResponse` debe asegurar la lectura directa de IndexedDB (`await getAllLocalEntries()`) cuando la memoria reactiva inicia vacía, impidiendo falsos positivos de lista vacía `{ total: 0, items: [] }`.
   - Si no existen entradas locales pero existen indicios de sesión activa (`hasStoredAuthSessionOrHash()`), debe retornar `null` para activar el fallback a Supabase.
   - La resolución de catálogo en `getLocalMyListResponse` nutre directamente la carga principal en curso, evitando invocar `loadAndRenderMovies` de forma re-entrante desde los escuchadores de `userDataUpdated` para garantizar que la señal de red no sea abortada y la clase `.is-fetching` se retire limpiamente en todos los escenarios.

## 19. Contrato de Conteo Directo en Fast-Path de Portada Limpia (Index-Only Count Optimization)

1. **Cortocircuito Completo en Portada Limpia (Fase 1.6)**:
   - Toda solicitud dirigida al escaparate limpio de portada (`v_enable_daily_showcase AND NOT v_has_filters AND v_showcase_limit = 378 AND (v_offset + v_limit <= 378)`) debe resolverse íntegramente dentro de la Fase 1.6 de `search_movies_offset.sql`, independientemente del valor del flag `get_count`.
   - Queda prohibido desviar la consulta a la Fase 4 cuando `get_count = true`, evitando el coste de `ROW_NUMBER() OVER ()`, `COUNT(*) OVER ()` y `hashtext()` sobre las 14.564 películas del catálogo global.

2. **Resolución Instantánea de Total por Escaneo de Índice**:
   - En la proyección `json_build_object`, el campo `'total'` se resuelve condicionalmente como `CASE WHEN get_count THEN (SELECT count(*) FROM public.movies) ELSE -1 END`.
   - Dado que la portada limpia sin filtros abarca la totalidad del universo cinematográfico activo, `(SELECT count(*) FROM public.movies)` se resuelve en ~2 ms mediante *Index-Only Scan*, reduciendo drásticamente el consumo de CPU y latencia en el servidor de base de datos.

## 20. Contrato de Estabilidad Geométrica de Esqueletos (Zero CLS Skeleton Contract)

1. **Invariante de Relación de Aspecto en Carga**:
   - Todo esqueleto de carga (`.skeleton-card`) debe reflejar con exactitud matemática el `aspect-ratio` de las tarjetas reales a las que sustituye temporalmente.
   - En modo normal interactivo: `aspect-ratio: 500 / 950` idéntico en ambos componentes (`card.css` y `ui.css`).
   - En Modo Muro (`body.rotation-disabled`): `aspect-ratio: 2 / 3` estricto en ambos componentes (`card.css` y `ui.css`), garantizando que la altura de fila calculada por el motor geométrico durante el estado de carga coincida al 100% con la de las carátulas hidratadas, erradicando saltos acumulativos de maquetación (*Cumulative Layout Shift* = 0).

## 21. Contrato de Diseño de Píldoras de Filtros en Sidebar (Quiet Luxury Filter Pill Standard)

1. **Invariante de Superficie y Contraste**:
   - Las píldoras de filtros activos (`.filter-pill`) deben mantener texto de alta legibilidad en blanco marfil (`#f5f5f5` / `#ffffff`) tanto en tema claro como oscuro, erradicando gradientes diagonales obsoletos o inversiones a texto negro sobre fondos claros.
   - En tema oscuro, las píldoras de inclusión adoptan fondo carbón (`var(--color-surface-2)`) y filete fino en oro viejo (`1px solid rgba(var(--color-brand-gold-rgb), 0.5)`), alineadas con los botones de ordenación y el Bento Grid.
   - Las píldoras de exclusión (`.filter-pill--exclude`) utilizan fondo óxido translúcido con ribete en carmín técnico (`var(--color-error)`).

2. **Microinteracción del Botón de Retirada (`.remove-filter-btn`)**:
   - El aspa `×` responde dinámicamente con viraje al dorado de marca (`var(--color-brand-gold)`) y escala suave al posar el cursor, con área de contacto táctil protegida.

## 22. Contrato de Tipografía y Ficha Técnica en Modal de Vista Rápida (Cinematic Archive Standard)

1. **Invariante Ortográfica y Escala del Año**:
   - El año cinematográfico debe representarse siempre como un bloque numérico limpio de cuatro cifras (`1994`) sin punto de millar ni caracteres de separación, conforme a las directrices de la RAE y el estándar internacional de catálogos fílmicos, tanto en el cliente SPA (`renderer.ts`) como en el renderizado perimetral Edge SSR (`render-movie.js`).
   - La escala tipográfica del año en la columna multimedia (`.is-quick-view [data-template="year"]` y `.is-quick-view .year-flag-group`) se fija en `1.65rem`, subordinada rigurosamente al título de la obra (`2.05rem`) para preservar una jerarquía visual armónica.

2. **Rótulos de Ficha Técnica (Field Labels)**:
   - Los encabezados de metadatos preservan su estilo característico en versalitas (`font-variant: small-caps; font-size: 1rem; letter-spacing: 0.12em;`) y punto ortográfico (`Género.`, `Reparto.`, `Sinopsis.`), manteniendo la identidad visual distintiva del proyecto.

3. **Invariante de Espaciado No Colapsable en Miniseries `(M)`**:
   - Cuando el año representa una miniserie (ej. `2019 (M)` o `2019-20 (M)`), el sufijo `(M)` debe mantener un espacio visible garantizado respecto a la cifra o rango de emisión.
   - Dado que el contenedor `[data-template="year"]` utiliza `display: inline-flex` para su alineación vertical con la bandera, los motores de renderizado colapsan espacios ASCII iniciales en nodos de texto flex anónimos. Para blindar el espacio frente a este comportamiento, el renderizador (`cardElement.ts`, `renderer.ts`, `render-movie.js`, `render-taxonomy.js`) emplea sistemáticamente un espacio no separable (`\u00A0` en DOM, `&nbsp;` en HTML SSR) y la regla CSS `white-space: pre` en `[data-template="year"]`.

## 23. Contrato de Oráculo Global, Ingesta CSV y Escudo de Inmunidad en Caché Local

1. **Recomendación Aleatoria sobre Catálogo Filtrado Completo**:
   - El botón *"Sorpréndeme"* (`#play-button`) del menú lateral selecciona una película pseudoaleatoria sobre el total del universo filtrado activo (`totalMovies`), superando la restricción de las 42 tarjetas renderizadas en el DOM.
   - Enfoque híbrido: resolución inmediata a 0 ms si la tarjeta aleatoria reside en la página activa; consulta RPC ligera con offset aleatorio (`pageSize: 1`) si pertenece a una página remota, sin vibraciones hápticas ni avisos obstructivos.

2. **Ingesta Atómica de Colecciones Externas (CSV)**:
   - Soporte simétrico de importación CSV en el modal de perfil (`#profile-btn-import-csv`).
   - El analizador sintáctico `parseCsvRows` procesa registros sin dependencias externas, valida tipos (`movieId`, `rating`, `onWatchlist`), asegura exclusividad mutua entre valoración y seguimiento, persiste en lote en IndexedDB (`saveLocalEntriesBatch`) e hidrata el estado en memoria programando sincronización en segundo plano hacia Supabase.

3. **Escudo de Inmunidad (*Pinning Shield*) y Ampliación de Caché LRU**:
   - Umbral de retención local `MAX_CACHED_MOVIES` ampliado a `3500` títulos en `src/js/localStore.ts`.
   - La rutina de desalojo `pruneOldCachedMovies` consulta `STORE_USER_ENTRIES` e inmuniza cualquier obra valorada o en seguimiento, evitando la pérdida de fichas locales para perfiles cinéfilos de gran volumen.

4. **Caché Perimetral RPC de 6 Horas con Partición Temporal de Madrid**:
   - Ampliación de retención perimetral de 5 minutos a 6 horas (`s-maxage=21600`) con `stale-while-revalidate=86400` y `max-age=0` para clientes en `/api/rpc/search_movies_offset` (`cloudflare/worker.js`).
   - Partición de la clave de Edge Cache incorporando la fecha determinista de Madrid (`d=YYYY-MM-DD` mediante `Intl.DateTimeFormat` a nivel de módulo), garantizando rotación automática a medianoche sin desincronización en el Daily Showcase ni mezcla de semillas entre páginas consecutivas.

5. **Negociación Markdown para Agentes de IA en Películas y Personas VIP**:
   - Creación de `cloudflare/seo/render-markdown.js` con generadores de alta densidad semántica `renderMovieMarkdown` y `renderPersonMarkdown`.
   - Soporte de `Accept: text/markdown` en `/titulo/:slug/` y `/:vip-slug/` entregando metadatos cinematográficos en <1-3 KB (reducción del 97.5% en egress frente al HTML).
   - Aislamiento perimetral con clave de caché sintética `/_edge_cache/md/...`, cabecera `Vary: Accept` y purga selectiva sincronizada en `/internal/purge`, erradicando el envenenamiento de caché hacia navegadores web estándar.

6. **Atajos de Teclado Globales (*Power-User Hotkeys* en Escritorio)**:
   - Registro de atajos ergonómicos en `main.ts`: `b` o `Ctrl+K` / `Cmd+K` para enfocar y auto-seleccionar el buscador (`#search-input`), `m` para alternar el Modo Muro 2D/3D (`toggleRotationMode`), `s` o `[` para plegar/desplegar la barra lateral (`toggleDesktopSidebar`), y `r` para pedir una recomendación aleatoria global (*"Sorpréndeme"*).
   - Triple blindaje de seguridad: suspensión total si hay modales abiertas (`document.body.classList.contains("modal-open")`), desactivación en elementos editables (`input`, `textarea`, `select`, `isContentEditable`), y bloqueo de modificadores (`ctrlKey`, `metaKey`, `altKey`) para no colisionar con funciones del sistema (`Ctrl+R`, etc.).
   - Hidratación bajo demanda (`await loadSidebar()`) para preservar la dieta estricta del bundle inicial (<45 KB).

7. **Reconciliación SWR Limpia en 'Mi Lista' (Erradicación de Falsos 'dirty')**:
   - Corrección del bug silencioso en `revalidateMyListInBackground` (`src/js/api.ts`): sustitución del guardado con `saveLocalEntry` por `mergeRemoteEntries` con protocolo LWW (*Last-Write-Wins*).
   - Inclusión de `updated_at` en la consulta `user_movie_entries`. Las entradas remotas se consolidan en IndexedDB con `syncStatus: "synced"`, eliminando re-subidas parásitas a Supabase y blindando la persistencia local ante recargas o modo offline.

8. **Depuración de Código Muerto y Redundancias en SPA (Auditoría main.ts, ui.ts y renderEngine.ts)**:
   - Eliminación de variables write-only sin lecturas: retirada definitiva de `isAuthInitialized` en el ciclo de autenticación y de `modalWasOpen` en el despachador de navegación hacia atrás (`handlePopState`).
   - Poda del parámetro fantasma en cadena `movies`: eliminación de `movies` en `updateTotalResultsUI(total)` y `updateMobileStatusBar(total, showTotal)` en `src/js/ui.ts` y desacoplamiento de sus 3 puntos de invocación en `src/js/renderEngine.ts`.
   - Unificación de listeners de teclado globales en `document`: consolidación de `handleEscKey` (cierre del menú lateral móvil en viewport estrecho) dentro del despachador central `initGlobalHotkeys` de `src/js/main.ts`, ahorrando un listener permanente en el documento y simplificando el ciclo de vida de desuscripción.
   - Eliminación de redundancia DOM en resize: supresión de la comprobación redundante `if (!dom.searchInput.title) ...` en el resize listener de `main.ts`, al estar garantizada nativamente en el markup estático de `index.html`.

9. **Desacoplamiento DRY y Blindaje de Contexto en Filtros VIP (`renderEngine.ts`)**:
   - Centralización de la reconciliación canónica de nombres de personas en `syncPersonFilterName(personData, vipType, vipName)`, eliminando 20 líneas duplicadas entre `page === 1` y `page > 1`.
   - Simplificación booleana: unificación de comparaciones mediante `toSlug(name).replace(/-/g, '')`, englobando de forma matemática todas las variaciones alfanuméricas (puntos, guiones, diacríticos y espacios) y permitiendo retirar el import innecesario de `normalizeText`.
   - Erradicación del borrado destructivo de filtros: protección en `loadAndRenderMovies` condicionando la limpieza del filtro a que el catálogo no haya devuelto ítems (`!catalogResult.items || catalogResult.items.length === 0`), garantizando que personas con películas en catálogo pero sin registro en `people` (o ante micro-cortes) conserven sus filtros, píldoras y paginación intactos.

10. **Optimización de Red y Poda de Regexp en Variantes de Búsqueda (`src/js/api.ts`)**:
    - Poda de sobrecarga RPC en sugerencias del Sidebar: sustitución del bucle iterativo secuencial `for (const alt of alternatives)` en `fetchDirectorSuggestions` y `fetchActorSuggestions` por una sola alternativa prioritaria `[candidate] = getAlternativeSearchTerms(term)`, garantizando a lo sumo 1 reintento de red en lugar de hasta 5 llamadas consecutivas en búsquedas sin resultados.
    - Unificación de expresiones regulares en `getAlternativeSearchTerms`: fusión de 4 bloques redundantes en una regla universal de iniciales sueltas `\b([a-zA-Z])\s+` que puntúa letras únicas consecutivas, intermedias e iniciales (`'j j abrams'`, `'david o russell'`, `'m night shyamalan'`), reduciendo el algoritmo a la mitad de líneas con total cobertura de tests.

11. **Formateo SSOT de Miniseries `\u00A0(M)` y Poda de Regex en Renderizado (`formatters.ts`, `cardElement.ts`, `renderer.ts`)**:
    - Centralización en `formatYear`: inyección directa del espacio no divisible (`\u00A0(M)`) en `src/shared/formatters.ts` y `cloudflare/seo/seo-types.js`.
    - Eliminación de 4 regex redundantes: retirada definitiva de `.replace(/ \((M)\)/g, "\u00A0($1)")` en el bucle de pintado de tarjetas (`cardElement.ts`) y en la vista rápida de la modal (`modal/renderer.ts`), erradicando sobrecarga de expresiones regulares en el ciclo de vida del DOM y garantizando el espaciado no divisible de forma transversal.

12. **Jerarquía Polimórfica OOCSS en Tarjetas VIP de Grupo (`cardElement.ts`, `lifecycle.ts`)**:
    - Preservación de `.collection-card` como clase base estructural en `createGroupCardElement` (`cardElement.ts`) incorporando `.studio-card` como modificador aditivo (`card.classList.add('studio-card')`), en vez de reemplazar la clase base.
    - Poda de guardas redundantes: retirada sistemática de comprobaciones secundarias `|| card.classList.contains('studio-card')` y `:not(.studio-card)` en `cardElement.ts`, `lifecycle.ts`, `filters.ts`, `renderEngine.ts` y `ui.ts`. Las tarjetas de estudios heredan automáticamente la condición inerte y exclusiones del DOM a través de `.collection-card` con cero duplicación de selectores.

13. **Poda de Consulta Duplicada a `getCachedPersonDetails` en Renderizado de Píldoras (`sidebar/filters.ts`)**:
    - Retirada de la segunda llamada redundante en `renderFilterPills()`: dado que `item.val` ya contiene el nombre canónico resuelto en la primera fase de construcción de la lista de filtros deseados (`desired`), la segunda consulta a `getCachedPersonDetails(type, item.val)` era 100% redundante, ahorrando lecturas al `Map` en cada actualización del Sidebar.

14. **Unificación de Fall-Through en el Oráculo (`handleRandomMovieRecommendation` en `sidebar/filters.ts`)**:
    - Fusión del Fast-Path y Fallback: reestructuración del flujo de recomendación aleatoria de modo que el intento remoto condicionado a `totalMovies > cards.length` realiza early-return solo ante respuesta exitosa, cayendo de forma natural y sin bifurcaciones duplicadas al bloque de selección local. Ahorro de 16 líneas idénticas y mayor linealidad algorítmica.

15. **Poda de Alias Deprecado y Limpieza de Imports (`profile.ts`, `sidebar/index.ts`)**:
    - Retirada del alias muerto `exportUserDataJson` y del selector fallback `|| document.getElementById("profile-btn-export-json")` en `src/js/components/profile.ts`, completando la migración exclusiva a CSV en la suite de pruebas (`tests/profile-stats.test.mjs`).
    - Eliminación del import no utilizado `CONFIG` en la cabecera de `src/js/components/sidebar/index.ts`.

16. **Corrección de Extracción de Datos Cronológicos y Clasificación de Series en Markdown (`cloudflare/seo/render-markdown.js`)**:
    - Corrección en ficha VIP de personas (`renderPersonMarkdown`): sustitución del acceso a la propiedad inexistente `ageInfo?.text` por el cálculo canónico de `computePersonAgeInfo` (`${ageInfo.datesStr} ${ageInfo.ageStr}`), incorporando además `place_of_birth` cuando esté disponible para una ficha biográfica completa entregada a bots y LLMs.
    - Diferenciación semántica de series (`renderMovieMarkdown`): reemplazo de la etiqueta rígida `' - Miniserie'` por discriminación semántica real (`isMini` para `SM`, `SAM`, `SDM` o `year_end === 'M'`, y `'Serie de TV'` para series regulares de múltiples temporadas `S`, `S-`, etc.), garantizando fichas Markdown fidedignas para cualquier formato audiovisual.
