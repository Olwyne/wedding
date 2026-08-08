# Onglet Déroulé jour-J — design

## Objectif

Nouvel onglet admin "Déroulé jour-J" : timeline chronologique interne et détaillée du jour du mariage (montage, arrivées prestataires, cortège, cérémonie, etc.), avec responsable par ligne. Distinct du tab "Événements" existant (programme public bilingue FR/ZH affiché aux invités) — celui-ci est un outil de coordination interne, pas de contenu bilingue, à destination de l'équipe, des témoins et des prestataires.

## Modèle de données

Nouvelle collection Firestore `runOfShow` :

```js
{
  time: string,               // 'HH:MM'
  title: string,
  location: string,           // optionnel
  responsibleType: 'none' | 'vendor' | 'guest',
  responsibleId: string | null,  // id dans vendors ou guests, selon responsibleType
  notes: string,               // optionnel, texte simple
  done: boolean,
}
```

Pas de champs FR/ZH : usage interne uniquement, une seule langue.

## Permissions

Nouvelle entrée dans `admin/sections-registry.js` :

```js
{ id: 'dayof', label: 'Déroulé jour-J', collection: 'runOfShow' },
```

Apparaît automatiquement dans la nav (`admin/script.js`) et la grille de permissions par utilisateur (`admin/users.js`, boucle déjà sur `SECTIONS`) — aucune modification de `users.js` nécessaire.

`firestore.rules` :

```
match /runOfShow/{itemId} {
  allow read: if perm('dayof') in ['read', 'write'];
  allow write: if perm('dayof') == 'write';
}
```

## Nouveaux fichiers / câblage

- `admin/dayof.js` — exporte `renderDayOfTab()`, suit le pattern de `events.js` / `witnesses.js`.
- `admin/index.html` — bouton nav (`data-section="dayof"`) + panel `tab-dayof`.
- `admin/script.js` — import `renderDayOfTab`, ajout dans `RENDER_BY_ID` et `SLUG_BY_SECTION` (slug `dayof`).
- `admin/styles.css` — styles table + règles `@media print` dédiées.

## UI — liste

Table triée par `time`, colonnes : Heure / Titre / Lieu / Responsable / Notes / Fait / Actions.

- Case à cocher "Fait" directement dans la ligne, toggle immédiat (`updateDoc`) sans ouvrir le panneau, visible seulement si `canWrite('dayof')` (sinon case affichée en lecture seule, disabled).
- Bouton "+ Ajouter une ligne" si `canWrite('dayof')`, ouvre le panneau d'édition vide.
- Bouton "Modifier" par ligne ouvre le panneau pré-rempli.
- Bouton "Imprimer" toujours visible (même en lecture seule) au-dessus de la table.

## UI — panneau d'édition

- Heure (`input type="time"`, requis)
- Titre (requis)
- Lieu (optionnel)
- Responsable : select type (Aucun / Prestataire / Invité) → si non-Aucun, second select recherchant parmi `vendors` ou `guests` déjà chargés (même schéma que `linkedType`/`linkedId` du spec todo/calendar)
- Notes (textarea simple)
- Fait (checkbox)

## Impression

Bouton "Imprimer" déclenche `window.print()`. CSS `@media print` dédiée dans `styles.css` :
- Masque nav, sidebar, boutons d'action (Ajouter/Modifier/Supprimer/Imprimer), colonne "Actions".
- Affiche uniquement un titre ("Déroulé jour-J") + la table (Heure / Titre / Lieu / Responsable / Notes), triée par heure, sans état "Fait" (non pertinent sur un document imprimé à l'avance).
- Pas de vue/page séparée : une seule feuille de style, appliquée sur le DOM déjà rendu.

## Requêtes / index

`orderBy('time')` — un seul `orderBy`, aucun index composite Firestore requis.

## Erreurs / cas limites

- Ligne liée à un prestataire/invité supprimé entre-temps : affichage "—" à la place du nom lié (lookup échoue silencieusement), cohérent avec le reste de l'admin (cf. spec todo/calendar).
- `time` en format libre `HH:MM` : pas de validation stricte au-delà du type `input time` du navigateur.

## Hors scope

- Pas de bilinguisme FR/ZH.
- Pas de vue calendrier ni de drag pour réordonner (tri uniquement par `time`).
- Pas d'export PDF généré côté serveur — impression navigateur uniquement.
- Pas de notifications aux responsables.
