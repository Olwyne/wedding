# Onglet Témoins — design

## Objectif

Nouvel onglet admin "Témoins" pour gérer, par côté (Marié / Mariée), qui est témoin (max 2 par côté) et qui est garçon/demoiselle d'honneur (illimité), par glisser-déposer depuis la liste des invités.

## Modèle de données

Pas de nouvelle collection. Champ optionnel ajouté aux docs existants de `guests` :

```js
weddingParty: { role: 'temoin' | 'honneur', side: 'marie' | 'mariee' } | null
```

- Une personne n'a qu'un seul rôle à la fois (écrase l'ancien si réassignée).
- `side` ici est indépendant du champ `side` existant du guest (qui représente le côté d'invitation, pas le rôle dans le cortège).
- Absence du champ (ou `null`) = invité disponible dans le pool.

## Nouvelle section admin

- `admin/witnesses.js` exporte `renderWitnessesTab()`, suivant le pattern des autres modules (`guests.js`, `vendors.js`).
- Entrée ajoutée dans `admin/sections-registry.js` : `{ id: 'witnesses', label: 'Témoins', collection: 'guests' }`. Ceci suffit à faire apparaître automatiquement l'onglet dans la nav (`admin/script.js`), le routing par slug, et la grille de permissions par utilisateur (`admin/users.js`) — aucune autre modification de câblage nécessaire.
- `admin/index.html` : ajout d'un bouton nav (`data-section="witnesses"`) et d'un panel `tab-witnesses`.
- `admin/script.js` : import `renderWitnessesTab`, ajout dans `RENDER_BY_ID` et `SLUG_BY_SECTION` (slug `witnesses`).

## Permissions

Suit le système existant `permissions.js` (`canRead`/`canWrite` sur `witnesses`). Lecture seule = drag-drop désactivé, boutons `×` masqués.

## UI / Layout

Deux colonnes, `Marié` | `Mariée`. Chaque colonne :

1. **Témoins** — 2 emplacements fixes (drop targets), placeholder vide si non rempli.
2. **Garçons d'honneur** (colonne Marié) / **Demoiselles d'honneur** (colonne Mariée) — liste ouverte, le drop ajoute en fin de liste.

Sous les deux colonnes : **pool des invités disponibles** — tous les guests dont `weddingParty` est absent/null, affichés en cartes (nom + badge côté d'invitation existant), `draggable="true"`.

Chaque carte assignée (dans un slot témoin ou dans une liste honneur) affiche un bouton `×` pour désassigner (remet `weddingParty` à `null`, la personne revient dans le pool au prochain rendu).

## Interaction (drag-and-drop)

- HTML5 drag-and-drop natif (`dragstart`/`dragover`/`drop`), desktop uniquement — pas de support tactile.
- `dataTransfer` transporte l'id du guest.
- Drop sur un slot témoin :
  - Si le slot est vide → assigne (`updateDoc` avec le nouveau `weddingParty`).
  - Si les 2 slots témoins du côté sont déjà occupés → drop rejeté (pas d'écriture), léger effet visuel (shake) pour signaler le refus.
- Drop sur une liste honneur → ajoute toujours (pas de limite), `updateDoc`.
- On peut aussi glisser une carte déjà assignée directement vers un autre slot/liste pour la réassigner (pas besoin de repasser par le pool).
- Après chaque `updateDoc` réussi, la vue se rafraîchit (re-fetch des guests, re-render des colonnes + pool).

## Erreurs / cas limites

- Guest supprimé entre le chargement et un drop : `updateDoc` échouera silencieusement en erreur console ; pas de gestion spéciale (cas rare, cohérent avec le reste de l'admin qui ne gère pas ce cas ailleurs).
- Aucune validation serveur (Firestore rules) ajoutée pour la limite de 2 témoins — c'est une contrainte d'UX côté client uniquement, cohérent avec le niveau de rigueur du reste de l'admin (pas de rules complexes existantes pour les autres contraintes métier).

## Hors scope

- Pas de support tactile/mobile.
- Pas de cumul de rôles.
- Pas de limite configurable pour les slots témoins (2 est en dur, comme demandé).
- Pas de nouvelle collection Firestore ni de règles de sécurité additionnelles.
