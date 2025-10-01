# --- FASE 1: Definir el entorno base ---
# Empezamos desde una imagen oficial de Node.js (versión 18, ligera).
FROM node:20-slim

# Establecemos el directorio de trabajo dentro del contenedor.
WORKDIR /usr/src/app

# --- FASE 2: Instalar dependencias ---
# Copiamos solo el package.json para aprovechar la caché de Docker.
# Si este fichero no cambia, Docker no volverá a instalar las dependencias.
COPY package*.json ./

# Ejecutamos el comando para instalar las dependencias de la aplicación
RUN npm install

# --- FASE 3: Copiar el código y ejecutar ---
# Copiamos el resto de los ficheros de nuestra aplicación (HTML, CSS, JS).
# Gracias al .dockerignore, no se copiarán los ficheros que no queremos.
COPY . .

# Exponer el puerto en el que la aplicación se ejecutará
EXPOSE 8080

# Definimos el comando que se ejecutará cuando el contenedor se inicie.
# Esto es equivalente a ejecutar "npm start" en la terminal.
CMD ["npm", "start"]
