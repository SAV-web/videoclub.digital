import http from "http";
import { resolveTaxonomy } from "../cloudflare/seo/taxonomy-types.js";
import { renderTaxonomyHtml } from "../cloudflare/seo/render-taxonomy.js";
import { SEO_CARD_CSS } from "../cloudflare/seo/seo-card-css.js";

const sampleMovie = {
  id: 603,
  slug: "matrix-1999",
  title: "Matrix",
  original_title: "The Matrix",
  year: 1999,
  country: "EEUU",
  genres: "Ciencia Ficción, Acción",
  directors: "Lana Wachowski, Lilly Wachowski",
  actors: "Keanu Reeves, Laurence Fishburne, Carrie-Anne Moss, Hugo Weaving, Joe Pantoliano",
  synopsis: "Thomas Anderson es un programador informático de día y un hacker llamado Neo de noche. Su vida cambia por completo cuando conoce a Morfeo y Trinity.",
  fa_rating: 7.9,
  fa_votes: 168430,
  imdb_rating: 8.7,
  imdb_votes: 1950000,
  avg_rating: 8.3,
  type: "movie",
  justwatch: "https://www.justwatch.com/es/pelicula/matrix",
  wikipedia: "https://es.wikipedia.org/wiki/The_Matrix"
};

const taxInfo = resolveTaxonomy("sci-fi");
let html = renderTaxonomyHtml(taxInfo, [sampleMovie], {
  siteOrigin: "http://localhost:4455",
  baseUrl: "/",
  storageUrl: "https://wibygecgfczcvaqewleq.supabase.co/storage/v1/object/public"
});

const server = http.createServer((req, res) => {
  if (req.url.startsWith("/seo-card") && req.url.endsWith(".css")) {
    res.writeHead(200, { "Content-Type": "text/css" });
    res.end(SEO_CARD_CSS);
    return;
  }
  res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
  res.end(html);
});

server.listen(4455, () => {
  console.log("SERVER_RUNNING_4455");
});
