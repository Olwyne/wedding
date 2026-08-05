# Multi-utilisateurs back office — permissions par section

**Date :** 2026-08-05
**Projet :** Sophie & Ruiyuan — site de mariage
**Scope :** Gestion de comptes admin multiples avec permissions granulaires par section (lecture / modification / aucun accès), création de compte sans backend, page "Mon compte".

---

## 1. Contexte / problème

Le back office (`admin/`) utilise Firebase Auth email/password (`admin/auth.js`). Tout utilisateur authentifié a un accès complet en lecture/écriture à toutes les collections (`firestore.rules` : `allow write: if request.auth != null`). Les comptes sont créés manuellement dans la console Firebase — pas d'UI de gestion.

La mariée veut inviter d'autres personnes (le marié, les témoins) à consulter le back office, avec un contrôle fin de ce que chacun peut voir/modifier, et une possibilité d'étendre ce contrôle aux futurs onglets qui seront ajoutés au fil du temps.

## 2. Objectif

- Compte existant (sophbyr@gmail.com) reste admin complet par défaut.
- Depuis l'admin, créer de nouveaux comptes avec, pour chaque section, un niveau d'accès : **aucun** / **lecture** / **modification**.
- Une section à "aucun" est invisible dans la sidebar pour cet utilisateur.
- Le système de permissions est piloté par une liste centrale de sections, pour accueillir facilement de futurs onglets sans refonte.
- Chaque utilisateur peut changer son propre mot de passe depuis une page "Mon compte".
- Pas de backend serveur disponible (site statique + Firebase + EmailJS) — la création de compte doit fonctionner en pur client.

## 3. Modèle de données

### 3.1 Registre des sections — `admin/sections-registry.js`

```js
export const SECTIONS = [
  { id: 'blocks', label: 'Blocs',       collection: 'blocks' },
  { id: 'guests', label: 'Invités',     collection: 'guests' },
  { id: 'events', label: 'Événements',  collection: 'events' },
  { id: 'users',  label: 'Utilisateurs', collection: 'admins' },
];
```

Source unique utilisée par : la sidebar (quels onglets afficher), la page Utilisateurs (grille de permissions), et sert de référence pour écrire les règles Firestore associées (pattern répété par section, pas de génération automatique des règles).

Accueil (dashboard) n'est **pas** dans ce registre : toujours visible, lecture seule, aucune permission stockée.

Ajouter un futur onglet = ajouter une ligne ici + son `tab-panel` HTML + le bloc de règles Firestore correspondant (copié du pattern existant). Pas de migration de schéma nécessaire côté `permissions` (objet ouvert, clé = id de section).

### 3.2 Collection `admins/{uid}`

```js
{
  email: "temoin@example.com",
  permissions: {
    blocks: 'none' | 'read' | 'write',
    guests: 'none' | 'read' | 'write',
    events: 'none' | 'read' | 'write',
    users:  'none' | 'read' | 'write',
  },
  createdAt: "ISO",
  createdBy: "<uid créateur>",
}
```

`write` implique l'accès lecture (pas de case séparée). Une clé de section absente équivaut à `'none'`.

## 4. UI Admin

### 4.1 Sidebar dynamique

Pour chaque entrée de `SECTIONS`, l'onglet n'est rendu que si `permissions[section.id] !== 'none'`. Accueil toujours rendu en premier. Les vues de section (`blocks.js`, `guests.js`, `events.js`) désactivent les contrôles de création/édition/suppression si la permission est `'read'` (affichage seul, boutons masqués/désactivés).

### 4.2 Nouvel onglet "Utilisateurs" (`admin/users.js`)

Visible si `permissions.users !== 'none'`.

- **Liste** : tous les documents `admins/*` avec leur email et un résumé des permissions.
- **Formulaire de création** (visible seulement si `permissions.users === 'write'`) :
  - email
  - mot de passe généré aléatoirement à la soumission (12 caractères, alphanumérique), affiché une fois dans une boîte avec bouton "copier" — à transmettre manuellement à la personne.
  - pour chaque section du registre : sélecteur aucun/lecture/modification.
- **Édition** d'un utilisateur existant : modifier ses permissions (pas son mot de passe — la personne le change elle-même via "Mon compte").

### 4.3 "Mon compte"

Bouton dans le pied de la sidebar, à côté de "Se déconnecter". Ouvre un panneau simple : email (lecture seule), champ nouveau mot de passe + confirmation. Utilise `updatePassword` de Firebase Auth (avec `reauthenticateWithCredential` si Firebase exige une session récente). Accessible à tous les comptes, indépendamment des permissions de section.

## 5. Création de compte sans backend

Le SDK Firebase Auth côté client connecte automatiquement l'utilisateur nouvellement créé (`createUserWithEmailAndPassword`), ce qui déconnecterait la session admin en cours. Contournement standard : une **deuxième instance Firebase App** initialisée à la volée dans `admin/users.js` :

```js
import { initializeApp, deleteApp } from 'firebase-app.js';
import { getAuth, createUserWithEmailAndPassword, signOut } from 'firebase-auth.js';

const secondaryApp = initializeApp(firebaseConfig, 'secondary-' + Date.now());
const secondaryAuth = getAuth(secondaryApp);
const cred = await createUserWithEmailAndPassword(secondaryAuth, email, generatedPassword);
await signOut(secondaryAuth);
await deleteApp(secondaryApp);
// puis écrire le doc admins/{cred.user.uid} depuis la session principale
```

La session de l'admin qui crée le compte n'est jamais affectée.

## 6. Règles Firestore

Remplacer les règles actuelles par une fonction de permission basée sur `admins/{uid}` :

```
function perm(section) {
  return get(/databases/$(database)/documents/admins/$(request.auth.uid)).data.permissions[section];
}

match /admins/{uid} {
  allow get: if request.auth != null && request.auth.uid == uid;
  allow get, list: if perm('users') in ['read', 'write'];
  allow create, update, delete: if perm('users') == 'write';
}

match /blocks/{id} {
  allow read: if true;
  allow write: if perm('blocks') == 'write';
}

match /guests/{id} {
  allow get: if true;
  allow list: if perm('guests') in ['read', 'write'];
  allow create, delete: if perm('guests') == 'write';
  allow update: if perm('guests') == 'write'
    || request.resource.data.diff(resource.data).affectedKeys().hasOnly(['rsvp']);
}

match /events/{id} {
  allow read: if true;
  allow write: if perm('events') == 'write';
}
```

Note : `allow get` sur son propre doc `admins/{uid}` doit rester ouvert à tout utilisateur authentifié (pas seulement ceux avec permission `users`), sinon un utilisateur ne peut pas lire ses propres permissions pour construire sa sidebar — d'où la règle combinée ci-dessus (self-read toujours permis, list/get des autres nécessite `users: read|write`).

`blocks` et `events` gardent une lecture publique (`allow read: if true`) comme aujourd'hui — seule l'écriture est concernée par les permissions.

## 7. Migration

Script one-shot (ex. étendre `admin/seed.js` ou nouveau `admin/seed-admins.js`, exécuté une fois manuellement) qui crée `admins/{uid}` pour le compte existant sophbyr@gmail.com avec :
```js
permissions: { blocks: 'write', guests: 'write', events: 'write', users: 'write' }
```
Ce document doit exister **avant** le déploiement des nouvelles règles Firestore, sinon le compte perd l'accès (les règles dépendent de `admins/{uid}`).

## 8. Hors scope

- Envoi automatique d'email d'identifiants (EmailJS) — transmission manuelle du mot de passe généré.
- Suppression de compte depuis l'UI (peut être ajouté plus tard dans le même onglet Utilisateurs).
- Récupération de mot de passe oublié ("mot de passe oublié" standard Firebase) — non demandé, peut être ajouté séparément.
- Permissions plus fines que lecture/modification (ex. suppression séparée de la création) — un seul niveau "modification" couvre create/update/delete.
