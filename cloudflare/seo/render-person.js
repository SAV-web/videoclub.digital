// =================================================================
//        RENDERIZADOR HTML DE PERSONAS VIP EN EL EDGE
//              (cloudflare/seo/render-person.js)
// =================================================================
// Renderiza la ficha VIP oficial (.person-card) idéntica a la SPA
// con foto perimetral (/vips/:slug.webp), borde dorado, fechas y
// biografía con giro 3D, seguida del muro de su filmografía destacada.
// Schema.org Person, CollectionPage, ItemList, BreadcrumbList.
// =================================================================

import {
  escapeHtml,
  escapeAttr,
  preserveHyphenatedWords,
  toSlug,
  getTitleLengthClass
} from './seo-types.js';

import { renderSpaMovieCard } from './render-taxonomy.js';

function safeJsonLd(obj) {
  return JSON.stringify(obj)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026');
}

/**
 * Calcula la información cronológica y edad de personas (vivas o fallecidas).
 */
export function computePersonAgeInfo(birthday, deathday) {
  if (!birthday) {
    return { bYear: '', dYear: '', datesStr: '', ageStr: '' };
  }

  const birthDate = new Date(birthday);
  if (isNaN(birthDate.getTime())) {
    return { bYear: '', dYear: '', datesStr: '', ageStr: '' };
  }

  const bYear = String(birthDate.getUTCFullYear());
  let dYear = '';
  let age = 0;
  let isDeceased = false;

  if (deathday) {
    const deathDate = new Date(deathday);
    if (!isNaN(deathDate.getTime())) {
      dYear = String(deathDate.getUTCFullYear());
      isDeceased = true;
      let diff = deathDate.getUTCFullYear() - birthDate.getUTCFullYear();
      const m = deathDate.getUTCMonth() - birthDate.getUTCMonth();
      if (m < 0 || (m === 0 && deathDate.getUTCDate() < birthDate.getUTCDate())) {
        diff--;
      }
      age = diff;
    }
  }

  if (!isDeceased) {
    const now = new Date();
    let diff = now.getUTCFullYear() - birthDate.getUTCFullYear();
    const m = now.getUTCMonth() - birthDate.getUTCMonth();
    if (m < 0 || (m === 0 && now.getUTCDate() < birthDate.getUTCDate())) {
      diff--;
    }
    age = diff;
  }

  const datesStr = isDeceased ? `${bYear}-${dYear}` : `${bYear}-`;
  const ageStr = isDeceased ? `✝ (${age})` : `(${age})`;

  return { bYear, dYear, datesStr, ageStr };
}

/**
 * Renderiza la tarjeta VIP oficial (.person-card) con giro 3D y diseño de la SPA.
 * Para personas con rol dual (actor y director), incluye los controles [ D ] [ A ].
 */
export function renderSpaPersonCard(person, activeRole = 'director', hasOtherRoleOrOptions = false, siteOriginArg = 'https://videoclub.digital', baseUrlArg = '/') {
  let siteOrigin = siteOriginArg;
  let baseUrl = baseUrlArg;
  let hasBothRoles = person.type === 'DA' || person.type === 'AD';

  // Retrocompatibilidad con firma clásica (person, role, hasOtherRole, siteOrigin, baseUrl)
  if (typeof hasOtherRoleOrOptions === 'boolean') {
    hasBothRoles = hasOtherRoleOrOptions || hasBothRoles;
  } else if (hasOtherRoleOrOptions && typeof hasOtherRoleOrOptions === 'object') {
    siteOrigin = hasOtherRoleOrOptions.siteOrigin || siteOrigin;
    baseUrl = hasOtherRoleOrOptions.baseUrl || baseUrl;
    if (typeof hasOtherRoleOrOptions.hasBothRoles === 'boolean') {
      hasBothRoles = hasOtherRoleOrOptions.hasBothRoles;
    }
  }

  const slug = person.slug || toSlug(person.name);
  const photoUrl = `${siteOrigin}/vips/${slug}.webp`;
  const defaultFallbackUrl = `${baseUrl}collection_default.webp`;
  const ageInfo = computePersonAgeInfo(person.birthday, person.deathday);

  const countryCode = person.countries?.code || null;
  const countryName = person.countries?.name || '';
  const countrySlug = countryCode ? toSlug(countryName) : null;

  const currentRole = activeRole === 'actor' ? 'actor' : 'director';
  const isDirector = currentRole === 'director';
  const targetRole = isDirector ? 'actor' : 'director';
  const currentLetter = isDirector ? 'D' : 'A';
  const tooltipText = isDirector
    ? `Ver películas de ${person.name} como Actor`
    : `Ver películas de ${person.name} como Director`;
  const titleLengthClass = getTitleLengthClass(person.name);

  return `
    <article class="movie-card person-card" data-person-id="${person.id}" style="--card-index: 0;">
      <div class="flip-card-inner">
        <!-- Cara frontal -->
        <div class="flip-card-front">
          <div class="poster-container">
            <img
              src="${escapeAttr(photoUrl)}"
              alt="Foto de ${escapeAttr(person.name)}"
              width="400"
              height="496"
              loading="eager"
              fetchpriority="high"
              class="loaded"
              onerror="this.src='${escapeAttr(defaultFallbackUrl)}'"
            />
            <div class="poster-overlay-guard"></div>

            ${hasBothRoles ? `
              <button
                type="button"
                class="person-role-toggle-btn"
                data-current-role="${escapeAttr(currentRole)}"
                data-target-role="${escapeAttr(targetRole)}"
                title="${escapeAttr(tooltipText)}"
                aria-label="${escapeAttr(tooltipText)}"
              >
                <span class="role-badge-letter">${currentLetter}</span>
              </button>
            ` : ''}

            <div class="card-rating-block">
              <span class="wall-person-name">${escapeHtml(person.name)}</span>
            </div>
          </div>

          <div class="movie-info movie-summary">
            <div class="title-director-block">
              <h3 class="${titleLengthClass}">${escapeHtml(person.name)}</h3>
              <div class="front-director-info">
                ${person.place_of_birth ? `<span>${escapeHtml(person.place_of_birth)}</span>` : ''}
              </div>
            </div>
            <div class="movie-meta">
              <div class="year-country-line">
                <div class="year-flag-group">
                  ${ageInfo.ageStr ? `<span class="person-age">${escapeHtml(ageInfo.ageStr)}</span>` : ''}
                  ${ageInfo.datesStr ? `<span class="person-dates">${escapeHtml(ageInfo.datesStr)}</span>` : ''}
                  ${countryCode ? `
                    <a class="country-info" href="${countrySlug ? `${baseUrl}?_p=/${countrySlug}/` : '#'}" title="${escapeAttr(countryName)}" aria-label="Ver títulos de ${escapeAttr(countryName)}">
                      <span class="country-flag-icon">
                        <svg width="14" height="14" aria-hidden="true">
                          <use href="${baseUrl}flags.svg#flag-${escapeAttr(countryCode.toLowerCase())}"></use>
                        </svg>
                      </span>
                    </a>
                  ` : ''}
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Cara trasera -->
        <div class="flip-card-back">
          <div class="scrollable-content" style="flex-grow: 1; margin-top: var(--space-xs, 6px); margin-bottom: 24px;">
            ${person.titulo_bio ? `<h4 class="bio-headline">${escapeHtml(person.titulo_bio)}</h4>` : ''}
            <div
              class="plot-summary-final"
              style="border-top: none; padding-top: 0; font-size: calc(var(--font-size-sm, 0.85rem) * 1.15); line-height: 1.5;"
            >
              ${escapeHtml(preserveHyphenatedWords(person.biography || 'Biografía no disponible en el catálogo.'))}
            </div>
          </div>
          <button type="button" class="expand-content-btn" aria-label="Expandir biografía">+</button>
        </div>
      </div>
    </article>
  `;
}

/**
 * Renderiza la página HTML completa para una entidad VIP en el Edge.
 * 
 * Modelo conceptual unificado:
 * - person: entidad editorial única (identidad, biografía, foto, datos).
 * - activeRole: rol activo en la interfaz ('director' | 'actor').
 * - filmographies: { director: Movie[], actor: Movie[] } separadas pero presentes en la misma página.
 * 
 * URL inmutable y canónica única: https://videoclub.digital/slug/
 */
export function renderPersonHtml(person, roleOrConfig = {}, hasOtherRoleLegacy, moviesLegacy = [], optionsLegacy = {}) {
  const defaultRole = (person.type === 'D' || person.type === 'DA') ? 'director' : 'actor';
  const hasBothRoles = person.type === 'DA' || person.type === 'AD';

  let activeRole = defaultRole;
  let filmographies = { director: [], actor: [] };
  let options = {};

  if (typeof roleOrConfig === 'string') {
    // Firma clásica: renderPersonHtml(person, role, hasOtherRole, movies, options)
    activeRole = roleOrConfig;
    const movies = Array.isArray(hasOtherRoleLegacy) ? hasOtherRoleLegacy : (Array.isArray(moviesLegacy) ? moviesLegacy : []);
    options = optionsLegacy || {};
    filmographies = {
      [activeRole]: movies,
      [activeRole === 'director' ? 'actor' : 'director']: []
    };
  } else if (roleOrConfig && typeof roleOrConfig === 'object') {
    options = (hasOtherRoleLegacy && typeof hasOtherRoleLegacy === 'object') ? hasOtherRoleLegacy : (optionsLegacy || {});
    if (roleOrConfig.filmographies) {
      filmographies = {
        director: roleOrConfig.filmographies.director || [],
        actor: roleOrConfig.filmographies.actor || []
      };
      activeRole = roleOrConfig.activeRole || defaultRole;
    } else if (roleOrConfig.director || roleOrConfig.actor) {
      filmographies = {
        director: roleOrConfig.director || [],
        actor: roleOrConfig.actor || []
      };
      activeRole = roleOrConfig.activeRole || defaultRole;
    } else if (Array.isArray(roleOrConfig)) {
      filmographies = {
        [defaultRole]: roleOrConfig,
        [defaultRole === 'director' ? 'actor' : 'director']: []
      };
      activeRole = defaultRole;
    }
  }

  const siteOrigin = options.siteOrigin || 'https://videoclub.digital';
  const baseUrl = options.baseUrl || '/';
  const storageUrl = options.storageUrl || 'https://wibygecgfczcvaqewleq.supabase.co/storage/v1/object/public';
  const slug = person.slug || toSlug(person.name);
  const canonicalUrl = `${siteOrigin}/${slug}/`;

  const isDirector = activeRole === 'director';
  const spaRedirectUrl = `${baseUrl}?_p=/${isDirector ? 'director' : 'actor'}/${slug}/`;

  const roleTitle = hasBothRoles ? 'Director y actor de cine' : (isDirector ? 'Director de cine' : 'Actor cinematográfico');

  const seoTitle = `${person.name} — Películas y Biografía | Videoclub Digital`;
  const bioExcerpt = person.titulo_bio 
    ? `${person.name}: ${person.titulo_bio}. Filmografía completa y biografía en Videoclub Digital.`
    : `Filmografía completa, biografía y títulos destacados de ${person.name} en Videoclub Digital.`;
  const description = bioExcerpt.length > 160 ? bioExcerpt.substring(0, 157) + '...' : bioExcerpt;

  const photoUrl = `${siteOrigin}/vips/${slug}.webp`;

  const directorMovies = filmographies.director || [];
  const actorMovies = filmographies.actor || [];
  const activeMovies = activeRole === 'director' ? directorMovies : actorMovies;
  const primaryMovies = activeMovies.length > 0 ? activeMovies : (directorMovies.length > 0 ? directorMovies : actorMovies);

  // 1. Schema.org Person con propiedades condicionales
  const personSchema = {
    "@context": "https://schema.org",
    "@type": "Person",
    "name": person.name,
    "url": canonicalUrl,
    "mainEntityOfPage": canonicalUrl,
    ...(photoUrl ? { "image": photoUrl } : {}),
    ...(person.titulo_bio || person.biography ? {
      "description": person.titulo_bio || person.biography?.substring(0, 300)
    } : {}),
    ...(roleTitle ? {
      "jobTitle": roleTitle,
      "hasOccupation": {
        "@type": "Occupation",
        "name": roleTitle
      }
    } : {}),
    ...(person.birthday ? { "birthDate": person.birthday } : {}),
    ...(person.deathday ? { "deathDate": person.deathday } : {}),
    ...(person.place_of_birth ? {
      "birthPlace": {
        "@type": "Place",
        "name": person.place_of_birth
      }
    } : {}),
    ...(person.countries?.name ? {
      "nationality": {
        "@type": "Country",
        "name": person.countries.name
      }
    } : {}),
    ...(primaryMovies.length > 0 ? {
      "knowsAbout": primaryMovies.slice(0, 6).map(m => m.title || m.original_title)
    } : {})
  };

  // 2. Schema.org CollectionPage + ItemList de su Filmografía
  const collectionSchema = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    "name": seoTitle,
    "description": description,
    "url": canonicalUrl,
    "inLanguage": "es",
    "mainEntity": {
      "@type": "ItemList",
      "numberOfItems": primaryMovies.length,
      "itemListElement": primaryMovies.map((m, index) => ({
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

  // 3. Schema.org BreadcrumbList
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
        "name": person.name,
        "item": canonicalUrl
      }
    ]
  };

  // 4. Speculation Rules API
  const topSlugsUrls = primaryMovies.slice(0, 5).map(m => `${siteOrigin}/titulo/${m.slug}/`);
  const speculationRules = {
    prerender: [{ source: "list", urls: ["/"] }],
    prefetch: [{ source: "list", urls: topSlugsUrls }]
  };

  // Renderizar la tarjeta VIP de la persona (#0) y las tarjetas de su filmografía (#1..#42)
  const personCardHtml = renderSpaPersonCard(person, activeRole, { hasBothRoles, siteOrigin, baseUrl });

  const directorCardsHtml = directorMovies.map((movie, index) => {
    return renderSpaMovieCard(movie, index + 1, siteOrigin, baseUrl);
  }).join('\n');

  const actorCardsHtml = actorMovies.map((movie, index) => {
    return renderSpaMovieCard(movie, index + 1, siteOrigin, baseUrl);
  }).join('\n');

  const singleMovieCardsHtml = activeMovies.map((movie, index) => {
    return renderSpaMovieCard(movie, index + 1, siteOrigin, baseUrl);
  }).join('\n');

  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta name="theme-color" content="#f5f5f5" media="(prefers-color-scheme: light)" />
  <meta name="theme-color" content="#0d0d0d" media="(prefers-color-scheme: dark)" />
  <!-- Anti-flicker para sincronización exacta de modo claro/oscuro entre SPA y SEO -->
  <script>
    (function () {
      try {
        var cookieMatch = document.cookie.match(/(?:^|;\s*)theme=([^;]*)/);
        var stored = localStorage.getItem("theme") || (cookieMatch ? cookieMatch[1] : null);
        var systemDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
        var isDark = stored ? stored === "dark" : systemDark;
        if (isDark) {
          document.documentElement.classList.add("dark-mode");
          document.documentElement.classList.remove("light-mode");
        } else {
          document.documentElement.classList.add("light-mode");
          document.documentElement.classList.remove("dark-mode");
        }
        var metas = document.querySelectorAll('meta[name="theme-color"]');
        metas.forEach(function(m) { m.setAttribute("content", isDark ? "#0d0d0d" : "#f5f5f5"); });
      } catch (e) {}
    })();
  </script>
  <title>${escapeHtml(seoTitle)}</title>
  <meta name="description" content="${escapeAttr(description)}" />
  <link rel="canonical" href="${escapeAttr(canonicalUrl)}" />
  <meta name="robots" content="index, follow, max-image-preview:large" />

  <!-- Open Graph -->
  <meta property="og:title" content="${escapeAttr(seoTitle)}" />
  <meta property="og:description" content="${escapeAttr(description)}" />
  <meta property="og:url" content="${escapeAttr(canonicalUrl)}" />
  <meta property="og:type" content="profile" />
  <meta property="og:image" content="${escapeAttr(photoUrl)}" />
  <meta property="og:site_name" content="Videoclub Digital" />
  <meta property="og:locale" content="es_ES" />

  <!-- Twitter Card -->
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="${escapeAttr(seoTitle)}" />
  <meta name="twitter:description" content="${escapeAttr(description)}" />
  <meta name="twitter:image" content="${escapeAttr(photoUrl)}" />

  <!-- Tipografía Inter Variable Autoalojada (Misma que la SPA) -->
  <link rel="preconnect" href="https://wibygecgfczcvaqewleq.supabase.co" crossorigin />
  <link rel="preload" href="https://wibygecgfczcvaqewleq.supabase.co/storage/v1/object/public/assets/Inter-Variable-v41.woff2" as="font" type="font/woff2" crossorigin />

  <!-- Structured Data: Person, CollectionPage & Breadcrumbs -->
  <script type="application/ld+json">${safeJsonLd(personSchema)}</script>
  <script type="application/ld+json">${safeJsonLd(collectionSchema)}</script>
  <script type="application/ld+json">${safeJsonLd(breadcrumbSchema)}</script>
  <script type="speculationrules">${safeJsonLd(speculationRules)}</script>

  <!-- CSS Unificado (Servido en Edge Memory con design tokens y contrato completo de tarjeta) -->
  <link rel="stylesheet" href="${baseUrl}seo-card-v7.css" />
  <link rel="icon" type="image/svg+xml" href="${baseUrl}favicon.svg" />
</head>
<body class="collection-wall">
  <div class="main-layout">
    <div class="main-content-wrapper">
      <!-- Cabecera Minimalista Estilo SPA -->
      <header class="main-header">
        <div class="header-content" style="display:flex; justify-content:space-between; align-items:center; width:100%; max-width:1440px; margin-inline:auto;">
          <a href="${baseUrl}" class="brand-logo-text" aria-label="Videoclub Digital">
            <span class="logo-line-1">videoclub</span>
            <span class="logo-line-2">.digital</span>
          </a>
          
          <!-- Nombre de la persona -->
          <div class="active-filters-list" style="display:flex; align-items:center; gap: 8px; margin:0; padding:0;">
            <a href="${escapeAttr(spaRedirectUrl)}" class="filter-pill is-active" title="Abrir ${escapeAttr(person.name)} en el videoclub interactivo" style="text-decoration:none;">
              <span>${escapeHtml(person.name)}</span>
            </a>
          </div>
        </div>
      </header>

      <!-- Muro de Tarjetas Oficial (Ficha VIP #0 + Filmografía #1..#42) -->
      <main class="content">
        <h1 class="sr-only">${escapeHtml(seoTitle)}</h1>
        <section id="grid-container" class="grid-container" aria-label="Ficha de ${escapeAttr(person.name)} y filmografía destacada">
          ${personCardHtml}
          ${hasBothRoles ? `
            <div id="filmography-director" class="filmography-role-group" style="${activeRole === 'director' ? 'display: contents;' : 'display: none;'}">
              ${directorCardsHtml}
            </div>
            <div id="filmography-actor" class="filmography-role-group" style="${activeRole === 'actor' ? 'display: contents;' : 'display: none;'}">
              ${actorCardsHtml}
            </div>
          ` : `
            ${singleMovieCardsHtml}
          `}
        </section>
      </main>

      <!-- Pie de página oficial con avisos legales de la SPA -->
      <footer class="site-footer">
        <ul class="footer-links">
          <li class="footer-brand">videoclub.digital</li>
          <li><a href="${baseUrl}?legal=about" class="footer-legal-link">Quiénes somos</a></li>
          <li><a href="${baseUrl}?legal=contact" class="footer-legal-link">Contacto</a></li>
          <li><a href="${baseUrl}?legal=legal" class="footer-legal-link">Aviso legal</a></li>
          <li><a href="${baseUrl}?legal=privacy" class="footer-legal-link">Privacidad</a></li>
          <li><a href="${baseUrl}?legal=cookies" class="footer-legal-link">Cookies</a></li>
          <li class="footer-copy">2025-2026 © Copyright.</li>
        </ul>
      </footer>
    </div>
  </div>

  <!-- Handler de alternancia D/A, acceso a la trasera y expansión de biografía en Vanilla JS -->
  <script>
    (function () {
      var activeCard = null;

      // Preservar orden del catálogo seleccionado en la SPA (localStorage preferred_sort)
      try {
        var prefSort = localStorage.getItem("preferred_sort");
        if (prefSort) {
          document.querySelectorAll("a[href*='_p=']").forEach(function (a) {
            if (!a.href.includes("_q=")) {
              a.href += (a.href.includes("?") ? "&" : "?") + "_q=sort%3D" + encodeURIComponent(prefSort);
            } else if (!a.href.includes("sort%3D") && !a.href.includes("sort=")) {
              a.href += "%26sort%3D" + encodeURIComponent(prefSort);
            }
          });
        }
      } catch (e) {}

      // Alternancia interactiva D/A para VIPs con ambos roles (círculo único D <-> A como en la SPA, URL inmutable)
      var roleToggleBtn = document.querySelector(".person-role-toggle-btn");
      if (roleToggleBtn) {
        var currentRole = ${JSON.stringify(activeRole)};
        var dirGroup = document.getElementById("filmography-director");
        var actGroup = document.getElementById("filmography-actor");
        var filterPill = document.querySelector(".active-filters-list .filter-pill");
        var personName = ${JSON.stringify(person.name)};
        var pSlug = ${JSON.stringify(slug)};
        var bUrl = ${JSON.stringify(baseUrl)};
        var letterSpan = roleToggleBtn.querySelector(".role-badge-letter");

        roleToggleBtn.addEventListener("click", function (e) {
          e.preventDefault();
          e.stopPropagation();

          // Alternar rol activo (director <-> actor)
          currentRole = (currentRole === "director") ? "actor" : "director";
          var isDir = currentRole === "director";
          var currentLetter = isDir ? "D" : "A";
          var targetRole = isDir ? "actor" : "director";
          var tooltip = isDir
            ? "Ver películas de " + personName + " como Actor"
            : "Ver películas de " + personName + " como Director";

          // 1. Actualizar visualmente la letra y tooltip del círculo único (como en la SPA)
          if (letterSpan) {
            letterSpan.textContent = currentLetter;
          }
          roleToggleBtn.title = tooltip;
          roleToggleBtn.setAttribute("aria-label", tooltip);
          roleToggleBtn.setAttribute("data-current-role", currentRole);
          roleToggleBtn.setAttribute("data-target-role", targetRole);

          // 2. Conmutar el grid de películas visible sin mutar URL
          if (dirGroup && actGroup) {
            dirGroup.style.display = isDir ? "contents" : "none";
            actGroup.style.display = isDir ? "none" : "contents";
          }

          // 3. Sincronizar enlace del filter-pill a la SPA
          if (filterPill) {
            filterPill.href = bUrl + "?_p=/" + currentRole + "/" + pSlug + "/";
          }

          // 4. Resetear tarjeta volteada si hubiera alguna activa
          if (activeCard) {
            activeCard.classList.remove("is-flipped");
            var prevBack = activeCard.querySelector(".flip-card-back");
            if (prevBack) {
              prevBack.classList.remove("is-expanded", "show-actors");
              var prevBtn = prevBack.querySelector(".expand-content-btn");
              if (prevBtn) prevBtn.textContent = "+";
            }
            activeCard = null;
          }
        });
      }

      document.addEventListener("click", function (e) {
        // 1. Botón + de actores: despliega la lista completa de actores y géneros en overlay
        var actorsExpandBtn = e.target.closest(".actors-expand-btn");
        if (actorsExpandBtn) {
          e.preventDefault();
          e.stopPropagation();
          var back = actorsExpandBtn.closest(".flip-card-back");
          if (back) {
            back.classList.add("is-expanded", "show-actors");
            var bottomBtn = back.querySelector(".expand-content-btn");
            if (bottomBtn) {
              bottomBtn.textContent = "−";
              bottomBtn.setAttribute("aria-label", "Cerrar detalles");
            }
          }
          return;
        }

        // 2. Botón inferior de expansión / contracción (+ / −) de sinopsis o biografía
        var expandBtn = e.target.closest(".expand-content-btn");
        if (expandBtn) {
          e.preventDefault();
          e.stopPropagation();
          var back = expandBtn.closest(".flip-card-back");
          if (back) {
            if (back.classList.contains("show-actors") || back.classList.contains("is-expanded")) {
              back.classList.remove("is-expanded", "show-actors");
              expandBtn.textContent = "+";
              expandBtn.setAttribute("aria-label", "Expandir detalles");
              var scrolls = back.querySelectorAll(".scrollable-content, .actors-scrollable-content");
              scrolls.forEach(function (s) { s.scrollTop = 0; });
            } else {
              back.classList.add("is-expanded");
              expandBtn.textContent = "−";
              expandBtn.setAttribute("aria-label", "Contraer detalles");
            }
          }
          return;
        }

        // 3. Trasera ampliada: retroceder a la trasera normal al pulsar fuera del área de enlaces
        var expandedBack = e.target.closest(".flip-card-back.is-expanded");
        if (expandedBack) {
          var isInteractive = e.target.closest("a[href], button, [role='button'], [data-action]");
          if (!isInteractive) {
            var sel = window.getSelection ? window.getSelection() : null;
            if (sel && sel.toString().trim().length > 0) {
              e.stopPropagation();
              return;
            }
            e.preventDefault();
            e.stopPropagation();
            expandedBack.classList.remove("is-expanded", "show-actors");
            var btn = expandedBack.querySelector(".expand-content-btn");
            if (btn) {
              btn.textContent = "+";
              btn.setAttribute("aria-label", "Expandir detalles");
            }
            var scrolls = expandedBack.querySelectorAll(".scrollable-content, .actors-scrollable-content");
            scrolls.forEach(function (s) { s.scrollTop = 0; });
            return;
          }
        }

        // 4. Volteo a la trasera al pulsar el cartel o cualquier lugar de la ficha (solo películas)
        var card = e.target.closest(".movie-card:not(.person-card)");
        if (card) {
          if (e.target.closest("a, button, [role='button'], .actors-scrollable-content, .scrollable-content")) return;
          var inner = card.querySelector(".flip-card-inner");
          if (inner) {
            var isFlipped = inner.classList.toggle("is-flipped");
            if (isFlipped) {
              if (activeCard && activeCard !== inner) {
                activeCard.classList.remove("is-flipped");
                var prevBack = activeCard.querySelector(".flip-card-back");
                if (prevBack) {
                  prevBack.classList.remove("is-expanded", "show-actors");
                  var prevBtn = prevBack.querySelector(".expand-content-btn");
                  if (prevBtn) prevBtn.textContent = "+";
                }
              }
              activeCard = inner;
            } else if (activeCard === inner) {
              var back = inner.querySelector(".flip-card-back");
              if (back) {
                back.classList.remove("is-expanded", "show-actors");
                var btn = back.querySelector(".expand-content-btn");
                if (btn) btn.textContent = "+";
              }
              activeCard = null;
            }
          }
        } else if (activeCard) {
          activeCard.classList.remove("is-flipped");
          var back = activeCard.querySelector(".flip-card-back");
          if (back) {
            back.classList.remove("is-expanded", "show-actors");
            var btn = back.querySelector(".expand-content-btn");
            if (btn) btn.textContent = "+";
          }
          activeCard = null;
        }
      });
    })();
  </script>
</body>
</html>`;
}
