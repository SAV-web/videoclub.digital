# Usar una imagen base de Node.js
FROM node:20-slim

# Establecer el directorio de trabajo
WORKDIR /usr/src/app

# Copiar el package.json y package-lock.json (si existe)
COPY package*.json ./

# Instalar las dependencias de la aplicación
RUN npm install

# Copiar el resto de los archivos de la aplicación
COPY . .

# Exponer el puerto en el que la aplicación se ejecutará
EXPOSE 8080

# Comando para iniciar la aplicación
CMD ["npm", "start"]
