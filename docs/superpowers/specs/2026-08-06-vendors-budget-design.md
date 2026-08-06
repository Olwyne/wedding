# Onglets Prestataires & Budget — Design

Date : 2026-08-06

## Contexte

Le back-office (`admin/`) a une nav par sections déclarées dans [sections-registry.js](../../../admin/sections-registry.js), chacune avec sa collection Firestore, ses droits `read`/`write` par admin (`permissions.js`), et un fichier de rendu (`renderXTab`) suivant le pattern CRUD déjà en place dans [events.js](../../../admin/events.js) (table + panel overlay pour créer/modifier).

Besoin : suivre les prestataires (contacts, statut, montants) et un budget global agrégé à partir de ces prestataires.

## Architecture

Deux nouvelles sections indépendantes, ajoutées à `sections-registry.js` :

```js
{ id: 'vendors', label: 'Prestataires', collection: 'vendors' },
{ id: 'budget',  label: 'Budget',       collection: 'vendors' }, // lecture seule agrégée, pas de collection propre
```

- `admin/vendors.js` — CRUD complet sur la collection Firestore `vendors`, même structure que `events.js` (table + panel overlay).
- `admin/budget.js` — pas de CRUD sur des dépenses ; lit `loadVendors()` (exporté par `vendors.js`, comme `dashboard.js` réutilise `loadGuests`/`loadEvents`) et agrège. Le seul écrit propre à cet onglet est la cible budgétaire globale, stockée dans un document `settings/budget` (`{ target: number }`).
- Nav (`index.html`, `script.js`) : deux boutons `nav-item` supplémentaires (`data-section="vendors"` et `data-section="budget"`), entrées dans `RENDER_BY_ID` et `SLUG_BY_SECTION` (`vendors` → `/admin/vendors/`, `budget` → `/admin/budget/`).
- Permissions : `vendors` et `budget` deviennent deux droits distincts, gérables séparément par admin dans `users.js` (comme `guests`, `events`, etc.).

## Modèle de données

### `vendors` (collection Firestore)

| Champ | Type | Notes |
|---|---|---|
| `category` | string | ex. traiteur, photographe, DJ, lieu, fleuriste — texte libre |
| `name` | string | requis |
| `contact` | string | tél/email, texte libre |
| `status` | string | `contacted` \| `booked` \| `paid` |
| `total` | number | montant total prévu |
| `deposit` | number | montant déjà versé |
| `dueDate` | string (ISO date) | optionnel, prochaine échéance |
| `link` | string (URL) | optionnel, devis/contrat |
| `notes` | string | optionnel |

### `settings/budget` (document unique)

| Champ | Type |
|---|---|
| `target` | number |

## UI

### Onglet Prestataires

Table triée par catégorie puis nom : Catégorie, Nom, Statut (badge coloré selon `contacted`/`booked`/`paid`), Total, Versé, Reste (`total - deposit`), Échéance, Actions.

Panel création/édition (overlay, comme `openEventPanel`) : tous les champs listés ci-dessus. `category` et `status` en `<select>` avec options fixes ; `link` en input type url, optionnel ; validation minimale (name requis, total/deposit ≥ 0).

Droits : bouton "+ Ajouter" et actions Modifier/Supprimer visibles seulement si `canWrite('vendors')`.

### Onglet Budget

1. Bandeau haut : cible globale (éditable inline si `canWrite('budget')`, sinon affichage seul), total engagé (somme `total` de tous les vendors), total versé (somme `deposit`), barre de progression versé/cible.
2. Tableau récap par catégorie (calqué sur `renderEventStats` de `dashboard.js`) : Catégorie, Engagé, Versé, Reste.

Lecture seule pour tous si `!canWrite('budget')` (la cible ne s'édite pas, le reste est toujours en lecture pure car dérivé des vendors).

## Erreurs / cas limites

- Pas de vendors → tableau vide + message "Aucun prestataire" (comme les autres tabs vides).
- `settings/budget` inexistant → `target` traité comme `0`, pas d'erreur bloquante (mêmes `try/catch` que `permissions.js`/`dashboard.js`).
- Suppression d'un vendor → `confirm()` puis `deleteDoc`, identique à `events.js`.

## Hors scope

- Pas d'upload de fichiers (devis/contrats) : `link` est une URL externe, pas de stockage Firebase Storage.
- Pas d'historique de paiements (un seul `deposit` cumulatif, pas de journal de transactions).
- Pas de conversion devise ni de graphiques.
