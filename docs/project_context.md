# VIDEOCLUB.DIGITAL - Project Context & Architecture

## 📌 Visión General

**videoclub.digital** es una Progressive Web App (PWA) móvil-first diseñada para explorar, filtrar y descubrir películas y series. Actúa como un "oráculo cinéfilo" con un motor de búsqueda y filtrado extremadamente rápido, integración de cuentas de usuario, y un enfoque obsesivo en el rendimiento web (60-120 FPS, optimización de CPU/GPU, y prevención de re-renders innecesarios).

## 🛠️ Stack Tecnológico

- **Frontend:** TypeScript (ES2022+), HTML5 Semántico, CSS3 (Variables, Grid, Flexbox, Container Queries).
- **Build Tool:** Vite (con esbuild y TypeScript para minificación y type-checking estricto).
- **Backend/Database:** Supabase (PostgreSQL 15+, PL/pgSQL RPC `search_movies_offset` optimizado sin sobrecoste de conteo ni ventanas en portada limpia, precomputación vectorizada de `genre_tsquery` $O(1)$ en `public.genres`, RLS, Trigram Indexes), Supabase Auth, Supabase Storage.
- **Edge SSR & CDN:** Cloudflare Worker (`cloudflare/worker.js`) con ESM bundle vía esbuild, proxy inmutable de imágenes (`/posters/*`, `/vips/*`), Edge SSR para SEO, negociación Markdown para agentes de IA y endpoint perimetral `/api/rpc/search_movies_offset` con Edge Caching público canónico (`s-maxage=300, stale-while-revalidate=3600`) y bypass directo para usuarios autenticados.
- **PWA & Offline:** Service Worker propio (`sw.js`) inyectado dinámicamente con versión por timestamp en build time vía Vite, con estrategias de caché `CACHE_STATIC` y `CACHE_DYNAMIC` y `manifest.webmanifest`.
- **Arquitectura Local-First:** `localStore.ts` (IndexedDB v2 con almacén de fichas `cached_movies` y retención LRU), `syncManager.ts` con estado de sincronización (`dirty`, `synced`, `deleted`), cola offline, renderizado instantáneo en 0 ms para *Mi Lista* y resolución determinista *Last-Write-Wins* (LWW).
- **Dependencias Externas Clave:** `@supabase/supabase-js`, `lru-cache` (caché en memoria para búsquedas/filtros).

## 📂 Estructura del Proyecto

### 1. Archivos Raíz y Configuración

- `index.html`: Punto de entrada. Contiene el CSS crítico (_Above the Fold_), script temprano en `<head>` para neutralizar de raíz el destello (Anti-FOUC) del Hero de bienvenida en recargas con parámetros de listas (`?list=watchlist`, `?list=rated`, `?list=mixed`), preloads, meta tags SEO, política CSP ajustada (sin directivas exclusivas de cabecera como `frame-ancestors`) y los `<template>` de los componentes para instanciación rápida.
- `vite.config.js`: Configurado con `base: '/'` (ruta absoluta raíz estricta para garantizar la resolución correcta de bundles en rutas SEO anidadas como `/titulo/:slug/` o `/genero/:slug/`), código moderno (`es2022`), minificación de CSS, separación de chunks (vendor, supabase), proxy de desarrollo para `/api/rpc` e inyección automática de versión de Service Worker (`injectSwVersion`).
- `public/404.html`: Fallback SPA histórico de contingencia. En la arquitectura actual, Cloudflare Workers gestiona el enrutamiento SPA de forma nativa a través de `not_found_handling = "single-page-application"`.
- `public/sw.js`: Service Worker interceptor con versión inyectada dinámicamente (`vYYYYMMDDHHMM`), aislamiento estricto por origen (`url.origin === self.location.origin`) y estrategias:
  - _Network First_ (`CACHE_STATIC` para navegación HTML y App Shell, con bypass explícito para rutas SEO perimetrales `/titulo/*`, `/genero/*`, `/pais/*`, `/estudio/*`, `/seleccion/*`, `/actor/*`, `/director/*` y slugs VIP para evitar colisiones con el App Shell).
  - _Stale-While-Revalidate_ (`CACHE_DYNAMIC` para assets estáticos JS/CSS con precacheo de `/` y `/manifest.webmanifest` en `CRITICAL_ASSETS`; los iconos SVG viajan inlined en el DOM).
  - _Cache First_ (`CACHE_DYNAMIC` para pósters y fotos VIP proxyeadas con límite FIFO).
  - _Aislamiento de Origen Cruzado_: Los recursos alojados en `*.supabase.co` (fuentes Inter, Auth, RPC) fluyen directamente por red nativa sin ser interceptados por el SW, previniendo advertencias de colisión con `<link rel="preload">`.
  - Estrategia de invalidación documentada en `docs/service_worker_invalidation.md`.
- `wrangler.toml`: Configuración de Cloudflare Workers y Static Assets. Declara la ruta de zona `videoclub.digital/*`, vincula `./dist` con binding `ASSETS`, enrutamiento SPA directo y `run_worker_first = true` bajo `[assets]` para asegurar que el código del Worker intercepte y evalúe las rutas SEO perimetrales antes de que el servidor estático devuelva el fallback SPA.
- `cloudflare/worker.js`: Origen de producción y capa perimetral (*Edge SSR, Reverse Proxy & Static Assets serving*):
  - Inyección dinámica y **fail-closed** de entorno (`env.SUPABASE_URL`, `env.SUPABASE_ANON_KEY`), habiéndose eliminado por completo cualquier credencial hardcodeada o transitoria (`TRANSITIONAL_CONFIG`). Si falta la configuración en el entorno de Cloudflare, las rutas SEO devuelven inmediatamente un error explícito `500 Server misconfigured (missing Supabase credentials)` con `Cache-Control: no-store`.
  - Inyección de `Cache-Control: public, max-age=31536000, immutable` en bundles de Vite (`/assets/*`).
  - Endpoint de catálogo perimetral `/api/rpc/search_movies_offset`: Clave de caché canónica determinista (`canonicalizeRpcParams`), almacenamiento en Cloudflare Cache API para peticiones anónimas (`s-maxage=300, stale-while-revalidate=3600`) y bypass directo para peticiones con JWT de usuario autenticado.
  - Proxy perimetral de imágenes (`/posters/*` y `/vips/*`) con reescritura hacia Supabase Storage para evitar consumo de egress.
  - Negociación de contenido Markdown (`Accept: text/markdown` $\to$ `/llms.txt`) y cabeceras de descubrimiento para agentes de IA (`Link: </llms.txt>; rel="alternate"`). Documentado en `cloudflare/README.md`.
  - Endpoint de purga selectiva perimetral (`POST /internal/purge`) protegido estrictamente mediante variable de entorno secreta `PURGE_SECRET` (sin fallbacks hardcodeados en código; devuelve `500 Server misconfigured` si el secreto no está configurado).
  - Inyección de cabeceras HTTP de seguridad simétricas (`applySecurityHeaders`): endurecimiento perimetral mediante `X-Frame-Options: DENY`, `Content-Security-Policy` con directiva `frame-ancestors 'none'`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy`, `Strict-Transport-Security` y `X-XSS-Protection: 0`, aplicado homogéneamente sobre la SPA, Edge SSR y páginas semánticas de error (documentado exhaustivamente en `docs/security.md`).
  - Fallback a `env.ASSETS.fetch(request)` para servir la SPA y recursos estáticos sin servidores externos.

### 2. Módulos Compartidos SSOT (`src/shared/`)

- **`slugs.ts`**: Fuente Única de Verdad para slugs canónicos. Mapea y normaliza los 21 géneros canónicos oficiales (`GENRE_SLUG_MAP`), el catálogo oficial de países (`COUNTRY_SLUG_MAP`), estudios, colecciones y personas. La resolución de sinónimos temáticos y multilingües de búsqueda se delega dinámicamente a PostgreSQL (`genres.synonyms`).
- **`constants.ts`**: Constantes globales compartidas, límites de años dinámicos y taxonomías.
- **`formatters.ts`**: Funciones puras de formateo, puntuación y normalización de texto. Incluye la función canónica de seguridad `sanitizeExternalUrl` para validar esquemas seguros exclusivamente HTTPS (`^https://`) y neutralizar esquemas inseguros HTTP, vectores de inyección XSS (`javascript:`, `data:`) y enlaces relativos en la UI y el Edge SSR.

### 3. Frontend TS (`src/js/`)

Arquitectura modular con tipado estricto (TypeScript), funciones puras, delegación de eventos y sincronización local-first.

- **`main.ts`**: Director de orquesta y punto de entrada SPA (*Wiring Hub*). Conecta el bus de eventos global (`appEvents`), cablea los manejadores de cabecera y teclado, orquesta el ciclo de autenticación y sesión de usuario (`setupAuthSystem`), y gestiona el arranque determinista (`init()`) y el desmontaje total sin fugas (`disposeApp()`).
- **`renderEngine.ts`**: Motor centralizado de carga y renderizado del catálogo (`loadAndRenderMovies`, `updateDomWithResults`). Administra consultas RPC abortables a Supabase, lógica de páginas huérfanas, presupuestos de slots, renderizado de cuadrícula, esqueletos, estados vacíos y sincronización de metadatos SEO (`Title`, `Breadcrumbs`, `StructuredData`).
- **`router.ts`**: Sincronización bidireccional entre la URL (*Pretty Paths* canónicos y query params) y el estado inmutable global (`readUrlAndSetState`, `updateUrl`), manipulación de la History API nativa (`pushState`/`replaceState`), normalización determinista de rutas y persistencia en memoria del *scroll*.
- **`scrollWatcher.ts`**: Monitorización de scroll de alto rendimiento mediante `requestAnimationFrame` desacoplado del hilo principal (*passive scroll*). Gestiona la visibilidad del header móvil (*hide/show on scroll* preservando foco y teclado virtual), prefetch predictivo de la página siguiente (>70% de scroll) y guardado debounced de posición.
- **`state.ts`**: Gestor de estado global inmutable. Sincroniza la URL (_Pretty Paths_ y QueryParams) con el estado de la aplicación (`activeFilters`, `currentPage`, `userMovieData`), y ejecuta `canonicalizeCurrentUrl()` para garantizar URLs canónicas estrictas.
- **`contracts.ts`**: Definición central de contratos de datos, códigos de error (`ERROR_CODES`), detección unificada del base path (`getAppBasePath()`), generación de URLs canónicas de filtros (`buildFilterUrl`), guardas de tipos y normalizadores puros de bajo nivel (`parseYearRangeRaw`, `normalizeMovieId`).
- **`api.ts`**: Capa de acceso a datos. Implementa deduplicación de peticiones (_In-flight requests_), cliente perimetral `executeCatalogRpc` con fallback a Supabase RPC, resolución local instantánea de *Mi Lista* (`getLocalMyListResponse`), Stale-While-Revalidate hacia Supabase, `AbortController` para cancelar consultas obsoletas y memoria LRU (`queryCache`, `suggestionsCache`, `personCache`).
- **`localStore.ts`**: Almacenamiento local-first en IndexedDB v2. Incluye `user_entries` (con índices `by_watchlist`, `by_rating`, `by_syncStatus`), `cached_movies` (con índice temporal `by_cachedAt` y purgado LRU `MAX_CACHED_MOVIES = 1000`), escrituras atómicas transaccionales (`saveLocalEntryWithMovie`) y reconciliación determinista *Last-Write-Wins* (LWW).
- **`syncManager.ts`**: Gestor de sincronización bidireccional en segundo plano entre el almacenamiento local y Supabase (`user_movie_entries`), con soporte offline y reintentos ante reconexión.
- **`checkedIds.ts`**: Control de deduplicación de IDs de películas sincronizadas en memoria para romper dependencias circulares.
- **`ui.ts`**: Controladores genéricos del DOM. Maneja Toasts, esqueletos de carga (_Skeletons_), paginación y las trampas de foco (_Focus Trap_) para modales.
- **`seo.ts`**: Generador dinámico de `JSON-LD` (Schema.org), títulos, breadcrumbs, `og:url` y canonical tags siempre referenciados a la URL canónica pura vía `getCanonicalUrl()`.
- **`utils.ts`**: Herramientas puras de alto rendimiento. Incluye creadores de nodos DOM veloces (`createElement` vía `Object.assign`), normalización de texto (eliminación de acentos), formateadores y gestión segura de `localStorage`.
- **`constants.ts`**: Fuente única de la verdad. Almacena mapeos de clases CSS, selectores del DOM, SVG sprites integrados (`ICONS`), límites de paginación y mapeos de plataformas (Netflix, HBO, etc).
- **`auth.ts`**: Lógica de registro y login delegada a Supabase Auth.
- **`templates/` (`src/js/templates/`)**: Plantillas diferidas (*Lazy Templates*) para vistas modales secundarias (`authModal.ts`, `legalModal.ts`, `profileModal.ts`). Inyectan el marcado bajo demanda en el DOM solo cuando el usuario interactúa, reduciendo ~35 KB del documento HTML inicial.
- **`types.ts`**: Interfaces TypeScript centralizadas (`MappedMovie`, `ActiveFilters`, `UserMovieEntry`, `PersonDetails`, `VipData`).

### 4. Componentes TS (`src/js/components/`)

- **`card/` (Módulo de Ficha y Cuadrícula)**: Descompuesto en submódulos especializados para desacoplar el ciclo de vida, la construcción del DOM y el estado reactivo:
  - **`context.ts`**: Estado reactivo interno del componente (tarjeta actualmente volteada, hover activo, temporizadores de *flip*, *hover* y *onboarding*, observer LQIP/ThumbHash compartido y generación de ciclo de vida `cardLifecycleGen`).
  - **`cardElement.ts`**: Construcción y formateo del DOM de tarjetas individuales. Resuelve plantillas `<template>` mediante *Lazy Getters* bajo demanda; gestiona plantillas específicas (películas, personas VIP con insignias duales `(D)`/`(A)`, colecciones y estudios); administra eventos individuales (tap, doble clic, *flip*, atajos táctiles, prefetch FIFO de imágenes y actualización optimista de Watchlist con autenticación activa `body.user-logged-in`). Mantiene el ritmo vertical e interlineado armónico y la disposición milimétrica de botones expansores `+`/`−`.
  - **`lifecycle.ts`**: Delegación de eventos e interacciones a nivel de cuadrícula (*Grid*). Gestiona eventos `pointerover`, `pointerout`, clics y escuchadores del documento (`visibilitychange` para repliegue al cambiar de pestaña). Exporta `initCardInteractions()` y `disposeCardEvents()` para la limpieza estricta de *listeners* y *observers*.
  - **`index.ts`**: Orquestador principal y fachada pública de la tarjeta. Implementa el renderizado por lotes masivo (`renderMovieGrid` mediante `yieldToMain`), esqueletos (`renderSkeletons`), estados vacíos/error (`renderNoResults`, `renderErrorState`), animación guiada de inicio (`runFlipOnboarding`) y re-exporta la API pública completa para el resto de la aplicación.
- **`modal/` (Módulo de Vista Rápida / Quick View)**: Descompuesto en submódulos especializados por responsabilidad para desacoplar renderizado, gestos táctiles, eventos y navegación, con `modal.ts` como orquestador y fachada pública (~396 líneas):
  - **`renderer.ts`**: Renderizado síncrono y montaje del DOM para películas y personas VIP (`populateModalContent`), portadas con LQIP progresivo, resolución de plantilla (`#quick-view-template` / `#quick-view-person-template`), banderas de país, metadatos (`renderModalMetaUnits`), enlaces interactivos de taxonomía (`createLink`), botón de alternancia de rol dual `(D)`/`(A)` e inicialización de notas/watchlist para usuarios autenticados.
  - **`navigation.ts`**: Navegación entre tarjetas adyacentes (`navigateToSibling`), límites de catálogo y muro con solicitud de cambio de página, actualización de botones previo/siguiente (`updateNavButtons`) y precarga predictiva de imágenes adyacentes (`prefetchAdjacentModalImages`).
  - **`gestures.ts`**: Lógica y física de gestos táctiles (`touchState`, `handleTouchStart`, `handleTouchMove`, `handleTouchEnd`), detección de arrastre vertical con *rubber banding* exponencial para descarte (`SWIPE_Y_CLOSE_THRESHOLD`), deslizamiento horizontal para navegación (`SWIPE_X_THRESHOLD`) y compatibilidad con móvil apaisado.
  - **`events.ts`**: Centralización de todos los escuchadores de la vista rápida expuestos mediante interfaz limpia `bindModalEvents` / `unbind`: eventos de aplicación (`appEvents`), delegación de clics en metadatos y póster, máscara de scroll y compactación apaisada (`.poster-compact`), eventos auxiliares de rueda y tacto, atajos de teclado (`Escape`, flechas, `PageUp`/`PageDown`), botones de navegación y enlace de gestos.
  - **`modal.ts`**: Orquestador principal y API pública (`isModalOpen`, `openModal`, `openModalForMovie`, `closeModal`, `initQuickView`, `disposeModalEvents`). Mantiene la caché DOM lazy, ciclo de vida (`modalLifecycleGen`), temporizadores y RAF cancelables, cierre por clic exterior (`handleOutsideClick`), integración con History API (`modalOpen`) y coordinación de *View Transitions API* (expansión y repliegue *Hero* de la tarjeta).
- **`profile.ts`**: Panel de perfil de usuario y estadísticas cinemáticas en tiempo real. Procesa catálogos masivos (>2.500 entradas), calculando media sobre 10 y sobre 3 estrellas, desglose por franjas de valoración, distribución por géneros, exportación de datos en formato CSV/JSON y baja de cuenta vía RPC.
- **`sidebar/` (Módulo del Menú Lateral de Filtrado)**: Descompuesto en submódulos modulares para aislar lógica de filtros, sincronización de años y gestos móviles:
  - **`context.ts`**: Almacena el caché de selectores del DOM (`dom`), referencias al estado de layout móvil/escritorio (`isMobileLayout`) y registro de desuscripciones del bus de eventos.
  - **`filters.ts`**: Lógica de selección, deselección y reconciliación visual de los 4 desplegables principales (género, país, directores, actores, estudios y selecciones). Gestiona autocompletado en tiempo real con debounce y guardias (`>= 2`), soporte bidireccional para colectivos y dúos cinematográficos (ej. Hermanos Russo $\leftrightarrow$ Joe y Anthony Russo), estilos de alto contraste en modo claro (`#1e293b`) y oscuro (`#334155`), e inserción de píldoras dinámicas de exclusión (`(NO País) x`).
  - **`yearFilter.ts`**: Coordinación del filtro de rango temporal, actualización de inputs numéricos y sincronización bidireccional con el componente `yearSlider`.
  - **`gestures.ts`**: Física de arrastre táctil (*touch gestures*) y gestos de deslizamiento (*swipe-to-dismiss*) para la apertura y cierre suave del *drawer* en dispositivos móviles, con soporte para *haptic feedback*.
  - **`index.ts`**: Fachada y ciclo de vida del menú lateral. Orquesta la inicialización (`initSidebar`), cierre/apertura programática (`closeMobileDrawer`, `openMobileDrawer`), colapso de acordeones (`collapseAllSections`) y desmontaje exhaustivo (`disposeSidebarEvents`).
- **`rating.ts`**: Lógica visual del sistema de puntuación por estrellas y lógica de votación de usuario (optimista), manteniendo la exclusividad mutua con la Watchlist. Exige inicio de sesión previo (`body.user-logged-in`) para cualquier interacción o mutación (ratón, teclado, foco o nota en muro): en ausencia de sesión, no previsualiza el llenado ni anima en hover/active, bloquea la mutación local/remota, notifica vía toast informativo e invoca automáticamente la modal de autenticación (`openAuthModal()`).
- **`yearSlider.ts`**: Componente nativo de control de rango de años doble (_DualRangeSlider_) con soporte táctil, arrastre fluido de pivotes, cálculos precisos de porcentaje y sin dependencias externas.

### 5. Capa Perimetral y Edge SSR (`cloudflare/`)

- **Propósito**: Renderizado en el servidor perimetral (*Edge SSR*) y optimización de entrega sin latencia de origen ni consumo de egress.
- **Tecnología**: Cloudflare Workers (ESM bundle vía esbuild).
- **Rutas Servidas en Edge SSR**:
  - `/titulo/:slug/`: Ficha completa accesible con modal nativo, enlaces canónicos en géneros (`/genero/:slug/`), directores y reparto, Schema.org Movie/TVSeries, Breadcrumbs y normalización case-insensitive 301.
  - `/:vip-slug/`: Ficha VIP oficial de director o actor con tarjeta dedicada `#0`, foto `/vips/:slug.webp`, biografía con giro 3D y filmografía destacada en cuadrícula (evaluación perezosa *lazy* de tarjetas por rol).
  - `/genero/:slug/`, `/pais/:slug/`, `/estudio/:slug/`, `/seleccion/:slug/`: Muros de taxonomía cerrada con 42 tarjetas oficiales.
  - Reverso de tarjeta en Edge SSR: idéntico visualmente a la SPA; el título original se ubica bajo las puntuaciones y actúa como enlace a la ficha (`.back-original-title-link`), la sinopsis fluye con degradado hasta la base, los botones `+` se alinean milimétricamente a 8px del margen derecho y el botón `−` permite cerrar tanto el panel de reparto como la sinopsis expandida elevándose a `z-index: 60`.
- **Coherencia de Tema Claro / Oscuro**: Script anti-flicker síncrono en `<head>` (0 ms) que sincroniza `localStorage` y cookie `theme=...`, junto al botón interactivo `#theme-toggle` en todas las cabeceras perimetrales.
- **Filosofía VIP = Fuente Editorial**: `VIP_SLUGS` actúa estrictamente como filtro de enrutamiento perimetral en tiempo constante $O(1)$ para decidir si una ruta raíz intenta resolverse como ficha SEO VIP; los datos editoriales siempre proceden de Supabase (SSOT), quedando terminantemente prohibido almacenar fichas dentro del manifiesto.
- **Pipeline de Preparación de Artefactos**: `npm run prepare:worker` genera deterministamente el manifiesto VIP (`generate-vip-manifest.mjs`) y el CSS perimetral en memoria (`build-seo-css.mjs`), integrándose de forma atómica en `build:worker` y `deploy:worker`.

### 6. Scripts de Automatización y Generación (`scripts/`)

- **`build-seo-css.mjs`**: Compila y minifica el CSS perimetral unificado (`public/seo-card-v7.css` minificado directamente y `cloudflare/seo/seo-card-css.js`).
- **`generate-vip-manifest.mjs`**: Genera el índice en memoria de personas VIP (`cloudflare/seo/vip-manifest.js`) a partir de `people.vip = 1` en Supabase. Carga credenciales con `process.loadEnvFile()` de Node.js de forma determinista y fail-closed (sin credenciales hardcodeadas).
- **`generate-sitemap.mjs`**: Genera sitemaps canónicos (`public/sitemap.xml` y `public/sitemap-index.xml`) con más de 15.000 URLs indexables, resolviendo entorno mediante `process.loadEnvFile()`.
- **`generate-llms.mjs`**: Genera especificaciones canónicas para agentes de IA (`public/llms.txt` y `public/llms-full.txt`).
- **`run-data-tests.mjs`**: Runner de auditoría declarativa DataOps contra PostgreSQL (`run_data_tests`).
- **`sync-sprites.mjs`**: Herramienta de sincronización de SVG sprites hacia `public/sprite.svg`.

### 7. Estilos (`src/css/`)

- **`variables.css`**: Design tokens. Fuentes (Inter), paleta de colores adaptable (Tema Claro/Oscuro dinámico con tokens como `--color-rating-star` y `--color-accent-darker`) y duraciones de animación (_Quiet Luxury easing_).
- **`globals.css`**: Reset, utilidades generales y scrollbars personalizados.
- **`layout.css`**: Estructura macro basada en Container Queries (`container-type: inline-size`), cabecera fija elástica (`position: sticky; top: 0;`), CSS Grid para la cuadrícula principal adaptativa y componente de portada `#landing-hero` ("Cartelera de Cine & Haz Dorado") con halo radial suave de proyector (`radial-gradient`), titular en oro metálico pulido (`background-clip: text`), micro-separador de haz de luz (`::after` con destello difuso) y transición de desvanecimiento suave (`.is-scrolled-away`) sincronizada con el bucle rAF de `scrollWatcher.ts`.
- **`components/*.css`**: CSS scopeado a componentes. Uso intensivo de `contain: layout paint style` y `content-visibility: auto` para máximo rendimiento. Evita transicionar propiedades pesadas (`width`, `padding`) en móviles, priorizando `transform` y `opacity` (GPU).
- **Frontera Canónica de Breakpoints (Mobile / Desktop)**: Estandarización unificada en todo el proyecto:
  - `≤ 768px` $\to$ **MÓVIL** (panel deslizable *Bottom Sheet*, gestos táctiles, botones de acción ampliados para accesibilidad WCAG).
  - `≥ 769px` $\to$ **ESCRITORIO** (ventanas flotantes bicolumna con scroll independiente, flechas exteriores y hover habilitado para ratón `pointer: fine`).
  - Eliminada toda frontera transitoria o inconsistente (antiguos 700/701px).
- **Contrato Arquitectónico Card vs. Quick View**:
  El sistema mantiene una separación estricta e infranqueable entre la tarjeta 3D del catálogo y la modal editorial de vista rápida:

  ```text
  CARD NORMAL (.movie-card:not(.is-quick-view))
  ├── .flip-card-inner
  ├── .flip-card-front
  └── .flip-card-back

  QUICK VIEW (.movie-card.is-quick-view)
  ├── .quick-view-inner
  ├── .quick-view-media
  └── .quick-view-details
  ```

  **Reglas de aislamiento estructural:**
  1. `flip-card-*` pertenece exclusivamente a la interacción 3D de Card (`card.css` y plantillas de catálogo).
  2. `quick-view-*` pertenece exclusivamente a Quick View (`modal.css` y plantillas `#quick-view-template` / `#quick-view-person-template`).
  3. Los cambios de estilo y estructura de Quick View no deben depender de selectores estructurales internos de Card.
  4. **Invariante de mantenimiento:** `modal.css` es responsable de Quick View y no debe volver a introducir selectores `flip-card-*`.

- **Arquitectura de Componentes CSS**:
  - **`modal.css` (Quick View & Legal Modal)**:
    - Estructurado en 10 secciones delimitadas (A a J): Base/Estructura, Contenido/Tipografía, Ratings/Acciones, Navegación, Mobile (Bottom Sheet), Desktop (Bicolumna Películas 50/50), Personas VIP (45/55), Landscape (móviles apaisados $\le 550\text{px}/600\text{px}$ con layout 50/50 y cartel dinámico `.poster-compact`), Rendimiento/Transiciones y Modal Legal e Informativo.
    - Cascada limpia y unidireccional: la capa base establece el contrato común, Desktop define las ventanas flotantes (50/50 películas y 45/55 personas), y Landscape actúa al final como excepción terminal para alturas compactas, eliminando conflictos de cascada sin depender de `!important` artificiales.
  - **`card.css` (Card System)**:
    - Estructurado en 10 secciones modulares (A a J): Base/3D, Frontal (Póster/LQIP), Frontal (Títulos `text-wrap: balance`/Metadatos), Trasera (Títulos/Duración/Enlaces externos), Trasera (Detalles/Sinopsis `text-wrap: pretty`/Actores), Botones expansores (`+`/`−` con área táctil 40px WCAG), Elementos interactivos/Watchlist (microanimaciones Pop/Glow/Settle), Modo Muro (`body.rotation-disabled`, ratio 2:3, lógica estrellas usuario vs media), Fichas VIP (fotos 2:3 con `object-position: top center`, botón dual D/A `.person-role-toggle-btn`) y Rendimiento/Accesibilidad.
    - Reducción neta del 16% en tamaño en bytes (~5,8 KB ahorrados), eliminación de reglas redundantes en Dark Mode (contorno dorado) y consolidación cromática de estudios con selector `:is()`.
  - **`header.css` (Header Component)**: Refactor consolidado y ligero (Fase 10E-B). Cascada nativa limpia entre desktop y móvil, donde las reglas activas de tipo (`.type-filter--movies`, `.type-filter--series`) prevalecen naturalmente sobre `:where(html.dark-mode)` por orden de aparición e idéntica especificidad `(0, 2, 0)`, eliminando el 100% de los `!important` redundantes.
  - **`profile.css` & Tokens Semánticos de Perfil (Fases 10D-D y 10D-F)**: Reemplazo integral del vocabulario histórico por design tokens semánticos propios en `variables.css` (`--profile-surface`, `--profile-text-primary`, `--profile-text-secondary`, `--profile-text-muted`, `--profile-border`, `--profile-success`, `--profile-warning`, `--profile-danger*`), garantizando aislamiento de tema y superficie oscura consistente sin fallbacks ad-hoc.
- **Principio SSOT en Desarrollo vs Compilación Perimetral**: El directorio `src/css/` es la **Única Fuente de Verdad** de los estilos. Durante el desarrollo local (`npm run dev`), Vite procesa estos archivos en tiempo real con HMR (*Hot Module Replacement*). Los artefactos derivados para SEO perimetral (`public/seo-card-v7.*` y `cloudflare/seo/seo-card-css.js`) son generados automáticamente por `scripts/build-seo-css.mjs` y **nunca deben editarse manualmente ni recompilarse en cada cambio menor de diseño**. Su regeneración se delega exclusivamente a `npm run prepare:worker` antes de un commit o despliegue.
- **Grafo Semántico de Código (`.codebase-memory/`)**: Índice persistente del repositorio (`graph.db.zst`, 3.134 nodos y 15.168 aristas semánticas) gestionado por el servidor MCP `codebase-memory` para análisis de impacto y trazabilidad de dependencias TypeScript/Edge sin afectar al control de versiones (excluido en `.gitignore`).

### 8. Suite de Tests (`tests/`)

- Ejecución centralizada mediante el test runner nativo de Node.js (`node --test`), con ejecución concurrente paralela nativa (reducción de 28,5 s a 11-14 s en local y ~4 s en CI) y batería exhaustiva de aserciones sin dependencias externas pesadas.
- **`tests/helpers/vite-ssr.mjs`**: Helper unificado `startViteSsrServer()` que arranca el entorno Vite en modo SSR de forma aislada para evaluar módulos TypeScript directamente.
- **Batería de Pruebas (Suites activas en Node.js Test Runner)**:
  - `card.test.mjs`: Tests de caracterización del componente `card/` (renderizado masivo, tarjetas VIP con insignias duales, formato de directores/episodios, actualización optimista de Watchlist y estados vacíos/error).
  - `lifecycle-dispose.test.mjs`: Ciclo de vida y funciones de desmontaje explícito (`disposeApp`, `disposeCardEvents`, `disposeModalEvents`, `disposeSidebarEvents`) para prevenir *memory leaks* y verificar el reenganche limpio de escuchadores.
  - `url-contract.test.mjs`: Test formal del contrato de URLs (jerarquía canónica, lectura agnóstica al orden, reglas de exclusividad semántica y las 10 filas de la Tabla 4 de URLs prohibidas/normalizadas).
  - `worker.test.mjs`: Batería exhaustiva de smoke tests del Cloudflare Worker (Edge SSR de títulos con enlaces de género, contratos HTTP explícitos 200/404/500/502, seguridad fail-closed ante ausencia de credenciales, taxonomías perimetrales, personas VIP en la raíz con roles duales D/A, normalización case-insensitive 301, proxy perimetral de imágenes con `immutable`, ThumbHash LQIP, inyección de cabecera `Link rel="alternate"` y negociación Markdown para agentes).
  - `profile-stats.test.mjs`: Panel de perfil, estadísticas cinemáticas, cálculo de notas/estrellas, exportación CSV/JSON y reconciliación de sesión (`openProfileModal` con `mergeOnLogin`).
  - `contracts-state-utils.test.mjs`: Contratos de datos, formato canónico de edad de fallecidos `✝ (74)`, tipos de error, paridad de slugs y normalizadores puros.
  - `api-rating-critical.test.mjs`: Normalización de parámetros RPC, claves de caché canónicas, discriminación de directores y conversión de notas a estrellas en tarjetas.
  - `pure-functions.test.mjs`: Funciones puras de formateo, puntuación y equivalencia SPA vs. SSR.
  - `shared-and-events.test.mjs`: Integridad del SSOT de constantes, taxonomías compartidas y ciclo de vida del bus de eventos sin fugas de memoria.
  - `local-first-sync.test.mjs`: Arquitectura local-first (`localStore.ts`, `syncManager.ts`), resolución LWW, persistencia de estados (`dirty`/`synced`/`deleted`) y reconciliación remota.
  - `llms-spec.test.mjs`: Verificación de la especificación de rutas canónicas en `llms.txt` y `llms-full.txt` frente a las taxonomías oficiales.

## 💾 Backend y Base de Datos (PostgreSQL / Supabase)

### Tablas Principales

- `movies`: Núcleo central. Identificador inmutable `id` (`PRIMARY KEY`), metadatos, valoraciones (FA, IMDb, y `avg_rating` calculada automáticamente) y campos de vectores de texto (`_tsv`) para búsqueda rápida.
- `actors`, `directors`: Entidades de los VIPs.
- Relaciones N:M: `movie_actors`, `movie_directors`, `movie_genres`, `movie_selections`, `movie_studios`.
- `user_movie_entries`: Almacena las valoraciones (1-10) y la Watchlist (boolean) por usuario con exclusividad mutua.
- Tablas `_staging`: Usadas para el proceso ETL (ingesta masiva desde CSV con datos consolidados completos) mediante la función diferencial `process_staging_data()`. La columna `show IS TRUE` actúa como filtro de admisión (gatekeeper) para la carga al catálogo consolidado cruzando por clave primaria inmutable `id`.

### Lógica Avanzada SQL (`docs/script.sql`, `docs/schema.sql` y `docs/data_tests.sql`)

- **Columnas Generadas (`GENERATED ALWAYS AS ... STORED`)**: Usadas para calcular campos `tsvector` de búsqueda en tiempo de inserción, descargando al procesador durante las consultas `SELECT`. También se usa para normalizar textos (`unaccent`).
- **Índices y Operadores Cualificados**:
  - Índices GIN con Trigramas cualificados (`extensions.gin_trgm_ops`) para autocompletado ultra-rápido en nombres de actores, directores y componentes de colectivos.
  - Índices compuestos para consultas habituales (Ej: `country_id, type, year DESC`).
- **Vistas Materializadas (`mv_*`)**: Caché pre-calculada de las sugerencias del buscador para no saturar la CPU de la base de datos contando películas. Auto-convergencia segura con `RESTRICT` e índices dedicados.
- **RPC Principal (`search_movies_offset`)**: Función PL/pgSQL responsable de toda la lógica de filtrado del backend.
  - **Late Row Lookup**: Ordena solo IDs y métricas ligeras con **desempate determinista (`m.id ASC`)** para evitar saltos entre páginas, y _luego_ hace JOIN con textos pesados (sinopsis, arrays) y empaqueta en JSON puro (`json_build_object`).
  - **Daily Showcase Adaptativo (Alternativa 2)**: Para el orden `"relevance,asc"`, baraja 378 películas en la portada limpia, y en filtros específicos aplica una ventana proporcional según el volumen de títulos: Top 12 (< 50 títulos), Top 24 (50..200 títulos) o Top 42 (> 200 títulos), ordenando el resto de forma 100% estricta por `relevance ASC`. Búsquedas y personas VIP quedan excluidas de barajado.
  - **Compensación de Personas con Guiones (Fases 3.6 y 3.7)**: Al recibir nombres transformados a espacios desde el frontend (`slugToPersonQuery`), el SQL compensa mediante reconstrucción contra el índice `slug` y un fallback alfanumérico estricto (`regexp_replace(name_norm, '[^a-z0-9]', '', 'g')`), garantizando que nombres como "Daniel Day-Lewis" o "Jean-Luc Godard" casen siempre sin importar la pérdida del guion en URL.
  - **Mitigación de Deep Pagination DoS (Fase 1.4)**: Cortocircuito inmediato si `v_offset > 15000`, previniendo el consumo abusivo de CPU e IOPS mediante escaneo, ordenación y descarte secuencial en memoria/disco por parte de clientes públicos anónimos (`anon`).
  - **Mitigación de Input Inflation DoS (Fase 1.3)**: Cortocircuito temprano si los arrays `p_country_codes`, `excluded_genres` o `excluded_countries` superan 10 elementos, o si `search_term` excede 100 caracteres, bloqueando la saturación de CPU por `unnest` y lematización lingüística masiva.
- **ETL Diferencial de Alto Rendimiento (`process_staging_data`)**: Pipeline transaccional con tabla temporal en memoria (`tmp_affected_staging`), cruce por clave primaria inmutable `id` (`ON CONFLICT (id) DO UPDATE`), admisión por `show IS TRUE` y **pre-agregación lineal $O(N_1 + N_2 + ...)$** que elimina la multiplicación por producto cartesiano en relaciones N:M.
- **DataOps Quality Gate (`run_data_tests`)**: Suite declarativa inspirada en dbt ejecutada nativamente en PostgreSQL, integrada en GitHub Actions ([`.github/workflows/data-audit.yml`](../.github/workflows/data-audit.yml)) mediante [`scripts/run-data-tests.mjs`](../scripts/run-data-tests.mjs) (ejecución diaria programada a las 03:00 UTC y manual), desacoplada del pipeline de despliegue continuo de código para optimizar los tiempos de ciclo en CI.
- **Seguridad (RLS & DCL Hardening)**: Row Level Security habilitado en todas las tablas. Lectura pública general; `user_movie_entries` protegida con política unificada `FOR ALL` al `auth.uid()`; tablas de staging restringidas exclusivamente a `service_role` mediante DCL (`REVOKE ALL`). Hardening explícito en vistas de telemetría (`view_slow_queries`, `view_top_cpu_queries`) y funciones de auditoría (`run_data_tests`) revocando el acceso por defecto de `PUBLIC`/`anon` para evitar exfiltración de telemetría o abusos DoS vía RPC.
- **`search_path` Seguro**: Fijado estrictamente en todas las funciones `SECURITY DEFINER` (`SET search_path = pg_catalog, public, extensions, pg_temp;`).
- **Auditoría Forense y Mitigaciones**: Documentadas íntegramente en `docs/security.md`.

## ⚡ Patrones de Rendimiento y Arquitectura (Performance)

1. **Prevención de Layout Thrashing:**
   Separación estricta de las lecturas del DOM (ej. `.offsetHeight`, `.scrollY`) de las escrituras del DOM (ej. `.classList.add`). Se orquesta con `requestAnimationFrame` en el scroll.
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
   Garantía de que exactamente una sola imagen en pantalla (tarjeta VIP en posición 0 o primera película) ostente `fetchpriority="high"` y `loading="eager"`. Eliminación de instancias redundantes de `new Image()` en `applyLqipImage`, unificando el ThumbHash como `backgroundImage` directo y conectando el `src` al elemento `<img>` del DOM. Reutilización higiénica de un único elemento `<link data-lcp-preload="true">` en `<head>` para evitar preloads huérfanos acumulativos.
10. **Determinación Certera de Estado VIP y Consistencia de Offset:**
   Para personas (directores/actores), la condición VIP (`vip === 1` o `birthday`) se resuelve con certeza antes de calcular los parámetros de paginación del catálogo (`personCache` en 0 ms si ya está en memoria). Si la persona no es VIP, se solicita el `fetchLimit` íntegro en pág. 1 y el offset estándar `(page - 1) * basePageSize` en pág. 2+, previniendo la pérdida de una película en la primera página o la duplicación de la última película en páginas sucesivas. En grupos (colección/estudio), la tarjeta VIP es determinista y su metadata se paraleliza con `Promise.all`.
11. **Consolidación Canónica de Facetas y Directivas Robots:**
   Colapso estricto de parámetros secundarios y efímeros (`page`, `sort`, filtros combinados) hacia la URL canónica de la categoría base limpia (`getCanonicalUrl`), resolviendo el problema de dispersión de rastreo e indexación duplicada en navegación facetada. Asignación determinista de `noindex, follow` en búsquedas libres y listas privadas, junto a `index, follow, max-image-preview:large` en vistas de catálogo público.
12. **Escalonado Fluido de Cuadrícula con Container Queries Multi-Navegador:**
   Implementación de escalones graduados mediante Container Queries (`@container (min-width: 600px)` para 4 columnas y `@container (min-width: 760px)` para 5 columnas) en el modo exploración, asegurando una densidad visual y tamaño de tarjetas idéntico entre navegadores que integran barras de herramientas fijas (como Opera) y navegadores con viewport despejado (como Chrome).
13. **Optimización de Transición Modal y Depuración de Tooltips:**
   Ajuste de tiempos y aceleración en las transiciones de apertura y cierre de la modal de detalle desde las fichas del grid para una respuesta táctil y visual instantánea, junto con la retirada de atributos redundantes `title="Sinopsis"` en plantillas del cliente y SSR.

## ⏱️ Protocolo de Eficiencia en Desarrollo y Validación (Cost & Latency Optimization)

Para optimizar el uso de recursos, reducir tiempos de ciclo y minimizar costes operativos en agentes de IA y flujos CI/CD:

1. **Diagnóstico Directo:** Identificación precisa de la causa raíz mediante lecturas de código acotadas y análisis focalizado antes de intervenir.
2. **Edición Quirúrgica:** Modificación exclusiva de las líneas responsables del comportamiento deseado, sin formateos globales ni alteraciones en módulos colaterales.
3. **Validación Mínima Suficiente (*Targeted Testing & Builds*):**
   - **Pruebas Focalizadas:** Ejecutar únicamente el archivo de pruebas correspondiente al módulo modificado (`node --test tests/<modulo>.test.mjs`), evitando suites globales innecesarias durante la iteración activa.
   - **Compilaciones Desacopladas:** Construir únicamente los artefactos alterados (ej. compilar CSS sin regenerar manifiestos pesados de base de datos).
   - **Fast-Path Commit (3 segundos):** Para commits y pushes estándar, PROHIBIDO ejecutar `prepare:worker` (que consulta la BD remota de Supabase) o la suite completa local de 205 tests (que toma ~13s levantando SSR en Node). La validación local inmediata se limita a `npx tsc --noEmit` (~1s) o test focalizado si aplica. La suite exhaustiva queda delegada al CI remoto en GitHub Actions tras el push.

