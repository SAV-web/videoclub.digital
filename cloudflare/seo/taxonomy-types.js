// =================================================================
//        REPRESENTACIÓN SEO Y METADATOS DE EDGE SSR
//             (cloudflare/seo/taxonomy-types.js)
// =================================================================
// Este módulo define la REPRESENTACIÓN SEO y METADATOS DE PRESENTACIÓN
// para el Edge Worker (Cloudflare Workers).
//
// REGLA ARQUITECTÓNICA ESTRICTA:
// - slugs.ts = IDENTIDAD / CANONICIDAD (SSOT):
//   Define la existencia de entidades, slugs canónicos, alias y normalización.
// - taxonomy-types.js = REPRESENTACIÓN SEO:
//   Enriquece la identidad canónica con metadatos descriptivos (títulos SEO,
//   descripciones editoriales, Schema.org y parámetros RPC para Supabase).
//
// Cualquier entidad añadida o modificada aquí debe mantener paridad
// estricta con los conjuntos canónicos registrados en `src/shared/slugs.ts`.
// =================================================================

/**
 * 21 Géneros Canónicos Oficiales
 */
export const GENRE_MAP = {
  accion: {
    name: "Acción",
    title: "Películas y Series de Acción",
    description: "Explora las mejores películas y series de acción en streaming. Clásicos del cine adrenalínico, artes marciales y grandes superproducciones valoradas por la comunidad."
  },
  animacion: {
    name: "Animación",
    title: "Películas y Series de Animación",
    description: "Grandes obras maestras del cine y la televisión de animación tradicional, stop-motion y CGI de estudios de todo el mundo disponibles en streaming."
  },
  aventuras: {
    name: "Aventuras",
    title: "Películas y Series de Aventuras",
    description: "Expediciones inolvidables, viajes épicos y mundos por descubrir. El mejor catálogo de aventuras cinematográficas en streaming."
  },
  belico: {
    name: "Bélico",
    title: "Películas y Series Bélicas",
    description: "Los conflictos históricos más dramáticos y realistas llevados a la pantalla. Cine bélico imprescindible ordenado por valoración y votos."
  },
  biografia: {
    name: "Biografía",
    title: "Biografías y Biopics",
    description: "Vidas extraordinarias y figuras clave de la historia, la cultura y la ciencia. Los mejores dramas biográficos en streaming."
  },
  noir: {
    name: "Noir",
    title: "Cine Noir y Cine Negro",
    description: "Detectives cínicos, femmes fatales y claroscuros morales. Las joyas del cine negro clásico y neo-noir disponibles para ver online."
  },
  comedia: {
    name: "Comedia",
    title: "Películas y Series de Comedia",
    description: "Desde el slapstick clásico y la comedia absurda hasta la sátira inteligente y la comedia dramática contemporánea."
  },
  crimen: {
    name: "Crimen",
    title: "Películas y Series de Crimen y Mafia",
    description: "Golpes maestros, organizaciones criminales e investigaciones policiales de alto calibre en streaming."
  },
  deporte: {
    name: "Deporte",
    title: "Cine y Series Deportivas",
    description: "Historias de superación, épica en la cancha y momentos cumbre del deporte llevados a la gran pantalla."
  },
  documental: {
    name: "Documental",
    title: "Documentales Imprescindibles",
    description: "Investigaciones periodísticas, crónicas históricas, naturaleza y sociedad en una cuidada selección documental."
  },
  drama: {
    name: "Drama",
    title: "Películas y Series Dramáticas",
    description: "Relatos humanos conmovedores, conflictos morales y grandes interpretaciones del cine dramático universal."
  },
  familiar: {
    name: "Familiar",
    title: "Cine Familiar para Todas las Edades",
    description: "Películas entrañables y divertidas para disfrutar en familia, con recomendaciones de alta calidad cinematográfica."
  },
  fantasia: {
    name: "Fantasía",
    title: "Películas y Series de Fantasía",
    description: "Mundos mágicos, criaturas míticas y viajes legendarios que desafían las fronteras de la imaginación."
  },
  historico: {
    name: "Histórico",
    title: "Cine y Series Históricas",
    description: "Recreaciones rigurosas y dramáticas de los periodos, imperios y revoluciones que moldearon nuestro mundo."
  },
  intriga: {
    name: "Intriga",
    title: "Películas y Series de Intriga y Misterio",
    description: "Giros de guion inesperados, enigmas sin resolver y tramas absorbentes que mantienen la tensión hasta el final."
  },
  musica: {
    name: "Música",
    title: "Cine Musical y Obras Musicales",
    description: "Bandas sonoras legendarias, musicales de Broadway y biografías de los artistas que cambiaron la historia de la música."
  },
  romance: {
    name: "Romance",
    title: "Películas y Series Románticas",
    description: "Grandes historias de amor, romances apasionados y comedias románticas inteligentes ordenadas por valoración comunitaria."
  },
  "sci-fi": {
    name: "Sci-Fi",
    title: "Películas y Series de Ciencia Ficción",
    description: "Viajes espaciales, futuros distópicos, inteligencia artificial y paradojas temporales en la mejor selección de ciencia ficción en streaming."
  },
  terror: {
    name: "Terror",
    title: "Películas y Series de Terror",
    description: "Cine de terror psicológico, horror sobrenatural, slashers de culto y monstruos clásicos disponibles para ver online."
  },
  thriller: {
    name: "Thriller",
    title: "Películas y Series Thriller y Suspense",
    description: "Tensión constante, persecuciones electrizantes y conspiraciones psicológicas en el catálogo más votado de suspense."
  },
  western: {
    name: "Western",
    title: "Cine Western y del Oeste",
    description: "Duelos bajo el sol, forajidos legendarios y la conquista de la frontera en los mejores westerns clásicos y modernos."
  }
};

/**
 * 15 Estudios Cinematográficos Oficiales
 */
export const STUDIO_MAP = {
  warner: {
    code: "warner",
    name: "Warner Bros.",
    title: "Películas y Series de Warner Bros.",
    description: "Catálogo legendario de Warner Bros. Pictures: desde los clásicos dorados de Hollywood hasta las mayores franquicias contemporáneas."
  },
  universal: {
    code: "universal",
    name: "Universal Pictures",
    title: "Películas y Series de Universal Pictures",
    description: "Los monstruos clásicos, dramas de autor y grandes éxitos de taquilla del histórico estudio Universal Pictures."
  },
  sony: {
    code: "sony",
    name: "Sony Pictures",
    title: "Películas y Series de Sony Pictures",
    description: "Producciones y clásicos de Columbia Pictures y TriStar producidos bajo el sello Sony Pictures Entertainment."
  },
  paramount: {
    code: "paramount",
    name: "Paramount Pictures",
    title: "Películas y Series de Paramount Pictures",
    description: "Más de un siglo de historia cinematográfica con las obras cumbre producidas por Paramount Pictures."
  },
  disney: {
    code: "disney",
    name: "Walt Disney Pictures",
    title: "Películas y Series de Walt Disney",
    description: "Clásicos animados imperecederos, producciones en imagen real y magia cinematográfica para todas las generaciones."
  },
  netflix: {
    code: "netflix",
    name: "Netflix",
    title: "Películas y Series Originales de Netflix",
    description: "Obras premiadas y cine internacional exclusivo producido y distribuido por la plataforma Netflix."
  },
  amazon: {
    code: "amazon",
    name: "Amazon MGM Studios",
    title: "Películas y Series de Amazon MGM Studios",
    description: "Títulos destacados de Amazon Studios y el legendario catálogo del león de Metro-Goldwyn-Mayer."
  },
  fox: {
    code: "fox",
    name: "20th Century Studios",
    title: "Películas y Series de 20th Century Studios",
    description: "El inmenso legado de 20th Century Fox: obras de culto, ciencia ficción revolucionaria y ganadoras del Óscar."
  },
  lionsgate: {
    code: "lionsgate",
    name: "Lionsgate",
    title: "Películas y Series de Lionsgate",
    description: "Cine independiente audaz, sagas de acción desenfrenada y thrillers de alto impacto producidos por Lionsgate."
  },
  canalplus: {
    code: "canalplus",
    name: "Canal+",
    title: "Cine y Series de Canal+",
    description: "Cine europeo de vanguardia, coproducciones autorales y prestigiosas series con el sello de calidad de Canal+."
  },
  bbc: {
    code: "bbc",
    name: "BBC Film",
    title: "Cine y Series de BBC Film",
    description: "Dramas de época impecables, adaptaciones literarias y cine británico independiente producido por la BBC."
  },
  miramax: {
    code: "miramax",
    name: "Miramax",
    title: "Películas de Miramax",
    description: "El cine que revolucionó los años 90: cine independiente de culto, guiones brillantes y directores rompedores."
  },
  a24: {
    code: "a24",
    name: "A24",
    title: "Películas y Series de A24",
    description: "El referente moderno del cine independiente: propuestas audaces, terror psicológico de autor y visiones cinematográficas únicas."
  },
  movistar: {
    code: "movistar",
    name: "Movistar Plus+",
    title: "Series y Películas de Movistar Plus+",
    description: "Producción original española de máximo nivel: series aclamadas y coproducciones de cine de autor de Movistar Plus+."
  },
  apple: {
    code: "apple",
    name: "Apple Original Films",
    title: "Películas y Series de Apple Original Films",
    description: "Grandes directores, producciones cuidadas al milímetro y ganadoras del Óscar de Apple Original Films."
  }
};

/**
 * 10 Selecciones Editoriales Oficiales
 */
export const SELECTION_MAP = {
  "1001movies": {
    code: "1001movies",
    name: "1001 Películas que ver antes de morir",
    title: "1001 Películas que hay que ver antes de morir",
    description: "La guía canónica definitiva de la historia del cine seleccionada por Steven Jay Schneider y críticos internacionales."
  },
  tspdt: {
    code: "tspdt",
    name: "TSPDT (They Shoot Pictures, Don't They?)",
    title: "They Shoot Pictures, Don't They? — Las 1000 Mejores Películas",
    description: "El mayor consenso crítico de la historia del cine compilando listas de directores y críticos de todo el mundo."
  },
  criterion: {
    code: "criterion",
    name: "The Criterion Collection",
    title: "The Criterion Collection — Obras Maestras del Cine",
    description: "La biblioteca de referencia para amantes del cine: ediciones restauradas y películas de autor esenciales."
  },
  kinolorber: {
    code: "kinolorber",
    name: "Kino Lorber",
    title: "Archivo Cinematográfico Kino Lorber",
    description: "Pioneros del cine mudo, cine europeo clásico y obras de culto restauradas en alta definición."
  },
  toptv: {
    code: "toptv",
    name: "Top TV Series",
    title: "Las Mejores Series de Televisión según los Rankings",
    description: "Las series de televisión más aclamadas y mejor valoradas de la historia de la pequeña pantalla."
  },
  hbo: {
    code: "hbo",
    name: "Series HBO",
    title: "Series Legendarias de HBO",
    description: "La época dorada de la televisión: producciones que cambiaron para siempre el medio televisivo internacional."
  },
  acontra: {
    code: "acontra",
    name: "A Contracorriente Films",
    title: "Colección A Contracorriente Films",
    description: "Cine independiente europeo, comedias de autor y títulos de calidad excepcional distribuidos en España."
  },
  arrow: {
    code: "arrow",
    name: "Arrow Video",
    title: "Colección de Culto Arrow Video",
    description: "El templo del cine de culto: giallo, serie B, terror clásico y joyas underground restauradas."
  },
  eureka: {
    code: "eureka",
    name: "Eureka Masters of Cinema",
    title: "Masters of Cinema (Eureka)",
    description: "Joyas universales del cine mudo, expresionismo alemán y clásicos asiáticos restaurados meticulosamente."
  },
  imprint: {
    code: "imprint",
    name: "Imprint Films",
    title: "Colección Exclusiva Imprint Films",
    description: "Cine de culto australiano e internacional de las décadas doradas en ediciones limitadas para coleccionistas."
  }
};

/**
 * 2 Grupos Regionales Canónicos
 */
export const REGIONAL_GROUPS_MAP = {
  latam: {
    code: "latam",
    name: "Latinoamérica",
    title: "Cine Latinoamericano",
    description: "Las mejores obras cinematográficas de Argentina, México, Brasil, Chile, Colombia y toda América Latina en streaming."
  },
  nordic: {
    code: "nordic",
    name: "Países Nórdicos",
    title: "Cine Nórdico y Escandinavo",
    description: "Grandes títulos de Suecia, Dinamarca, Noruega, Finlandia e Islandia: thriller nórdico, cine de autor y dramas psicológicos."
  }
};

/**
 * 78 Países Activos con Películas Garantizadas en la Base de Datos
 */
export const ACTIVE_COUNTRIES_MAP = {
  afganistan: { name: "Afganistán", code: "AF" },
  alemania: { name: "Alemania", code: "DE" },
  "arabia-saudi": { name: "Arabia Saudí", code: "SA" },
  argelia: { name: "Argelia", code: "DZ" },
  argentina: { name: "Argentina", code: "AR" },
  australia: { name: "Australia", code: "AU" },
  austria: { name: "Austria", code: "AT" },
  belgica: { name: "Bélgica", code: "BE" },
  bosnia: { name: "Bosnia", code: "BA" },
  botswana: { name: "Botswana", code: "BW" },
  brasil: { name: "Brasil", code: "BR" },
  camboya: { name: "Camboya", code: "KH" },
  canada: { name: "Canadá", code: "CA" },
  chequia: { name: "Chequia", code: "CZ" },
  chile: { name: "Chile", code: "CL" },
  china: { name: "China", code: "CN" },
  colombia: { name: "Colombia", code: "CO" },
  "corea-del-sur": { name: "Corea del Sur", code: "KR" },
  croacia: { name: "Croacia", code: "HR" },
  cuba: { name: "Cuba", code: "CU" },
  dinamarca: { name: "Dinamarca", code: "DK" },
  ecuador: { name: "Ecuador", code: "EC" },
  eeuu: { name: "EEUU", code: "US" },
  egipto: { name: "Egipto", code: "EG" },
  eslovaquia: { name: "Eslovaquia", code: "SK" },
  espana: { name: "España", code: "ES" },
  estonia: { name: "Estonia", code: "EE" },
  filipinas: { name: "Filipinas", code: "PH" },
  finlandia: { name: "Finlandia", code: "FI" },
  francia: { name: "Francia", code: "FR" },
  georgia: { name: "Georgia", code: "GE" },
  grecia: { name: "Grecia", code: "GR" },
  guatemala: { name: "Guatemala", code: "GT" },
  holanda: { name: "Holanda", code: "NL" },
  "hong-kong": { name: "Hong Kong", code: "HK" },
  hungria: { name: "Hungría", code: "HU" },
  india: { name: "India", code: "IN" },
  indonesia: { name: "Indonesia", code: "ID" },
  irak: { name: "Irak", code: "IQ" },
  iran: { name: "Irán", code: "IR" },
  irlanda: { name: "Irlanda", code: "IE" },
  islandia: { name: "Islandia", code: "IS" },
  israel: { name: "Israel", code: "IL" },
  italia: { name: "Italia", code: "IT" },
  jamaica: { name: "Jamaica", code: "JM" },
  japon: { name: "Japón", code: "JP" },
  kazajistan: { name: "Kazajistán", code: "KZ" },
  lesotho: { name: "Lesotho", code: "LS" },
  letonia: { name: "Letonia", code: "LV" },
  libano: { name: "Líbano", code: "LB" },
  macedonia: { name: "Macedonia", code: "MK" },
  marruecos: { name: "Marruecos", code: "MA" },
  mexico: { name: "México", code: "MX" },
  noruega: { name: "Noruega", code: "NO" },
  "nueva-zelanda": { name: "Nueva Zelanda", code: "NZ" },
  palestina: { name: "Palestina", code: "PS" },
  panama: { name: "Panamá", code: "PA" },
  paquistan: { name: "Paquistán", code: "PK" },
  paraguay: { name: "Paraguay", code: "PY" },
  peru: { name: "Perú", code: "PE" },
  polonia: { name: "Polonia", code: "PL" },
  portugal: { name: "Portugal", code: "PT" },
  rumania: { name: "Rumanía", code: "RO" },
  rusia: { name: "Rusia", code: "RU" },
  senegal: { name: "Senegal", code: "SN" },
  serbia: { name: "Serbia", code: "RS" },
  singapur: { name: "Singapur", code: "SG" },
  sudafrica: { name: "Sudáfrica", code: "ZA" },
  suecia: { name: "Suecia", code: "SE" },
  suiza: { name: "Suiza", code: "CH" },
  tailandia: { name: "Tailandia", code: "TH" },
  taiwan: { name: "Taiwán", code: "TW" },
  turquia: { name: "Turquía", code: "TR" },
  ucrania: { name: "Ucrania", code: "UA" },
  uk: { name: "UK", code: "GB" },
  uruguay: { name: "Uruguay", code: "UY" },
  venezuela: { name: "Venezuela", code: "VE" },
  vietnam: { name: "Vietnam", code: "VN" }
};

/**
 * Resuelve un slug de URL a su entidad de taxonomía correspondiente.
 * Devuelve null si el slug no pertenece a ninguna de las taxonomías activas.
 * 
 * @param {string} rawSlug
 * @returns {object|null}
 */
export function resolveTaxonomy(rawSlug) {
  if (!rawSlug) return null;
  const slug = String(rawSlug).trim().toLowerCase().replace(/^\/+|\/+$/g, "");
  if (!slug) return null;

  // 1. Género
  if (GENRE_MAP[slug]) {
    const item = GENRE_MAP[slug];
    return {
      type: "genre",
      name: item.name,
      title: item.title,
      seoTitle: `${item.title} — Videoclub Digital`,
      description: item.description,
      badgeLabel: "Género",
      canonicalSlug: slug,
      categoryBreadcrumb: "Géneros",
      rpcParams: {
        genre_name: item.name,
        sort_field: "fa_votes",
        sort_direction: "desc",
        page_limit: 42,
        page_offset: 0,
        get_count: false
      }
    };
  }

  // 2. Estudio
  if (STUDIO_MAP[slug]) {
    const item = STUDIO_MAP[slug];
    return {
      type: "studio",
      name: item.name,
      title: item.title,
      seoTitle: `${item.title} — Videoclub Digital`,
      description: item.description,
      badgeLabel: "Estudio",
      canonicalSlug: slug,
      categoryBreadcrumb: "Estudios",
      rpcParams: {
        p_studio_code: item.code,
        sort_field: "fa_votes",
        sort_direction: "desc",
        page_limit: 42,
        page_offset: 0,
        get_count: false
      }
    };
  }

  // 3. Selección Editorial
  if (SELECTION_MAP[slug]) {
    const item = SELECTION_MAP[slug];
    return {
      type: "selection",
      name: item.name,
      title: item.title,
      seoTitle: `${item.title} — Videoclub Digital`,
      description: item.description,
      badgeLabel: "Colección",
      canonicalSlug: slug,
      categoryBreadcrumb: "Selecciones",
      rpcParams: {
        p_selection_code: item.code,
        sort_field: "fa_votes",
        sort_direction: "desc",
        page_limit: 42,
        page_offset: 0,
        get_count: false
      }
    };
  }

  // 4. Grupo Regional
  if (REGIONAL_GROUPS_MAP[slug]) {
    const item = REGIONAL_GROUPS_MAP[slug];
    return {
      type: "country",
      name: item.name,
      title: item.title,
      seoTitle: `${item.title} — Videoclub Digital`,
      description: item.description,
      badgeLabel: "Región",
      canonicalSlug: slug,
      categoryBreadcrumb: "Países",
      rpcParams: {
        country_name: item.code,
        sort_field: "fa_votes",
        sort_direction: "desc",
        page_limit: 42,
        page_offset: 0,
        get_count: false
      }
    };
  }

  // 5. País Activo Individual
  if (ACTIVE_COUNTRIES_MAP[slug]) {
    const item = ACTIVE_COUNTRIES_MAP[slug];
    const countryTitle = `Cine de ${item.name}`;
    const countryDesc = `Descubre las mejores películas y series de ${item.name} disponibles en streaming en España, ordenadas por valoración y votos.`;
    return {
      type: "country",
      name: item.name,
      code: item.code,
      title: countryTitle,
      seoTitle: `${countryTitle} — Videoclub Digital`,
      description: countryDesc,
      badgeLabel: "País",
      canonicalSlug: slug,
      categoryBreadcrumb: "Países",
      rpcParams: {
        country_name: item.name,
        sort_field: "fa_votes",
        sort_direction: "desc",
        page_limit: 42,
        page_offset: 0,
        get_count: false
      }
    };
  }

  return null;
}
