// =================================================================
//                  LÓGICA DE AUTENTICACIÓN
// =================================================================
// Este script gestiona los formularios de login y registro en la modal de autenticación.

import { supabase } from './supabaseClient.js';
import { closeAuthModal } from './ui.js'; // Importamos la función para cerrar la modal

// No es necesario un DOMContentLoaded porque este módulo será llamado por main.js

const dom = {
    loginView: document.getElementById('login-view'),
    registerView: document.getElementById('register-view'),
    loginForm: document.getElementById('login-form'),
    registerForm: document.getElementById('register-form'),
    showRegisterBtn: document.getElementById('show-register-view'),
    showLoginBtn: document.getElementById('show-login-view'),
    authMessage: document.getElementById('auth-message'),
};

/**
 * Muestra un mensaje en la interfaz de autenticación.
 * @param {string} text - El mensaje a mostrar.
 * @param {'error' | 'success'} type - El tipo de mensaje.
 */
function showMessage(text, type = 'error') {
    dom.authMessage.textContent = text;
    dom.authMessage.className = `auth-message auth-message--${type}`;
    dom.authMessage.style.display = 'block';
}

/**
 * Limpia cualquier mensaje previo.
 */
function clearMessage() {
    dom.authMessage.style.display = 'none';
    dom.authMessage.textContent = '';
}

/**
 * Gestiona el envío del formulario de registro.
 * @param {Event} e - El evento de submit.
 */
async function handleRegister(e) {
    e.preventDefault();
    clearMessage();
    const email = dom.registerForm.elements['register-email'].value;
    const password = dom.registerForm.elements['register-password'].value;

    const { data, error } = await supabase.auth.signUp({ email, password });

    if (error) {
        showMessage(`Error en el registro: ${error.message}`);
    } else if (data.user && data.user.identities && data.user.identities.length === 0) {
        showMessage('Error: Este usuario ya existe.', 'error');
    } else if (data.user) {
        showMessage('¡Registro exitoso! Revisa tu email para confirmar tu cuenta.', 'success');
        dom.registerForm.reset();
    }
}

/**
 * Gestiona el envío del formulario de inicio de sesión.
 * @param {Event} e - El evento de submit.
 */
async function handleLogin(e) {
    e.preventDefault();
    clearMessage();
    const email = dom.loginForm.elements['login-email'].value;
    const password = dom.loginForm.elements['login-password'].value;

    const { error } = await supabase.auth.signInWithPassword({ email, password });

    if (error) {
        // ✨ MEJORA: Usar los códigos de error o el nombre de la clase de error en lugar de
        // buscar texto en el mensaje. Es más robusto ante cambios en la librería de Supabase.
        // Aunque Supabase JS v2 no expone códigos de error numéricos fácilmente, podemos
        // comprobar el tipo de error si la librería lo especificara. Por ahora, mantenemos
        // la lógica pero con conciencia de su fragilidad.
        if (error.message === 'Invalid login credentials') {
            showMessage('Email o contraseña incorrectos.');
        } else if (error.message === 'Email not confirmed') {
            showMessage('Por favor, confirma tu email antes de iniciar sesión.');
        } else {
            showMessage(`Error: ${error.message}`);
        }
    } else {
        // En lugar de redirigir, cerramos la modal.
        // El listener onAuthStateChange en main.js se encargará de actualizar la UI.
        closeAuthModal();
        dom.loginForm.reset();
    }
}

/**
 * Inicializa los listeners para los formularios de autenticación.
 */
export function initAuthForms() {
    if (!dom.loginForm) return; // Si no estamos en la página correcta, no hacer nada

    dom.loginForm.addEventListener('submit', handleLogin);
    dom.registerForm.addEventListener('submit', handleRegister);

    dom.showRegisterBtn.addEventListener('click', () => {
        clearMessage();
        dom.loginView.style.display = 'none';
        dom.registerView.style.display = 'block';
    });

    dom.showLoginBtn.addEventListener('click', () => {
        clearMessage();
        dom.registerView.style.display = 'none';
        dom.loginView.style.display = 'block';
    });
}