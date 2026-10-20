// =================================================================
//        PLANTILLA DIFERIDA (LAZY TEMPLATE): LEGAL MODAL
// =================================================================
// Carga diferida del modal informativo y legal (Quiénes somos, Contacto,
// Aviso Legal, Privacidad, Cookies) reduciendo el documento principal en ~14 KB.
// =================================================================

export const LEGAL_MODAL_HTML = `
  <div id="legal-overlay" class="legal-overlay" hidden aria-hidden="true"></div>
  <div id="legal-modal" class="legal-modal" role="dialog" aria-modal="true" hidden aria-labelledby="legal-modal-title"
    tabindex="-1">
    <div class="legal-box">
      <header class="legal-header">
        <div class="legal-header-brand">
          <h2 id="legal-modal-title" class="legal-logo">
            <span>videoclub</span>.<span>digital</span>
          </h2>
        </div>
        <button type="button" id="legal-close-btn" class="legal-close-btn" aria-label="Cerrar modal informativo">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
            stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <use href="#icon-close"></use>
          </svg>
        </button>
      </header>

      <nav class="legal-nav" role="tablist" aria-label="Secciones informativas y legales">
        <button type="button" class="legal-tab-btn is-active" role="tab" id="tab-about" aria-selected="true"
          aria-controls="panel-about" data-tab="about">
          Quiénes somos
        </button>
        <button type="button" class="legal-tab-btn" role="tab" id="tab-contact" aria-selected="false"
          aria-controls="panel-contact" data-tab="contact">
          Contacto
        </button>
        <button type="button" class="legal-tab-btn" role="tab" id="tab-legal" aria-selected="false"
          aria-controls="panel-legal" data-tab="legal">
          Aviso legal
        </button>
        <button type="button" class="legal-tab-btn" role="tab" id="tab-privacy" aria-selected="false"
          aria-controls="panel-privacy" data-tab="privacy">
          Privacidad
        </button>
        <button type="button" class="legal-tab-btn" role="tab" id="tab-cookies" aria-selected="false"
          aria-controls="panel-cookies" data-tab="cookies">
          Cookies
        </button>
      </nav>

      <div class="legal-body">
        <!-- 1. Quiénes somos -->
        <section id="panel-about" class="legal-panel is-active" role="tabpanel" aria-labelledby="tab-about">
          <h3>Quiénes somos</h3>
          <p>
            <strong>videoclub.digital</strong> es un archivo y catálogo
            cinematográfico digital independiente, diseñado para cinéfilos,
            investigadores y amantes del séptimo arte.
          </p>
          <p>
            Nuestra misión es ofrecer un espacio de descubrimiento riguroso,
            facilitando la exploración de filmografías completas de directores
            y actores, selecciones temáticas, cinematografías de distintos
            países y períodos históricos.
          </p>
          <p>
            El proyecto no aloja ni distribuye archivos audiovisuales de vídeo
            en streaming; funciona como una biblioteca de referencia, análisis
            y prescripción cultural de obras cinematográficas.
          </p>
        </section>

        <!-- 2. Contacto -->
        <section id="panel-contact" class="legal-panel" role="tabpanel" aria-labelledby="tab-contact" hidden>
          <h3>Contacto</h3>
          <p>
            Para cualquier consulta, sugerencia de catálogo, propuesta de
            colaboración o notificación técnica, puedes escribirnos
            directamente a nuestro buzón de atención:
          </p>
          <div class="legal-contact-card">
            <span class="legal-contact-label">Correo electrónico oficial:</span>
            <a href="mailto:videoclub.digital@hotmail.com" class="legal-contact-link">videoclub.digital@hotmail.com</a>
          </div>
          <p class="legal-small-note">
            Revisamos periódicamente todos los mensajes y respondemos con la
            mayor brevedad posible.
          </p>
        </section>

        <!-- 3. Aviso Legal -->
        <section id="panel-legal" class="legal-panel" role="tabpanel" aria-labelledby="tab-legal" hidden>
          <h3>Aviso legal</h3>
          <p>
            <strong>Titularidad y naturaleza del proyecto:</strong>
            videoclub.digital es un proyecto personal, independiente y sin
            ánimo de lucro, gestionado por una persona física a título
            particular. No constituye una empresa, no ofrece bienes ni
            servicios de pago, no aloja publicidad de ningún tipo, no obtiene
            ingresos por afiliación ni por ninguna otra vía comercial, y no
            realiza actividad económica alguna. Por su naturaleza
            estrictamente personal y no lucrativa, queda al margen del deber
            de identificación empresarial recogido en el artículo 10 de la Ley
            34/2002, de Servicios de la Sociedad de la Información y Comercio
            Electrónico (LSSICE), reservado a prestadores con actividad
            comercial.
          </p>
          <p>
            Contacto:
            <a href="mailto:videoclub.digital@hotmail.com">videoclub.digital@hotmail.com</a>
          </p>
          <p>
            <strong>Propiedad Intelectual y Contenidos:</strong> Los títulos,
            sinopsis, nombres de películas y materiales promocionales (como
            pósters o imágenes de referencia) mostrados en la plataforma
            pertenecen a sus respectivos productores, distribuidores o
            titulares de derechos, y se utilizan bajo un propósito
            estrictamente divulgativo y de reseña cultural, sin ánimo de
            lucro.
          </p>
          <p>
            <strong>Enlaces Externos:</strong> La web proporciona enlaces a
            fuentes externas de información y plataformas de streaming (como
            IMDb, FilmAffinity, JustWatch o Wikipedia). videoclub.digital no
            asume responsabilidad sobre la disponibilidad o contenidos de
            dichos sitios externos.
          </p>
        </section>

        <!-- 4. Privacidad -->
        <section id="panel-privacy" class="legal-panel" role="tabpanel" aria-labelledby="tab-privacy" hidden>
          <h3>Política de privacidad</h3>
          <p>
            En videoclub.digital nos tomamos muy en serio la privacidad y la
            minimización de datos conforme al Reglamento General de Protección
            de Datos (RGPD, Reglamento UE 2016/679):
          </p>
          <ul>
            <li>
              <strong>Responsable del tratamiento:</strong> Proyecto personal
              videoclub.digital · Contacto:
              <a href="mailto:videoclub.digital@hotmail.com">videoclub.digital@hotmail.com</a>
            </li>
            <li>
              <strong>Datos recogidos:</strong> Si decides crear una cuenta
              personal, únicamente almacenamos tu dirección de correo
              electrónico y las preferencias/puntuaciones de tu lista privada
              (watchlist y valoraciones).
            </li>
            <li>
              <strong>Finalidad:</strong> Permitir la autenticación segura y
              sincronizar tus películas guardadas en tus dispositivos.
            </li>
            <li>
              <strong>Base jurídica:</strong> El tratamiento se basa en tu
              consentimiento explícito al crear la cuenta (art. 6.1.a RGPD) y
              en la ejecución del servicio que solicitas expresamente al
              guardar tus valoraciones y watchlist (art. 6.1.b RGPD).
            </li>
            <li>
              <strong>Plazo de conservación:</strong> Tus datos se conservan
              mientras tu cuenta permanezca activa. Si solicitas la
              eliminación de tu cuenta, tus datos se borran de forma
              permanente en un plazo máximo de 30 días.
            </li>
            <li>
              <strong>No cesión a terceros:</strong> Tus datos jamás se
              venden, ceden ni comparten con terceros para fines publicitarios
              o comerciales.
            </li>
            <li>
              <strong>Tus derechos:</strong> Puedes ejercer en cualquier
              momento tus derechos de acceso, rectificación, supresión,
              oposición, limitación del tratamiento y portabilidad de tus
              datos, escribiendo a
              <a href="mailto:videoclub.digital@hotmail.com">videoclub.digital@hotmail.com</a>.
            </li>
            <li>
              <strong>Derecho a reclamar:</strong> Si consideras que el
              tratamiento de tus datos no se ajusta a la normativa, tienes
              derecho a presentar una reclamación ante la Agencia Española de
              Protección de Datos (<a href="https://www.aepd.es" target="_blank" rel="noopener">www.aepd.es</a>).
            </li>
          </ul>
        </section>

        <!-- 5. Cookies -->
        <section id="panel-cookies" class="legal-panel" role="tabpanel" aria-labelledby="tab-cookies" hidden>
          <h3>Política de cookies y almacenamiento</h3>
          <p>
            <strong>videoclub.digital no utiliza cookies de seguimiento
              publicitario ni tecnologías de rastreo de terceros con fines
              comerciales.</strong>
            Utilizamos únicamente tecnologías de almacenamiento local
            estrictamente técnicas y funcionales, necesarias para el
            funcionamiento del servicio que solicitas al usarlo, y por tanto
            exentas del deber de solicitar tu consentimiento conforme a la
            Guía de Cookies de la Agencia Española de Protección de Datos
            (AEPD).
          </p>
          <p><strong>Inventario técnico detallado:</strong></p>
          <div class="legal-table-wrapper">
            <table class="legal-cookie-table">
              <thead>
                <tr>
                  <th scope="col">Nombre / Clave</th>
                  <th scope="col">Tecnología</th>
                  <th scope="col">Finalidad</th>
                  <th scope="col">Duración</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td><code>sb-*-auth-token</code></td>
                  <td>localStorage o sessionStorage*</td>
                  <td>
                    Mantener tu sesión iniciada (gestionado por Supabase Auth)
                  </td>
                  <td>Hasta cierre de sesión o expiración del token</td>
                </tr>
                <tr>
                  <td><code>videoclub:remember_me</code></td>
                  <td>localStorage</td>
                  <td>
                    Recordar si elegiste mantener la sesión iniciada entre
                    visitas
                  </td>
                  <td>Persistente hasta que la cambies</td>
                </tr>
                <tr>
                  <td><code>theme</code></td>
                  <td>localStorage y Cookie técnica</td>
                  <td>Recordar tu preferencia de tema claro/oscuro</td>
                  <td>Persistente (1 año o hasta que la cambies)</td>
                </tr>
                <tr>
                  <td><code>rotationState</code></td>
                  <td>localStorage</td>
                  <td>
                    Recordar tu preferencia de modo de visualización del
                    catálogo
                  </td>
                  <td>Persistente hasta que la cambies</td>
                </tr>
                <tr>
                  <td><code>videoclub_local_db</code></td>
                  <td>IndexedDB</td>
                  <td>
                    Guardar temporalmente tus valoraciones o cambios en la
                    watchlist hechos sin conexión, para sincronizarlos
                    automáticamente al recuperar internet
                  </td>
                  <td>Hasta que la sincronización se complete con éxito</td>
                </tr>
              </tbody>
            </table>
          </div>
          <p class="legal-small-note">
            *Si eliges "recordarme" al iniciar sesión, tu sesión se guarda en
            <code>localStorage</code> (persiste entre visitas). Si no lo
            eliges, se guarda en <code>sessionStorage</code> y se borra
            automáticamente al cerrar la pestaña o el navegador.
          </p>
          <p>
            Al ser mecanismos meramente técnicos y exentos de elaboración de
            perfiles publicitarios, no interfieren con tu privacidad, y no
            requieren de un banner de consentimiento conforme a la normativa
            vigente.
          </p>
        </section>
      </div>

      <footer class="legal-box-footer">
        <small>2025-2026 © videoclub.digital. Todos los derechos
          reservados.</small>
      </footer>
    </div>
  </div>
`;

/**
 * Monta el modal legal e informativo en el DOM bajo demanda si aún no existe.
 */
export function ensureLegalModalMounted(): HTMLElement | null {
  if (typeof document === "undefined") return null;
  let modal = document.getElementById("legal-modal");
  if (!modal) {
    document.body.insertAdjacentHTML("beforeend", LEGAL_MODAL_HTML);
    modal = document.getElementById("legal-modal");
  }
  return modal;
}
