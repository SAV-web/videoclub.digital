const fs = require('fs');
const path = require('path');

require('dotenv').config();

console.log('Iniciando el proceso de build...');

const configTemplatePath = path.join(__dirname, 'src', 'js', 'config.template.js');
const configOutputPath = path.join(__dirname, 'src', 'js', 'config.js');

fs.readFile(configTemplatePath, 'utf8', (err, data) => {
    if (err) {
        return console.error('Error al leer la plantilla config.template.js:', err);
    }

    console.log('Plantilla leída correctamente.');

    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseAnonKey) {
        return console.error('Error: Las variables SUPABASE_URL y SUPABASE_ANON_KEY deben estar definidas en el fichero .env');
    }

    let result = data.replace('%%SUPABASE_URL%%', supabaseUrl);
    result = result.replace('%%SUPABASE_ANON_KEY%%', supabaseAnonKey);

    console.log('Placeholders reemplazados.');

    fs.writeFile(configOutputPath, result, 'utf8', (err) => {
        if (err) {
            return console.error('Error al escribir el fichero config.js:', err);
        }
        console.log('Éxito: El fichero src/js/config.js ha sido generado correctamente.');
    });
});