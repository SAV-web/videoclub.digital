const fs = require('fs');
const path = require('path');

require('dotenv').config();

console.log('Iniciando el proceso de build...');

const configTemplatePath = path.join(__dirname, 'src', 'js', 'config.template.js');
const configOutputPath = path.join(__dirname, 'src', 'js', 'config.js');

try {
    console.log('Leyendo plantilla de configuración...');
    const data = fs.readFileSync(configTemplatePath, 'utf8');
    console.log('Plantilla leída correctamente.');

    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseAnonKey) {
        throw new Error('Error: Las variables SUPABASE_URL y SUPABASE_ANON_KEY deben estar definidas.');
    }

    let result = data.replace('%%SUPABASE_URL%%', supabaseUrl);
    result = result.replace('%%SUPABASE_ANON_KEY%%', supabaseAnonKey);

    console.log('Placeholders reemplazados.');

    console.log('--- BEGIN GENERATED CONFIG.JS ---');
    console.log(result);
    console.log('--- END GENERATED CONFIG.JS ---');

    fs.writeFileSync(configOutputPath, result, 'utf8');
    console.log('Éxito: El fichero src/js/config.js ha sido generado correctamente.');

} catch (err) {
    console.error('Ha ocurrido un error durante el proceso de build:', err);
    process.exit(1); // Termina el proceso con un código de error
}