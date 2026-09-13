# Guía de Configuración: Cloudflare delante de GitHub Pages para VIDEOCLUB.DIGITAL

Esta guía documenta la puesta en marcha de **Cloudflare (Plan Gratuito)** como capa perimetral (Edge) delante de **GitHub Pages**, resolviendo tres retos arquitectónicos clave:

1. **Cache-Control Inmutable (`immutable`)**: Caché de 1 año para los bundles de Vite versionados con hash (`/assets/*`).
2. **Protección de Cuota de Supabase Storage (Egress Cero)**: Caché perimetral permanente de pósters (`/posters/*`) y fotos VIP (`/vips/*`).
3. **Compatibilidad con Agentes de IA (`IsItAgentReady`)**:
   - Inyección de cabecera HTTP `Link: </llms.txt>; rel="alternate"; type="text/markdown"`.
   - Negociación de contenido automática ante peticiones con `Accept: text/markdown`.
4. **Edge SSR para SEO de Alto Rendimiento**:
   - Fichas canónicas de títulos (`/titulo/:slug/`) con Schema.org Movie/TVSeries, BreadcrumbList y normalización 301 case-insensitive.
   - Fichas VIP en la raíz (`/:vip-slug/`) para directores y actores con foto oficial, biografía y filmografía destacada (descarte $O(1)$ sin consultar Supabase para slugs ordinarios).
   - Taxonomías cerradas (`/genero/:slug/`, `/pais/:slug/`, `/estudio/:slug/`, `/seleccion/:slug/`) con muros de 42 tarjetas oficiales.
   - Reverso canónico de tarjeta idéntico a la SPA (enlace a ficha en el título original, sinopsis fluida y botón `+`).
5. **Coherencia de Modo Claro / Oscuro**:
   - Script anti-flicker síncrono en `<head>` (0 ms) con persistencia dual (`localStorage` + cookie `theme=...`).
   - Botón interactivo `#theme-toggle` en todas las cabeceras perimetrales.
6. **CSS Perimetral en Memoria (`/seo-card-v7.css`)**:
   - Servido desde la memoria perimetral del Worker sin peticiones de red adicionales ni latencia de origen.

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

### Opción A: Mediante Wrangler CLI (Recomendado)
El proyecto incluye [wrangler.toml](file:///c:/Users/sigfr/Desktop/AI/VIDEOCLUB.DIGITAL/wrangler.toml) preconfigurado. Para desplegar directamente:
```bash
npx wrangler login   # Solo la primera vez si no has iniciado sesión
npx wrangler deploy  # Empaqueta y despliega el Worker automáticamente
```

### Opción B: Desde el Panel Web de Cloudflare (Sin CLI)
Dado que el worker modular utiliza submódulos (`./seo/render-movie.js`), hemos preparado un comando para generar un archivo único consolidado:
1. Ejecuta:
   ```bash
   npm run build:worker
   ```
2. Abre el archivo generado: [`cloudflare/dist/worker.bundle.js`](file:///c:/Users/sigfr/Desktop/AI/VIDEOCLUB.DIGITAL/cloudflare/dist/worker.bundle.js).
3. En el panel de Cloudflare, ve a **Workers & Pages** $\rightarrow$ tu Worker (`videoclub-edge-optimizer`) $\rightarrow$ **Edit code / Quick Edit**.
4. Pega todo el contenido de `worker.bundle.js` reemplazando lo anterior.
5. Haz clic en **Save and Deploy**.
6. Asegúrate de que la ruta en **Settings $\rightarrow$ Domains & Routes** siga asignada a `videoclub.digital/*`.

### 2.1 Modelo de Configuración Perimetral (ENVIRONMENT)

El Worker adopta el principio de configuración desacoplada basado en el entorno de ejecución:
```
ENVIRONMENT (env)
   ↓
SUPABASE_URL
SUPABASE_ANON_KEY
SUPABASE_STORAGE_URL (deducida automáticamente si no se provee)
PURGE_SECRET
```

- **Variables de Entorno Públicas (`[vars]` en `wrangler.toml`)**:
  - `SUPABASE_URL`: URL del proyecto Supabase (ej. `https://wibygecgfczcvaqewleq.supabase.co`).
  - `SUPABASE_ANON_KEY`: Clave pública para consultas REST y RPC.
  - `SUPABASE_STORAGE_URL`: Opcional; si no se especifica en el entorno, se deduce de forma determinista a partir de `${SUPABASE_URL}/storage/v1/object/public`.

- **Secreto de Purga (`PURGE_SECRET`)**:
  El endpoint perimetral de invalidación selectiva (`POST /internal/purge`) requiere la variable secreta `PURGE_SECRET`.
  Por diseño de seguridad estricto, es **fail-closed**: no existe ningún valor por defecto (*fallback*) en el código. Si no está configurado en el entorno de Cloudflare, el endpoint devuelve inmediatamente `500 Server misconfigured`.

  - **Configuración mediante Wrangler CLI**:
    ```bash
    npx wrangler secret put PURGE_SECRET
    # Introduce tu clave secreta cuando lo solicite el terminal
    ```
  - **Configuración mediante Dashboard de Cloudflare**:
    En **Workers & Pages** $\rightarrow$ tu Worker $\rightarrow$ **Settings** $\rightarrow$ **Variables and Secrets**, añade un secreto cifrado con nombre `PURGE_SECRET` y el valor privado elegido.

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

---

## 4. Pruebas de Humo Automatizadas (*Smoke Tests* en CI)

La lógica del worker cuenta con una batería de pruebas de regresión en [`tests/worker.test.mjs`](file:///c:/Users/sigfr/Desktop/AI/VIDEOCLUB.DIGITAL/tests/worker.test.mjs) que se ejecutan localmente y en GitHub Actions sin necesidad de desplegar:

```bash
# Ejecutar smoke tests del worker:
node --test tests/worker.test.mjs

# O dentro de la suite global del proyecto:
npm test
```

Esta suite valida de forma determinista:
1. Reescritura correcta de `/posters/*` y `/vips/*` hacia Supabase Storage e inyección de `Cache-Control: public, max-age=31536000, immutable`.
2. Supresión de cabeceras inmutables si Supabase devuelve `404 Not Found`.
3. Negociación de `text/markdown` en la raíz entregando `/llms.txt`.
4. Garantía de no interferencia con rutas internas ni recursos SPA.
5. Generación perimetral de fichas de títulos, muros de taxonomía y páginas VIP en la raíz con metadatos JSON-LD.
6. Normalización mediante redirección `301` para URLs con mayúsculas y sin barra final.
7. Representación canónica de episodios de series con `"x"` (ej. `"5 x"`).
8. Descarte en tiempo constante $O(1)$ de rutas directas a la SPA sin penalización de consulta a base de datos.
9. Purga perimetral selectiva (`POST /internal/purge`) para invalidación granular de caché.
10. Cumplimiento estricto del formato canónico de slugs VIP en minúsculas.

---

## 5. Filosofía Arquitectónica: Manifiesto VIP vs Fuente Editorial (SSOT)

- **Propósito Exclusivo de `VIP_SLUGS`**: El manifiesto (`cloudflare/seo/vip-manifest.js`) es un índice en memoria (`Set<string>`) concebido únicamente como filtro de enrutamiento para descarte perimetral en tiempo constante $O(1)$. Decide exclusivamente si el Worker debe intentar resolver una ruta raíz (`/:slug/`) como ficha SEO VIP o si debe delegar de inmediato a la SPA sin penalizar con consultas a la base de datos.
- **Fuente de Verdad Editorial (Supabase)**: Los datos editoriales de la persona (nombre, biografía, foto oficial, fechas de nacimiento/defunción, rol principal y cruzado, lugar de nacimiento y filmografía en cuadrícula) **siempre proceden de Supabase** (`public.people` donde `vip = 1`). El manifiesto no sustituye ni almacena datos de la base de datos.
- **Restricción de Diseño**: Queda expresamente prohibido incorporar fichas o datos editoriales dentro del manifiesto. Esto garantiza un bundle perimetral ultraligero (< 250 KB) y asegura la frescura inmediata de los contenidos editoriales ante cualquier actualización en la base de datos.
