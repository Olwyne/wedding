import { db, auth } from '../firebase-init.js';
import { doc, setDoc } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';
import { initAuth } from './auth.js';

function log(msg) {
  document.getElementById('seed-log').textContent += msg + '\n';
}

document.getElementById('seed-btn').addEventListener('click', async () => {
  const user = auth.currentUser;
  if (!user) { log('Non connecté.'); return; }
  try {
    await setDoc(doc(db, 'admins', user.uid), {
      email: user.email,
      permissions: { blocks: 'write', guests: 'write', events: 'write', users: 'write' },
      createdAt: new Date().toISOString(),
      createdBy: user.uid,
    });
    log(`Créé : admins/${user.uid} (${user.email}) avec accès complet.`);
  } catch (err) {
    log(`Erreur : ${err.message}`);
  }
});

initAuth({ onSignedIn: () => {}, onSignedOut: () => {} });
