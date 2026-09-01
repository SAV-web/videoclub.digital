# Guía de Configuración: Cloudflare delante de GitHub Pages para VIDEOCLUB.DIGITAL

Esta guía documenta la puesta en marcha de **Cloudflare (Plan Gratuito)** como capa perimetral (Edge) delante de **GitHub Pages**, resolviendo tres retos arquitectónicos clave:

1. **Cache-Control Inmutable (`immutable`)**: Caché de 1 año para los bundles de Vite versionados con hash (`/assets/*`).
2. **Protección de Cuota de Supabase Storage (Egress Cero)**: Caché perimetral permanente de pósters (`/posters/*`) y fotos VIP (`/vips/*`).
3. **Compatibilidad con Agentes de IA (`IsItAgentReady`)**:
   - Inyección de cabecera HTTP `Link: </llms.txt>; rel="alternate"; type="text/markdown"`.
   - Negociación de contenido automática ante peticiones con `Accept: text/markdown`.

---

## 1. Configuración de DNS en Cloudflare

1. En el panel de **Cloudflare DNS**, añade o edita el registro CNAME para tu dominio:
   - **Tipo**: `CNAME`
   - **Nombre**: `@` (o `videoclub.digital`)
   - **Destino**: `<tu-usuario>.github.io`
   - **Estado de Proxy**: ☁️ **Nube Naranja (Proxied)**.
2. En la sección **SSL/TLS**:
   - Configura el modo de cifrado en **Full (Estricto)** o **Full**.

---

## 2. Despliegue del Cloudflare Worker

El script [cloudflare/worker.js](file:///c:/Users/sigfr/Desktop/AI/VIDEOCLUB.DIGITAL/cloudflare/worker.js) unifica toda la lógica de edge en un único punto.

### Opción A: Desde el Panel Web de Cloudflare (Sin instalar nada)
1. Ve a **Workers & Pages** $\rightarrow$ **Create Application** $\rightarrow$ **Create Worker**.
2. Asigna un nombre al Worker (ej. `videoclub-edge-optimizer`).
3. Pega el contenido de [`cloudflare/worker.js`](file:///c:/Users/sigfr/Desktop/AI/VIDEOCLUB.DIGITAL/cloudflare/worker.js).
4. Guarda y despliega (**Save and Deploy**).
5. Ve a **Settings** $\rightarrow$ **Domains & Routes** $\rightarrow$ **Add Route**:
   - **Route**: `videoclub.digital/*`
   - **Zone**: `videoclub.digital`

### Opción B: Mediante Wrangler CLI
```bash
npx wrangler deploy cloudflare/worker.js --name videoclub-edge-optimizer --route "videoclub.digital/*"
```

---

## 3. Verificación de Beneficios Técnicos

Una vez activo el proxy de Cloudflare, verifica mediante curl o DevTools:

### A. Assets con Caché Inmutable
```bash
curl -I https://videoclub.digital/assets/index-BwCqPT0a.css
# Debe devolver:
# Cache-Control: public, max-age=31536000, immutable
# cf-cache-status: HIT
```

### B. Inyección de Cabecera Link para Agentes
```bash
curl -I https://videoclub.digital/
# Debe devolver:
# Link: </llms.txt>; rel="alternate"; type="text/markdown"
# Cache-Control: public, max-age=0, must-revalidate
```

### C. Negociación de Contenido Markdown para LLMs
```bash
curl -H "Accept: text/markdown" https://videoclub.digital/
# Debe responder con el contenido de /llms.txt y:
# Content-Type: text/markdown; charset=utf-8
```

### D. Descarga y Caché de Pósters de Supabase
```bash
curl -I https://videoclub.digital/posters/el-padrino.webp
# Primera petición: cf-cache-status: MISS (descarga de Supabase)
# Segunda petición: cf-cache-status: HIT (servido gratis desde la red perimetral de Cloudflare)
```
