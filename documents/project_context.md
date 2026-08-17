# VIDEOCLUB.DIGITAL - Project Context & Architecture

## 📌 Visión General
**videoclub.digital** es una Progressive Web App (PWA) móvil-first diseñada para explorar, filtrar y descubrir películas y series. Actúa como un "oráculo cinéfilo" con un motor de búsqueda y filtrado extremadamente rápido, integración de cuentas de usuario, y un enfoque obsesivo en el rendimiento web (60-120 FPS, optimización de CPU/GPU, y prevención de re-renders innecesarios).

## 🛠️ Stack Tecnológico
- **Frontend:** TypeScript (ES2022+), HTML5 Semántico, CSS3 (Variables, Grid, Flexbox, Container Queries).
- **Build Tool:** Vite (con esbuild y TypeScript para minificación y type-checking estricto).
- **Backend/Database:** Supabase (PostgreSQL), Supabase Auth, Supabase Storage.
- **PWA:** Service Worker propio (`sw.js`) inyectado dinámicamente con versión por timestamp en build time vía Vite, con estrategias de caché avanzadas y `manifest.webmanifest`.
- **Dependencias Externas Clave:** `@supabase/supabase-js`, `lru-cache` (caché en memoria), `nouislider` (control de rango de años).

## 📂 Estructura del Proyecto

### 1. Archivos Raíz y Configuración
- `index.html`: Punto de entrada. Contiene el CSS crítico (*Above the Fold*), preloads, meta tags SEO, y los `<template>` de los componentes para instanciación rápida.
- `vite.config.ts`: Configurado para generar código moderno (`es2022`), minificación de CSS, separación de chunks (vendor, supabase) e inyección automática de versión de Service Worker (`injectSwVersion`).
- `public/sw.js`: Service Worker interceptor con versión inyectada dinámicamente (`vYYYYMMDDHHMM`) y estrategias: 
  - *Network First* (HTML).
  - *Stale-While-Revalidate* (Assets estáticos).
  - *Cache First* (Pósters de Supabase Storage).
  - *Custom TTL Cache* (RPC Calls).
  - Estrategia de invalidación documentada en `documents/service_worker_invalidation.md`.

### 2. Frontend TS (`src/js/`)
Arquitectura modular con tipado estricto (TypeScript), funciones puras y delegación de eventos.
- **`main.ts`**: Orquestador principal. Maneja el scroll global (Batched Reads/Writes para evitar *Layout Thrashing*), hidratación inicial y la orquestación de la carga de la cuadrícula (`loadAndRenderMovies`).
- **`state.ts`**: Gestor de estado global inmutable. Sincroniza la URL (QueryParams) con el estado de la aplicación (`activeFilters`, `currentPage`, `userMovieData`).
- **`api.ts`**: Capa de acceso a datos. Implementa deduplicación de peticiones (*In-flight requests*), `AbortController` para cancelar consultas obsoletas y memoria LRU (`queryCache`, `suggestionsCache`).
- **`ui.ts`**: Controladores genéricos del DOM. Maneja Toasts, esqueletos de carga (*Skeletons*), paginación y las trampas de foco (*Focus Trap*) para modales.
- **`seo.ts`**: Generador dinámico de `JSON-LD` (Schema.org), títulos y breadcrumbs para SEO en clientes con JS habilitado.
- **`utils.ts`**: Herramientas puras de alto rendimiento. Incluye creadores de nodos DOM veloces (`createElement` vía `Object.assign`), normalización de texto (eliminación de acentos), formateadores y gestión segura de `localStorage`.
- **`constants.ts`**: Fuente única de la verdad. Almacena mapeos de clases CSS, selectores del DOM, SVG sprites integrados (`ICONS`), límites de paginación y mapeos de plataformas (Netflix, HBO, etc).
- **`contracts.ts`**: Definición central de contratos de datos, códigos de error (`ERROR_CODES`), guardas de tipos y normalizadores puros de bajo nivel (`parseYearRangeRaw`, `normalizeMovieId`).
- **`auth.ts`**: Lógica de registro y login delegada a Supabase Auth.
- **`types.ts`**: Interfaces TypeScript centralizadas (`MappedMovie`, `ActiveFilters`, `UserMovieEntry`, `PersonDetails`, `VipData`).

### 3. Componentes TS (`src/js/components/`)
- **`card.ts`**: Renderizador masivo de la cuadrícula (*Grid*). Utiliza `yieldToMain` y fragmentos del DOM para instanciar el HTML por lotes y no congelar el hilo principal. Controla interacciones hápticas y de *hover/flip*. En el reverso, los géneros se muestran como texto plano informativo no clickable, y al pulsar `+` en la línea de reparto se despliega el panel superpuesto (`.actors-scrollable-content`) con **Géneros interactivos arriba** y **Reparto de actores abajo**.
- **`modal.ts`**: Vista rápida (*Quick View*). Implementa modal flotante en dos columnas con scroll vertical independiente en escritorio y móvil apaisado (*landscape*), y formato *Bottom Sheet* en móviles verticales con física de arrastre (*swipe-to-dismiss*) y *View Transitions API* para el efecto *Hero* desde la tarjeta. Los enlaces dentro de la modal (géneros, directores, actores, año) son interactivos y cierran automáticamente la modal al aplicarse.
- **`sidebar.ts`**: Menú lateral de filtrado avanzado. Incluye autocompletado en tiempo real, control de rango con slider, acordeones CSS nativos y gestos de *swipe* para abrir/cerrar. Implementa reconciliación de píldoras DOM y exclusiones visuales (`(NO País) x`).
- **`rating.ts`**: Lógica visual del sistema de puntuación por estrellas y lógica de votación de usuario (optimista), manteniendo la exclusividad mutua con la Watchlist.

### 4. Estilos (`src/css/`)
- **`variables.css`**: Design tokens. Fuentes (Inter), paleta de colores adaptable (Tema Claro/Oscuro dinámico con tokens como `--color-rating-star` y `--color-accent-darker`) y duraciones de animación (*Quiet Luxury easing*).
- **`globals.css`**: Reset, utilidades generales y scrollbars personalizados.
- **`layout.css`**: Estructura macro basada en Container Queries (`container-type: inline-size`) y CSS Grid para la cuadrícula principal adaptativa.
- **`components/*.css`**: CSS scopeado a componentes. Uso intensivo de `contain: layout paint style` y `content-visibility: auto` para máximo rendimiento. Evita transicionar propiedades pesadas (`width`, `padding`) en móviles, priorizando `transform` y `opacity` (GPU).

### 5. Suite de Tests (`tests/`)
- Tests unitarios ejecutados con el rodador nativo de Node.js (`node --test`).
- **`tests/helpers/vite-ssr.mjs`**: Helper unificado `startViteSsrServer()` que arranca el entorno Vite en modo SSR de forma aislada para cargar módulos TypeScript directamente sin duplicidad de configuración.

## 💾 Backend y Base de Datos (PostgreSQL / Supabase)

### Tablas Principales
- `movies`: Núcleo central. Almacena metadatos, valoraciones (FA, IMDb, y `avg_rating` calculada automáticamente) y campos de vectores de texto (`_tsv`) para búsqueda rápida.
- `actors`, `directors`: Entidades de los VIPs.
- Relaciones N:M: `movie_actors`, `movie_directors`, `movie_genres`, `movie_selections`, `movie_studios`.
- `user_movie_entries`: Almacena las valoraciones (1-10) y la Watchlist (boolean) por usuario.
- Tablas `_staging`: Usadas exclusivamente para el proceso ETL (ingesta masiva desde CSV) mediante Triggers de `UPSERT`.

### Lógica Avanzada SQL (`documents/script_sql.txt`)
- **Columnas Generadas (`GENERATED ALWAYS AS ... STORED`)**: Usadas para calcular campos `tsvector` de búsqueda en tiempo de inserción, descargando al procesador durante las consultas `SELECT`. También se usa para normalizar textos (`unaccent`).
- **Índices**: 
  - Índices GIN con Trigramas (`pg_trgm`) para autocompletado ultra-rápido en nombres de actores/directores.
  - Índices compuestos para consultas habituales (Ej: `country_id, type, year DESC`).
- **Vistas Materializadas (`mv_*`)**: Caché pre-calculada de las sugerencias del buscador para no saturar la CPU de la base de datos contando películas.
- **RPC Principal (`search_movies_offset`)**: Función PL/pgSQL responsable de toda la lógica de filtrado del backend. Implementa patrón **"Late Row Lookup"**: ordena solo IDs y métricas ligeras y *luego* hace JOIN con textos pesados (sinopsis, arrays) y empaqueta en JSON puro (`json_build_object`).
- **Seguridad (RLS)**: Row Level Security habilitado en todo. Lectura pública general; `user_movie_entries` bloqueada estrictamente al `auth.uid()`.

## ⚡ Patrones de Rendimiento y Arquitectura (Performance)

1. **Prevención de Layout Thrashing:** 
   Separación estricta de las lecturas del DOM (ej. `.offsetHeight`, `.scrollY`) de las escrituras del DOM (ej. `.classList.add`). Se orquesta con `requestAnimationFrame` en el scroll.
2. **DOM Lazy Loading:**
   Las secciones pesadas como el listado completo de actores en la parte trasera de una tarjeta no se renderizan al crear la tarjeta. Se insertan dinámicamente mediante `DocumentFragment` solo cuando el usuario pulsa "Ver Reparto".
3. **In-Flight Deduplication & AbortControllers:**
   Si el usuario pulsa repetidamente un filtro, las peticiones HTTP previas se abortan automáticamente para evitar sobrecarga de red y *race conditions* visuales.
4. **View Transitions API:**
   Animaciones nativas para transicionar del grid a la vista de detalle, con fallback seguro para navegadores antiguos.
5. **Aislamiento de Renderizado CSS:**
   Uso intensivo de la propiedad `contain` y `will-change: transform` para evitar que las animaciones locales provoquen recálculos globales en la pantalla.
