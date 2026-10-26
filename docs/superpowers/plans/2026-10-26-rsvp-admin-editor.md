# Éditeur RSVP admin — Plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rendre le panneau "Réponse" du backoffice invités entièrement éditable, pour que les admins puissent corriger une réponse RSVP à posteriori et que le dashboard reflète les changements.

**Architecture:** `openRsvpDetail` dans `admin/guests.js` est transformée en `openRsvpPanel` — même UX, mais les divs lecture seule deviennent des inputs, et un bouton "Enregistrer" écrit `guest.rsvp` dans Firestore via `updateDoc`.

**Tech Stack:** Vanilla JS ES modules, Firebase Firestore 10.7.1, aucun build step.

## Global Constraints

- Pas de build step — les changements prennent effet au rechargement de page
- ES modules : imports en haut du fichier uniquement
- `escapeHtml()` obligatoire pour toute chaîne utilisateur interpolée dans du HTML
- Pas de TypeScript — JS plain uniquement
- Pattern des panneaux existants : bouton Save désactivé pendant l'écriture, erreur inline via `#panel-error`

---

### Task 1 : Transformer `openRsvpDetail` en panneau éditable `openRsvpPanel`

**Files:**
- Modify: `admin/guests.js`
  - Renommer `openRsvpDetail` → `openRsvpPanel`
  - Remplacer le body lecture seule par un formulaire avec inputs
  - Ajouter handler Save avec `updateDoc`
  - Mettre à jour le call site (ligne ~326)

**Interfaces:**
- Consumes: `guest: { id: string, name: string, rsvp?: object }`, `eventById: { [id]: { title_fr: string } }` — déjà disponibles au call site (ligne 326)
- Produces: écrit `{ rsvp: newRsvp }` dans `guests/{guest.id}` via `updateDoc`, puis appelle `renderGuestsTab()`

- [ ] **Step 1 : Remplacer `openRsvpDetail` par `openRsvpPanel` dans `admin/guests.js`**

Trouver la fonction entière (lignes ~408–449) :
```js
function openRsvpDetail(guest, eventById) {
  // ...
}
```

La remplacer par :
```js
async function openRsvpPanel(guest, eventById) {
  const rsvp = guest?.rsvp || {};

  function nameListHtml(id, names) {
    const rows = (names || []).map((n, i) => `
      <div class="expected-guest-row" data-idx="${i}">
        <input type="text" class="name-list-input" value="${escapeHtml(n)}" placeholder="Nom">
        <button type="button" class="btn-icon name-list-remove" aria-label="Retirer">✕</button>
      </div>`).join('');
    return `<div id="${id}-list">${rows}</div>
      <button type="button" class="btn-secondary name-list-add" data-list="${id}" style="margin-top:4px">+ Ajouter</button>`;
  }

  const eventCheckboxes = Object.keys(eventById).map(id => {
    const checked = rsvp.confirmedEvents?.[id] ? 'checked' : '';
    return `<label style="display:flex;gap:6px;align-items:center;font-weight:normal;margin-bottom:4px">
      <input type="checkbox" class="event-cb" data-event-id="${escapeHtml(id)}" ${checked}>
      ${escapeHtml(eventById[id]?.title_fr || id)}
    </label>`;
  }).join('');

  const overlay = document.createElement('div');
  overlay.className = 'panel-overlay';
  const panelEl = document.createElement('div');
  panelEl.className = 'panel';
  panelEl.innerHTML = `
    <div class="panel-header">
      <h3>Réponse de ${escapeHtml(guest?.name || '')}</h3>
      <button class="btn-icon" id="panel-close" aria-label="Fermer">✕</button>
    </div>
    <div class="panel-body">
      <label class="field">
        <span>Statut</span>
        <select id="rsvp-status">
          <option value="pending"   ${rsvp.status === 'pending'   || !rsvp.status ? 'selected' : ''}>En attente</option>
          <option value="confirmed" ${rsvp.status === 'confirmed' ? 'selected' : ''}>Confirmé</option>
          <option value="declined"  ${rsvp.status === 'declined'  ? 'selected' : ''}>Décliné</option>
        </select>
      </label>
      <label class="field">
        <span>Nom déclaré</span>
        <input id="rsvp-name" type="text" value="${escapeHtml(rsvp.name || '')}">
      </label>
      <label class="field">
        <span>Email</span>
        <input id="rsvp-email" type="email" value="${escapeHtml(rsvp.email || '')}">
      </label>
      <label class="field">
        <span>Téléphone</span>
        <input id="rsvp-phone" type="text" value="${escapeHtml(rsvp.phone || '')}">
      </label>
      <label class="field">
        <span>Adultes</span>
        <input id="rsvp-adults" type="number" min="0" value="${rsvp.adults ?? 0}">
      </label>
      <label class="field">
        <span>Enfants</span>
        <input id="rsvp-children" type="number" min="0" value="${rsvp.children ?? 0}">
      </label>
      <div class="field">
        <span>Autres adultes (noms)</span>
        ${nameListHtml('extra-adults', rsvp.extraAdultNames)}
      </div>
      <div class="field">
        <span>Enfants (noms)</span>
        ${nameListHtml('child-names', rsvp.childNames)}
      </div>
      <div class="field">
        <span>Événements confirmés</span>
        <div>${eventCheckboxes || '<em style="color:var(--muted)">Aucun événement configuré</em>'}</div>
      </div>
      <label class="field">
        <span>Allergies / régime</span>
        <textarea id="rsvp-diet">${escapeHtml(rsvp.diet || '')}</textarea>
      </label>
      <label class="field">
        <span>Message</span>
        <textarea id="rsvp-message">${escapeHtml(rsvp.message || '')}</textarea>
      </label>
      <div class="field">
        <span>Répondu le</span>
        <div>${rsvp.respondedAt ? new Date(rsvp.respondedAt).toLocaleString('fr-FR') : '—'}</div>
      </div>
      <p id="panel-error" class="login-error" hidden></p>
    </div>
    <div class="panel-footer">
      <button class="btn-primary" id="panel-save">Enregistrer</button>
      <button class="btn-secondary" id="panel-cancel">Annuler</button>
    </div>`;

  function isSaving() { return panelEl.querySelector('#panel-save').disabled; }
  function close() { teardown(); overlay.remove(); panelEl.remove(); }
  const teardown = mountPanel(overlay, panelEl, close);
  panelEl.querySelector('#panel-close').addEventListener('click', () => { if (!isSaving()) close(); });
  panelEl.querySelector('#panel-cancel').addEventListener('click', () => { if (!isSaving()) close(); });
  overlay.addEventListener('click', () => { if (!isSaving()) close(); });

  // Dynamic name lists
  function bindNameLists() {
    panelEl.querySelectorAll('.name-list-remove').forEach(btn => {
      btn.onclick = () => btn.closest('.expected-guest-row').remove();
    });
    panelEl.querySelectorAll('.name-list-add').forEach(btn => {
      btn.onclick = () => {
        const listEl = panelEl.querySelector(`#${btn.dataset.list}-list`);
        const idx = listEl.children.length;
        listEl.insertAdjacentHTML('beforeend', `
          <div class="expected-guest-row" data-idx="${idx}">
            <input type="text" class="name-list-input" value="" placeholder="Nom">
            <button type="button" class="btn-icon name-list-remove" aria-label="Retirer">✕</button>
          </div>`);
        bindNameLists();
      };
    });
  }
  bindNameLists();

  panelEl.querySelector('#panel-save').addEventListener('click', async () => {
    const saveBtn = panelEl.querySelector('#panel-save');
    const errEl = panelEl.querySelector('#panel-error');
    saveBtn.disabled = true;
    errEl.hidden = true;

    const confirmedEvents = {};
    panelEl.querySelectorAll('.event-cb').forEach(cb => {
      confirmedEvents[cb.dataset.eventId] = cb.checked;
    });

    const extraAdultNames = Array.from(
      panelEl.querySelectorAll('#extra-adults-list .name-list-input')
    ).map(i => i.value.trim()).filter(Boolean);

    const childNames = Array.from(
      panelEl.querySelectorAll('#child-names-list .name-list-input')
    ).map(i => i.value.trim()).filter(Boolean);

    const newRsvp = {
      ...rsvp,
      status:           panelEl.querySelector('#rsvp-status').value,
      name:             panelEl.querySelector('#rsvp-name').value.trim(),
      email:            panelEl.querySelector('#rsvp-email').value.trim(),
      phone:            panelEl.querySelector('#rsvp-phone').value.trim(),
      adults:           parseInt(panelEl.querySelector('#rsvp-adults').value, 10) || 0,
      children:         parseInt(panelEl.querySelector('#rsvp-children').value, 10) || 0,
      extraAdultNames,
      childNames,
      confirmedEvents,
      diet:             panelEl.querySelector('#rsvp-diet').value.trim(),
      message:          panelEl.querySelector('#rsvp-message').value.trim(),
    };

    try {
      await updateDoc(doc(db, 'guests', guest.id), { rsvp: newRsvp });
      close();
      renderGuestsTab();
    } catch (e) {
      errEl.textContent = e.message || 'Erreur lors de l\'enregistrement.';
      errEl.hidden = false;
      saveBtn.disabled = false;
    }
  });
}
```

- [ ] **Step 2 : Mettre à jour le call site**

Trouver (ligne ~326) :
```js
openRsvpDetail(guests.find(g => g.id === guestId), eventById);
```

Remplacer par :
```js
openRsvpPanel(guests.find(g => g.id === guestId), eventById);
```

- [ ] **Step 3 : Test manuel**

1. Ouvrir le backoffice → onglet Invités
2. Cliquer "Réponse" sur un invité ayant répondu → vérifier que le panneau s'ouvre avec les champs pré-remplis
3. Modifier le nombre d'adultes (ex : 1 → 2)
4. Cliquer "Enregistrer" → panneau se ferme, liste se recharge
5. Rouvrir "Réponse" → valeur mise à jour ✓
6. Aller sur le Dashboard → compteur reflète la nouvelle valeur ✓
7. Tester "Annuler" → pas de modification ✓
8. Tester avec un invité sans RSVP (`guest.rsvp` absent) → panneau s'ouvre avec valeurs vides ✓

- [ ] **Step 4 : Commit**

```bash
rtk git add admin/guests.js && rtk git commit -m "feat: rsvp admin editor — openRsvpPanel remplace openRsvpDetail"
```
