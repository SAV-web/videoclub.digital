# VIDEOCLUB.DIGITAL 🎬🍿

> Progressive Web App (PWA) móvil-first de altísimo rendimiento para explorar, filtrar y descubrir películas y series en tiempo real.

---

## 📌 Visión General

**videoclub.digital** actúa como un "oráculo cinéfilo" interactivo. Ofrece un motor de búsqueda y filtrado multinivel extremadamente ágil (por estudio, género, país, directores, actores, rango de años y listas personalizadas), respaldado por un backend potente en Supabase (PostgreSQL) y una arquitectura frontend optimizada para alcanzar **60-120 FPS** sin bloqueos del hilo principal.

---

## 🚀 Características Principales

- 🔍 **Filtrado Avanzado & Multinivel**:
  - Filtros combinados por Estudio (Universal, Warner, etc.), Género, País, Colecciones/Sagas y Rango de Años (Dual Slider).
  - Búsqueda exacta de Directores y Actores con tarjetas informativas dedicadas (Visions/VIP Cards).
  - Píldoras dinámicas de exclusión (ej. `(NO España) x`).
- ⚡ **Rendimiento Extraordinario (PWA Mobile-First)**:
  - Carga masiva en la cuadrícula por lotes priorizados (`yieldToMain`).
  - Animaciones de portada fluidas con **View Transitions API** nativa.
  - Caché inteligente en memoria LRU y Service Worker propio offline.
- ⭐ **Gestión de Usuario & Exclusividad**:
  - Autenticación con Supabase Auth.
  - Gestión de puntuaciones personalizadas y Watchlist (pendientes de ver) con reglas estrictas de exclusividad mutua.
- 📱 **Experiencia Móvil Nativa**:
  - Interfaz responsiva con Container Queries.
  - Menú lateral deslizante (*Drawer*) y modales *Bottom Sheet* con física de arrastre (*swipe-to-dismiss*) y respuesta háptica.

---

## 🛠️ Stack Tecnológico

| Capa | Tecnología |
| --- | --- |
| **Frontend Core (SPA)** | TypeScript (ES2022+), HTML5 Semántico |
| **Estilos (CSS)** | Vanilla CSS3 (Variables, Grid, Flexbox, Container Queries, `contain: layout paint`) |
| **Embalado & Build** | Vite (con plugin de inyección automática de versión de SW `injectSwVersion`) |
| **Subsistema SEO (SSG)** | Astro 5+ en [`seo-site/`](seo-site/) (Generación estática de fichas públicas, sitemaps y JSON-LD) |
| **Backend & DB** | Supabase (PostgreSQL 15+, PL/pgSQL RPC `search_movies_offset`, RLS, Trigram Indexes) |
| **PWA & Offline** | Service Worker (`public/sw.js`) con invalidación dinámica por timestamp (`vYYYYMMDDHHMM`) |
| **Caché Local** | `lru-cache` en memoria para búsquedas/filtros + `localStorage` versionado |
| **Testing** | Node.js Test Runner nativo (`node --test`) + Vite SSR Server para aislamiento |

---

## 📂 Estructura del Proyecto

```text
VIDEOCLUB.DIGITAL/
├── index.html                   # Shell HTML principal, CSS crítico y plantillas <template>
├── vite.config.js               # Configuración de Vite y plugin inyector de Service Worker
├── package.json                 # Dependencias y scripts de desarrollo/test
├── public/
│   ├── sw.js                    # Service Worker interceptor (CACHE_STATIC y CACHE_DYNAMIC)
│   └── manifest.webmanifest     # Manifiesto PWA
├── src/
│   ├── css/                     # Sistema de diseño modular en Vanilla CSS
│   │   ├── variables.css        # Tokens de diseño (temas claro/oscuro, paletas, timings)
│   │   ├── globals.css          # Estilos globales y reset
│   │   ├── layout.css           # Estructura principal y grid adaptativo
│   │   └── components/          # Estilos scopeados por componente (card, modal, sidebar, etc.)
│   └── js/                      # Lógica de la aplicación en TypeScript
│       ├── main.ts              # Orquestador del DOM y flujo de renderizado
│       ├── state.ts             # Estado inmutable global y sincronización con URL
│       ├── api.ts               # Capa de datos, deduplicación e integración Supabase (LRU Cache)
│       ├── contracts.ts         # Contratos, guardas de tipos y normalizadores puros
│       ├── types.ts             # Interfaces TypeScript centralizadas
│       ├── utils.ts             # Helpers de alto rendimiento y manipuladores DOM
│       ├── ui.ts                # Gestión genérica de interfaz (Toasts, Skeletons, Paginación)
│       └── components/          # Módulos UI (card, modal, sidebar, rating, yearSlider)
├── seo-site/                    # Subsistema Astro para generación estática (SSG) de SEO
│   ├── astro.config.mjs         # Configuración del generador estático
│   ├── src/pages/               # Páginas públicas indexables (/titulo/[slugId], /director/[slug], etc.)
│   └── public/                  # Sitemaps XML y recursos estáticos de indexación
├── tests/                       # Suite de pruebas unitarias
│   ├── helpers/vite-ssr.mjs     # Servidor auxiliar Vite SSR para ejecución de tests
│   └── *.test.mjs               # Archivos de test unitarios (api, state, rating, seo, utils)
└── docs/                        # Documentación técnica detallada de arquitectura
    ├── project_context.md       # Contexto global y mapa del proyecto
    ├── contracts.md             # Especificación de contratos de datos y fronteras
    ├── service_worker_invalidation.md # Estrategia de versión e invalidación del SW
    ├── script.sql               # Esquema SQL, funciones RPC e índices de Supabase
    └── schema.sql               # Esquema DDL de tablas y restricciones relacionales
```

---

## 💻 Comandos de Desarrollo

### Requisitos previos
- Node.js (versión 18+ recomendada)
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

### 4. Ejecución de la suite de pruebas unitarias
```bash
npm run test
```

### 5. Compilación para producción
```bash
npm run build
```
Genera la carpeta `dist/` optimizada e inyecta la versión del Service Worker.

---

## 📖 Documentación Adicional

Para más detalles sobre la arquitectura interna y decisiones de diseño técnico, consulta la carpeta [`docs/`](docs/):

- 📘 [**Project Context & Architecture**](docs/project_context.md): Explicación exhaustiva del stack, estructura y patrones de rendimiento.
- 📐 [**Contratos de Datos**](docs/contracts.md): Definición formal de las interfaces `ActiveFilters`, `MappedMovie`, `UserMovieEntry` y gestión de errores.
- 🔄 [**Estrategia de Invalidación del Service Worker**](docs/service_worker_invalidation.md): Explicación de políticas de caché y despliegue.
- 🗄️ [**Script SQL & Backend Schema**](docs/script.sql): Código de la función RPC `search_movies_offset`, índices trigrama y Row Level Security.
- 🗃️ [**Contexto SQL & DDL Schema**](docs/schema.sql): Definición de tablas relacionales, columnas generadas y restricciones de base de datos.
