#!/usr/bin/env node

/**
 * =================================================================
 *   DATAOPS RUNNER: VIDEOCLUB.DIGITAL CATALOG DATA QUALITY GATE
 * =================================================================
 * 
 * Invoca la suite declarativa nativa de PostgreSQL `public.run_data_tests()`
 * mediante Supabase PostgREST RPC, evaluando la integridad referencial y de
 * negocio del catálogo cinematográfico.
 * 
 * Modos de ejecución:
 * - Local / Default: Si no hay credenciales SUPABASE_SERVICE_ROLE_KEY,
 *   emite aviso y sale con código 0 para no bloquear entornos sin secretos.
 * - Estricto (--strict): Si faltan credenciales o cualquier test de datos
 *   devuelve status === 'FAIL', aborta inmediatamente con código 1.
 */

import { createClient } from "@supabase/supabase-js";

const isStrict = process.argv.includes("--strict");

const supabaseUrl =
  process.env.SUPABASE_URL ||
  process.env.VITE_SUPABASE_URL ||
  "https://wibygecgfczcvaqewleq.supabase.co";

const serviceRoleKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.SUPABASE_KEY;

console.log("\n🛡️  --- DataOps: Verificación de Contratos de Calidad de Datos ---");
console.log(`🔗 Supabase URL: ${supabaseUrl}`);

if (!serviceRoleKey) {
  const msg =
    "⚠️  SUPABASE_SERVICE_ROLE_KEY no está configurada en el entorno.\n" +
    "    La función 'run_data_tests()' requiere permisos de service_role.\n" +
    "    Configura el secreto en GitHub Secrets (o en tu archivo .env local) para habilitar la auditoría.";

  if (isStrict) {
    console.error(`\n❌ ERROR: Modo estricto activo (--strict).\n${msg}\n`);
    process.exit(1);
  } else {
    console.warn(`\n${msg}\n⏩ Omitiendo auditoría de datos en modo permisivo.\n`);
    process.exit(0);
  }
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false },
});

try {
  console.log("⏳ Ejecutando public.run_data_tests(p_fail_fast => false)...");
  const { data, error } = await supabase.rpc("run_data_tests", {
    p_fail_fast: false,
  });

  if (error) {
    console.error("\n❌ Error al ejecutar run_data_tests() en PostgreSQL:");
    console.error(`   Código: ${error.code || "N/A"}`);
    console.error(`   Mensaje: ${error.message}`);
    if (error.hint) console.error(`   Pista: ${error.hint}`);
    process.exit(1);
  }

  if (!Array.isArray(data) || data.length === 0) {
    console.warn("\n⚠️  run_data_tests() no devolvió registros de aserción.");
    process.exit(0);
  }

  const failedTests = data.filter(
    (row) => row.status !== "PASS" || Number(row.failed_records) > 0
  );

  console.log("\n📊 Informe de Calidad de Datos:");
  console.log("--------------------------------------------------------------------------------");
  for (const row of data) {
    const isPass = row.status === "PASS" && Number(row.failed_records) === 0;
    const badge = isPass ? "✔ PASS" : "❌ FAIL";
    console.log(
      `  [${badge}] ${row.test_name.padEnd(35)} | Cat: ${row.category.padEnd(15)} | Fallos: ${String(row.failed_records).padStart(3)}`
    );
  }
  console.log("--------------------------------------------------------------------------------");

  if (failedTests.length > 0) {
    console.error(`\n🚨 CALIDAD DE DATOS COMPROMETIDA: ${failedTests.length} prueba(s) fallida(s).\n`);
    for (const failure of failedTests) {
      console.error(`❌ Test: ${failure.test_name} (${failure.category})`);
      console.error(`   Severidad: ${failure.severity}`);
      console.error(`   Registros infractores: ${failure.failed_records}`);
      if (failure.sample_query) {
        console.error(`   Query de depuración:`);
        console.error(`   ${failure.sample_query.trim()}\n`);
      }
    }
    process.exit(1);
  }

  console.log(`\n✅ Catálogo de datos 100% íntegro: ${data.length}/${data.length} aserciones superadas (PASS).\n`);
  process.exit(0);
} catch (err) {
  console.error("\n💥 Error inesperado durante la ejecución del runner DataOps:", err);
  process.exit(1);
}
