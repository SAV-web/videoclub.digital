// =================================================================
//          GENERADOR DE LLMS.TXT Y LLMS-FULL.TXT
// =================================================================
// Lee la Fuente Única de Verdad (SSOT) de src/shared/slugs.ts y
// src/shared/constants.ts y genera public/llms.txt y public/llms-full.txt
// de forma 100% determinista, eliminando cualquier discrepancia.
// =================================================================

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { startViteSsrServer } from "../tests/helpers/vite-ssr.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "../");
const publicDir = path.resolve(projectRoot, "public");

async function main() {
  console.log("Cargando diccionarios canónicos del proyecto vía Vite SSR...");
  const viteEnv = await startViteSsrServer([
    "/src/shared/slugs.ts",
    "/src/shared/constants.ts",
  ]);

  const [slugsModule, constantsModule] = viteEnv.modules;

  const {
    toSlug,
    OFFICIAL_GENRES,
    GENRE_SLUG_MAP,
    genreToSlug,
    COUNTRY_SLUG_MAP,
    STUDIO_SLUGS,
    SELECTION_SLUGS,
  } = slugsModule;

  const { STUDIO_DATA } = constantsModule;

  await viteEnv.close();

  // Nombres legibles para selecciones
  const SELECTION_TITLES = {
    "1001movies": "1001 películas que hay que ver antes de morir (Steven Jay Schneider)",
    tspdt: "They Shoot Pictures, Don't They? (Top 1000 de la historia del cine)",
    criterion: "The Criterion Collection",
    kinolorber: "Colección Kino Lorber",
    toptv: "Mejores series de televisión de la historia (Top TV)",
    hbo: "Colección HBO Originals",
    acontra: "A Contracorriente Films",
    arrow: "Arrow Video",
    eureka: "Eureka Entertainment / Masters of Cinema",
    imprint: "Imprint Films",
  };

  // 1. GENERAR public/llms.txt (Resumen conciso y autoritativo)
  const llmsTxtContent = `# VIDEOCLUB.DIGITAL

> VIDEOCLUB.DIGITAL es una plataforma digital de exploración y descubrimiento cinematográfico en español que cataloga más de 3.000 títulos clásicos y contemporáneos, con puntuaciones consolidadas (FilmAffinity e IMDb), fichas técnicas enriquecidas y enlaces directos a plataformas de streaming.

## Catálogo y Enlaces Principales

- [Inicio / Catálogo Completo](https://videoclub.digital/): Rejilla interactiva de películas y series con filtrado multidimensional instantáneo.
- [Mapa del Sitio (Sitemap Index)](https://videoclub.digital/sitemap-index.xml): Índice de sitemaps estructurados para películas, directores, actores, géneros y países.
- [Especificación Completa para Agentes (llms-full.txt)](https://videoclub.digital/llms-full.txt): Referencia exhaustiva con la totalidad de taxonomías, operadores y metadatos.

## Estructura de URLs Canónicas

La plataforma opera con un sistema de rutas canónicas limpias (Pretty Paths) deterministas y jerárquicas:

### 1. Entidades VIP (Personas)
Las páginas de directores y actores utilizan siempre un segmento de ruta dedicado:
- **Directores**: \`/director/{slug}/\` (ej: \`https://videoclub.digital/director/christopher-nolan/\`, \`https://videoclub.digital/director/martin-scorsese/\`)
- **Actores**: \`/actor/{slug}/\` (ej: \`https://videoclub.digital/actor/al-pacino/\`, \`https://videoclub.digital/actor/eduard-fernandez/\`)
*Nota: No se admiten parámetros tipo \`?director=\` ni \`?actor=\` en URLs canónicas.*

### 2. Taxonomías de Catálogo (Rutas Canónicas)
Jerarquía canónica en ruta: \`/{genero}/{pais}/{estudio O seleccion}/\`
- **21 Géneros Canónicos**: ${OFFICIAL_GENRES.map(g => `\`/${toSlug(g)}/\` (${g})`).join(", ")}.
- **Países y Regiones Principales**: \`/eeuu/\` (EEUU), \`/espana/\` (España), \`/uk/\` (Reino Unido), \`/francia/\` (Francia), \`/japon/\` (Japón), \`/italia/\` (Italia), \`/alemania/\` (Alemania), \`/latam/\` (Latinoamérica), \`/nordic/\` (Países Nórdicos).
- **15 Estudios Cinematográficos**: ${Array.from(STUDIO_SLUGS).map(s => `\`/${s}/\``).join(", ")}.
- **10 Selecciones Críticas**: ${Array.from(SELECTION_SLUGS).map(s => `\`/${s}/\``).join(", ")}.
- **Exclusiones**: Se prefijan con \`no-\` dentro de la ruta (ej: \`/comedia/no-eeuu/\`, \`/drama/no-terror/\`).

### 3. Parámetros de Consulta (Query Parameters)
Los filtros no posicionales utilizan exclusivamente parámetros URL:
- **Filtro Temporal**: \`?year={ano}\` o \`?year={min}-{max}\` (ej: \`https://videoclub.digital/?year=1994\`, \`https://videoclub.digital/sci-fi/?year=1980-1989\`). *Los años y décadas nunca forman parte de la ruta ni tienen segmentos URL propios.*
- **Búsqueda**: \`?search={termino}\`
- **Ordenación**: \`?sort={criterio}\` (\`relevance,asc\`, \`year,desc\`, \`year,asc\`, \`fa_rating,desc\`, \`imdb_rating,desc\`, \`fa_votes,desc\`, \`imdb_votes,desc\`)
- **Tipo de Medio**: \`?type={movies|series|all}\`
- **Paginación**: \`?page={numero}\` (ej: \`?page=2\`)
- **Ficha Detallada**: \`?movie={id}\`

## Calificaciones Consolidadas

- **FilmAffinity**: Puntuación sobre 10 y recuento de votos.
- **IMDb**: Puntuación sobre 10 y recuento de votos.
- **Nota Media Ponderada**: Cálculo ponderado logarítmico para equilibrar diferencias de volumen muestral.
- **Escala Visual de 3 Estrellas**: Normalización visual continua de 1 a 3 estrellas para evaluación cualitativa rápida.
`;

  // 2. GENERAR public/llms-full.txt (Especificación exhaustiva y completa)
  const genresListMarkdown = OFFICIAL_GENRES.map(g => {
    const slug = toSlug(g);
    return `- \`/${slug}/\` — **${g}** (\`https://videoclub.digital/${slug}/\`)`;
  }).join("\n");

  const studiosListMarkdown = Array.from(STUDIO_SLUGS).map(slug => {
    const info = STUDIO_DATA[slug];
    const name = info?.title || slug.charAt(0).toUpperCase() + slug.slice(1);
    return `- \`/${slug}/\` — **${name}** (\`https://videoclub.digital/${slug}/\`)`;
  }).join("\n");

  const selectionsListMarkdown = Array.from(SELECTION_SLUGS).map(slug => {
    const desc = SELECTION_TITLES[slug] || slug;
    return `- \`/${slug}/\` — **${desc}** (\`https://videoclub.digital/${slug}/\`)`;
  }).join("\n");

  const majorCountries = [
    ["eeuu", "EEUU (Estados Unidos)"],
    ["espana", "España"],
    ["uk", "Reino Unido (UK)"],
    ["francia", "Francia"],
    ["italia", "Italia"],
    ["alemania", "Alemania"],
    ["japon", "Japón"],
    ["corea-del-sur", "Corea del Sur"],
    ["canada", "Canadá"],
    ["australia", "Australia"],
    ["hong-kong", "Hong Kong"],
    ["mexico", "México"],
    ["argentina", "Argentina"],
    ["suecia", "Suecia"],
    ["dinamarca", "Dinamarca"],
    ["noruega", "Noruega"],
    ["polonia", "Polonia"],
    ["rusia", "Rusia"],
    ["irlanda", "Irlanda"],
    ["belgica", "Bélgica"],
    ["austria", "Austria"],
    ["holanda", "Holanda (Países Bajos)"],
    ["suiza", "Suiza"],
    ["portugal", "Portugal"],
    ["grecia", "Grecia"],
    ["brasil", "Brasil"],
    ["chile", "Chile"],
    ["colombia", "Colombia"],
    ["cuba", "Cuba"],
    ["india", "India"],
    ["china", "China"],
    ["taiwan", "Taiwán"],
    ["iran", "Irán"],
    ["turquia", "Turquía"],
    ["nueva-zelanda", "Nueva Zelanda"],
    ["latam", "Región Latinoamérica (Grupo Regional)"],
    ["nordic", "Región Países Nórdicos (Grupo Regional)"],
  ];

  const countriesListMarkdown = majorCountries.map(([slug, name]) => {
    return `- \`/${slug}/\` — **${name}** (\`https://videoclub.digital/${slug}/\`)`;
  }).join("\n");

  const llmsFullTxtContent = `# VIDEOCLUB.DIGITAL — Especificación Completa del Catálogo (llms-full.txt)

> Documentación técnica oficial y exhaustiva para modelos de lenguaje (LLMs), sistemas RAG, agentes de navegación y rastreadores web sobre VIDEOCLUB.DIGITAL.
> Generado directamente a partir de los contratos del código fuente del proyecto.

---

## 1. Misión, Enfoque y Cobertura

VIDEOCLUB.DIGITAL es un archivo y catálogo cinematográfico independiente en español centrado en la excelencia fílmica: cine clásico, cine de autor internacional, obras de culto, selecciones canónicas y cine contemporáneo relevante. No aloja archivos de vídeo streaming; actúa como un prescriptor inteligente y base de conocimiento técnico con sinopsis, biografías, créditos normalizados, desambiguación de colectivos de dirección y enlaces externos oficiales.

---

## 2. Taxonomías y Slugs Canónicos Oficiales

Todas las rutas canónicas del catálogo son estrictamente deterministas. Cada slug mapea 1:1 con un registro de base de datos.

### A. Catálogo Completo de Géneros Oficiales (21)
${genresListMarkdown}

*Aclaraciones críticas de normalización:*
- El slug para **Ciencia Ficción** es obligatoriamente \`sci-fi\`.
- El slug para **Cine Negro** es obligatoriamente \`noir\`.
- El slug para **Fantasía** es obligatoriamente \`fantasia\`.
- El slug para **Música** es obligatoriamente \`musica\`.

### B. Estudios y Productoras Oficiales (15)
${studiosListMarkdown}

*Nota sobre plataformas VOD:*
El catálogo clasifica por los 15 sellos de producción/estudio canónicos registrados arriba. No existen rutas para servicios externos como \`/filmin/\`, \`/prime-video/\` ni \`/hbo-max/\`.

### C. Selecciones y Colecciones Canónicas (10)
${selectionsListMarkdown}

*Aclaraciones críticas de normalización:*
- Los slugs son estrictamente alfanuméricos simples sin guiones ni añadidos: \`1001movies\`, \`tspdt\`, \`criterion\`, etc.

### D. Países y Grupos Regionales
${countriesListMarkdown}

*Aclaraciones críticas de normalización:*
- Estados Unidos utiliza el slug \`eeuu\` (no \`/estados-unidos/\`).
- Reino Unido utiliza el slug \`uk\` (no \`/reino-unido/\`).

---

## 3. Entidades de Personas (Directores y Actores)

Las personalidades del catálogo cuentan con rutas dedicadas con prefijo semántico:

- **Directores**: \`/director/{slug}/\`
  - Ejemplo: \`https://videoclub.digital/director/christopher-nolan/\`
  - Ejemplo: \`https://videoclub.digital/director/martin-scorsese/\`
  - Ejemplo: \`https://videoclub.digital/director/luis-garcia-berlanga/\`
- **Actores**: \`/actor/{slug}/\`
  - Ejemplo: \`https://videoclub.digital/actor/al-pacino/\`
  - Ejemplo: \`https://videoclub.digital/actor/eduard-fernandez/\`

*Regla de Protocolo:*
No se utilizan consultas por parámetro (\`?director=\` o \`?actor=\`) para enlaces permanentes o canónicos.

---

## 4. Gramática y Combinatoria de Rutas (Pretty Paths)

El enrutador canónico admite la combinación de taxonomías en un orden jerárquico estricto:

1. **Jerarquía**: \`/{genero}/{pais}/{estudio O seleccion}/\`
   - Ejemplo (Género + País): \`https://videoclub.digital/drama/francia/\`
   - Ejemplo (Género + País + Estudio): \`https://videoclub.digital/sci-fi/eeuu/warner/\`
   - Ejemplo (Género + Selección): \`https://videoclub.digital/drama/criterion/\`
   - Ejemplo (País + Estudio): \`https://videoclub.digital/japon/sony/\`

2. **Exclusiones de Catálogo**:
   - Prefijadas con \`no-\`: \`https://videoclub.digital/comedia/no-eeuu/\`
   - Exclusión de género: \`https://videoclub.digital/drama/no-terror/\`

3. **Filtrado Temporal (Años y Décadas)**:
   - **NO** forma parte de la ruta. Los años o décadas nunca tienen segmentos propios en la URL.
   - El año se filtra siempre vía Query Parameter:
     - Año individual: \`https://videoclub.digital/?year=1994\`
     - Rango de años: \`https://videoclub.digital/sci-fi/?year=1980-1989\`
     - Rango abierto: \`https://videoclub.digital/drama/?year=2010-\`

4. **Parámetros URL Adicionales**:
   - \`?search={texto}\`: Búsqueda de texto completo normalizada sin acentos ni diacríticos.
   - \`?sort={criterio}\`: Criterios válidos:
     - \`relevance,asc\` (Relevancia editorial)
     - \`year,desc\` (Más recientes primero)
     - \`year,asc\` (Más antiguas primero)
     - \`fa_rating,desc\` (Mejor nota FilmAffinity)
     - \`imdb_rating,desc\` (Mejor nota IMDb)
     - \`fa_votes,desc\` (Mayor cantidad de votos FilmAffinity)
     - \`imdb_votes,desc\` (Mayor cantidad de votos IMDb)
   - \`?type=movies|series|all\`: Filtro por largometraje, serie o catálogo conjunto.
   - \`?page={n}\`: Navegación paginada (base 1).
   - \`?movie={id}\`: Acceso canónico a ficha de título por identificador numérico.

---

## 5. Esquema de Datos y Metadatos de Ficha

Cada ficha cinematográfica expone el siguiente contrato de datos normalizado:

- \`id\` (integer): Identificador único inmutable.
- \`slug\` (string): Identificador alfanumérico URL-safe del título.
- \`title\` (string): Título en español para el mercado hispanohablante.
- \`original_title\` (string): Título en su idioma original de producción.
- \`year\` (integer): Año de estreno original.
- \`runtime\` (integer): Duración en minutos (para series, promedio por episodio o formato temporada).
- \`directors\` (string): Directores acreditados separados por coma.
- \`actors\` (string): Reparto principal ordenado por relevancia.
- \`genres\` (string): Géneros asignados de entre los 21 oficiales.
- \`country\` (string): País de procedencia con código ISO y bandera SVG.
- \`synopsis\` (string): Sinopsis argumental en español.
- \`fa_rating\` (number | null): Calificación FilmAffinity (0.0 a 10.0).
- \`fa_votes\` (integer): Recuento de votos en FilmAffinity.
- \`imdb_rating\` (number | null): Calificación IMDb (0.0 a 10.0).
- \`imdb_votes\` (integer): Recuento de votos en IMDb.
- \`avg_rating\` (number | null): Promedio estadístico consolidado.
- \`justwatch\` (string | null): Enlace a ficha de disponibilidad VOD en JustWatch.
- \`wikipedia\` (string | null): Enlace a artículo enciclopédico de referencia.

---

## 6. Políticas de Indexación y Buenas Prácticas para Agentes

- **Acceso Público**: Todo el catálogo es público, libre y navegable sin barreras de registro.
- **Descubrimiento Estructurado**: Consulta el índice general de sitemaps en \`https://videoclub.digital/sitemap-index.xml\`.
- **Cabecera HTTP Link**: Todas las respuestas HTML inyectan la cabecera:
  \`Link: </llms.txt>; rel="alternate"; type="text/markdown"\`
- **Content-Signal**: De acuerdo con las directivas en \`/robots.txt\`, se concede autorización para operaciones de búsqueda, indexación y respuesta de agentes (\`search=yes, ai-train=no, ai-input=yes\`).
`;

  fs.writeFileSync(path.join(publicDir, "llms.txt"), llmsTxtContent, "utf-8");
  fs.writeFileSync(path.join(publicDir, "llms-full.txt"), llmsFullTxtContent, "utf-8");

  console.log("¡Archivos public/llms.txt y public/llms-full.txt generados con éxito!");
  console.log(`- Géneros oficiales incluidos: ${OFFICIAL_GENRES.length}/21`);
  console.log(`- Estudios incluidos: ${STUDIO_SLUGS.size}/15`);
  console.log(`- Selecciones incluidas: ${SELECTION_SLUGS.size}/10`);
}

main().catch((err) => {
  console.error("Error al generar llms.txt:", err);
  process.exit(1);
});
