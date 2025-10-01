// Importamos el framework Express que declaramos en package.json
const express = require('express');
const path = require('path');

// Creamos una instancia de la aplicación Express
const app = express();

// Definimos el puerto en el que escuchará nuestro servidor.
// Usará el puerto que defina el entorno (ej. en un servicio de hosting) o el 8080 por defecto.
const port = process.env.PORT || 8080;

// Servir archivos estáticos desde el directorio raíz del proyecto
// Le decimos a Express que sirva todos los ficheros que están en el directorio actual.
// Cuando alguien pida la ruta "/", Express buscará y enviará automáticamente "index.html".
app.use(express.static(path.join(__dirname, '')));

// Ruta principal que sirve el index.html
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// Iniciamos el servidor y le decimos que escuche peticiones en el puerto definido.
app.listen(port, () => {
  console.log(`Servidor escuchando en el puerto ${port}`);
});
