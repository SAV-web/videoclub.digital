// src/js/seo.js
import { CONFIG, FILTER_CONFIG, STUDIO_DATA } from "./constants.js";
import { getActiveFilters } from "./state.js";
import { capitalizeWords } from "./utils.js";

// --- Gestión de Título y Metadatos ---

export function updatePageTitle(movies = []) {
  const { searchTerm, genre, year, country, director, actor, selection, studio, mediaType, myList } = getActiveFilters();
  
  let baseNoun = "Películas y series";
  if (mediaType === "movies") baseNoun = "Películas";
  else if (mediaType === "series") baseNoun = "Series";

  let title = baseNoun;
  const yearSuffix = (year && year !== `${CONFIG.YEAR_MIN}-${CONFIG.YEAR_MAX}`) 
    ? ` (${year.replace("-", " a ")})` : "";

  if (myList) title = `Mi Lista`;
  else if (searchTerm) title = `Resultados para "${searchTerm}"`;
  else if (selection) {
    const config = FILTER_CONFIG.selection;
    const name = config.titles?.[selection] || config.items[selection];
    if (name) title = name + yearSuffix;
  } else if (studio) {
    title = (STUDIO_DATA[studio]?.title || title) + yearSuffix;
  }
  else if (genre) title = `${baseNoun} de ${capitalizeWords(genre)}`;
  else if (director) title = `${baseNoun} de ${capitalizeWords(director)}`;
  else if (actor) title = `${baseNoun} con ${capitalizeWords(actor)}`;
  else if (year && year !== `${CONFIG.YEAR_MIN}-${CONFIG.YEAR_MAX}`) title = `${baseNoun} de ${year.replace("-", " a ")}`;
  else if (country) title = `${baseNoun} de ${capitalizeWords(country)}`;
  
  document.title = `${title} | videoclub.digital`;

  // Actualización de Metadatos
  updatePageMetadata(title, baseNoun, getActiveFilters(), movies);
}

function updatePageMetadata(title, noun, filters, movies = []) {
  // 1. Generar Descripción Contextual
  let desc = `Explora y descubre ${noun.toLowerCase()} en videoclub.digital.`;
  
  if (filters.myList) {
    desc = "Gestiona tu lista personal de películas y series favoritas, puntuaciones y pendientes.";
  } else if (filters.searchTerm) {
    desc = `Resultados de búsqueda para "${filters.searchTerm}". Encuentra ${noun.toLowerCase()} relacionadas en nuestro catálogo inteligente.`;
  } else {
    const parts = [];
    if (filters.genre) parts.push(`género ${filters.genre}`);
    if (filters.country) parts.push(`de ${filters.country}`);
    if (filters.director) parts.push(`dirigidas por ${filters.director}`);
    if (filters.actor) parts.push(`con ${filters.actor}`);
    if (filters.year && filters.year !== `${CONFIG.YEAR_MIN}-${CONFIG.YEAR_MAX}`) parts.push(`del periodo ${filters.year}`);
    
    if (parts.length > 0) {
      desc = `Catálogo de ${noun.toLowerCase()} ${parts.join(", ")}. Descubre las mejores obras según tus gustos.`;
    } else {
      desc = `Tu oráculo cinéfilo. Explora miles de ${noun.toLowerCase()}, filtra por género, año, país, director y más para encontrar tu próxima obra maestra.`;
    }
  }

  // 3. Enriquecimiento con Títulos (CTR Booster)
  if (movies && movies.length > 0 && !filters.myList) {
    const titles = movies.slice(0, 3).map(m => m.title).join(", ");
    desc += ` Destacadas: ${titles}.`;
  }

  // 4. Truncado SEO (160 caracteres) para evitar cortes abruptos en SERP
  if (desc.length > 160) {
    desc = desc.substring(0, 157) + "...";
  }

  // 2. Actualizar DOM (Meta Tags)
  const setMeta = (selector, content) => {
    const el = document.querySelector(selector);
    if (el) el.setAttribute("content", content);
  };

  setMeta('meta[name="description"]', desc);
  setMeta('meta[property="og:title"]', title);
  setMeta('meta[property="og:description"]', desc);
  setMeta('meta[property="og:url"]', window.location.href);
  
  // Canonical URL (Evita contenido duplicado)
  let canonical = document.querySelector("link[rel='canonical']");
  if (canonical) canonical.href = window.location.href;
}

// --- Datos Estructurados (JSON-LD) ---

export function updateStructuredData(movies, totalMovies) {
  const scriptId = "dynamic-json-ld";
  let script = document.getElementById(scriptId);
  
  if (!script) {
    script = document.createElement("script");
    script.id = scriptId;
    script.type = "application/ld+json";
    document.head.appendChild(script);
  }

  if (!movies || movies.length === 0) {
    script.textContent = "";
    return;
  }

  // Optimización SEO: Truncar a 20 elementos para evitar payloads JSON-LD excesivos.
  const limitedMovies = movies.slice(0, 20);

  const schema = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    "mainEntityOfPage": window.location.href,
    "numberOfItems": totalMovies,
    "itemListElement": limitedMovies.map((movie, index) => ({
      "@type": "ListItem",
      "position": index + 1,
      "item": {
        "@type": movie.type && String(movie.type).startsWith("S") ? "TVSeries" : "Movie",
        "name": movie.title,
        "image": `${CONFIG.POSTER_BASE_URL}${movie.image}.webp`,
        "dateCreated": movie.year ? String(movie.year) : undefined,
        "director": movie.directors ? movie.directors.split(",").map(d => ({ "@type": "Person", "name": d.trim() })) : undefined,
        "actor": movie.actors ? movie.actors.split(",").map(a => ({ "@type": "Person", "name": a.trim() })) : undefined,
        "aggregateRating": movie.avg_rating ? {
          "@type": "AggregateRating",
          "ratingValue": movie.avg_rating.toFixed(1),
          "bestRating": "10",
          "worstRating": "1",
          "ratingCount": (movie.fa_votes || 0) + (movie.imdb_votes || 0)
        } : undefined
      }
    }))
  };

  script.textContent = JSON.stringify(schema);
}

export function updateBreadcrumbData(filters) {
  const scriptId = "dynamic-breadcrumbs-json-ld";
  let script = document.getElementById(scriptId);

  if (!script) {
    script = document.createElement("script");
    script.id = scriptId;
    script.type = "application/ld+json";
    document.head.appendChild(script);
  }

  // Base URL (sin query params) para construir los enlaces
  const baseUrl = window.location.origin + window.location.pathname;

  const items = [
    {
      "@type": "ListItem",
      "position": 1,
      "name": "Inicio",
      "item": baseUrl
    }
  ];

  // Nivel 2: Tipo de Medio
  let typeName = "Catálogo";
  let typeParam = "type=all";
  
  if (filters.mediaType === 'movies') {
    typeName = "Películas";
    typeParam = "type=movies";
  } else if (filters.mediaType === 'series') {
    typeName = "Series";
    typeParam = "type=series";
  }

  const typeUrl = `${baseUrl}?${typeParam}`;

  items.push({
    "@type": "ListItem",
    "position": 2,
    "name": typeName,
    "item": typeUrl
  });

  // Nivel 3: Filtro Específico (Prioridad jerárquica)
  let filterName = null;
  let filterQuery = "";

  if (filters.myList) {
     filterName = "Mi Lista";
     filterQuery = `&list=${filters.myList}`;
  } else if (filters.searchTerm) {
    filterName = `"${filters.searchTerm}"`;
    filterQuery = `&q=${encodeURIComponent(filters.searchTerm)}`;
  } else if (filters.selection) {
     const config = FILTER_CONFIG.selection;
     filterName = config.titles?.[filters.selection] || config.items[filters.selection] || filters.selection;
     filterQuery = `&sel=${filters.selection}`;
  } else if (filters.studio) {
     filterName = STUDIO_DATA[filters.studio]?.title || filters.studio;
     filterQuery = `&stu=${filters.studio}`;
  } else if (filters.genre) {
    filterName = filters.genre;
    filterQuery = `&genre=${encodeURIComponent(filters.genre)}`;
  } else if (filters.director) {
    filterName = filters.director;
    filterQuery = `&dir=${encodeURIComponent(filters.director)}`;
  } else if (filters.actor) {
    filterName = filters.actor;
    filterQuery = `&actor=${encodeURIComponent(filters.actor)}`;
  } else if (filters.country) {
    filterName = filters.country;
    filterQuery = `&country=${encodeURIComponent(filters.country)}`;
  } else if (filters.year && filters.year !== `${CONFIG.YEAR_MIN}-${CONFIG.YEAR_MAX}`) {
    filterName = filters.year;
    filterQuery = `&year=${filters.year}`;
  }

  if (filterName) {
    items.push({
      "@type": "ListItem",
      "position": 3,
      "name": filterName,
      "item": `${typeUrl}${filterQuery}`
    });
  }

  const schema = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    "itemListElement": items
  };

  script.textContent = JSON.stringify(schema);
}
