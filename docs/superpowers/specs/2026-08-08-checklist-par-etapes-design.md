# Checklist par étapes — design

## Objectif

Ajouter une vue "Checklist" pré-remplie dans l'onglet To-Do existant, groupée par palier temporel (12+ mois avant → semaine du mariage), inspirée des checklists type Bridebook. Coexiste avec la liste libre actuelle dans le même onglet, via un toggle. Aucun nouvel onglet, aucune nouvelle collection Firestore.

## Modèle de données

Extension de la collection `tasks` existante (pas de nouvelle collection, pas de nouvelle permission — reste sous les clés `todo`/`calendar` déjà en place) :

```js
{
  // champs existants inchangés : title, description, status, dueDate, linkedType, linkedId, assignedTo, order, createdAt
  milestone: '12plus' | '9-12' | '6-9' | '3-6' | '1-3' | 'week' | null,
}
```

`null` (ou absent) = tâche libre, comportement actuel inchangé. Une valeur non-null place la tâche dans la vue Checklist, sous le palier correspondant.

Paliers, dans l'ordre d'affichage :

```js
export const MILESTONES = [
  ['12plus', '12+ mois avant'],
  ['9-12', '9-12 mois avant'],
  ['6-9', '6-9 mois avant'],
  ['3-6', '3-6 mois avant'],
  ['1-3', '1-3 mois avant'],
  ['week', 'Semaine du mariage'],
];
```

## UI — onglet To-Do

Deux pills en haut de l'onglet, au-dessus des pills de statut existantes (Toutes/À faire/En cours/Terminé) : **Liste libre** / **Checklist**. État local (pas persisté), comme le filtre de statut actuel.

- **Liste libre** : comportement actuel exact (table, filtres de statut, tri par `order`). Aucun changement de code sur ce chemin, toutes les tâches y compris celles avec `milestone` restent visibles (une tâche checklist reste une tâche comme les autres).
- **Checklist** : tâches filtrées à `milestone != null`, groupées par palier dans l'ordre `MILESTONES`, chaque groupe affiché comme une sous-liste avec titre de palier + items (case à cocher rapide identique à la liste libre, clic sur le titre ouvre le panneau d'édition). Items sans `milestone` exclus de cette vue. Pas de filtre de statut ici — tous les items du palier sont affichés, cochés ou non (le visuel "coché" suffit à distinguer fait/pas fait, cohérent avec une checklist).
- Si aucune tâche n'a de `milestone` défini (première visite, ou tout supprimé) : bouton "Générer la checklist type" affiché à la place de la liste, visible seulement si `canWrite('todo')`. Clic → crée les ~30 items par défaut (voir plus bas) via `addDoc` en série, avec `status: 'todo'`, `dueDate: null`, `order` suivant la position dans la liste globale. Le bouton disparaît dès qu'au moins une tâche a un `milestone` non-null (évite les doublons si on reclique) — pas de protection serveur additionnelle, cohérent avec le niveau de rigueur du reste de l'admin.

## Panneau d'édition (`admin/tasks-shared.js`)

Ajout d'un champ "Palier" (select) dans `openTaskPanel`, pour toute tâche (libre ou checklist) — n'importe quelle tâche libre peut être promue en item de checklist et vice-versa en changeant ce champ :

```
Aucun / 12+ mois avant / 9-12 mois avant / 6-9 mois avant / 3-6 mois avant / 1-3 mois avant / Semaine du mariage
```

Sauvegardé comme `milestone: value === 'none' ? null : value`.

## Lien avec le Calendrier

Aucun changement de code. `admin/calendar.js` affiche déjà toute tâche avec `dueDate` non-null, indépendamment de `milestone`. Un item de checklist n'apparaît au calendrier que si on lui donne une échéance précise via le panneau — comportement déjà existant, juste étendu naturellement aux items checklist puisqu'ils sont des tâches comme les autres.

## Items pré-remplis (seed "Générer la checklist type")

30 items, répartis sur les 6 paliers, `status: 'todo'`, `dueDate: null`, `linkedType: 'none'`, `assignedTo: null` :

**12+ mois avant**
- Définir le budget global
- Établir la liste des invités provisoire
- Choisir la date du mariage
- Réserver le lieu de réception
- Réserver le lieu de cérémonie (si différent)

**9-12 mois avant**
- Réserver le traiteur
- Réserver le photographe
- Réserver le vidéaste
- Réserver la musique / DJ
- Choisir les témoins

**6-9 mois avant**
- Choisir et commander la robe de mariée
- Choisir les costumes
- Réserver le fleuriste
- Réserver l'officiant / la cérémonie
- Envoyer les save-the-date
- Réserver l'hébergement pour les invités

**3-6 mois avant**
- Envoyer les invitations
- Choisir le gâteau
- Réserver les transports
- Choisir les alliances
- Planifier la lune de miel
- Essayage robe/costume

**1-3 mois avant**
- Confirmer le nombre définitif d'invités (RSVP)
- Finaliser le plan de table
- Essayage final robe/costume
- Confirmer les prestataires (horaires, livraisons)
- Préparer le déroulé jour-J
- Récupérer les alliances

**Semaine du mariage**
- Confirmer les derniers détails avec chaque prestataire
- Préparer les paiements finaux (soldes)
- Préparer le kit d'urgence (couture, épingles...)
- Répéter la cérémonie
- Se reposer !

## Erreurs / cas limites

- Seed partiellement échoué (ex. réseau coupé en cours de `addDoc` en série) : items déjà créés restent, le bouton "Générer" ne réapparaît pas (dès qu'un item a un `milestone`, condition remplie) — pas de retry automatique, cohérent avec le reste de l'admin qui ne gère pas ce cas ailleurs.
- Tâche checklist supprimée par erreur : pas de restauration, comportement identique à la suppression d'une tâche libre aujourd'hui.

## Hors scope

- Pas de dates automatiques calculées à partir de la date du mariage (les paliers restent des libellés, pas des `dueDate` pré-calculées).
- Pas de progression visuelle (% complété par palier) — juste la liste avec cases à cocher.
- Pas de personnalisation du contenu des paliers eux-mêmes (les 6 paliers sont fixes, en dur).
- Pas de suppression en masse ni de réinitialisation de la checklist (suppression item par item, comme le reste de l'admin).
