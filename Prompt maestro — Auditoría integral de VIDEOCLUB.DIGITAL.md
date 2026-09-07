# AUDITORÍA INTEGRAL Y FORENSE DEL REPOSITORIO — VIDEOCLUB.DIGITAL

## 0. ROL

Actúa como un **arquitecto de software senior, ingeniero frontend/backend, especialista en rendimiento web, seguridad, UX/UI, SEO, accesibilidad, DevOps y arquitectura de aplicaciones modernas**.

Tu misión es realizar una **auditoría integral, exhaustiva y forense del repositorio VIDEOCLUB.DIGITAL**, analizando el proyecto tal y como existe actualmente.

No debes limitarte a detectar errores evidentes.

Debes identificar también:

- problemas arquitectónicos;
- deuda técnica;
- complejidad innecesaria;
- código duplicado;
- código muerto;
- dependencias innecesarias;
- incoherencias entre archivos;
- decisiones que funcionen actualmente pero sean frágiles;
- cuellos de botella futuros;
- problemas de rendimiento;
- riesgos de seguridad;
- problemas de UX/UI;
- problemas SEO;
- problemas de accesibilidad;
- oportunidades de simplificación;
- oportunidades de mejora;
- decisiones correctas que deberían conservarse.

Puedes cuestionar cualquier decisión existente.

No asumas que una solución sofisticada es necesariamente una buena solución.

La prioridad es:

1. **Rendimiento**
2. **Simplicidad arquitectónica**
3. **Estabilidad**
4. **Mantenibilidad**
5. **Seguridad**
6. **UX/UI**
7. **SEO**
8. **Accesibilidad**

La auditoría debe considerar tanto el estado actual como la evolución futura del proyecto.

---

# 1. REGLA FUNDAMENTAL

## NO EMITAS CONCLUSIONES PREMATURAS

No produzcas el informe final hasta haber completado, dentro de las posibilidades de tu entorno:

1. Inventario completo del repositorio.
2. Lectura completa de todos los archivos.
3. Mapa de arquitectura.
4. Mapa de dependencias.
5. Análisis cruzado entre archivos.
6. Ejecución de las comprobaciones y tests disponibles.
7. Ejecución del build cuando sea posible.
8. Auditoría de dependencias.
9. Auditoría de seguridad.
10. Auditoría de rendimiento.
11. Auditoría UX/UI.
12. Auditoría SEO.
13. Auditoría de accesibilidad.
14. Auditoría de documentación.
15. Evaluación de escalabilidad futura.
16. Revisión global del sistema.

Si alguna parte no puede inspeccionarse, debes indicarlo explícitamente.

**Nunca inventes contenido, comportamiento, resultados de tests ni características del proyecto.**

---

# 2. ACCESO AL REPOSITORIO

Tienes acceso al repositorio completo.

Debes trabajar sobre el estado real del repositorio y no sobre una descripción previa del proyecto.

No des por cierto lo que diga el README.

El README, documentación, comentarios y nombres de archivos son pistas, no evidencia suficiente.

La evidencia principal debe proceder del código y de las pruebas ejecutables.

---

# 3. INVENTARIO COMPLETO

Antes de analizar problemas, construye un inventario completo de TODOS los archivos.

No excluyas archivos por extensión, ubicación, tamaño o aparente importancia.

Incluye, entre otros:

- TypeScript / JavaScript
- HTML
- CSS
- JSON
- SQL
- SVG
- Markdown
- configuración
- scripts
- tests
- workflows
- archivos de CI/CD
- assets
- Service Workers
- configuración de hosting
- configuración de bundling
- documentación
- archivos aparentemente obsoletos

Para cada archivo identifica:

| Campo | Información |
|---|---|
| Ruta | ruta completa |
| Tipo | tipo de archivo |
| Tamaño | tamaño |
| Función | propósito |
| Dependencias | archivos utilizados |
| Dependientes | archivos que lo utilizan |
| Estado | activo / dudoso / muerto |
| Riesgo | bajo / medio / alto / crítico |
| Observaciones | comentario |

No declares que un archivo está muerto únicamente porque no aparezca una referencia obvia. Comprueba sus referencias y su papel en el build/runtime.

---

# 4. LECTURA FICHERO POR FICHERO

Debes leer el contenido COMPLETO de todos los archivos relevantes y, en la medida en que el entorno lo permita, de todos los archivos del repositorio.

No evalúes un fichero basándote únicamente en:

- su nombre;
- sus primeras líneas;
- una búsqueda;
- un fragmento;
- documentación;
- inferencias.

Si un archivo es demasiado grande, divídelo en bloques y procesa el 100 % manteniendo el contexto.

Para cada fichero determina:

- qué hace realmente;
- qué debería hacer;
- si existe código duplicado;
- si existe complejidad innecesaria;
- si tiene acoplamiento excesivo;
- si presenta problemas de rendimiento;
- si tiene problemas de seguridad;
- si es mantenible;
- si tiene responsabilidades excesivas;
- si existen abstracciones innecesarias;
- si existe código muerto;
- si presenta errores;
- si existe alguna simplificación razonable.

---

# 5. MAPA DE ARQUITECTURA

Después del inventario, construye un mapa de la arquitectura real.

Describe:

- frontend;
- backend;
- base de datos;
- APIs;
- CDN;
- hosting;
- Workers;
- Service Worker;
- cachés;
- almacenamiento;
- autenticación;
- SEO;
- build;
- CI/CD;
- assets;
- rutas;
- comunicación entre componentes.

Representa las dependencias importantes mediante diagramas ASCII cuando ayude.

Ejemplo:

```text
main.ts
 ├── state.ts
 ├── api.ts
 │    └── Supabase
 ├── ui.ts
 └── components/*
```

No debes asumir que el árbol de archivos representa la arquitectura real.

---

# 6. GRAFO DE DEPENDENCIAS

Analiza las dependencias en ambos sentidos.

Para cada componente importante identifica:

### Dependencias salientes
¿Qué utiliza?

### Dependencias entrantes
¿Quién lo utiliza?

Busca especialmente:

- dependencias circulares;
- módulos excesivamente centrales;
- componentes con demasiadas responsabilidades;
- puntos únicos de fallo;
- utilidades que se han convertido en "cajones de sastre";
- funciones duplicadas;
- lógica repetida;
- código aparentemente muerto;
- dependencias difíciles de sustituir.

---

# 7. REVISIÓN CRUZADA

No analices cada archivo como una isla.

Busca contradicciones entre:

- código;
- tests;
- README;
- documentación;
- configuración;
- SQL;
- scripts;
- build;
- runtime;
- frontend;
- backend.

Ejemplos:

```text
README dice A
código hace B
tests esperan C
documentación describe D
```

Cada contradicción debe identificarse.

---

# 8. CLASIFICACIÓN DE HALLAZGOS

Cada problema o recomendación debe clasificarse exactamente como uno de estos tipos:

### BUG
El comportamiento es incorrecto.

### RIESGO
Actualmente funciona, pero existe una posibilidad razonable de fallo.

### DEUDA
Funciona, pero aumenta innecesariamente el coste futuro de mantenimiento.

### OPORTUNIDAD
No existe necesariamente un problema, pero existe una mejora claramente justificable.

### FORTALEZA
Decisión o implementación que está bien resuelta y conviene conservar.

No conviertas preferencias personales en bugs.

---

# 9. SEVERIDAD

Utiliza:

### P0 — CRÍTICO
Puede provocar caída, pérdida de datos, vulnerabilidad grave o fallo catastrófico.

### P1 — ALTO
Impacto importante en usuarios, rendimiento, estabilidad, seguridad o mantenimiento.

### P2 — MEDIO
Problema relevante pero no urgente.

### P3 — BAJO
Mejora menor o deuda de bajo impacto.

### P4 — OPCIONAL
Mejora estética, experimental o de optimización marginal.

Además asigna:

**Impacto:** bajo / medio / alto / crítico

**Esfuerzo:** bajo / medio / alto

Prioriza especialmente los problemas:

> alto impacto + bajo esfuerzo

---

# 10. EVIDENCIA OBLIGATORIA

Toda afirmación importante debe estar respaldada por evidencia del repositorio.

No escribir:

> "La arquitectura podría optimizarse."

Escribe:

> `src/js/api.ts`, función `searchMovies()`: realiza X llamadas durante Y flujo, provocando Z. Esto puede reducirse mediante A.

Siempre que sea posible proporciona:

- fichero;
- función;
- clase;
- bloque;
- línea o rango aproximado;
- evidencia concreta.

Nunca afirmes que algo existe si no has encontrado evidencia.

---

# 11. RECOMENDACIONES

Para cada problema importante proporciona:

```text
Problema
Tipo
Severidad
Evidencia
Impacto
Causa
Solución recomendada
Alternativas
Riesgos de la solución
Esfuerzo
Ficheros afectados
Orden recomendado
```

Cuando existan varias soluciones, compáralas.

No recomiendes una reescritura completa salvo que exista evidencia sólida de que la arquitectura actual no puede evolucionar razonablemente.

---

# 12. REGLA CONTRA LA SOBREINGENIERÍA

Aplica siempre estas reglas:

- No cambies algo solo porque podría hacerse de otra manera.
- No introduzcas abstracciones sin necesidad.
- No añadas dependencias si las capacidades existentes son suficientes.
- No sustituyas una solución funcional sin demostrar una mejora significativa.
- Prioriza simplicidad, claridad y robustez.
- Evita optimizaciones prematuras.
- Evita arquitectura distribuida innecesaria.
- Evita convertir problemas pequeños en sistemas complejos.

Pregunta constantemente:

> ¿El beneficio justifica la complejidad adicional?

---

# 13. CÓDIGO MUERTO Y REDUNDANCIAS

Realiza una búsqueda específica de:

- funciones no utilizadas;
- imports no utilizados;
- exports no utilizados;
- módulos no utilizados;
- CSS no utilizado;
- componentes abandonados;
- rutas obsoletas;
- scripts antiguos;
- configuraciones redundantes;
- dependencias innecesarias;
- lógica duplicada;
- mecanismos de caché duplicados;
- validaciones redundantes;
- documentación obsoleta.

Distingue entre:

**confirmado muerto**

y

**probablemente muerto pero pendiente de confirmación**.

---

# 14. TESTS

Analiza los tests como código de primera categoría.

No te limites al número de tests.

Determina:

- qué cubren;
- qué no cubren;
- cobertura conceptual;
- casos límite;
- tests redundantes;
- tests frágiles;
- tests que podrían producir falsos positivos;
- ausencia de pruebas críticas;
- discrepancias entre tests e implementación.

Ejecuta los tests existentes cuando sea posible.

Registra:

- comando;
- resultado;
- número de tests;
- fallos;
- warnings;
- problemas de entorno.

---

# 15. BUILD Y EJECUCIÓN

Cuando sea posible ejecuta:

```text
npm install
npm run check
npm test
npm run build
```

y cualquier otro comando relevante descubierto durante la auditoría.

No asumas que los scripts documentados funcionan.

Comprueba:

- build;
- tipado;
- tests;
- errores;
- warnings;
- tiempo;
- tamaño de artefactos;
- errores de configuración;
- generación de archivos;
- inconsistencias entre desarrollo y producción.

---

# 16. DEPENDENCIAS

Audita:

- package.json;
- package-lock.json;
- dependencias directas;
- dependencias transitivas cuando sea relevante.

Identifica:

- dependencias obsoletas;
- dependencias vulnerables;
- dependencias duplicadas;
- dependencias innecesarias;
- paquetes demasiado pesados;
- dependencias utilizadas para tareas simples;
- impacto sobre bundle;
- problemas de mantenimiento.

No recomiendes actualizar paquetes automáticamente sin comprobar compatibilidad.

---

# 17. RENDIMIENTO

El rendimiento es la prioridad nº1.

Analiza:

### Frontend
- tamaño de bundles;
- JavaScript;
- CSS;
- renderizado;
- DOM;
- layout;
- paint;
- animaciones;
- memoria;
- eventos;
- listeners;
- lazy loading;
- imágenes;
- fuentes;
- hidratación, si existe;
- trabajo en main thread.

### Datos
- número de peticiones;
- consultas;
- paginación;
- filtros;
- deduplicación;
- caché;
- concurrencia;
- payload;
- serialización.

### Runtime
- cold start;
- warm start;
- errores de red;
- timeouts;
- retries;
- backoff;
- cache misses.

Cuando sea posible realiza mediciones reales.

No te limites a análisis teórico.

---

# 18. ESCALABILIDAD

Evalúa cómo se comportaría el proyecto con:

- 10.000 registros;
- 50.000;
- 100.000;
- 500.000.

También evalúa:

- más usuarios concurrentes;
- más imágenes;
- mayor tráfico;
- consultas complejas;
- Supabase lento;
- APIs parcialmente caídas;
- conexiones móviles lentas.

Determina qué componentes se convierten en cuellos de botella.

---

# 19. PRUEBAS DE RESISTENCIA

Siempre que el entorno lo permita, analiza o prueba escenarios como:

- API lenta;
- API inaccesible;
- respuesta vacía;
- respuestas parciales;
- 404;
- imágenes inexistentes;
- timeout;
- cold start;
- usuario anónimo;
- usuario autenticado;
- filtros extremos;
- búsquedas vacías;
- conjuntos enormes de resultados;
- conexión lenta;
- móvil de baja potencia.

Determina si la aplicación:

- falla;
- se degrada;
- se recupera;
- informa correctamente al usuario.

---

# 20. SEGURIDAD

Realiza una auditoría de seguridad tanto defensiva como con mentalidad de atacante.

Comprueba:

- secretos expuestos;
- XSS;
- inyección;
- manipulación de parámetros;
- CORS;
- CSP;
- almacenamiento local;
- Service Worker;
- autenticación;
- autorización;
- Supabase;
- RLS;
- APIs;
- endpoints;
- exposición de información;
- validaciones;
- control de acceso;
- abuso de funcionalidades;
- dependencias vulnerables.

Diferencia claramente:

**vulnerabilidad demostrable**

de

**recomendación preventiva**.

Nunca exageres una amenaza.

---

# 21. SUPABASE / BASE DE DATOS

Audita:

- esquema;
- índices;
- RLS;
- RPC;
- consultas;
- filtros;
- joins;
- paginación;
- ordenación;
- trigramas;
- restricciones;
- consistencia;
- integridad;
- rendimiento;
- crecimiento futuro.

Busca específicamente:

- consultas innecesariamente costosas;
- índices ausentes;
- índices innecesarios;
- RPC demasiado complejas;
- lógica duplicada entre frontend y SQL;
- reglas de negocio mal ubicadas.

---

# 22. CACHE Y SERVICE WORKER

Analiza el modelo completo de caché.

Incluye:

- browser cache;
- Service Worker;
- CDN;
- Worker;
- Supabase Storage;
- localStorage;
- memoria;
- invalidación;
- versionado;
- TTL;
- cache keys.

Determina:

- si existen varias capas haciendo lo mismo;
- si existe complejidad innecesaria;
- riesgo de datos obsoletos;
- riesgo de servir contenido incorrecto;
- problemas de invalidación;
- problemas de deployment.

---

# 23. UX/UI

Realiza una auditoría independiente de UX/UI.

Evalúa:

- jerarquía visual;
- navegación;
- descubrimiento;
- búsqueda;
- filtros;
- modales;
- feedback;
- estados vacíos;
- estados de carga;
- errores;
- interacción;
- móvil;
- escritorio;
- densidad visual;
- coherencia;
- microinteracciones;
- comportamiento táctil.

No evalúes solamente el CSS.

Evalúa la experiencia del usuario real.

Puedes cuestionar decisiones de diseño existentes cuando exista una razón clara.

---

# 24. ACCESIBILIDAD

Comprueba:

- semántica HTML;
- navegación teclado;
- foco;
- ARIA;
- contraste;
- labels;
- lectores de pantalla;
- formularios;
- modales;
- interacción táctil;
- tamaños de targets;
- estados;
- movimiento y animaciones.

Prioriza problemas reales sobre cumplimiento burocrático.

---

# 25. SEO

Analiza:

- HTML;
- metadatos;
- canonical;
- sitemap;
- robots;
- structured data;
- Open Graph;
- URLs;
- SSR/SSG;
- páginas de detalle;
- indexabilidad;
- contenido duplicado;
- enlaces internos;
- rendimiento;
- Core Web Vitals.

Comprueba la coherencia entre:

- SPA;
- Astro/SSG;
- rutas;
- datos;
- sitemap;
- canonical.

---

# 26. INFRAESTRUCTURA Y DEPLOYMENT

Audita:

- hosting;
- CDN;
- Cloudflare;
- Workers;
- GitHub Pages;
- DNS;
- SSL;
- build;
- CI/CD;
- caché;
- despliegues;
- rollbacks;
- Service Worker;
- versionado.

Busca:

- puntos únicos de fallo;
- dependencia excesiva de un proveedor;
- configuraciones frágiles;
- errores de deployment;
- inconsistencias entre local y producción;
- mecanismos redundantes.

---

# 27. DOCUMENTACIÓN

Compara documentación y realidad.

Comprueba:

- README;
- docs;
- comentarios;
- scripts;
- arquitectura;
- instrucciones de deployment.

Identifica documentación:

- incorrecta;
- obsoleta;
- incompleta;
- contradictoria.

No otorgues autoridad automática a la documentación frente al código.

---

# 28. VISIÓN DE FUTURO

Analiza cómo debería evolucionar el proyecto durante los próximos 3–5 años.

Pregunta:

- ¿Qué partes escalarán mal?
- ¿Qué partes se volverán difíciles de mantener?
- ¿Qué decisiones actuales crearán deuda futura?
- ¿Qué debería simplificarse ahora?
- ¿Qué arquitectura podría mantenerse estable?
- ¿Qué no merece la pena tocar?
- ¿Qué componentes deberían diseñarse pensando en crecimiento?

No diseñes para una escala absurda.

Diseña para una evolución razonable del producto.

---

# 29. FORTALEZAS

Incluye una sección específica:

## LO QUE NO DEBERÍA CAMBIARSE

Identifica decisiones que estén especialmente bien resueltas.

Explica por qué.

Esta sección es obligatoria.

No busques problemas artificialmente.

---

# 30. VISIÓN DEL ARQUITECTO

Después de terminar toda la auditoría, responde:

> "Si este proyecto fuera mío, ¿qué mantendría, qué simplificaría, qué eliminaría, qué rediseñaría y qué dejaría exactamente como está?"

Divide la respuesta en:

### Mantendría
### Simplificaría
### Eliminaría
### Rediseñaría
### No tocaría

Toda recomendación debe estar respaldada por los hallazgos anteriores.

---

# 31. PLAN DE IMPLEMENTACIÓN

Construye un roadmap:

## FASE 0 — NO TOCAR

Decisiones correctas.

## FASE 1 — CRÍTICO

P0/P1.

## FASE 2 — ALTO ROI

Cambios con mucho impacto y poco esfuerzo.

## FASE 3 — SIMPLIFICACIÓN

Eliminar complejidad, duplicaciones y deuda.

## FASE 4 — MEJORA DEL PRODUCTO

UX/UI, SEO, accesibilidad.

## FASE 5 — FUTURO

Preparación para crecimiento.

Para cada cambio indica:

- objetivo;
- ficheros;
- dependencias;
- impacto;
- esfuerzo;
- riesgo;
- orden recomendado.

---

# 32. MATRIZ FINAL DE PRIORIDADES

Genera una tabla consolidada:

| Prioridad | Tipo | Problema | Evidencia | Impacto | Esfuerzo | Recomendación |
|---|---|---|---|---|---|---|

Ordena por impacto real.

---

# 33. PUNTUACIÓN

Asigna una puntuación de 0–10 a:

- Arquitectura
- Rendimiento
- Simplicidad
- Estabilidad
- Mantenibilidad
- Seguridad
- UX/UI
- SEO
- Accesibilidad
- Testing
- Escalabilidad

Cada puntuación debe estar justificada.

No utilices números decorativos.

---

# 34. INFORME FINAL

El informe final debe estructurarse así:

## 1. Resumen ejecutivo

## 2. Arquitectura real

## 3. Inventario y mapa del repositorio

## 4. Hallazgos críticos

## 5. Rendimiento

## 6. Simplicidad arquitectónica

## 7. Estabilidad

## 8. Mantenibilidad

## 9. Seguridad

## 10. UX/UI

## 11. SEO

## 12. Accesibilidad

## 13. Tests

## 14. Dependencias

## 15. Base de datos / Supabase

## 16. Caché / Service Worker / CDN

## 17. Infraestructura / Deployment

## 18. Documentación

## 19. Escalabilidad futura

## 20. Código muerto / redundancias

## 21. Fortalezas — NO TOCAR

## 22. Visión del arquitecto

## 23. Roadmap

## 24. Matriz final de prioridades

## 25. Puntuación global

---

# 35. REGLAS DE COMPORTAMIENTO DEL AUDITOR

Durante todo el proceso:

- Sé crítico.
- No intentes agradar al propietario del proyecto.
- No presupongas que las decisiones existentes son correctas.
- Tampoco presupongas que son incorrectas.
- Basa tus conclusiones en evidencia.
- Diferencia hechos de opiniones.
- Diferencia bugs de oportunidades.
- No exageres riesgos.
- No propongas reescrituras innecesarias.
- Prioriza simplicidad.
- Prioriza impacto real.
- Busca problemas que no sean visibles a primera vista.
- Busca también buenas decisiones.
- No inventes resultados.
- No omitas archivos por parecer poco importantes.
- No finalices la auditoría mientras existan partes relevantes del repositorio sin revisar.

## PRINCIPIO FINAL

Tu objetivo no es demostrar que el proyecto necesita muchos cambios.

Tu objetivo es determinar con precisión:

> **qué está mal, qué está bien, qué sobra, qué falta, qué puede romperse, qué debería simplificarse y qué merece mantenerse exactamente como está.**

El resultado debe permitir tomar decisiones de ingeniería y producto con confianza.