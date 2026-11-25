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
  preserveHyphenatedWords,
  toSlug,
  getTitleLengthClass,
  computePersonAgeInfo,
  isSeriesType,
  getPosterUrl,
  buildItemListSchema,
  SPECULATION_RULES
} from './seo-types.js';

import { renderSpaMovieCard } from './render-taxonomy.js';
import { renderSeoHead, renderCollectionWallPage } from './html-fragments.js';


/**
 * Renderiza la tarjeta VIP oficial (.person-card) en el Edge.
 * Para personas con rol dual (actor y director), incluye los controles [ D ] [ A ].
 */
export function renderVipPersonCard(person, options = {}) {
  const defaultRole = (person.type === 'D' || person.type === 'DA') ? 'director' : 'actor';
  const defaultBothRoles = person.type === 'DA' || person.type === 'AD';

  const {
    activeRole = defaultRole,
    hasBothRoles = defaultBothRoles,
    siteOrigin = 'https://videoclub.digital',
    baseUrl = '/'
  } = options;

  const slug = person.slug || toSlug(person.name);
  const photoUrl = `${siteOrigin}/vips/${slug}.webp`;
  const defaultFallbackUrl = `${baseUrl}collection_default.webp`;
  const ageInfo = computePersonAgeInfo(person.birthday, person.deathday);

  const countryCode = person.countries?.code || null;
  const countryName = person.countries?.name || '';

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
              src="${escapeHtml(photoUrl)}"
              alt="Foto de ${escapeHtml(person.name)}"
              width="428"
              height="535"
              loading="eager"
              fetchpriority="high"
              class="${person.thumbhash_st ? 'lazy-lqip' : 'loaded'}"
              ${person.thumbhash_st ? `style="background-image: url('${escapeHtml(person.thumbhash_st)}'); background-size: cover; background-position: center;" onload="this.classList.add('loaded')"` : ''}
              onerror="this.src='${escapeHtml(defaultFallbackUrl)}'"
            />
            <div class="poster-overlay-guard"></div>

            ${hasBothRoles ? `
              <button
                type="button"
                class="person-role-toggle-btn"
                data-current-role="${escapeHtml(currentRole)}"
                data-target-role="${escapeHtml(targetRole)}"
                title="${escapeHtml(tooltipText)}"
                aria-label="${escapeHtml(tooltipText)}"
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
                    <span class="country-info" title="${escapeHtml(countryName)}" aria-label="${escapeHtml(countryName)}">
                      <span class="country-flag-icon">
                        <svg width="14" height="14" aria-hidden="true">
                          <use href="${baseUrl}flags.svg#flag-${escapeHtml(countryCode.toLowerCase())}"></use>
                        </svg>
                      </span>
                    </span>
                  ` : ''}
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Cara trasera -->
        <div class="flip-card-back">
          <div class="scrollable-content" style="flex-grow: 1; margin-top: var(--space-xs, 6px); margin-bottom: 24px;">
            ${person.titulo_bio ? `<h4 class="bio-headline">${escapeHtml(preserveHyphenatedWords(person.titulo_bio))}</h4>` : ''}
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
export function renderPersonHtml(person, options = {}) {
  const defaultRole = (person.type === 'D' || person.type === 'DA') ? 'director' : 'actor';
  const defaultBothRoles = person.type === 'DA' || person.type === 'AD';

  const {
    activeRole = defaultRole,
    hasBothRoles = defaultBothRoles,
    filmographies = { director: [], actor: [] },
    siteOrigin = 'https://videoclub.digital',
    baseUrl = '/'
  } = options;

  const slug = person.slug || toSlug(person.name);
  const canonicalUrl = `${siteOrigin}/${slug}/`;

  const isDirector = activeRole === 'director';
  const spaRedirectUrl = `${baseUrl}?_p=/${activeRole}/${slug}/`;

  const roleTitle = hasBothRoles ? 'Director y actor de cine' : (isDirector ? 'Director de cine' : 'Actor cinematográfico');

  const seoTitle = `${person.name} — Películas y Biografía | Videoclub Digital`;
  const bioExcerpt = person.titulo_bio 
    ? `${person.name}: ${person.titulo_bio}. Filmografía completa y biografía en Videoclub Digital.`
    : `Filmografía completa, biografía y títulos destacados de ${person.name} en Videoclub Digital.`;
  const description = bioExcerpt.length > 160 ? bioExcerpt.substring(0, 157) + '...' : bioExcerpt;

  const photoUrl = `${siteOrigin}/vips/${slug}.webp`;

  const directorMovies = filmographies.director || [];
  const actorMovies = filmographies.actor || [];
  const activeMovies = filmographies[activeRole] || [];
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
    "mainEntity": buildItemListSchema(primaryMovies, siteOrigin)
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

  // 4. Speculation Rules API (Prerender SPA y rutas de navegación frecuente)
  const speculationRules = SPECULATION_RULES;

  // Renderizar la tarjeta VIP de la persona (#0) y las tarjetas de su filmografía (#1..#42)
  const personCardHtml = renderVipPersonCard(person, { activeRole, hasBothRoles, siteOrigin, baseUrl });

  const renderCards = (movies) => movies.map((movie, index) => {
    return renderSpaMovieCard(movie, index + 1, siteOrigin, baseUrl);
  }).join('\n');

  const filmographyHtml = hasBothRoles ? `
    <div id="filmography-director" class="filmography-role-group" style="${activeRole === 'director' ? 'display: contents;' : 'display: none;'}">
      ${renderCards(directorMovies)}
    </div>
    <div id="filmography-actor" class="filmography-role-group" style="${activeRole === 'actor' ? 'display: contents;' : 'display: none;'}">
      ${renderCards(actorMovies)}
    </div>
  ` : renderCards(activeMovies);

  const headHtml = renderSeoHead({
    title: seoTitle,
    description,
    canonicalUrl,
    ogType: 'profile',
    ogImageUrl: photoUrl,
    includeRobots: true,
    baseUrl,
    schemas: [personSchema, collectionSchema, breadcrumbSchema],
    speculationRules,
  });

  const headerFilterHtml = `<a href="${escapeHtml(spaRedirectUrl)}" class="filter-pill is-active" title="Abrir ${escapeHtml(person.name)} en el videoclub interactivo" style="text-decoration:none;">
              <span>${escapeHtml(person.name)}</span>
            </a>`;

  const roleToggleScript = `
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

          if (letterSpan) {
            letterSpan.textContent = currentLetter;
          }
          roleToggleBtn.title = tooltip;
          roleToggleBtn.setAttribute("aria-label", tooltip);
          roleToggleBtn.setAttribute("data-current-role", currentRole);
          roleToggleBtn.setAttribute("data-target-role", targetRole);

          if (dirGroup && actGroup) {
            dirGroup.style.display = isDir ? "contents" : "none";
            actGroup.style.display = isDir ? "none" : "contents";
          }

          if (filterPill) {
            filterPill.href = bUrl + "?_p=/" + currentRole + "/" + pSlug + "/";
          }

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
      }`;

  return renderCollectionWallPage({
    headHtml,
    headerFilterHtml,
    h1Title: seoTitle,
    gridAriaLabel: `Ficha de ${person.name} y filmografía destacada`,
    gridContentHtml: `${personCardHtml}\n          ${filmographyHtml}`,
    baseUrl,
    extraInitScript: roleToggleScript,
    expandNoun: 'detalles',
  });
}
