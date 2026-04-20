import { createClient } from '@supabase/supabase-js';

// ============================================================================
// SCRIPT ETL: ENRIQUECIMIENTO DE ACTORES Y DIRECTORES VIA TMDB
// Ejecución: node --env-file=.env scripts/update_tmdb_people.js
// ============================================================================

const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY; // Usar SERVICE_ROLE para saltar RLS
const TMDB_API_KEY = process.env.TMDB_API_KEY; // ¡Añadir al .env!

if (!SUPABASE_URL || !SUPABASE_KEY || !TMDB_API_KEY) {
  console.error("Faltan variables de entorno (VITE_SUPABASE_URL, SUPABASE_SERVICE_KEY o TMDB_API_KEY).");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
const DELAY_MS = 250; // TMDB permite ~40 peticiones por segundo (somos conservadores)
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Busca a la persona en TMDB por nombre y obtiene sus detalles
 */
async function fetchPersonDetailsFromTMDB(name) {
  try {
    // 1. Buscar el ID de la persona
    const searchUrl = `https://api.themoviedb.org/3/search/person?query=${encodeURIComponent(name)}&language=es-ES&api_key=${TMDB_API_KEY}`;
    const searchRes = await fetch(searchUrl);
    const searchData = await searchRes.json();

    if (!searchData.results || searchData.results.length === 0) {
      return null; // No encontrado
    }

    const personId = searchData.results[0].id;

    // 2. Obtener los detalles completos (fechas, lugar) usando el ID
    const detailsUrl = `https://api.themoviedb.org/3/person/${personId}?language=es-ES&api_key=${TMDB_API_KEY}`;
    const detailsRes = await fetch(detailsUrl);
    const detailsData = await detailsRes.json();

    return {
      profile_path: detailsData.profile_path,
      birthday: detailsData.birthday || null,
      deathday: detailsData.deathday || null,
      place_of_birth: detailsData.place_of_birth || null,
    };
  } catch (error) {
    console.error(`Error consultando TMDB para ${name}:`, error.message);
    return null;
  }
}

let countriesMap = new Map();

/**
 * Normaliza texto eliminando acentos y mayúsculas para emparejar con la BD
 */
function normalizeText(text) {
  if (!text) return "";
  return text.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
}

/**
 * Carga todos los países de la base de datos en memoria
 */
async function loadCountries() {
  const { data, error } = await supabase.from('countries').select('id, name_norm');
  if (error) {
    console.error("Error cargando países:", error);
    return;
  }
  data.forEach(c => countriesMap.set(c.name_norm, c.id));
  console.log(`Cargados ${countriesMap.size} países en memoria para emparejamiento.`);
}

/**
 * Procesa una tabla (actors o directors)
 */
async function processTable(tableName, vipNames = null) {
  console.log(`\n--- Iniciando procesamiento de la tabla: ${tableName} ---`);
  
  let peopleToProcess = [];

  if (vipNames) {
    // Modo VIP: Extraer lista exacta, ignorando filtros para forzar actualización
    const { data, error } = await supabase
      .from(tableName)
      .select('id, name')
      .in('name', vipNames);

    if (error) {
      console.error(`Error obteniendo VIPs en ${tableName}:`, error);
      return;
    }
    peopleToProcess = data;
  } else {
    // Modo normal (por conteo de películas y que no tengan profile_path)
    const viewName = tableName === 'actors' ? 'mv_actor_suggestions' : 'mv_director_suggestions';
    const minMovies = tableName === 'directors' ? 3 : 5;

    // 1. Obtener los IDs que superan el mínimo de películas usando las vistas materializadas
    const { data: topPeople, error: topError } = await supabase
      .from(viewName)
      .select('id')
      .gt('movie_count', minMovies);

    if (topError) {
      console.error(`Error obteniendo datos de ${viewName}:`, topError);
      return;
    }

    const topIds = topPeople.map(p => p.id);
    if (topIds.length === 0) {
      console.log(`No hay registros con más de ${minMovies} películas en ${tableName}.`);
      return;
    }

    // 2. Obtener registros filtrados que no han sido procesados aún (profile_path es null)
    const { data: people, error } = await supabase
      .from(tableName)
      .select('id, name')
      .in('id', topIds)
      .is('profile_path', null);

    if (error) {
      console.error(`Error obteniendo ${tableName}:`, error);
      return;
    }
    peopleToProcess = people;
  }

  console.log(`Encontrados ${peopleToProcess.length} registros a procesar en ${tableName}. Procesando...`);

  let count = 0;
  for (const person of peopleToProcess) {
    count++;
    const details = await fetchPersonDetailsFromTMDB(person.name);
    
    let country_id = null;
    if (details && details.place_of_birth) {
      // Extraemos la última parte tras la última coma (suele ser el país)
      const parts = details.place_of_birth.split(',');
      let countryStr = parts[parts.length - 1].trim();
      let normCountry = normalizeText(countryStr);

      // Alias comunes para las respuestas de TMDB en español
      const aliases = {
        'estados unidos': 'eeuu',
        'usa': 'eeuu',
        'ee uu': 'eeuu',
        'reino unido': 'uk',
        'inglaterra': 'uk',
        'escocia': 'uk',
        'gales': 'uk',
        'irlanda del norte': 'uk',
        'corea del sur': 'corea',
        'union sovietica': 'rusia'
      };
      
      if (aliases[normCountry]) normCountry = aliases[normCountry];

      country_id = countriesMap.get(normCountry) || null;
    }

    const updateData = details ? { ...details, country_id } : {
      profile_path: 'NOT_FOUND', // Marcador para no volver a buscarlo en el futuro
      birthday: null,
      deathday: null,
      place_of_birth: null,
      country_id: null
    };

    const { error: updateError } = await supabase
      .from(tableName)
      .update(updateData)
      .eq('id', person.id);

    if (updateError) {
      console.error(`[${count}/${peopleToProcess.length}] Error actualizando ${person.name}:`, updateError.message);
    } else {
      const status = details?.profile_path ? "✅ Encontrado" : "❌ No encontrado";
      console.log(`[${count}/${peopleToProcess.length}] ${status} -> ${person.name}`);
    }

    await sleep(DELAY_MS); // Respetar rate limits de TMDB
  }
  
  console.log(`--- Fin del lote para ${tableName} ---`);
}

async function main() {
  await loadCountries();

  const VIP_DIRECTORS = [
    "Mario Bava", "Ettore Scola", "Marco Bellocchio", "Mario Monicelli",
    "Francesco Rosi", "Nanni Moretti", "Sergio Corbucci", "Dino Risi",
    "Enzo Barboni", "Ferzan Ozpetek", "Matteo Garrone", "Ermanno Olmi",
    "Gillo Pontecorvo", "Marco Tullio Giordana", "Paolo Virzì", "Pietro Germi",
    "Alice Rohrwacher", "Enzo G. Castellari", "Franco Zeffirelli",
    "Gabriele Muccino", "Gabriele Salvatores", "Hermanos Taviani",
    "Marco Ferreri", "Michele Soavi", "Roberto Benigni"
  ];

  // Ejecutar forzando la actualización solo de esta lista de directores VIP
  await processTable('directors', VIP_DIRECTORS);
  
  console.log("\nProceso finalizado.");
}

main();