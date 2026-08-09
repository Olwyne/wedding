# Vue frise drag & drop — Déroulé jour-J — design

## Objectif

Extension de l'onglet "Déroulé jour-J" (`admin/dayof.js`, [2026-08-08-day-of-timeline-design.md](2026-08-08-day-of-timeline-design.md)). Aujourd'hui : liste triée par heure de début uniquement. Ajout d'une vue frise chronologique type agenda (heures en colonne, lanes en parallèle : Général / Mariée / Marié / Témoins...), avec blocs déplaçables et redimensionnables à la souris, en plus de la vue tableau existante qui reste disponible.

## Modèle de données

`runOfShow` — ajoute deux champs au schéma existant :

```js
{
  time: string,          // 'HH:MM' — inchangé
  endTime: string,        // 'HH:MM' — nouveau, optionnel (absent = durée par défaut 30min en frise)
  laneId: string | null,  // nouveau, id dans timelineLanes ; null/absent = lane "Général"
  // title, location, responsibleType, responsibleId, notes, done — inchangés
}
```

Nouvelle collection `timelineLanes` :

```js
{
  label: string,   // ex: 'Mariée'
  order: number,   // ordre d'affichage des colonnes
  color: string,   // hex, pour le bloc dans la frise
}
```

Une lane "Général" est créée par défaut au premier chargement si `timelineLanes` est vide (seed implicite, pas de script séparé). Elle ne peut pas être supprimée.

## Permissions

Pas de nouvelle entrée `SECTIONS` : `timelineLanes` suit les mêmes permissions que `dayof` (`perm('dayof')`), pas une section à part dans le menu utilisateurs.

`firestore.rules` :

```
match /timelineLanes/{laneId} {
  allow read: if perm('dayof') in ['read', 'write'];
  allow write: if perm('dayof') == 'write';
}
```

## UI — bascule Tableau / Frise

Bouton toggle en haut de l'onglet (à côté de "Imprimer"), état gardé en mémoire (pas persisté). Vue tableau = comportement actuel + 2 colonnes ("Heure fin", "Lane"). Vue frise = nouveau composant.

## UI — vue frise, desktop (≥768px)

- Grille CSS : colonne fixe heures (ex. toutes les heures pleines, ticks visuels), une colonne par lane triée par `order`.
- Bloc par item, positionné en `top`/`height` calculés depuis `time`/`endTime` (échelle : 1 minute = N px constant).
- Couleur du bloc = `timelineLanes.color` de sa lane.
- Poignée de resize en bas du bloc (zone ~6px, curseur `ns-resize`) : drag modifie `endTime` seul, clampé à `time + 15min` minimum.
- Drag du corps du bloc : déplace `time`+`endTime` ensemble (durée conservée), snap 15min (`Math.round(minutes / 15) * 15`).
- Clic simple (sans mouvement de drag) sur un bloc ouvre le panneau d'édition existant (`openDayOfPanel`), y compris pour changer titre/responsable/notes/lane.
- `updateDoc` déclenché au `mouseup` / `dragend`, pas à chaque frame — un seul write Firestore par manipulation.

## UI — vue frise, mobile (<768px)

- Onglets horizontaux (un par lane, scrollables si besoin) au-dessus de la frise.
- Une seule colonne (lane active) affichée à la fois, même mécanique drag/resize.
- Bascule d'onglet ne modifie aucune donnée, juste le filtre d'affichage.

## UI — gestion des lanes

Petit panneau (bouton "Gérer les lanes" à côté du toggle Tableau/Frise) :
- Liste des lanes avec label, couleur (color picker), boutons monter/descendre (réordonne `order`), supprimer.
- Ajouter une lane : label + couleur.
- "Général" toujours en première position, non supprimable, non réordonnable.
- Suppression d'une lane : tous les `runOfShow` avec ce `laneId` repassent à `laneId: null` (repli sur "Général") via un batch `updateDoc` avant de supprimer le doc de lane.

## Erreurs / cas limites

- `endTime` absent (données existantes créées avant cette feature) : frise affiche un bloc de 30min par défaut à partir de `time`, tableau affiche "—" dans la colonne Heure fin tant que non édité.
- Chevauchement de deux items dans la même lane : autorisé, blocs superposés visuellement (pas de détection/blocage en v1 — YAGNI, l'utilisateur voit le chevauchement à l'œil).
- Resize ramenant `endTime` avant `time` : bloqué, clamp automatique à `time + 15min`.
- Drag hors limites de la journée (avant 00:00 ou après 23:59) : bloqué, clamp aux bornes de la grille affichée.
- Lecture seule (`!canWrite('dayof')`) : drag/resize désactivés (pas de listeners posés), clic sur bloc n'ouvre pas le panneau d'édition (cohérent avec la vue tableau existante qui masque déjà les actions).

## Hors scope

- Pas de détection/alerte de conflit entre items d'une même lane.
- Pas de vue "plusieurs jours" — un seul jour-J, pas de navigation date.
- Pas de drag entre lanes (changer la lane d'un item se fait via le panneau d'édition, select existant).
- Pas de zoom/échelle réglable par l'utilisateur sur la frise (échelle fixe).
- Pas de persistance du choix Tableau/Frise entre sessions.
