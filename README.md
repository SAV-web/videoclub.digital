# VIDEOCLUB.DIGITAL 🎬🍿

> Progressive Web App (PWA) móvil-first de altísimo rendimiento para explorar, filtrar y descubrir películas y series en tiempo real.

---

## 📌 Visión General

**videoclub.digital** actúa como un "oráculo cinéfilo" interactivo. Ofrece un motor de búsqueda y filtrado multinivel extremadamente ágil (por estudio, género, país, directores, actores, rango de años y listas personalizadas), respaldado por un backend potente en Supabase (PostgreSQL) y una arquitectura frontend optimizada para alcanzar **60-120 FPS** sin bloqueos del hilo principal.

---

## 🚀 Características Principales

- 🔍 **Filtrado Avanzado & Multinivel**:
  - Filtros combinados por Estudio (© Universal, Warner, etc.), Género, País (banderas interactivas en fichas y modal), Colecciones/Sagas y Rango de Años (Dual Slider).
  - Búsqueda exacta de Directores y Actores con tarjetas informativas dedicadas (*VIP Cards* / Biografías).
  - Soporte para **colectivos y dúos cinematográficos** (ej. Hermanos Russo $\leftrightarrow$ Joe y Anthony Russo) con búsqueda e indexación bidireccional.
  - **Insignias de Doble Rol VIP** (`(D)` en fichas de actor, `(A)` en fichas de director) para alternar filmografías con un solo clic.
  - Notificaciones informativas automáticas al conmutar filtros de persona excluyendo categorías previas incompatibles.
  - Píldoras dinámicas de exclusión (ej. `(NO España) x`).
- ⚡ **Rendimiento Extraordinario (PWA Mobile-First)**:
  - Carga masiva en la cuadrícula por lotes priorizados (`yieldToMain`) y resolución de plantillas mediante *Lazy Getters* a prueba de arranques en frío (*cold boots*).
  - Micro-animaciones de elevación primaveral en todas las tarjetas al pasar el ratón, con supresión de recuadro en fichas VIP.
  - Animaciones de portada fluidas con **View Transitions API** nativa.
  - Caché inteligente en memoria LRU multiescala con deduplicación de peticiones en vuelo y reintentos automáticos progresivos (*backoff*) ante arranques en frío (*cold-starts*).
  - Sincronización determinista de estado y botones responsive ante rotaciones de pantalla (*portrait/landscape*).
  - Service Worker propio con invalidación automatizada por compilación.
- ⭐ **Gestión de Usuario & Exclusividad**:
  - Autenticación con Supabase Auth.
  - Gestión de puntuaciones personalizadas y Watchlist (pendientes de ver) con reglas estrictas de exclusividad mutua.
- 📱 **Experiencia Móvil Nativa**:
  - Interfaz responsiva con Container Queries y cabecera elástica *sticky* sin solapamientos.
  - Línea informativa en cabecera estructurada 1:1 con la jerarquía canónica de las URLs.
  - Menú lateral deslizante (*Drawer*) y modales *Bottom Sheet* con física de arrastre (*swipe-to-dismiss*) y respuesta háptica.
- 🧹 **Gestión de Ciclo de Vida y Limpieza (Teardown)**:
  - Funciones de desmontaje explícito (`disposeApp`, `disposeCardEvents`, `disposeModalEvents`, etc.) y bus de eventos global seguro para garantizar cero fugas de memoria (*zero memory leaks*).

---

## 🛠️ Stack Tecnológico

| Capa | Tecnología |
| --- | --- |
| **Frontend Core (SPA)** | TypeScript (ES2022+), HTML5 Semántico |
| **Estilos (CSS)** | Vanilla CSS3 (Variables, Grid, Flexbox, Container Queries, `contain: layout paint`) |
| **Embalado & Build** | Vite (con plugin de inyección automática de versión de SW `injectSwVersion`) |
| **Edge & CDN** | Cloudflare Worker (`cloudflare/worker.js`) para Edge SSR (títulos, personas VIP, taxonomías), `immutable` cache, proxy de pósters y negociación IA |
| **Fuente Única de Verdad (SSOT)** | Módulos compartidos en `src/shared/` para reglas de negocio y formateadores |
| **Subsistema SEO (SSG & Edge SSR)** | Cloudflare Edge SSR + Astro 5+ en [`seo-site/`](seo-site/) (Generación de fichas públicas, sitemaps y JSON-LD) |
| **Backend & DB** | Supabase (PostgreSQL 15+, PL/pgSQL RPC `search_movies_offset`, RLS, Trigram Indexes) |
| **PWA & Offline** | Service Worker (`public/sw.js`) con invalidación dinámica por timestamp (`vYYYYMMDDHHMM`) |
| **Caché Local** | `lru-cache` en memoria para catálogo/sugerencias + `localStorage` versionado |
| **Testing & Calidad** | Node.js Test Runner nativo (155 tests en 29 suites) + DataOps nativo en PostgreSQL (`run_data_tests`) |

---

## 📂 Estructura del Proyecto

```text
VIDEOCLUB.DIGITAL/
├── index.html                   # Shell HTML principal, CSS crítico y plantillas <template>
├── vite.config.js               # Configuración de Vite y plugin inyector de Service Worker
├── package.json                 # Dependencias y scripts de desarrollo/test
├── cloudflare/                  # Capa perimetral en el Edge (Cloudflare Worker & SSR)
│   ├── worker.js                # Edge SSR de títulos, taxonomías, personas VIP, proxy de imágenes y negociación Markdown
│   ├── seo/                     # Renderizadores perimetrales HTML/CSS (render-taxonomy, render-person, render-movie)
│   └── README.md                # Guía de configuración y verificación de Cloudflare Edge
├── scripts/                     # Scripts auxiliares de automatización y CI
│   ├── build-seo-css.mjs        # Compilador de CSS SEO minificado (/public/seo-card-v7.css y módulo Worker)
│   ├── generate-llms.mjs        # Generador de especificaciones llms.txt y llms-full.txt
│   ├── generate-sitemap.mjs     # Generador de sitemaps XML unificados (/sitemap.xml y sitemap-index)
│   ├── generate-vip-manifest.mjs# Generador de manifiesto de personas VIP para descarte O(1) en Edge
│   ├── run-data-tests.mjs       # DataOps Runner: evalúa contratos de calidad en PostgreSQL
│   └── sync-sprites.mjs         # Sincronizador de iconos SVG inlined en index.html
├── public/
│   ├── 404.html                 # Fallback SPA para GitHub Pages (?_p y ?_q)
│   ├── sw.js                    # Service Worker interceptor (CACHE_STATIC y CACHE_DYNAMIC)
│   └── manifest.webmanifest     # Manifiesto PWA
├── src/
│   ├── css/                     # Sistema de diseño modular en Vanilla CSS
│   │   ├── variables.css        # Tokens de diseño (temas claro/oscuro, paletas, timings)
│   │   ├── globals.css          # Estilos globales y reset
│   │   ├── layout.css           # Estructura principal y grid adaptativo
│   │   └── components/          # Estilos scopeados por componente (card, modal, sidebar con alto contraste, etc.)
│   ├── js/                      # Lógica de la aplicación en TypeScript
│   │   ├── main.ts              # Orquestador del DOM y flujo de renderizado
│   │   ├── state.ts             # Estado inmutable global y sincronización con URL
│   │   ├── api.ts               # Capa de datos, reintentos, deduplicación e integración Supabase
│   │   ├── contracts.ts         # Contratos, guardas de tipos, getAppBasePath() y normalizadores
│   │   ├── types.ts             # Interfaces TypeScript centralizadas
│   │   ├── utils.ts             # Helpers de alto rendimiento y manipuladores DOM
│   │   ├── ui.ts                # Gestión genérica de interfaz (Toasts, Skeletons, Paginación, Theme Toggle)
│   │   └── components/          # Módulos UI (card, modal, sidebar, rating, yearSlider)
│   └── shared/                  # Fuente Única de Verdad (SSOT) compartida entre SPA y SEO
│       ├── slugs.ts             # Slugs canónicos, aliases oficiales de 21 géneros y expansión SQL
│       ├── constants.ts         # Constantes de negocio, configuraciones y taxonomías
│       └── formatters.ts        # Funciones puras de formateo, puntuación y normalización
├── seo-site/                    # Subsistema Astro para generación estática (SSG) de SEO
│   ├── astro.config.mjs         # Configuración del generador estático
│   ├── src/pages/               # Páginas públicas indexables (/titulo/[slugId], /director/[slug], etc.)
│   └── public/                  # Sitemaps XML y recursos estáticos de indexación
├── tests/                       # Suite de 155 pruebas unitarias y de integración
│   ├── helpers/vite-ssr.mjs     # Servidor auxiliar Vite SSR para ejecución de tests
│   ├── url-contract.test.mjs    # Test del contrato canónico de URLs y Tabla de Prohibidos
│   ├── worker.test.mjs          # Smoke tests del Cloudflare Worker (Edge SSR, proxy y headers)
│   ├── profile-stats.test.mjs   # Estadísticas de usuario y reconciliación de login
│   └── *.test.mjs               # Pruebas de api, state, rating, seo, utils, formatters
└── docs/                        # Documentación técnica y de arquitectura
    ├── project_context.md       # Contexto global y mapa del proyecto
    ├── contracts.md             # Especificación de contratos de datos, URLs y temas
    ├── data_contracts.md        # Disciplina DataOps y catálogo de aserciones PostgreSQL
    ├── data_tests.sql           # Suite nativa de pruebas de base de datos (run_data_tests)
    ├── service_worker_invalidation.md # Estrategia de versión e invalidación del SW
    ├── script.sql               # Esquema SQL completo, funciones RPC e índices
    ├── schema.sql               # Esquema DDL de tablas y restricciones relacionales
    └── ingest.sql               # Script post-CSV: ETL diferencial, vistas y estadísticas
```

---

## 💻 Comandos de Desarrollo

### Requisitos previos
- Node.js (versión 20+ o 22 recomendada)
- npm

### 1. Instalación de dependencias
```bash
npm install
```

### 2. Entorno de desarrollo local
```bash
npm run dev
```
Abre `http://localhost:5173` en tu navegador.

### 3. Verificación de tipos TypeScript
```bash
npm run check
```

### 4. Ejecución de la suite completa de tests (155 pruebas en 29 suites)
```bash
npm run test
```

### 5. Auditoría de calidad de datos en base de datos (DataOps)
```bash
node scripts/run-data-tests.mjs --strict
```

### 6. Compilación de la SPA para producción
```bash
npm run build
```
Genera la especificación llms, manifiestos VIP, sitemaps, CSS de SEO y la carpeta `dist/` optimizada con inyección automática de versión de Service Worker.

### 7. Compilación y Despliegue del Cloudflare Worker (Edge SSR)
```bash
# Empaqueta el worker unificado en cloudflare/dist/worker.bundle.js
npm run build:worker

# O despliega directamente a Cloudflare Workers vía Wrangler CLI
npm run deploy:worker
```

---

## 📖 Documentación Adicional

Para más detalles sobre la arquitectura interna y decisiones de diseño técnico, consulta la carpeta [`docs/`](docs/):

- 📘 [**Project Context & Architecture**](docs/project_context.md): Explicación exhaustiva del stack, estructura y patrones de rendimiento.
- 📐 [**Contratos de Datos y URLs**](docs/contracts.md): Definición formal de las interfaces `ActiveFilters`, `MappedMovie`, contrato de URLs y tabla de valores prohibidos.
- 🛡️ [**Contratos de Calidad de Datos (DataOps)**](docs/data_contracts.md): Framework declarativo de pruebas nativas en PostgreSQL y automatización en CI.
- 🔄 [**Estrategia de Invalidación del Service Worker**](docs/service_worker_invalidation.md): Explicación de políticas de caché, aislamiento de origen y despliegue.
- ☁️ [**Configuración de Cloudflare Edge**](cloudflare/README.md): Guía de configuración perimetral de proxy de imágenes y negociación Markdown.
- 🗄️ [**Script SQL & Backend Schema**](docs/script.sql): Código de la función RPC `search_movies_offset`, ETL diferencial e índices trigrama.
- 🗃️ [**Contexto SQL & DDL Schema**](docs/schema.sql): Definición de tablas relacionales, columnas generadas y restricciones de base de datos.
