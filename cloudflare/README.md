# Guía de Configuración: Cloudflare como Origen Completo para VIDEOCLUB.DIGITAL

Esta guía documenta la puesta en marcha de **Cloudflare** como origen de producción autónomo (Edge + Workers Static Assets) eliminando la dependencia de **GitHub Pages**, resolviendo los retos arquitectónicos clave:

1. **Origen Autónomo en el Edge**: Static Assets y SPA servidos directamente desde el Edge de Cloudflare con latencia cero a orígenes externos.
2. **Cache-Control Inmutable (`immutable`)**: Caché de 1 año para los bundles de Vite versionados con hash (`/assets/*`).
3. **Protección de Cuota de Supabase Storage (Egress Cero)**: Caché perimetral permanente de pósters (`/posters/*`) y fotos VIP (`/vips/*`).
4. **Compatibilidad con Agentes de IA (`IsItAgentReady`)**:
   - Inyección de cabecera HTTP `Link: </llms.txt>; rel="alternate"; type="text/markdown"`.
   - Negociación de contenido automática ante peticiones con `Accept: text/markdown`.
5. **Edge SSR para SEO de Alto Rendimiento**:
   - Fichas canónicas de títulos (`/titulo/:slug/`) con Schema.org Movie/TVSeries, BreadcrumbList y normalización 301 case-insensitive.
   - Fichas VIP en la raíz (`/:vip-slug/`) para directores y actores con foto oficial, biografía y filmografía destacada (descarte $O(1)$ sin consultar Supabase para slugs ordinarios).
   - Taxonomías cerradas (`/genero/:slug/`, `/pais/:slug/`, `/estudio/:slug/`, `/seleccion/:slug/`) con muros de 42 tarjetas oficiales.
   - Reverso canónico de tarjeta idéntico a la SPA (enlace a ficha en el título original, sinopsis fluida y botón `+`).
6. **Coherencia de Modo Claro / Oscuro**:
   - Script anti-flicker síncrono en `<head>` (0 ms) con persistencia dual (`localStorage` + cookie `theme=...`).
   - Botón interactivo `#theme-toggle` en todas las cabeceras perimetrales.
7. **CSS Perimetral en Memoria (`/seo-card-v7.css`)**:
   - Servido desde la memoria perimetral del Worker sin peticiones de red adicionales ni latencia de origen.

---

## 1. Configuración de DNS en Cloudflare

Al operar Cloudflare como origen autónomo (sin servidor externo ni GitHub Pages):
1. En el panel de **Cloudflare DNS**, el dominio `videoclub.digital` requiere un registro proxied para que Cloudflare enrute el tráfico a través del Worker y sus Static Assets:
   - **Tipo**: `AAAA`
   - **Nombre**: `@` (o `videoclub.digital`)
   - **Destino**: `100::` *(dirección RFC 6666 / Cloudflare Dummy Origin estándar para zonas 100% Workers)*
   - **Estado de Proxy**: ☁️ **Nube Naranja (Proxied)**.
   *(Nota: Durante la fase transitoria de prueba, el registro CNAME previo hacia GitHub Pages con nube naranja sigue funcionando idénticamente, ya que el Worker intercepta todo el tráfico antes de cualquier resolución de origen).*
2. En la sección **SSL/TLS**:
   - Configura el modo de cifrado en **Full (Estricto)** o **Full**.

---

## 2. Despliegue del Cloudflare Worker

El script [`cloudflare/worker.js`](worker.js) unifica toda la lógica de edge en un único punto.

### 2.0 Enrutamiento Perimetral Prioritario (`run_worker_first = true`)
En `wrangler.toml`, la sección `[assets]` declara:
```toml
[assets]
directory = "./dist"
binding = "ASSETS"
not_found_handling = "single-page-application"
run_worker_first = true
```
**Importancia crítica**: Por defecto, Cloudflare Workers con Static Assets evalúa los archivos estáticos y el fallback de SPA (`index.html`) antes que el código del Worker. Con `run_worker_first = true`, el Worker toma el control prioritario de todas las peticiones entrantes:
1. Intercepta y renderiza las rutas SEO en el Edge (`/titulo/:slug/`, `/:vip-slug/`, taxonomías).
2. Reescribe y cachea imágenes (`/posters/*`, `/vips/*`) hacia Supabase Storage.
3. Gestiona cabeceras `immutable` y negociación Markdown (`/llms.txt`).
4. Delega a `env.ASSETS.fetch(request)` **únicamente** cuando se trata de assets estáticos reales o rutas reservadas de la SPA.

### Opción A: Mediante Wrangler CLI (Recomendado)
El proyecto incluye [`wrangler.toml`](../wrangler.toml) preconfigurado. Para desplegar directamente:
```bash
npx wrangler login     # Solo la primera vez si no has iniciado sesión
npm run deploy:worker  # Ejecuta prepare:worker (regenera VIP manifest y CSS) y despliega con Wrangler
```

### Opción B: Desde el Panel Web de Cloudflare (Sin CLI)
Dado que el worker modular utiliza submódulos (`./seo/render-movie.js`), disponemos de un comando para generar un bundle único consolidado:
1. Ejecuta:
   ```bash
   npm run build:worker # Ejecuta prepare:worker y empaqueta en cloudflare/dist/worker.bundle.js
   ```
2. Abre el archivo generado: [`cloudflare/dist/worker.bundle.js`](dist/worker.bundle.js).
3. En el panel de Cloudflare, ve a **Workers & Pages** $\rightarrow$ tu Worker (`videoclub-edge-optimizer`) $\rightarrow$ **Edit code / Quick Edit**.
4. Pega todo el contenido de `worker.bundle.js` reemplazando lo anterior.
5. Haz clic en **Save and Deploy**.
6. Asegúrate de que la ruta en **Settings $\rightarrow$ Domains & Routes** siga asignada a `videoclub.digital/*`.

### 2.1 Modelo de Configuración Perimetral (ENVIRONMENT)

El Worker adopta el principio de configuración desacoplada y estricta (**fail-closed**) basado en el objeto de entorno `env`:
```
ENVIRONMENT (env)
   ↓
SUPABASE_URL
SUPABASE_ANON_KEY
SUPABASE_STORAGE_URL (deducida automáticamente si no se provee)
PURGE_SECRET
```

- **Variables de Entorno Inyectadas (CI/CD `--var` o Dashboard)**:
  - `SUPABASE_URL`: URL del proyecto Supabase (inyectada dinámicamente desde secretos de CI/CD o Cloudflare Dashboard).
  - `SUPABASE_ANON_KEY`: Clave pública (anon JWT) para consultas REST y RPC.
  - `SUPABASE_STORAGE_URL`: Opcional; deducida de forma determinista a partir de `${SUPABASE_URL}/storage/v1/object/public`.

- **Cero Credenciales Hardcodeadas y Fail-Closed**:
  El objeto transitorio de credenciales de respaldo (`TRANSITIONAL_CONFIG`) fue **completamente eliminado**. El código en `resolveEnvironment(env)` valida estrictamente la presencia de `SUPABASE_URL` y `SUPABASE_ANON_KEY`. Si alguna no está inyectada en `env`, cualquier petición SEO devuelve de forma inmediata e inequívoca un error `500 Server misconfigured (missing Supabase credentials)` con cabecera `Cache-Control: no-store`, evitando respuestas zombies o caídas silenciosas a la SPA.

- **Secreto de Purga (`PURGE_SECRET`)**:
  El endpoint perimetral de invalidación selectiva (`POST /internal/purge`) requiere la variable secreta `PURGE_SECRET`.
  Por diseño de seguridad estricto, es **fail-closed**: si no está configurado en el entorno de Cloudflare, el endpoint devuelve inmediatamente `500 Server misconfigured`.

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

La lógica del worker cuenta con una batería de **41 pruebas de regresión** en [`tests/worker.test.mjs`](../tests/worker.test.mjs) que se ejecutan localmente y en GitHub Actions sin necesidad de desplegar:

```bash
# Ejecutar smoke tests del worker:
node --test tests/worker.test.mjs

# O dentro de la suite global del proyecto:
npm test
```

Esta suite valida de forma determinista:
1. **Proxy Inmutable de Imágenes**: Reescritura correcta de `/posters/*` y `/vips/*` hacia Supabase Storage e inyección de `Cache-Control: public, max-age=31536000, immutable`.
2. **Resiliencia de Storage**: Supresión de cabeceras inmutables si Supabase devuelve `404 Not Found`.
3. **Negociación para LLMs**: Peticiones con `Accept: text/markdown` en la raíz entregan `/llms.txt` sin secuestrar rutas SPA ni páginas internas.
4. **Caché Inmutable de Bundles**: Cabecera `immutable` (1 año) en `/assets/*` y `/seo-card-v7.css`.
5. **Cabecera Link Alternativa**: Inyección de `Link: </llms.txt>; rel="alternate"` en todas las respuestas HTML.
6. **Integración con `env.ASSETS`**: Delegación a Static Assets cuando el binding está presente.
7. **Normalización Trailing Slash**: Redirección `301` en `/titulo/:slug` hacia `/titulo/:slug/`.
8. **Edge SSR de Títulos**: Generación de HTML con Schema.org Movie/TVSeries, Breadcrumbs y almacenamiento en Edge Cache.
9. **Contratos Explícitos HTTP en SEO**: `404` ante título inexistente, `502` ante fallo upstream de Supabase y `500` con `no-store` ante excepciones de red.
10. **Case-Insensitive SEO**: Normalización `301` de slugs en mayúsculas a minúsculas canónicas.
11. **Formato Canónico de Series**: Representación de episodios con `"x"` (ej. `"5 x"`).
12. **Composición Visual Perimetral**: Fondo sin desenfoque (`backdrop-filter: none`), enlaces del header accesibles por encima del overlay y banderas enlazando a `/pais/:slug/`.
13. **Purga Selectiva Perimetral**: Validación de `PURGE_SECRET` e invalidación granular de claves en caché (`POST /internal/purge`).
14. **Sitemaps Canónicos**: Generación de `/sitemap-index.xml` y `/sitemap.xml`.
15. **Taxonomías Perimetrales**: Respuestas `200 OK` para `/genero/*`, `/pais/*`, `/estudio/*` y `/seleccion/*` con muros de 42 tarjetas.
16. **CSS Perimetral en Memoria**: Entrega de `/seo-card-v7.css` compilado en memoria sin latencia de origen.
17. **Fichas VIP en la Raíz**: Respuestas `200 OK` con Schema Person, foto oficial y filmografía destacada.
18. **Personas VIP con Rol Dual**: Soporte para insignias interactivas `(D)` / `(A)` y alternancia fluida de filmografía.
19. **Aislamiento SPA**: Rutas reservadas (`/actor/*`, `/director/*`) entregan la SPA sin desvíos indebidos al SEO.
20. **Descarte Instantáneo $O(1)$**: Slugs en la raíz que no están en el manifiesto VIP delegan inmediatamente a la SPA sin penalizar Supabase.
21. **Botones e Interacciones**: Comportamiento canónico de botones circulares `+` / `−` y repliegue de panel superpuesto.
22. **Limpieza de Query Strings**: Redirección `301` limpiando parámetros de búsqueda accidentales en rutas SEO.
23. **Seguridad y Jerarquía `env`**: Inyección dinámica de variables de entorno y validación **fail-closed** (`500` controlado si faltan credenciales).
24. **Imágenes LQIP (ThumbHash)**: Proyección optimizada de ThumbHash para placeholder instantáneo en películas, VIPs y taxonomías.

---

## 5. Filosofía Arquitectónica: Manifiesto VIP vs Fuente Editorial (SSOT)

- **Propósito Exclusivo de `VIP_SLUGS`**: El manifiesto (`cloudflare/seo/vip-manifest.js`) es un índice en memoria (`Set<string>`) concebido únicamente como filtro de enrutamiento para descarte perimetral en tiempo constante $O(1)$. Decide exclusivamente si el Worker debe intentar resolver una ruta raíz (`/:slug/`) como ficha SEO VIP o si debe delegar de inmediato a la SPA sin penalizar con consultas a la base de datos.
- **Fuente de Verdad Editorial (Supabase)**: Los datos editoriales de la persona (nombre, biografía, foto oficial, fechas de nacimiento/defunción, rol principal y cruzado, lugar de nacimiento y filmografía en cuadrícula) **siempre proceden de Supabase** (`public.people` donde `vip = 1`). El manifiesto no sustituye ni almacena datos de la base de datos.
- **Restricción de Diseño**: Queda expresamente prohibido incorporar fichas o datos editoriales dentro del manifiesto. Esto garantiza un bundle perimetral ultraligero (< 250 KB) y asegura la frescura inmediata de los contenidos editoriales ante cualquier actualización en la base de datos.
