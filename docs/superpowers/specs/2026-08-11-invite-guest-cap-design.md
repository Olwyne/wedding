# Plafond de personnes par invitation + noms attendus + toggle enfants — design

## Contexte

Chaque invitation (`guests/{token}`) représente un couple ou une famille avec un lien unique. Le formulaire RSVP public laisse actuellement saisir jusqu'à 12 adultes et 12 enfants sans lien avec le nombre réel de personnes invitées. Objectifs :
1. Plafonner par invitation, avec les noms des personnes attendues connus à l'avance par l'admin quand possible.
2. Informer clairement l'invité de son max sur le formulaire.
3. Permettre de désactiver globalement les enfants (mariage sans enfants).

## 1. Modèle de données

Sur chaque doc `guests`, ajout de :

```
expectedGuests: [
  { name: "Jean Dupont", type: "adult" },   // name peut être vide ("")
  { name: "", type: "adult" },              // accompagnant sans nom connu
  { name: "", type: "child" },              // enfant sans nom connu
],
maxAdults: 2,     // dérivé: count(expectedGuests, type='adult')
maxChildren: 1,   // dérivé: count(expectedGuests, type='child')
```

`maxAdults`/`maxChildren` sont stockés en plus de `expectedGuests` (dénormalisés) pour que le formulaire public et les règles Firestore n'aient pas besoin de recalculer/lire le tableau complet à chaque fois.

Le champ `name` du doc (titre affiché, ex. "Jean & Marie Dupont") reste séparé et saisi librement — non dérivé de `expectedGuests`.

**Invités existants** (créés avant cette feature, sans `expectedGuests`) : fallback en lecture partout → `maxAdults = guest.maxAdults ?? 1`, `maxChildren = guest.maxChildren ?? 0`, `expectedGuests = guest.expectedGuests ?? [{ name: guest.name, type: 'adult' }]`. Pas de script de migration ; le plafond par défaut (1 adulte / 0 enfant) s'applique immédiatement.

Nouveau doc séparé `settings/general` :

```
{ childrenAllowed: true }
```

## 2. Admin — Panel invité (`admin/guests.js`)

- Remplace les champs numériques par une liste dynamique "Personnes attendues" :
  - Chaque ligne = champ nom (optionnel, placeholder "Nom (optionnel)") + toggle Adulte/Enfant + bouton supprimer.
  - Bouton "+ Ajouter une personne" ajoute une ligne (type adulte par défaut).
  - Si `childrenAllowed === false` (lu depuis `settings/general`), le toggle Enfant est désactivé/grisé sur chaque ligne — impossible de créer une ligne enfant.
  - Ligne sans nom affichée avec placeholder : "Accompagnant" (adulte) / "Enfant (nom inconnu)" (enfant).
- Nouvel invité : 1 ligne pré-remplie par défaut (nom = valeur du champ "Nom" du haut, type adulte).
- Sauvegarde (`setDoc`/`updateDoc`) : calcule `maxAdults`/`maxChildren` depuis les types des lignes, stocke `expectedGuests` + ces 2 nombres dérivés.
- `renderGuestRow` / tableau : nouvelle colonne "Max" affichant ex. `2A / 1E`.

## 3. Admin — Nouvel onglet Paramètres

- Nouvelle entrée dans `SECTIONS` (`admin/sections-registry.js`) : `{ id: 'settings', label: 'Paramètres', collection: 'settings' }`.
- Nouveau `<div id="tab-settings" class="tab-panel" hidden>` dans `admin/index.html`, câblé comme les autres onglets.
- Nouveau module `admin/settings.js` : lit/écrit `settings/general`, affiche un toggle "Enfants autorisés" (défaut activé) + bouton Enregistrer. Respecte `canWrite('settings')` comme les autres sections (lecture seule si permission `read`).
- Accès contrôlé par le système de permissions existant (`admins/{uid}.permissions.settings`).

## 4. Formulaire public (`script.js`)

- Au chargement du guest (~ligne 140-155), stocker `state.rsvp.maxAdults`, `state.rsvp.maxChildren` (fallback comme en section 1), et charger `childrenAllowed` depuis `settings/general`.
- Juste avant les champs adultes/enfants, phrase d'intro dynamique, ex. "Vous êtes invité(s) pour 2 adultes et 1 enfant maximum" (accord singulier/pluriel ; omission de la partie enfants si `maxChildren === 0` ou `childrenAllowed === false`).
- Labels des champs : "Adultes (max 2) *" / "Enfants (max 1) *", valeurs dynamiques.
- Attribut HTML `max` des inputs `#r-adults`/`#r-children` = valeurs dynamiques (remplace le `12` codé en dur). Listeners `input` clampent la valeur saisie à `Math.min(value, max)`.
- **Si `childrenAllowed === false`** : le champ `#r-children` et tout ce qui s'y rattache (label, champs "nom d'enfant" dans `renderExtraPeople`) sont entièrement retirés du DOM du formulaire — pas juste masqués. `state.rsvp.children` forcé à `0` et jamais soumis.

## 5. Firestore rules (`firestore.rules`)

```
match /settings/{settingId} {
  allow read: if true;
  allow write: if perm('settings') == 'write';
}

match /guests/{guestId} {
  allow get: if true;
  allow list: if perm('guests') in ['read', 'write'] || perm('witnesses') in ['read', 'write'] || perm('tables') in ['read', 'write'] || perm('dayof') in ['read', 'write'] || perm('todo') in ['read', 'write'] || perm('calendar') in ['read', 'write'];
  allow create, delete: if perm('guests') == 'write';
  allow update: if perm('guests') == 'write'
    || (request.resource.data.diff(resource.data).affectedKeys().hasOnly(['rsvp'])
        && request.resource.data.rsvp.adults >= 0
        && request.resource.data.rsvp.adults <= (resource.data.maxAdults != null ? resource.data.maxAdults : 1)
        && request.resource.data.rsvp.children >= 0
        && request.resource.data.rsvp.children <= (resource.data.maxChildren != null ? resource.data.maxChildren : 0))
    || (perm('witnesses') == 'write' && request.resource.data.diff(resource.data).affectedKeys().hasOnly(['weddingParty']));
}
```

Le toggle global "enfants autorisés" n'est **pas** re-vérifié dans les rules `guests` (éviterait un `get()` Firestore supplémentaire coûteux à chaque RSVP) — il est appliqué côté client uniquement (le champ enfants disparaît du formulaire). Si `childrenAllowed` repasse à `false` après coup, les RSVP déjà soumis avec des enfants restent inchangés (pas de purge rétroactive).

## Hors scope

- Pas de notification/alerte admin si un invité tente de dépasser son max.
- Pas de gestion des invitations "enfant seul" (`maxAdults = 0`) — l'admin garde au moins une ligne adulte par convention.
- Pas de suppression automatique des enfants existants dans `expectedGuests`/RSVP quand `childrenAllowed` passe à `false` — seule la création de nouvelles lignes/saisies enfant est bloquée.
- Le toggle "enfants autorisés" est global au mariage, pas par événement.
