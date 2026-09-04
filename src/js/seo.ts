/// <reference types="vite/client" />

// src/js/seo.ts
import { CONFIG, FILTER_CONFIG, STUDIO_DATA } from "./constants.js";
import { getActiveFilters, stateToPrettyUrl } from "./state.js";
import { capitalizeWords, getHqPosterUrl } from "./utils.js";
import { ActiveFilters, Movie, MappedMovie } from "./types.js";

// =================================================================
//          1. BUILDERS (Funciones Puras - Lógica de Negocio)
// =================================================================

export interface SeoTitleResult {
  pageTitle: string;
  ogTitle: string;
  baseNoun: string;
}

const formatYearPeriod = (year: string): string => year.replace("-", " a ");

export function buildSeoTitle(filters: ActiveFilters): SeoTitleResult {
  const { searchTerm, genre, year, country, director, actor, selection, studio, mediaType, myList } = filters;
  
  let baseNoun = "Películas y series";
  if (mediaType === "movies") {
    baseNoun = "Películas";
  } else if (mediaType === "series") {
    baseNoun = "Series";
  }

  let title = baseNoun;
  const isCustomYear = !!(year && year !== `${CONFIG.YEAR_MIN}-${CONFIG.YEAR_MAX}`);
  const yearSuffix = isCustomYear ? ` (${formatYearPeriod(year)})` : "";

  if (myList === "watchlist") {
    title = `Pendientes`;
  } else if (myList === "rated") {
    title = `Votadas`;
  } else if (myList) {
    title = `Mi Lista`;
  } else if (searchTerm) {
    title = `Resultados para "${searchTerm}"`;
  } else if (selection) {
    const config = FILTER_CONFIG.selection;
    const name = config.titles?.[selection as keyof typeof config.titles] || config.items[selection as keyof typeof config.items];
    if (name) title = name + yearSuffix;
  } else if (studio) {
    const studioInfo = STUDIO_DATA[studio as keyof typeof STUDIO_DATA];
    title = (studioInfo ? studioInfo.title : title) + yearSuffix;
  } else if (genre) {
    title = `${baseNoun} de ${capitalizeWords(genre)}`;
  } else if (director) {
    title = `${baseNoun} de ${capitalizeWords(director)}`;
  } else if (actor) {
    title = `${baseNoun} con ${capitalizeWords(actor)}`;
  } else if (isCustomYear) {
    title = `${baseNoun} de ${formatYearPeriod(year)}`;
  } else if (country) {
    title = `${baseNoun} de ${capitalizeWords(country)}`;
  }
  
  return {
    pageTitle: `${title} | videoclub.digital`,
    ogTitle: title,
    baseNoun
  };
}

export function buildSeoDescription(noun: string, filters: ActiveFilters, movies: Movie[] = []): string {
  let desc = `Explora y descubre ${noun.toLowerCase()} en videoclub.digital.`;
  
  if (filters.myList) {
    desc = "Gestiona tu lista personal de películas y series favoritas, puntuaciones y pendientes.";
  } else if (filters.searchTerm) {
    desc = `Resultados de búsqueda para "${filters.searchTerm}". Encuentra ${noun.toLowerCase()} relacionadas en nuestro catálogo inteligente.`;
  } else {
    const parts: string[] = [];
    if (filters.genre) parts.push(`género ${filters.genre}`);
    if (filters.country) parts.push(`de ${filters.country}`);
    if (filters.director) parts.push(`dirigidas por ${filters.director}`);
    if (filters.actor) parts.push(`con ${filters.actor}`);
    if (filters.year && filters.year !== `${CONFIG.YEAR_MIN}-${CONFIG.YEAR_MAX}`) {
      parts.push(filters.year.includes("-") ? `del periodo ${formatYearPeriod(filters.year)}` : `del año ${filters.year}`);
    }
    
    if (parts.length > 0) {
      desc = `Catálogo de ${noun.toLowerCase()} ${parts.join(", ")}. Descubre las mejores obras según tus gustos.`;
    } else {
      desc = `Tu oráculo cinéfilo. Explora miles de ${noun.toLowerCase()}, filtra por género, año, país, director y más para encontrar tu próxima obra maestra.`;
    }
  }

  if (movies && movies.length > 0 && !filters.myList) {
    const titles = movies.slice(0, 3).map(m => m.title).join(", ");
    desc += ` Destacadas: ${titles}.`;
  }

  if (desc.length > 160) {
    desc = `${desc.slice(0, 157)}...`;
  }
  return desc;
}

export function buildItemListSchema(movies: Array<Movie | MappedMovie> | null | undefined, totalMovies: number, currentUrl: string): Record<string, unknown> | null {
  if (!movies || movies.length === 0) return null;
  
  // Optimización SEO: Truncar a 20 elementos para evitar payloads JSON-LD excesivos.
  const limitedMovies = movies.slice(0, 20);

  return {
    "@context": "https://schema.org",
    "@type": "ItemList",
    "mainEntityOfPage": currentUrl,
    "numberOfItems": totalMovies,
    "itemListElement": limitedMovies.map((movie, index) => ({
      "@type": "ListItem",
      "position": index + 1,
      "item": {
        "@type": movie.type && movie.type.toLowerCase().startsWith('s') ? "TVSeries" : "Movie",
        "name": movie.title,
        "image": ("posterUrl" in movie ? movie.posterUrl : (movie.slug ? getHqPosterUrl(movie.slug) : undefined)) || undefined,
        "dateCreated": movie.year ? String(movie.year) : undefined,
        "director": movie.directors_list ? movie.directors_list.split(",").map(d => ({ "@type": "Person", "name": d.trim() })) : undefined,
        "actor": movie.actors_list ? movie.actors_list.split(",").map(a => ({ "@type": "Person", "name": a.trim() })) : undefined,
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
}

function formatBreadcrumbUrl(baseUrl: string, pathname: string, search: string): string {
  const cleanBase = baseUrl ? (baseUrl.endsWith("/") ? baseUrl.slice(0, -1) : baseUrl) : "https://videoclub.digital";
  const cleanPath = pathname.startsWith("/") ? pathname : `/${pathname}`;
  const fullPath = cleanPath === "/" ? `${cleanBase}/` : `${cleanBase}${cleanPath}`;
  return search ? `${fullPath}?${search}` : fullPath;
}

export function buildBreadcrumbSchema(filters: ActiveFilters = {} as ActiveFilters, baseUrl: string = "https://videoclub.digital/"): Record<string, unknown> | null {
  const cleanBase = baseUrl || "https://videoclub.digital/";
  const items: Array<{ "@type": string; position: number; name: string; item: string }> = [
    {
      "@type": "ListItem",
      "position": 1,
      "name": "Inicio",
      "item": cleanBase.endsWith("/") ? cleanBase : `${cleanBase}/`
    }
  ];

  // Nivel 2: Tipo de Medio / Catálogo
  let typeName = "Catálogo";
  let typeUrl = formatBreadcrumbUrl(cleanBase, "/", "");
  
  if (filters.mediaType === "movies") {
    typeName = "Películas";
    const { pathname, search } = stateToPrettyUrl({ mediaType: "movies" } as ActiveFilters, 1);
    typeUrl = formatBreadcrumbUrl(cleanBase, pathname, search);
  } else if (filters.mediaType === "series") {
    typeName = "Series";
    const { pathname, search } = stateToPrettyUrl({ mediaType: "series" } as ActiveFilters, 1);
    typeUrl = formatBreadcrumbUrl(cleanBase, pathname, search);
  }

  items.push({
    "@type": "ListItem",
    "position": 2,
    "name": typeName,
    "item": typeUrl
  });

  // Nivel 3: Filtro Específico (Prioridad jerárquica)
  let filterName: string | null = null;

  if (filters.myList === "watchlist") {
    filterName = "Pendientes";
  } else if (filters.myList === "rated") {
    filterName = "Votadas";
  } else if (filters.myList) {
    filterName = "Mi Lista";
  } else if (filters.searchTerm) {
    filterName = `"${filters.searchTerm}"`;
  } else if (filters.selection) {
    const config = FILTER_CONFIG.selection;
    filterName = config.titles?.[filters.selection as keyof typeof config.titles] || config.items[filters.selection as keyof typeof config.items] || filters.selection;
  } else if (filters.studio) {
    const studioInfo = STUDIO_DATA[filters.studio as keyof typeof STUDIO_DATA];
    filterName = (studioInfo && studioInfo.title) ? studioInfo.title : filters.studio;
  } else if (filters.director) {
    filterName = filters.director;
  } else if (filters.actor) {
    filterName = filters.actor;
  } else if (filters.genre) {
    filterName = filters.genre;
  } else if (filters.country) {
    filterName = filters.country;
  } else if (filters.year && filters.year !== `${CONFIG.YEAR_MIN}-${CONFIG.YEAR_MAX}`) {
    filterName = filters.year;
  }

  if (filterName) {
    const { pathname, search } = stateToPrettyUrl(filters, 1);
    const filterUrl = formatBreadcrumbUrl(cleanBase, pathname, search);

    items.push({
      "@type": "ListItem",
      "position": 3,
      "name": filterName,
      "item": filterUrl
    });
  }

  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    "itemListElement": items
  };
}

// =================================================================
//          2. INJECTORS (Manipulación del DOM)
// =================================================================

const setMeta = (selector: string, content: string): void => {
  const el = document.querySelector(selector);
  if (el && el.getAttribute("content") !== content) {
    el.setAttribute("content", content);
  }
};

const injectJsonLd = (scriptId: string, schema: Record<string, unknown> | null): void => {
  let script = document.getElementById(scriptId) as HTMLScriptElement | null;
  if (!script) {
    script = document.createElement("script");
    script.id = scriptId;
    script.type = "application/ld+json";
    document.head.appendChild(script);
  }
  const newContent = schema ? JSON.stringify(schema) : "";
  if (script.textContent !== newContent) {
    script.textContent = newContent;
  }
};

import { getAppBasePath } from "./contracts.js";
import { getCurrentPage } from "./state.js";

// =================================================================
//          3. ORQUESTADORES PÚBLICOS
// =================================================================

export function getCanonicalUrl(filters: ActiveFilters = getActiveFilters(), page: number = getCurrentPage()): string {
  if (typeof window === "undefined") return "https://videoclub.digital/";
  const { pathname, search } = stateToPrettyUrl(filters, page);
  const basePrefix = getAppBasePath();
  const cleanPath = search ? `${pathname}?${search}` : pathname;
  return `${window.location.origin}${basePrefix}${cleanPath}`;
}

export function updatePageTitle(movies: Movie[] = []): void {
  const filters = getActiveFilters();
  const canonicalUrl = getCanonicalUrl(filters, getCurrentPage());
  
  const { pageTitle, ogTitle, baseNoun } = buildSeoTitle(filters);
  const description = buildSeoDescription(baseNoun, filters, movies);
  
  document.title = pageTitle;
  setMeta('meta[name="description"]', description);
  setMeta('meta[property="og:title"]', ogTitle);
  setMeta('meta[property="og:description"]', description);
  setMeta('meta[property="og:url"]', canonicalUrl);
  
  let canonical = document.querySelector("link[rel='canonical']") as HTMLLinkElement | null;
  if (!canonical) {
    canonical = document.createElement("link");
    canonical.rel = "canonical";
    document.head.appendChild(canonical);
  }
  if (canonical.href !== canonicalUrl) {
    canonical.href = canonicalUrl;
  }
}

export function updateStructuredData(movies: Movie[], totalMovies: number): void {
  const canonicalUrl = getCanonicalUrl(getActiveFilters(), getCurrentPage());
  const schema = buildItemListSchema(movies, totalMovies, canonicalUrl);
  injectJsonLd("dynamic-json-ld", schema);
}

export function updateBreadcrumbData(filters: ActiveFilters): void {
  const baseEnv = import.meta.env.BASE_URL || "/";
  const normalizedBase = baseEnv.endsWith("/") ? baseEnv : `${baseEnv}/`;
  const baseUrl = `${window.location.origin}${normalizedBase}`;
  const schema = buildBreadcrumbSchema(filters, baseUrl);
  injectJsonLd("dynamic-breadcrumbs-json-ld", schema);
}

