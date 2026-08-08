# Onglets To-Do & Calendrier — design

## Objectif

Deux nouveaux onglets admin liés : **To-Do** (liste de tâches) et **Calendrier** (vue mensuelle des tâches ayant une échéance). Tâches d'organisation générales (relances, préparatifs) ou liées à un invité/prestataire précis.

## Modèle de données

Nouvelle collection Firestore `tasks` :

```js
{
  title: string,
  description: string,          // texte simple, optionnel
  status: 'todo' | 'in_progress' | 'done',
  dueDate: string | null,       // 'YYYY-MM-DD', optionnel
  linkedType: 'none' | 'guest' | 'vendor',
  linkedId: string | null,      // id dans guests ou vendors, selon linkedType
  assignedTo: string | null,    // uid dans admins, optionnel
  order: number,                // tri dans la liste To-Do
  createdAt: string,            // ISO
}
```

Une seule collection alimente les deux onglets. To-Do affiche tout ; Calendrier affiche uniquement les tâches avec `dueDate` non-null.

## Permissions

Deux entrées séparées dans `admin/sections-registry.js` (même collection, droits indépendants) :

```js
{ id: 'todo', label: 'To-Do', collection: 'tasks' },
{ id: 'calendar', label: 'Calendrier', collection: 'tasks' },
```

Apparaissent automatiquement dans la grille de permissions par utilisateur (`admin/users.js`, qui boucle déjà sur `SECTIONS`) — aucune modification de `users.js` nécessaire.

`firestore.rules` :

```
match /tasks/{taskId} {
  allow read: if perm('todo') in ['read','write'] || perm('calendar') in ['read','write'];
  allow write: if perm('todo') == 'write' || perm('calendar') == 'write';
}
```

Les deux onglets ont un droit "write" à sens réel : chacun peut créer/modifier/supprimer des tâches (voir Interaction Calendrier ci-dessous).

## Nouveaux fichiers / câblage

- `admin/tasks-shared.js` — `loadTasks()`, `openTaskPanel(id, tasks, defaults)` (panneau de création/édition partagé entre les deux onglets).
- `admin/todo.js` — exporte `renderTodoTab()`.
- `admin/calendar.js` — exporte `renderCalendarTab()`.
- `admin/index.html` — deux boutons nav (`data-section="todo"`, `data-section="calendar"`) + panels `tab-todo`, `tab-calendar`.
- `admin/script.js` — import des deux renderers, ajout à `RENDER_BY_ID` et `SLUG_BY_SECTION` (slugs `todo`, `calendar`).
- `admin/styles.css` — badges de statut, overrides FullCalendar pour cohérence thème clair/sombre existant.

## UI — onglet To-Do

Table triée par `order`, colonnes : Titre / Statut / Échéance / Lié à / Assigné / Actions.

- Pills de filtre en haut : Toutes / À faire / En cours / Terminé (filtrage client, pas de requête séparée).
- Case à cocher rapide par ligne pour bascule directe vers "Terminé" sans ouvrir le panneau.
- Bouton "+ Ajouter une tâche" si `canWrite('todo')`, ouvre `openTaskPanel(null, tasks)`.
- Bouton "Modifier" par ligne ouvre `openTaskPanel(id, tasks)`.

Panneau (`openTaskPanel`) :

- Titre (requis)
- Description (textarea simple)
- Statut (select : À faire / En cours / Terminé)
- Échéance (input date, optionnel)
- Lié à : select type (Aucun / Invité / Prestataire) → si non-Aucun, second select recherchant parmi `guests` ou `vendors` déjà chargés
- Assigné à : select parmi `admins` chargé (optionnel)

## UI — onglet Calendrier

FullCalendar (CDN, script + CSS), vue mois par défaut. Chargement dynamique du script au premier accès à l'onglet (pas chargé si l'utilisateur ne visite jamais ce tab).

- Events = tâches avec `dueDate` non-null. Couleur par statut : à faire = gris, en cours = orange, terminé = vert (texte barré).
- Clic sur un événement → `openTaskPanel(task.id, tasks)`.
- Clic sur un jour vide → `openTaskPanel(null, tasks, { dueDate: dateCliquée })`, seulement si `canWrite('calendar')`.
- `editable: true` si `canWrite('calendar')` — glisser un événement vers un autre jour met à jour `dueDate` via `updateDoc`.
- Lecture seule (`canRead` sans `canWrite`) : pas de clic-jour, pas de drag ; clic événement ouvre le panneau en lecture seule (champs disabled, pas de bouton Enregistrer).
- Tâches sans `dueDate` n'apparaissent jamais ici.

## Requêtes / index

- To-Do : `orderBy('order')`.
- Calendrier : `orderBy('dueDate')`.
Un seul `orderBy` par requête, pas de filtre combiné côté serveur → aucun index composite Firestore requis. Le filtrage par statut (pills To-Do) se fait côté client.

## Erreurs / cas limites

- Tâche liée à un invité/prestataire supprimé entre-temps : affichage "—" à la place du nom lié (lookup échoue silencieusement), cohérent avec le niveau de rigueur du reste de l'admin.
- `updateDoc` échoué (ex. réseau) sur un drag calendrier : log console, pas de rollback visuel spécifique (le prochain re-render corrigera l'affichage).

## Hors scope

- Pas de notifications/rappels (email, push).
- Pas de vue semaine/jour dans le calendrier (mois uniquement).
- Pas de sous-tâches ni de tags/catégories au-delà de `linkedType`.
- Pas de récurrence de tâches.
