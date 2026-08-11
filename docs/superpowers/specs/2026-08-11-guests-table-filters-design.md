# Filtres et épuration du tableau Invités — design

## Contexte

Le tableau Invités (`admin/guests.js`, `renderGuestsTab`) affiche actuellement 9 colonnes (Nom, Côté, Max, Événements, RSVP, Adultes, Enfants, Lien, Actions) sans aucun filtre. Avec le nombre d'invités qui grandit, la ligne est illisible et il n'y a aucun moyen de restreindre la vue par événement ou par statut RSVP.

## Filtres

Deux groupes de pills au-dessus du tableau, état gardé en mémoire JS (module-level, comme `currentFilter` dans `admin/vendors.js`), réinitialisé à chaque rechargement de l'onglet :

- **Par événement** (multi-sélection) : une pill "Tous les événements" + une pill par événement existant (`loadEvents()`, déjà chargé dans `renderGuestsTab`). Plusieurs pills actives simultanément. Un invité passe le filtre s'il est assigné à **au moins un** des événements sélectionnés (OR). "Tous les événements" désélectionne les autres et affiche tout le monde.
- **Par statut RSVP** (mono-sélection) : pills "Tous / Confirmés / En attente / Refusés", une seule active à la fois — même pattern que le filtre statut existant dans `admin/vendors.js`.

Les deux filtres se combinent en ET : un invité est affiché s'il passe le filtre événement **et** le filtre statut.

## Ligne épurée

La colonne "Événements" (pills par ligne) est retirée du tableau. L'information reste consultable dans le panel d'édition d'un invité (déjà présente via `event-cards`) et dans le détail RSVP (`openRsvpDetail`, déjà présente via `eventList`).

Colonnes finales : Nom | Côté | Max | RSVP | Adultes | Enfants | Lien | Actions.

## Menu d'actions (⋮)

La colonne "Actions" devient un seul bouton icône "⋮" par ligne. Un clic ouvre un petit menu contextuel avec les actions disponibles selon les droits :
- Lecture seule : "Réponse" uniquement.
- Écriture : "Réponse", "Modifier", "Supprimer".

Le menu se ferme au clic sur une action ou au clic en dehors du menu. Nouveau composant CSS (`.action-menu`, `.action-menu-btn`, `.action-menu-item`) — rien d'équivalent n'existe encore dans `admin/styles.css`, positionnement absolu ancré au bouton ⋮, fermeture au clic extérieur via un listener sur `document`.

Le bouton "Copier le lien" (icône dédiée, hors du menu ⋮ aujourd'hui) reste tel quel, en dehors du menu — c'est une action fréquente à un clic, pas une action destructive/secondaire.

## Hors scope

- Pas de persistance des filtres entre rechargements de page/onglet.
- Pas de filtre combiné multi-statut (mono-sélection uniquement pour le statut).
- Le bouton copier-lien n'est pas déplacé dans le menu ⋮.
