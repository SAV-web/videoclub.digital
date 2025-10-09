// =================================================================
//                  LÓGICA DE AUTENTICACIÓN
// =================================================================
// Este script gestiona los formularios de login y registro en auth.html
// src/js/auth.js
// =================================================================
//                  LÓGICA DE AUTENTICACIÓN
// =================================================================
// Este script gestiona los formularios de login y registro en auth.html

// ✨ CAMBIO 1: Importamos la instancia ÚNICA de supabase desde nuestro módulo central.
import { supabase } from './supabaseClient.js';
import { CONFIG } from './config.js';

const dom = {
    loginView: document.getElementById('login-view'),
    registerView: document.getElementById('register-view'),
    loginForm: document.getElementById('login-form'),
    registerForm: document.getElementById('register-form'),
    showRegisterBtn: document.getElementById('show-register-view'),
    showLoginBtn: document.getElementById('show-login-view'),
    authMessage: document.getElementById('auth-message'),
};

// ... (El resto del fichero 'auth.js' no necesita cambios ya que ya usaba la variable 'supabase')
// ... (handleRegister, handleLogin, etc. seguirán funcionando igual)

// ... (resto del código del fichero sin cambios)

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
        if (error.message.includes('Invalid login credentials')) {
            showMessage('Email o contraseña incorrectos.');
        } else if (error.message.includes('Email not confirmed')) {
            showMessage('Por favor, confirma tu email antes de iniciar sesión.');
        } else {
            showMessage(`Error: ${error.message}`);
        }
    } else {
        // Redirige a la página principal tras un login exitoso.
        window.location.href = 'index.html';
    }
}

/**
 * Inicializa los listeners de la página.
 */
function init() {
    // Cargar el tema (claro/oscuro) desde localStorage
    if (localStorage.getItem('theme') === 'dark') {
        document.body.classList.add('dark-mode');
    }

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

    // Redirigir si el usuario ya está logueado
    supabase.auth.getSession().then(({ data: { session } }) => {
        if (session) {
            console.log('Usuario ya logueado, redirigiendo a la página principal.');
            window.location.href = 'index.html';
        }
    });
}

document.addEventListener('DOMContentLoaded', init);