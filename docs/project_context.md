# VIDEOCLUB.DIGITAL - Contexto del Proyecto y Arquitectura

## 📌 Visión General

**videoclub.digital** es una Progressive Web App (PWA) de alto rendimiento orientada a móvil (*mobile-first*), diseñada para explorar, filtrar, catalogar y descubrir cine clásico y de culto con una experiencia de usuario distinguida (*Quiet Luxury*) y latencia ultra-baja.

El sistema fusiona una Single Page Application (SPA) reactiva y *Local-First* con una capa de renderizado perimetral en el Edge (*Server-Side Rendering*) sobre Cloudflare Workers para optimización extrema en motores de búsqueda (SEO) y accesibilidad universal.

---

## 🛠️ Stack Tecnológico

| Capa | Tecnologías Clave |
| :--- | :--- |
| **Frontend SPA** | TypeScript (ES2022 estricto), HTML5 semántico con `<template>`, CSS3 moderno (Nesting nativo, Container Queries, CSS Grid/Flexbox, View Transitions API), Vite. |
| **Edge & Proxy** | Cloudflare Workers, Cloudflare Cache API, Service Worker perimetral (*Stale-While-Revalidate* e invalidación versionada). |
| **Backend & Datos** | Supabase (PostgreSQL 15+), funciones RPC optimizadas en PL/pgSQL, vistas materializadas, Row Level Security (RLS), Supabase Storage. |
| **Almacenamiento Local** | IndexedDB nativo (*Local-First Storage*) para calificaciones, estados de seguimiento (*watchlist*) y notas personales con sincronización SWR en segundo plano. |
| **Testing & Calidad** | Node.js Test Runner nativo (205 tests concurrentes sin dependencias pesadas), TypeScript Type Checking estricto (`tsc --noEmit`). |

---

## 📂 Arquitectura por Capas del Sistema

```
├── cloudflare/          # Capa Perimetral: Edge SSR, Reverse Proxy, Cache API y SEO
│   ├── worker.js        # Punto de entrada del Cloudflare Worker (enrutador perimetral)
│   └── seo/             # Renderizadores HTML estáticos para bots y rastreadores
├── src/
│   ├── shared/          # Single Source of Truth (SSOT): constantes, slugs, formateadores y tipos
│   ├── js/              # Lógica del cliente SPA (TypeScript)
│   │   ├── api.ts       # Cliente de datos, caché canónica y reconciliación SWR
│   │   ├── state.ts     # Estado global reactivo basado en Proxies con WeakMap y bus appEvents
│   │   ├── renderEngine.ts # Orquestación de cuadrícula, paginación y slots VIP
│   │   ├── localStore.ts # Persistencia Local-First sobre IndexedDB (caché y datos de usuario)
│   │   ├── syncManager.ts # Cola de sincronización bidireccional y resolución LWW
│   │   └── components/  # Componentes modulares con ciclo de vida explícito (SRP)
│   │       ├── card/        # Fichas de película y autor (3D flip, modo muro 2D, LQIP)
│   │       ├── modal/       # Vista rápida cinemática y ficha técnica
│   │       └── sidebar/     # Filtros facetados, piscinas curadas y Oráculo global
│   └── css/             # SSOT de estilos (tokens de marca, nesting y responsive)
├── database/            # Backend relacional: esquemas, RPCs, ingesta ETL y tests de datos
├── public/              # Assets estáticos, manifest PWA y Service Worker (sw.js)
├── docs/                # Documentación canónica viva
│   └── archive/         # Memoria técnica histórica y registro de hitos
└── tests/               # Batería de pruebas unitarias y de integración en Node.js
```

### 1. Núcleo Perimetral y Edge SSR (`cloudflare/`)
- **Renderizado Perimetral de Rutas SEO:** Intercepta rutas indexables (`/titulo/:slug/`, `/director/:slug/`, `/actor/:slug/`, `/genero/:slug/`, `/pais/:slug/`, etc.) inyectando HTML semántico completo, meta tags OpenGraph, marcado estructurado JSON-LD y CSS crítico embebido antes de entregar la respuesta al navegador o bot.
- **Reverse Proxy & Cache API:** Cachea las respuestas RPC anónimas de `/api/rpc/search_movies_offset` en el Edge de Cloudflare con cabeceras deterministas (`s-maxage=21600, stale-while-revalidate=86400`) y proxy transparente de imágenes hacia Supabase Storage.
- **Fail-Closed Security:** Validación estricta de variables de entorno y cabeceras de seguridad simétricas (CSP, HSTS, X-Frame-Options DENY).

### 2. Fuente Única de Verdad Compartida (`src/shared/`)
- Módulos isomórficos consumidos idénticamente por el cliente SPA, los scripts de compilación, el worker perimetral y los tests:
  - `slugs.ts`: Generación canónica y desambiguación de slugs (eliminación de acentos, caracteres especiales y colisiones).
  - `constants.ts`: Tamaños de página, semillas temporales y piscinas curadas estáticas.
  - `formatters.ts`: Formateo canónico de duraciones, notas y años cinematográficos.
  - `types.ts`: Contratos e interfaces canónicas transversales.
- *Nota arquitectónica:* El diccionario normativo de taxonomías reside de forma isomórfica en `cloudflare/seo/taxonomy-types.js` y `src/js/constants.ts`, mientras que el bus global tipado de eventos (`appEvents`) reside en `src/js/state.ts`.

### 3. Cliente SPA y Gestión de Estado (`src/js/`)
- **Estado Reactivo (`state.ts`):** Proxies transparentes cacheados mediante `WeakMap` para reactividad en $O(1)$ sin sobrecarga de memoria ni recreación de envolturas.
- **Sincronización Local-First (`localStore.ts`, `syncManager.ts`, `api.ts`):** Los datos personales (watchlist, notas, estrellas) se graban sincrónicamente en memoria e IndexedDB (0 ms de latencia percibida) y se sincronizan asíncronamente con Supabase en segundo plano (*Optimistic UI + Background Reconciliation*).
- **Carga Diferida del SDK (`auth.ts`):** Visitantes anónimos navegan con 0 KB del SDK de Supabase. La librería se descarga bajo demanda solo cuando el usuario interactúa con funciones de autenticación.

### 4. Componentes Modulares y Ciclo de Vida (`src/js/components/`)
- Principio de Responsabilidad Única (SRP): Cada componente gestiona su propio DOM, escuchadores y funciones de desmontaje explícito (`disposeCardEvents`, `disposeModalEvents`, `disposeSidebarEvents`).
- Delegación de eventos en contenedores raíz (`#grid-container`, `#quick-view-content`) para evitar listeners acumulativos sobre cientos de tarjetas.

---

## 💾 Backend y Base de Datos (PostgreSQL / Supabase)

### Tablas Principales
- **`movies`**: Catálogo fílmico indexado (título, año, directores, actores, slug, rating, póster, thumbhash LQIP).
- **`people`**: Creadores (directores/actores) con soporte de doble rol (`A`, `D`, `AD`, `DA`), condición VIP, biografía, lugar/fecha de nacimiento y fallecimiento.
- **`user_movie_entries`**: Registro personal de usuarios (watchlist, notas, valoraciones) blindado con Row Level Security (RLS).
- **`countries`**, **`studios`**, **`selections`**: Tablas de referencia normalizadas.

### Funciones RPC Críticas
1. **`search_movies_offset`**: Motor de filtrado y ordenación principal:
   - **Showcase Determinista Diario:** Barajado pseudoaleatorio basado en semilla de fecha (`hashtext(seed || movie_id)`) que cambia diariamente a medianoche UTC preservando estabilidad de paginación.
   - **Fast-Path de Portada Limpia:** Detección de navegación inicial sin filtros para resolver el total de catálogo mediante *Index-Only Scan* en ~2 ms.
   - **Conteo Desacoplado (`get_count`):** Parámetro booleano que permite devolver las tarjetas inmediatamente y calcular el total en una petición en segundo plano no bloqueante.
2. **`process_staging_data`**: Pipeline ETL de ingesta de creadores y películas: deduplicación canónica insensible a mayúsculas y acentos (`unaccent_immutable`), casteo seguro de países e identificación de condición VIP.

---

## ⚡ 10 Principios Invariantes de Rendimiento y Arquitectura

1. **Desacoplamiento Crítico de Conteo (Pintar Primero → Contar Después):**
   La primera carga de catálogo solicita `get_count = false` para no demorar el First Contentful Paint esperando el cálculo secuencial de `COUNT(*)` en PostgreSQL. La UI se libera inmediatamente y el total se resuelve en segundo plano de forma atómica.
2. **Navegación Fluida sin Parpadeo (*In-Flight Stale Grid*):**
   Al cambiar de página o filtro con contenido ya visible, se conserva el grid anterior con opacidad sutil y `aria-busy="true"`, sustituyendo el DOM de una sola vez al llegar los nuevos datos, reservando los esqueletos únicamente para la primera carga en frío.
3. **Cero Salto de Maquetación (*Zero Cumulative Layout Shift*):**
   Las tarjetas reales y los esqueletos de carga comparten estrictamente la misma relación de aspecto matemática (`aspect-ratio: 500 / 950` en modo normal y `2 / 3` en Modo Muro), asegurando un CLS = 0 absoluto durante transiciones.
4. **Camino Crítico LCP y Preloads Higiénicos:**
   Exactamente una sola carátula visible (tarjeta VIP en posición 0 o primera película del catálogo) ostenta `fetchpriority="high"` y `loading="eager"`. Se reutiliza un único elemento `<link data-lcp-preload="true">` en `<head>` para evitar fugas de preloads acumulativos.
5. **Arquitectura Local-First SWR en Datos de Usuario:**
   Toda interacción con películas (añadir a favoritos, calificar con estrellas) muta síncronamente el estado en memoria y la base de datos local IndexedDB, postergando la sincronización remota a la red en segundo plano. Si la revalidación en caliente detecta discrepancias remotas, reconcilia suavemente la vista.
6. **Aplanamiento y Poda en Modo Muro (Optimización 2D para GPU):**
   En Modo Muro (`body.rotation-disabled`), las tarjetas no rotan. Las caras traseras se retiran del árbol de renderizado con `display: none !important` y se anulan los contextos 3D (`perspective: none`, `transform-style: flat`), garantizando 60-120 FPS fluidos en listas de 72 elementos.
7. **Dieta Estricta del Bundle y Carga Diferida:**
   El SDK de Supabase, las modales de autenticación/perfil y sus hojas de estilo CSS secundarias se cargan estrictamente bajo demanda (*Lazy Loading*), asegurando que el bundle crítico inicial de la SPA pese menos de 45 KB gzipped.
8. **Piscinas Curadas Estáticas en Descubrimiento (Zero Network Discovery):**
   Las sugerencias de autores en el menú lateral se nutren de colecciones curadas estáticas (100 referentes mundiales verificados), erradicando peticiones dinámicas de red en la apertura del menú y garantizando un montaje en 0 ms.
9. **Paridad Cromática y Coherencia de Marca (Quiet Luxury):**
   Unificación rigurosa de superficies y paleta entre tipos de fichas (películas, directores, actores, estudios y colecciones). Fichas VIP utilizan el mismo fondo de superficie corporativo (`--color-surface-1`) y acento de marca (`--color-accent`), eliminando oros estridentes y respetando contraste AA en modo claro y oscuro.
10. **Aislamiento DOM y Prevención de Layout Thrashing:**
    Separación estricta de lecturas geométricas (`getBoundingClientRect`, `scrollY`) de escrituras (mutación de clases o estilos). Delegación centralizada de eventos mediante burbujeo nativo para evitar acumulación de listeners.

---

## ⏱️ Protocolo de Eficiencia en Desarrollo y Validación (Cost & Latency Optimization)

Para optimizar recursos y tiempos de ejecución durante el mantenimiento continuo, se aplica un triple principio operativo estricto:

1. **Diagnóstico Directo:** Identificación precisa de la causa raíz mediante lecturas de código focalizadas por rangos de línea, sin ejecuciones globales no solicitadas.
2. **Edición Quirúrgica:** Modificación atómica exclusiva de las líneas responsables del problema, sin reformateos ni efectos colaterales en módulos adyacentes.
3. **Validación Mínima Suficiente (*Targeted Testing & Builds*):**
   - **Zero Chrome DevTools proactivo:** El servidor local de Vite actualiza la pantalla del usuario en tiempo real vía HMR. Prohibido abrir navegadores headless de forma automática salvo petición explícita de auditoría.
   - **Tests focalizados:** Ejecución exclusiva del test unitario específico del archivo modificado (ej. `node --test tests/card.test.mjs`). La suite completa de 219 tests se delega a la integración continua (CI) en GitHub Actions.
   - **Fast-Path Commit:** En órdenes de subida o commit, validación de tipos ultra-rápida (`npx tsc --noEmit`, ~1s) y encadenamiento atómico inmediato (`git add -A && git commit -m "..." && git push`).

---

## 📜 Memoria Histórica y Registro de Hitos

El registro pormenorizado de los **61 hitos de ingeniería y refactorizaciones técnicas** ejecutados en el proyecto se encuentra preservado íntegramente en:
👉 [**`docs/archive/CHANGELOG_MILESTONES.md`**](file:///docs/archive/CHANGELOG_MILESTONES.md)
