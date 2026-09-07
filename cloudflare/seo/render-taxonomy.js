// =================================================================
//      RENDERIZADOR HTML DE LANDINGS DE TAXONOMÍAS EN EL EDGE
//             (cloudflare/seo/render-taxonomy.js)
// =================================================================
// Renderiza páginas HTML5 completas, semánticas, accesibles (WCAG)
// y optimizadas para SEO (Schema.org CollectionPage, ItemList,
// Open Graph, Speculation Rules API) para géneros, países,
// estudios cinematográficos y selecciones editoriales.
// =================================================================

function escapeHtml(str) {
  if (str == null) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function escapeAttr(str) {
  return escapeHtml(str);
}

function safeJsonLd(obj) {
  return JSON.stringify(obj)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026');
}

/**
 * Renderiza una tarjeta individual dentro del grid de la colección.
 */
function renderCollectionItem(movie, siteOrigin, storageUrl) {
  const title = movie.title || movie.original_title || 'Sin título';
  const year = movie.year || '';
  const slug = movie.slug || '';
  const movieUrl = `${siteOrigin}/titulo/${slug}/`;
  const posterUrl = `${siteOrigin}/posters/${slug}.webp`;
  const rating = (movie.fa_rating && movie.fa_rating > 0)
    ? movie.fa_rating.toFixed(1)
    : (movie.avg_rating ? movie.avg_rating.toFixed(1) : null);
  const directors = movie.directors || '';

  return `
    <article class="collection-card">
      <a href="${escapeAttr(movieUrl)}" class="collection-card-poster-link" aria-label="${escapeAttr(title)} (${escapeAttr(year)})">
        <div class="collection-poster-wrap">
          <img
            src="${escapeAttr(posterUrl)}"
            alt="${escapeAttr(title)}"
            loading="lazy"
            decoding="async"
            width="300"
            height="450"
            onerror="this.style.opacity='0.2'"
          />
          ${rating ? `<span class="collection-card-rating" aria-label="Valoración ${rating} sobre 10">★ ${escapeHtml(rating)}</span>` : ''}
        </div>
      </a>
      <div class="collection-card-info">
        <h2 class="collection-card-title">
          <a href="${escapeAttr(movieUrl)}">${escapeHtml(title)}</a>
        </h2>
        <div class="collection-card-meta">
          ${year ? `<span class="collection-card-year">${escapeHtml(year)}</span>` : ''}
          ${directors ? `<span class="collection-card-director" title="${escapeAttr(directors)}">${escapeHtml(directors)}</span>` : ''}
        </div>
      </div>
    </article>
  `;
}

/**
 * Renderiza la página HTML completa para la taxonomía.
 * 
 * @param {object} taxInfo Información de la taxonomía resuelta
 * @param {Array} items Lista de películas/series destacadas
 * @param {object} options Opciones de contexto ({ siteOrigin, storageUrl })
 * @returns {string} HTML5 válido
 */
export function renderTaxonomyHtml(taxInfo, items, options = {}) {
  const siteOrigin = options.siteOrigin || 'https://videoclub.digital';
  const storageUrl = options.storageUrl || 'https://wibygecgfczcvaqewleq.supabase.co/storage/v1/object/public';
  const canonicalUrl = `${siteOrigin}/${taxInfo.canonicalSlug}/`;
  const spaRedirectUrl = `${siteOrigin}/?_p=/${taxInfo.canonicalSlug}/`;

  const topMovie = items && items.length > 0 ? items[0] : null;
  const ogImageUrl = topMovie && topMovie.slug 
    ? `${siteOrigin}/posters/${topMovie.slug}.webp` 
    : `${storageUrl}/assets/og-default.jpg`;

  // 1. Schema.org CollectionPage + ItemList
  const collectionSchema = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    "name": taxInfo.title,
    "description": taxInfo.description,
    "url": canonicalUrl,
    "inLanguage": "es",
    "mainEntity": {
      "@type": "ItemList",
      "numberOfItems": items.length,
      "itemListElement": items.map((m, index) => ({
        "@type": "ListItem",
        "position": index + 1,
        "item": {
          "@type": (m.type && String(m.type).toLowerCase().startsWith('s')) ? "TVSeries" : "Movie",
          "name": m.title || m.original_title,
          "url": `${siteOrigin}/titulo/${m.slug}/`,
          "image": `${siteOrigin}/posters/${m.slug}.webp`,
          ...(m.year ? { "datePublished": String(m.year) } : {}),
          ...(m.fa_rating ? {
            "aggregateRating": {
              "@type": "AggregateRating",
              "ratingValue": String(m.fa_rating),
              "bestRating": "10",
              "worstRating": "1",
              "ratingCount": m.fa_votes || 1
            }
          } : {})
        }
      }))
    }
  };

  // 2. Schema.org BreadcrumbList
  const breadcrumbSchema = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    "itemListElement": [
      {
        "@type": "ListItem",
        "position": 1,
        "name": "Videoclub",
        "item": `${siteOrigin}/`
      },
      {
        "@type": "ListItem",
        "position": 2,
        "name": taxInfo.categoryBreadcrumb,
        "item": `${siteOrigin}/`
      },
      {
        "@type": "ListItem",
        "position": 3,
        "name": taxInfo.name,
        "item": canonicalUrl
      }
    ]
  };

  // 3. Speculation Rules API (Prerender SPA y prefetch de primeros títulos)
  const topSlugsUrls = items.slice(0, 5).map(m => `${siteOrigin}/titulo/${m.slug}/`);
  const speculationRules = {
    prerender: [{ source: "list", urls: ["/"] }],
    prefetch: [{ source: "list", urls: topSlugsUrls }]
  };

  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta name="theme-color" content="#f5f5f5" media="(prefers-color-scheme: light)" />
  <meta name="theme-color" content="#0d0d0d" media="(prefers-color-scheme: dark)" />
  <!-- Anti-flicker para sincronización de modo claro/oscuro con el grid -->
  <script>
    (function () {
      try {
        var stored = localStorage.getItem("theme");
        var systemDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
        var isDark = stored === "dark" || (!stored && systemDark) || (!stored && stored === null);
        if (isDark) {
          document.documentElement.classList.add("dark-mode");
          document.documentElement.classList.remove("light-mode");
        } else if (stored === "light") {
          document.documentElement.classList.add("light-mode");
          document.documentElement.classList.remove("dark-mode");
        }
        var metas = document.querySelectorAll('meta[name="theme-color"]');
        metas.forEach(function(m) { m.setAttribute("content", isDark ? "#0d0d0d" : "#f5f5f5"); });
      } catch (e) {}
    })();
  </script>
  <title>${escapeHtml(taxInfo.seoTitle)}</title>
  <meta name="description" content="${escapeAttr(taxInfo.description)}" />
  <link rel="canonical" href="${escapeAttr(canonicalUrl)}" />
  <meta name="robots" content="index, follow, max-image-preview:large" />

  <!-- Open Graph -->
  <meta property="og:title" content="${escapeAttr(taxInfo.seoTitle)}" />
  <meta property="og:description" content="${escapeAttr(taxInfo.description)}" />
  <meta property="og:url" content="${escapeAttr(canonicalUrl)}" />
  <meta property="og:type" content="website" />
  <meta property="og:image" content="${escapeAttr(ogImageUrl)}" />
  <meta property="og:site_name" content="Videoclub Digital" />
  <meta property="og:locale" content="es_ES" />

  <!-- Twitter Card -->
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="${escapeAttr(taxInfo.seoTitle)}" />
  <meta name="twitter:description" content="${escapeAttr(taxInfo.description)}" />
  <meta name="twitter:image" content="${escapeAttr(ogImageUrl)}" />

  <!-- Structured Data: CollectionPage & Breadcrumbs -->
  <script type="application/ld+json">${safeJsonLd(collectionSchema)}</script>
  <script type="application/ld+json">${safeJsonLd(breadcrumbSchema)}</script>
  <script type="speculationrules">${safeJsonLd(speculationRules)}</script>

  <!-- CSS Unificado (Servido en Edge Memory con design tokens) -->
  <link rel="stylesheet" href="/seo-card-v3.css" />
  <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
</head>
<body class="collection-theme">
  <!-- Cabecera de Marca -->
  <header class="site-header">
    <div class="header-content">
      <a href="/" class="brand-logo" aria-label="Ir a la videoteca completa">
        <span class="logo-line-1">VIDEOCLUB</span>
        <span class="logo-line-2">DIGITAL</span>
      </a>
      <div class="header-controls">
        <a href="${escapeAttr(spaRedirectUrl)}" class="btn-header-cta" title="Abrir en el Videoclub interactivo" aria-label="Abrir en el Videoclub interactivo">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="20" height="20">
            <polygon points="5 3 19 12 5 21 5 3"></polygon>
          </svg>
        </a>
      </div>
    </div>
  </header>

  <main class="collection-main">
    <div class="collection-wrapper">
      <!-- Migas de Pan -->
      <nav class="collection-breadcrumbs" aria-label="Migas de pan">
        <a href="/">Inicio</a>
        <span class="breadcrumb-sep">/</span>
        <span>${escapeHtml(taxInfo.categoryBreadcrumb)}</span>
        <span class="breadcrumb-sep">/</span>
        <span class="breadcrumb-current" aria-current="page">${escapeHtml(taxInfo.name)}</span>
      </nav>

      <!-- Hero de Colección -->
      <section class="collection-hero">
        <div class="collection-badge-tag">${escapeHtml(taxInfo.badgeLabel.toUpperCase())}</div>
        <h1 class="collection-title">${escapeHtml(taxInfo.title)}</h1>
        <p class="collection-description">${escapeHtml(taxInfo.description)}</p>
        
        <div class="collection-hero-actions">
          <a href="${escapeAttr(spaRedirectUrl)}" class="btn-open-spa">
            <svg viewBox="0 0 24 24" fill="currentColor" width="18" height="18">
              <polygon points="5 3 19 12 5 21 5 3"></polygon>
            </svg>
            <span>Explorar en Videoclub Interactivo</span>
          </a>
          <span class="collection-stats-pill">${items.length} títulos destacados</span>
        </div>
      </section>

      <!-- Grid de Títulos -->
      <section class="collection-grid-container" aria-label="Títulos destacados de ${escapeAttr(taxInfo.name)}">
        <div class="collection-grid">
          ${items.map(m => renderCollectionItem(m, siteOrigin, storageUrl)).join('')}
        </div>
      </section>

      <!-- CTA Inferior -->
      <div class="collection-bottom-cta">
        <a href="${escapeAttr(spaRedirectUrl)}" class="btn-bottom-spa">
          <span>Abrir catálogo completo con filtros y buscador</span>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="5" y1="12" x2="19" y2="12"></line>
            <polyline points="12 5 19 12 12 19"></polyline>
          </svg>
        </a>
      </div>
    </div>
  </main>
</body>
</html>`;
}
