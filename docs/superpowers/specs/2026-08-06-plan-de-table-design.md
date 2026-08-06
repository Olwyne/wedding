# Onglet "Tables" (plan de salle) — Design

## Contexte

Le back-office admin (`admin/`) a des onglets Blocs, Prestations, Budget, Invités, Événements, Utilisateurs, définis dans [sections-registry.js](../../../admin/sections-registry.js) et rendus via `admin/script.js`. Chaque onglet a son module (`admin/<name>.js`) et sa permission (`canRead`/`canWrite` par section id, stockée sur le doc `admins/{uid}.permissions`).

On ajoute un onglet **Tables** : gérer les tables du lieu de réception (nombre, capacité, position sur un plan) et y placer les invités confirmés/en attente/refusés.

## Modèle de données

Nouvelle collection Firestore `tables` :

```js
{
  id: string,              // doc id (auto)
  name: string,             // "Table 1"
  capacity: number,         // 8
  x: number,                // position canvas, px
  y: number,
  guestIds: string[],       // ids de docs `guests` assignés à cette table
}
```

Le lien invité → table vit sur le doc `table` (tableau `guestIds`), pas sur le doc `guest`. Un invité placé occupe `(g.rsvp.adults ?? 0) + (g.rsvp.children ?? 0) + 1` places (lui-même + adultes suppl. + enfants) — le groupe entier du doc `guest` est indivisible, placé comme un seul bloc sur une seule table.

## UI

- Nouvel item de nav "Tables" dans la sidebar (après Invités), section id `tables`, ajouté à `SECTIONS` dans [sections-registry.js](../../../admin/sections-registry.js) et au HTML de `admin/index.html` (nav-item + tab-panel), au même pattern que les onglets existants.
- Permission : suit le pattern `canRead('tables')` / `canWrite('tables')` déjà en place. Écriture requise pour ajouter/déplacer/assigner ; lecture seule affiche le plan sans drag actif.
- Layout du panel `tab-tables` :
  - **Colonne gauche** : liste des invités (tous statuts RSVP), chaque carte affiche nom + badge de statut (confirmé/en attente/refusé) + nombre de personnes du groupe. Filtre par statut (boutons/segments comme le `btn-group` de Invités).
  - **Colonne droite** : canvas SVG avec les tables en cercles positionnés en `(x, y)`. Chaque cercle affiche nom + `occupés/capacité`.

## Interactions

- **Ajouter une table** : bouton "+ Ajouter une table" (zone `section-action`, comme les autres onglets) ouvre un petit panneau (nom, capacité) → crée le doc `tables`, position par défaut décalée pour ne pas superposer les tables existantes.
- **Déplacer une table** : glisser-déposer le cercle sur le canvas ; `x`/`y` mis à jour dans Firestore au relâchement (pas à chaque frame, pour limiter les writes).
- **Placer un invité** : glisser une carte invité de la colonne gauche sur un cercle-table → ajoute `guest.id` au `guestIds` de la table cible. Un invité déjà placé ailleurs est retiré de son ancienne table automatiquement (jamais sur deux tables).
- **Retirer un invité** : clic sur une table ouvre un mini-panneau listant ses occupants avec un bouton "retirer" chacun (repasse en liste "non placés").
- **Supprimer une table** : bouton dans ce même mini-panneau ; les invités qu'elle contenait redeviennent non placés (leur id retiré du `guestIds`, pas de trace ailleurs à nettoyer puisque le lien vit uniquement sur `tables`).
- **Dépassement de capacité** : si le nombre de personnes dépasse `capacity`, la table s'affiche avec un contour/badge rouge "surbooké X/Y" mais le drop reste autorisé (même pattern que l'avertissement de dépassement budget déjà dans l'app : avertir sans bloquer).

## Edge cases

- Invité supprimé depuis l'onglet Invités : au chargement de l'onglet Tables, filtrer les `guestIds` orphelins (id qui ne correspond plus à un doc `guests` existant) — nettoyage silencieux à la lecture, pas besoin de listener temps réel supplémentaire.
- Table sans invité : reste affichée normalement (cercle vide, `0/capacity`).
- Deux invités avec le même nom : pas un problème, l'assignation se fait par `id` de doc, pas par nom.

## Hors scope (YAGNI pour cette itération)

- Pas de fond de plan de salle (image/plan importé) — canvas neutre.
- Pas de placement individuel par personne (adulte/enfant nommé séparément) — le groupe `guest` reste l'unité indivisible.
- Pas de génération automatique de N tables d'un coup — ajout manuel un par un.
- Pas de suggestion automatique d'assignation (algorithme d'optimisation de placement).

## Sécurité

`firestore.rules` doit gérer la nouvelle collection `tables` avec les mêmes règles de permission par section que les collections existantes (lecture/écriture selon `admins/{uid}.permissions.tables`).
