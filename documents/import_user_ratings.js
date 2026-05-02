import fs from 'fs';
import { createClient } from '@supabase/supabase-js';

// ============================================================================
// SCRIPT ETL: IMPORTACIÓN DE NOTAS DE USUARIO DESDE EXCEL (TXT)
// Ejecución: node --env-file=.env documents/import_user_ratings.js
// ============================================================================

const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error("Faltan variables de entorno (VITE_SUPABASE_URL o SUPABASE_SERVICE_KEY).");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// ==========================================
// CONFIGURACIÓN DEL USUARIO Y MAPEO
// ==========================================

// 1️⃣ SUSTITUYE ESTO POR TU ID DE USUARIO DE SUPABASE (Authentication > Users)
const USER_ID = 'e6ce7689-432b-4f74-b656-ead1ac862afb'; 

const TXT_PATH = './documents/mis_notas.txt';

// 2️⃣ MAPEO DE NOTAS
// La base de datos guarda del 1 al 10. Ajusta esto según cómo funcione tu escala visual.
const RATING_MAP = {
  "0": 2,   // Suspenso (2)
  "1": 5,   // 1 Estrella (5)
  "2": 7,   // 2 Estrellas (7)
  "3": 10   // 3 Estrellas (10)
};

async function main() {
  if (!fs.existsSync(TXT_PATH)) {
    console.error(`❌ No se encontró el archivo: ${TXT_PATH}`);
    return;
  }

  const fileContent = fs.readFileSync(TXT_PATH, 'utf-8');
  const lines = fileContent.split('\n').filter(l => l.trim());

  console.log(`Leídas ${lines.length} líneas. Empezando importación...\n`);

  for (const line of lines) {
    // Al copiar de Excel, las columnas se separan por tabulación (\t)
    const parts = line.split('\t');
    if (parts.length < 2) continue;

    const imdbId = parts[0].trim();
    const note = parts[1].trim();
    const dbRating = RATING_MAP[note];

    if (!dbRating) {
      console.log(`⚠️ Nota inválida ignorada (${note}) para IMDb ID: ${imdbId}`);
      continue;
    }

    // Buscar película en BD por el imdb_id
    const { data: movies, error: searchError } = await supabase.from('movies').select('id, title').eq('imdb_id', imdbId).limit(1);

    if (searchError || !movies || movies.length === 0) {
      console.log(`❌ No encontrada en BD: ${imdbId}`);
      continue;
    }

    const movieId = movies[0].id;

    // Insertar o actualizar la nota
    const { error: upsertError } = await supabase.from('user_movie_entries').upsert({ user_id: USER_ID, movie_id: movieId, rating: dbRating, updated_at: new Date().toISOString() }, { onConflict: 'user_id,movie_id' });

    if (upsertError) console.log(`❌ Error al guardar "${movies[0].title}":`, upsertError.message);
    else console.log(`✅ Guardada: "${movies[0].title}" -> Nota original: ${note} (DB: ${dbRating})`);
  }
  console.log("\n🎉 Proceso finalizado.");
}
main();