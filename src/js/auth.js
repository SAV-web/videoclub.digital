// =================================================================
//                 EL PORTERO (Autenticación)
// =================================================================
// Maneja el inicio de sesión y registro de usuarios.
// =================================================================

import { getSupabase } from "./api.js";
import { closeAuthModal, showToast } from "./ui.js";

// Caché de elementos HTML para no buscarlos todo el rato
let domCache = null;
const getDom = () => domCache || (domCache = {
  vLogin: document.getElementById("login-view"),
  vReg: document.getElementById("register-view"),
  fLogin: document.getElementById("login-form"),
  fReg: document.getElementById("register-form"),
  btnToReg: document.getElementById("show-register-view"),
  btnToLog: document.getElementById("show-login-view"),
  msg: document.getElementById("auth-message"),
});

// Muestra u oculta mensajes de texto (Ej: "Contraseña incorrecta")
function setFeedback(text, type = "error") {
  const { msg } = getDom();
  if (!msg) return;
  msg.hidden = !text;
  msg.textContent = text || "";
  msg.className = `auth-message auth-message--${type}`;
}

// Traduce errores informáticos a humano
const translateError = (e) => {
  const m = (e?.message || "").toLowerCase();
  if (m.includes("invalid")) return "Email o contraseña incorrectos.";
  if (m.includes("registered")) return "Este email ya está registrado.";
  if (m.includes("rate limit")) return "Demasiados intentos. Espera un momento.";
  if (m.includes("weak")) return "La contraseña es muy débil.";
  return import.meta.env.DEV && e?.message ? `Error: ${e.message}` : "Error de acceso.";
};

// Lógica genérica al pulsar el botón "Entrar" o "Registrar"
async function handleSubmit(e, isLogin) {
  e.preventDefault();
  setFeedback(null);

  const form = e.currentTarget;
  const btn = form.querySelector('button');
  const origText = btn?.textContent || "";
  
  const email = form.querySelector('input[type="email"]')?.value.trim();
  const pass = form.querySelector('input[type="password"]')?.value.trim();

  if (!email || !pass) return setFeedback("Completa todos los campos.");

  if (btn) Object.assign(btn, { disabled: true, textContent: "Procesando..." });

  try {
    const supabase = await getSupabase();
    const { data, error } = isLogin 
      ? await supabase.auth.signInWithPassword({ email, password: pass })
      : await supabase.auth.signUp({ email, password: pass });

    if (error) {
      setFeedback(translateError(error));
    } else if (!isLogin && data?.user?.identities?.length === 0) {
      setFeedback("Este usuario ya está registrado.", "error");
    } else {
      if (isLogin) {
        showToast("¡Hola de nuevo!", "success");
        closeAuthModal();
      } else {
        setFeedback("¡Registro exitoso! Revisa tu email.", "success");
      }
      form.reset();
    }
  } catch (err) {
    setFeedback("Error inesperado de conexión.");
  } finally {
    if (btn) Object.assign(btn, { disabled: false, textContent: origText });
  }
}

// Alterna visualmente entre la pantalla de Login y la de Registro
function toggleView(showRegister) {
  const dom = getDom();
  setFeedback(null);
  dom.vLogin.hidden = showRegister;
  dom.vReg.hidden = !showRegister;
  requestAnimationFrame(() => (showRegister ? dom.fReg : dom.fLogin).querySelector('input')?.focus({ preventScroll: true }));
}

// Arranca el sistema al pulsar en la cabecera
export function initAuthForms() {
  const dom = getDom();
  if (!dom.fLogin) return;

  dom.fLogin.addEventListener("submit", e => handleSubmit(e, true));
  dom.fReg.addEventListener("submit", e => handleSubmit(e, false));
  dom.btnToReg.addEventListener("click", () => toggleView(true));
  dom.btnToLog.addEventListener("click", () => toggleView(false));
}