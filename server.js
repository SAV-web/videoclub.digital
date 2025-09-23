const express = require('express');
const path = require('path');

const app = express();
const port = process.env.PORT || 8080;

// Servir archivos estáticos desde el directorio raíz del proyecto
app.use(express.static(path.join(__dirname, '')));

// Ruta principal que sirve el index.html
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(port, () => {
  console.log(`Servidor escuchando en el puerto ${port}`);
});
