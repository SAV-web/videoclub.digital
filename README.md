# VIDEOCLUB.DIGITAL

> Progressive Web App (PWA) *mobile-first* para explorar, filtrar y catalogar cine y series con arquitectura *Local-First* y renderizado perimetral Edge SSR sobre Cloudflare Workers.

---

## Stack Principal

| Capa | Tecnología |
| :--- | :--- |
| **Frontend SPA** | TypeScript (ES2022 estricto), HTML5 `<template>`, CSS3 nativo, Vite |
| **Edge SSR & CDN** | Cloudflare Workers (`cloudflare/worker.js` + Static Assets), Cache API, negociación Markdown (`Accept: text/markdown`) |
| **SSOT Compartido** | Módulos isomórficos en `src/shared/` para SPA, Edge SSR, scripts y tests |
| **Backend & Datos** | Supabase (PostgreSQL 15+, RPC `search_movies_offset`, RLS, Storage) + IndexedDB (*Local-First* + SWR) |
| **Calidad & Testing** | Node.js Test Runner nativo (`tests/*.test.mjs`), `tsc --noEmit`, DataOps en PostgreSQL |

---

## Estructura del Proyecto

```text
VIDEOCLUB.DIGITAL/
├── index.html          # Shell HTML principal, CSS crítico y <template>s
├── vite.config.js      # Configuración Vite e inyección de versión del Service Worker
├── wrangler.toml       # Configuración de Cloudflare Workers y Static Assets
├── src/
│   ├── shared/         # Fuente Única de Verdad (slugs, constantes, formateadores, tipos)
│   ├── js/             # Cliente SPA TypeScript (estado, API/SWR, renderEngine, componentes)
│   └── css/            # Sistema de estilos modular (tokens, layout, componentes)
├── cloudflare/         # Edge Worker (proxy, caché, SSR SEO y Markdown GEO)
├── database/           # Esquema DDL, RPCs PostgreSQL, ETL y tests DataOps
├── scripts/            # Generadores de build (llms, sitemap, manifiesto VIP, CSS SEO)
├── public/             # Assets estáticos, PWA manifest y Service Worker (sw.js)
├── tests/              # Suite de pruebas unitarias y de integración (Node.js)
└── docs/               # Manual maestro de contratos y guías especializadas
```

---

## Comandos de Desarrollo

- **Instalación:** `npm install`
- **Desarrollo local:** `npm run dev` (`http://localhost:5173`)
- **Chequeo de tipos y bundle del Worker:** `npm run check`
- **Suite completa de tests:** `npm run test`
- **Auditoría DataOps (PostgreSQL):** `node scripts/run-data-tests.mjs --strict`
- **Build de producción (SPA):** `npm run build`
- **Preparar / empaquetar / desplegar Worker:** `npm run prepare:worker` · `npm run build:worker` · `npm run deploy:worker`

---

## Documentación

- [**Manual Maestro y Contratos del Sistema**](docs/contracts.md): Arquitectura normativa completa (estado, URLs, *Daily Showcase*, *Local-First*, Edge SSR, modales y rendimiento).
- [**Contratos de Calidad de Datos (DataOps)**](docs/data_contracts.md): Aserciones declarativas nativas en PostgreSQL.
- [**Seguridad y Auditoría**](docs/security.md): Controles perimetrales, CSP, RLS y sanitización.
- [**Invalidación del Service Worker**](docs/service_worker_invalidation.md): Políticas de caché PWA y versionado.
- [**Guía de Cloudflare Edge**](cloudflare/README.md): DNS, proxy de imágenes, cachés y smoke tests.
