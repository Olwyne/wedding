# Comparaison prestataires — design

## Objectif

Permettre de noter plusieurs prestataires candidats pour une même catégorie (ex. 3 photographes) avant de se décider, marquer celui qu'on préfère sans le confirmer, et distinguer un prestataire rejeté d'un prestataire réellement engagé — sans polluer le budget avec des devis non retenus.

## Modèle de données

Extension du champ `status` existant sur `vendors` (actuellement `contacted | booked | paid`) :

```js
status: 'candidat' | 'contacted' | 'booked' | 'paid' | 'rejected'
```

Nouveau champ optionnel :

```js
preferred: boolean  // pertinent seulement si status === 'candidat'
```

Pas de nouvelle collection, pas de nouvelle permission — reste sous `vendors`/`budget` existants.

## UI — onglet Prestations (`admin/vendors.js`)

- Pills de filtre par statut en haut de la table (Tous / Candidat / Contacté / Réservé / Payé / Rejeté), filtrage client, même pattern que les pills de statut du To-Do.
- Table inchangée sinon (déjà triée par catégorie puis nom — les candidats d'une même catégorie apparaissent groupés naturellement, pas de vue de comparaison séparée nécessaire).
- Sur une ligne au statut `candidat` : badge "★ Préféré" si `preferred === true`, sinon bouton "Marquer préféré". Cliquer le bouton marque ce candidat comme préféré et démarque automatiquement tout autre candidat préféré de la même catégorie (contrainte client uniquement, un seul préféré par catégorie, cohérent avec le cap 2-témoins existant qui est aussi non-serveur).
- Le select "Statut" du panneau d'édition (`openVendorPanel`) s'étend aux 5 valeurs : Candidat / Contacté / Réservé / Payé / Rejeté.
- Passer un prestataire à un statut autre que `candidat` (ex. Contacté) réinitialise implicitement sa pertinence de `preferred` — le champ reste en base mais n'a plus d'effet, cohérent avec le calcul budget ci-dessous qui ne regarde `preferred` que pour `status === 'candidat'`.

## Budget (`admin/budget.js`)

Nouveau calcul, remplace le comportement actuel qui sommait tous les prestataires sans filtre de statut :

- **Engagé** = somme des `total` des prestataires au statut `contacted`, `booked` ou `paid` uniquement. `candidat` et `rejected` exclus.
- **Estimé** (nouvelle ligne, sous "Engagé" dans le résumé global) = Engagé + somme des `total` des candidats avec `preferred === true`.
- **Versé** inchangé (basé sur `payments`, jamais rempli pour un candidat en pratique, donc non affecté par ce changement).
- Table par catégorie (`computeCategoryStats`) : la colonne "Engagé" applique le même filtre (candidat/rejeté exclus) — corrige au passage le même bug qu'au niveau global. Pas de colonne "Estimé" par catégorie, cette notion reste globale pour limiter le scope.

## Erreurs / cas limites

- Deux candidats marqués préféré simultanément dans la même catégorie via deux onglets ouverts en parallèle (race) : dernier `updateDoc` gagnant, incohérence visuelle possible jusqu'au prochain rechargement — non géré, cohérent avec le niveau de rigueur du reste de l'admin (même situation déjà tolérée pour le cap témoins).
- Un candidat préféré supprimé : disparaît simplement, le total Estimé se recalcule au prochain chargement de l'onglet Budget.

## Hors scope

- Pas de vue de comparaison dédiée (côte à côte) — le filtre par statut + tri existant par catégorie suffit.
- Pas de limite serveur (Firestore rules) sur un seul préféré par catégorie.
- Pas de colonne "Estimé" par catégorie dans le tableau budget détaillé.
- Pas de notification/rappel lors du choix d'un prestataire.
