// admin/auth.js
import { auth } from '../firebase-init.js';
import { signInWithEmailAndPassword, onAuthStateChanged, signOut } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js';
import { loadPermissions } from './permissions.js';

export function initAuth({ onSignedIn, onSignedOut }) {
  const loginScreen = document.getElementById('login-screen');
  const dashboard = document.getElementById('dashboard');
  const loginForm = document.getElementById('login-form');
  const loginError = document.getElementById('login-error');
  const logoutBtn = document.getElementById('logout-btn');

  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    loginError.hidden = true;
    const email = document.getElementById('login-email').value;
    const password = document.getElementById('login-password').value;
    try {
      await signInWithEmailAndPassword(auth, email, password);
    } catch (err) {
      loginError.textContent = 'Email ou mot de passe incorrect.';
      loginError.hidden = false;
    }
  });

  logoutBtn.addEventListener('click', () => signOut(auth));

  onAuthStateChanged(auth, async (user) => {
    if (user) {
      await loadPermissions(user.uid);
      loginScreen.hidden = true;
      dashboard.hidden = false;
      onSignedIn(user);
    } else {
      loginScreen.hidden = false;
      dashboard.hidden = true;
      onSignedOut();
    }
  });
}
