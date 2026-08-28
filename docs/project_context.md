# VIDEOCLUB.DIGITAL - Project Context & Architecture

## 📌 Visión General

**videoclub.digital** es una Progressive Web App (PWA) móvil-first diseñada para explorar, filtrar y descubrir películas y series. Actúa como un "oráculo cinéfilo" con un motor de búsqueda y filtrado extremadamente rápido, integración de cuentas de usuario, y un enfoque obsesivo en el rendimiento web (60-120 FPS, optimización de CPU/GPU, y prevención de re-renders innecesarios).

## 🛠️ Stack Tecnológico

- **Frontend:** TypeScript (ES2022+), HTML5 Semántico, CSS3 (Variables, Grid, Flexbox, Container Queries).
- **Build Tool:** Vite (con esbuild y TypeScript para minificación y type-checking estricto).
- **Backend/Database:** Supabase (PostgreSQL), Supabase Auth, Supabase Storage.
- **PWA:** Service Worker propio (`sw.js`) inyectado dinámicamente con versión por timestamp en build time vía Vite, con estrategias de caché `CACHE_STATIC` y `CACHE_DYNAMIC` y `manifest.webmanifest`.
- **Dependencias Externas Clave:** `@supabase/supabase-js`, `lru-cache` (caché en memoria para búsquedas/filtros).

## 📂 Estructura del Proyecto

### 1. Archivos Raíz y Configuración

- `index.html`: Punto de entrada. Contiene el CSS crítico (_Above the Fold_), preloads, meta tags SEO, y los `<template>` de los componentes para instanciación rápida.
- `vite.config.js`: Configurado para generar código moderno (`es2022`), minificación de CSS, separación de chunks (vendor, supabase) e inyección automática de versión de Service Worker (`injectSwVersion`).
- `public/404.html`: Fallback SPA para GitHub Pages. Intercepta rutas directas y recargas (`F5`) no coincidentes y redirige a la raíz preservando la ruta y query string mediante `?_p=` y `?_q=`.
- `public/sw.js`: Service Worker interceptor con versión inyectada dinámicamente (`vYYYYMMDDHHMM`) y estrategias:
  - _Network First_ (`CACHE_STATIC` para navegación HTML y App Shell).
  - _Stale-While-Revalidate_ (`CACHE_DYNAMIC` para assets estáticos JS/CSS y precacheo de `./sprite.svg` y `./flags.svg` en `CRITICAL_ASSETS`).
  - _Cache First_ (`CACHE_DYNAMIC` para pósters de Supabase Storage con límite FIFO).
  - _Exclusiones de API_: Las llamadas RPC y Auth viajan vía POST o manejan datos vivos; se gestionan mediante `lru-cache` en el cliente (`src/js/api.ts`).
  - Estrategia de invalidación documentada en `docs/service_worker_invalidation.md`.

### 2. Módulos Compartidos SSOT (`src/shared/`)

- **`slugs.ts`**: Fuente Única de Verdad para slugs canónicos. Mapea y normaliza los 21 géneros canónicos oficiales (`GENRE_SLUG_MAP`), el catálogo oficial de países (`COUNTRY_SLUG_MAP`), estudios, colecciones y personas. La resolución de sinónimos temáticos y multilingües de búsqueda se delega dinámicamente a PostgreSQL (`genres.synonyms`).
- **`constants.ts`**: Constantes globales compartidas, límites de años dinámicos y taxonomías.
- **`formatters.ts`**: Funciones puras de formateo, puntuación y normalización de texto.

### 3. Frontend TS (`src/js/`)

Arquitectura modular con tipado estricto (TypeScript), funciones puras y delegación de eventos.

- **`main.ts`**: Orquestador principal. Maneja el scroll global (Batched Reads/Writes para evitar _Layout Thrashing_), hidratación inicial y la orquestación de la carga de la cuadrícula (`loadAndRenderMovies`) con secuencia determinista (Estado $\to$ URL $\to$ SEO $\to$ Fetch $\to$ Render).
- **`state.ts`**: Gestor de estado global inmutable. Sincroniza la URL (_Pretty Paths_ y QueryParams) con el estado de la aplicación (`activeFilters`, `currentPage`, `userMovieData`), y ejecuta `canonicalizeCurrentUrl()` para garantizar URLs canónicas estrictas.
- **`contracts.ts`**: Definición central de contratos de datos, códigos de error (`ERROR_CODES`), detección unificada del base path (`getAppBasePath()`), generación de URLs canónicas de filtros (`buildFilterUrl`), guardas de tipos y normalizadores puros de bajo nivel (`parseYearRangeRaw`, `normalizeMovieId`).
- **`api.ts`**: Capa de acceso a datos. Implementa deduplicación de peticiones (_In-flight requests_), `AbortController` para cancelar consultas obsoletas, memoria LRU (`queryCache`, `suggestionsCache`, `personCache`) y normalización de parámetros para el RPC `search_movies_offset`.
- **`ui.ts`**: Controladores genéricos del DOM. Maneja Toasts, esqueletos de carga (_Skeletons_), paginación y las trampas de foco (_Focus Trap_) para modales.
- **`seo.ts`**: Generador dinámico de `JSON-LD` (Schema.org), títulos, breadcrumbs, `og:url` y canonical tags siempre referenciados a la URL canónica pura vía `getCanonicalUrl()`.
- **`utils.ts`**: Herramientas puras de alto rendimiento. Incluye creadores de nodos DOM veloces (`createElement` vía `Object.assign`), normalización de texto (eliminación de acentos), formateadores y gestión segura de `localStorage`.
- **`constants.ts`**: Fuente única de la verdad. Almacena mapeos de clases CSS, selectores del DOM, SVG sprites integrados (`ICONS`), límites de paginación y mapeos de plataformas (Netflix, HBO, etc).
- **`auth.ts`**: Lógica de registro y login delegada a Supabase Auth.
- **`types.ts`**: Interfaces TypeScript centralizadas (`MappedMovie`, `ActiveFilters`, `UserMovieEntry`, `PersonDetails`, `VipData`).

### 3. Componentes TS (`src/js/components/`)

- **`card.ts`**: Renderizador masivo de la cuadrícula (_Grid_). Utiliza `yieldToMain` y fragmentos del DOM para instanciar el HTML por lotes y no congelar el hilo principal. Controla interacciones hápticas y de _hover/flip_. En el reverso, los géneros se muestran como texto plano informativo no clickable, y al pulsar `+` en la línea de reparto se despliega el panel superpuesto (`.actors-scrollable-content`) con **Géneros interactivos arriba** y **Reparto de actores abajo**. Incorpora tarjetas especiales VIP para personas con soporte de **Insignias de Doble Rol** (`(D)` en ficha de actor, `(A)` en ficha de director) que permiten alternar su filmografía entre roles con un solo clic.
- **`modal.ts`**: Vista rápida (_Quick View_). Implementa modal flotante en dos columnas con scroll vertical independiente en escritorio y móvil apaisado (_landscape_), y formato _Bottom Sheet_ en móviles verticales con física de arrastre (_swipe-to-dismiss_) y _View Transitions API_ para el efecto _Hero_ desde la tarjeta. Los enlaces dentro de la modal (géneros, directores, actores, año, insignias de rol cruzado) son interactivos y cierran automáticamente la modal al aplicarse.
- **`sidebar.ts`**: Menú lateral de filtrado avanzado. Incluye autocompletado en tiempo real con guardias de longitud mínima (`>= 2`), debouncing y soporte bidireccional para **colectivos y dúos cinematográficos** (ej. buscar "Hermanos Russo" sugiere a Joe y Anthony Russo, y viceversa), control de rango con slider, acordeones CSS nativos y gestos de _swipe_ para abrir/cerrar. Implementa reconciliación de píldoras DOM y exclusiones visuales (`(NO País) x`).
- **`rating.ts`**: Lógica visual del sistema de puntuación por estrellas y lógica de votación de usuario (optimista), manteniendo la exclusividad mutua con la Watchlist.
- **`yearSlider.ts`**: Componente nativo de control de rango de años doble (_DualRangeSlider_) con soporte táctil, arrastre fluido de pivotes, cálculos precisos de porcentaje y sin dependencias externas.

### 4. Subsistema SEO Astro (`seo-site/`)

- **Propósito**: Generador estático (_Static Site Generation - SSG_) para indexación en motores de búsqueda (Google, Bing).
- **Tecnología**: Astro 5+ con TypeScript.
- **Páginas Generadas**: Fichas estáticas de títulos (`/titulo/[slugId]`), directores y actores con metadatos OpenGraph, Twitter Cards y microdatos JSON-LD (`Schema.org`).
- **Integración en Despliegue**: En el pipeline de CI/CD, los artefactos de `seo-site/dist` se fusionan con el `dist` principal de la SPA antes de publicar en GitHub Pages.

### 5. Estilos (`src/css/`)

- **`variables.css`**: Design tokens. Fuentes (Inter), paleta de colores adaptable (Tema Claro/Oscuro dinámico con tokens como `--color-rating-star` y `--color-accent-darker`) y duraciones de animación (_Quiet Luxury easing_).
- **`globals.css`**: Reset, utilidades generales y scrollbars personalizados.
- **`layout.css`**: Estructura macro basada en Container Queries (`container-type: inline-size`) y CSS Grid para la cuadrícula principal adaptativa.
- **`components/*.css`**: CSS scopeado a componentes. Uso intensivo de `contain: layout paint style` y `content-visibility: auto` para máximo rendimiento. Evita transicionar propiedades pesadas (`width`, `padding`) en móviles, priorizando `transform` y `opacity` (GPU).

### 6. Suite de Tests (`tests/`)

- Tests unitarios ejecutados con el rodador nativo de Node.js (`node --test`).
- **`tests/helpers/vite-ssr.mjs`**: Helper unificado `startViteSsrServer()` que arranca el entorno Vite en modo SSR de forma aislada para cargar módulos TypeScript directamente sin duplicidad de configuración.

## 💾 Backend y Base de Datos (PostgreSQL / Supabase)

### Tablas Principales

- `movies`: Núcleo central. Almacena metadatos, valoraciones (FA, IMDb, y `avg_rating` calculada automáticamente) y campos de vectores de texto (`_tsv`) para búsqueda rápida.
- `actors`, `directors`: Entidades de los VIPs.
- Relaciones N:M: `movie_actors`, `movie_directors`, `movie_genres`, `movie_selections`, `movie_studios`.
- `user_movie_entries`: Almacena las valoraciones (1-10) y la Watchlist (boolean) por usuario con exclusividad mutua.
- Tablas `_staging`: Usadas para el proceso ETL (ingesta masiva desde CSV con datos consolidados completos) mediante la función diferencial `process_staging_data()`. La columna `show = '1'` actúa como filtro de admisión (gatekeeper) para la carga al catálogo consolidado.

### Lógica Avanzada SQL (`docs/script.sql` y `docs/schema.sql`)

- **Columnas Generadas (`GENERATED ALWAYS AS ... STORED`)**: Usadas para calcular campos `tsvector` de búsqueda en tiempo de inserción, descargando al procesador durante las consultas `SELECT`. También se usa para normalizar textos (`unaccent`).
- **Índices y Operadores Cualificados**:
  - Índices GIN con Trigramas cualificados (`extensions.gin_trgm_ops`) para autocompletado ultra-rápido en nombres de actores, directores y componentes de colectivos.
  - Índices compuestos para consultas habituales (Ej: `country_id, type, year DESC`).
- **Vistas Materializadas (`mv_*`)**: Caché pre-calculada de las sugerencias del buscador para no saturar la CPU de la base de datos contando películas. Auto-convergencia segura con `RESTRICT` e índices dedicados.
- **RPC Principal (`search_movies_offset`)**: Función PL/pgSQL responsable de toda la lógica de filtrado del backend. Implementa patrón **"Late Row Lookup"**: ordena solo IDs y métricas ligeras con **desempate determinista (`m.id ASC`)** para evitar saltos entre páginas, y _luego_ hace JOIN con textos pesados (sinopsis, arrays) y empaqueta en JSON puro (`json_build_object`).
- **ETL Diferencial de Alto Rendimiento (`process_staging_data`)**: Pipeline transaccional con tabla temporal en memoria (`tmp_affected_staging`) y **pre-agregación lineal $O(N_1 + N_2 + ...)$** que elimina la multiplicación por producto cartesiano en relaciones N:M.
- **Seguridad (RLS & DCL)**: Row Level Security habilitado en todas las tablas. Lectura pública general; `user_movie_entries` protegida con política unificada `FOR ALL` al `auth.uid()`; tablas de staging restringidas exclusivamente a `service_role` mediante DCL (`REVOKE ALL`).
- **`search_path` Seguro**: Fijado estrictamente en todas las funciones `SECURITY DEFINER` (`SET search_path = pg_catalog, public, extensions, pg_temp;`).

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
   Todos los módulos (`card.ts`, `modal.ts`, `sidebar.ts`, `main.ts`) implementan funciones de desmontaje explícito (`disposeCardEvents`, `disposeModalEvents`, `disposeSidebarEvents`, `disposeMainEvents`, `disposeApp`) y un bus de eventos global con desuscripción limpia (`appEvents.off`, `appEvents.clearAll`) para prevenir _memory leaks_ y listeners huérfanos.
