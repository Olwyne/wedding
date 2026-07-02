# Back office invités — design

Date: 2026-07-02
Status: approved (pending spec review)

## Contexte

Le site actuel (`index.html` / `styles.css` / `script.js`) est 100% statique : aucun backend, aucune base de données. L'accès invité passe par des codes partagés (`?invite=FAMILLE`, `?invite=AMIS`, etc.) mappés à deux groupes fixes (`complet` / `mairie_soiree`), et le formulaire RSVP est purement local (aucune donnée n'est réellement envoyée ni conservée).

Besoin : un back office où gérer la liste des invités individuellement — qui vient à quel événement, de quel côté (marié / mariée / les deux), avec un lien d'invitation personnel par invité, et voir dans un tableau si chacun a confirmé sa présence (et à quels événements).

Ça suppose un vrai backend partagé entre le back office (écriture) et le site invité (lecture + écriture RSVP). Backend choisi : **Firebase** (Firestore + Authentication), en JS SDK modulaire via CDN — pas de bundler, cohérent avec l'approche "site statique sans étape de build" du reste du projet.

## Modèle de données (Firestore)

### Collection `events`

Remplace l'objet `EVENTS` codé en dur dans `script.js`. ID de doc = slug stable, identique aux IDs actuels : `the`, `resto`, `mairie`, `soiree`.

Champs :
- `order` (number)
- `zh` (glyphe, ex. `茶`)
- `time_fr`, `time_zh` (string)
- `title_fr`, `title_zh` (string)
- `place_fr`, `place_zh` (string)
- `desc_fr`, `desc_zh` (string)

Éditable depuis l'onglet Événements du back office.

### Collection `guests`

Nouvelle. **ID de doc = le token d'invitation lui-même** (chaîne aléatoire URL-safe, ex. `nX7qP2mK9a`), généré à la création. Le lien d'invitation est donc littéralement `https://.../?invite=<docId>` — une recherche d'invité est un `get` direct par ID, jamais un `list`.

Champs :
- `name` (string) — nom saisi par l'admin
- `side` (`'marie' | 'mariee' | 'deux'`) — métadonnée admin uniquement, n'affecte pas le site invité
- `assignedEvents` (string[]) — IDs d'événements auxquels cet invité est convié
- `createdAt` (timestamp)
- `rsvp` (object) :
  - `status`: `'pending' | 'confirmed'`
  - `name` (string, saisi par l'invité sur le formulaire)
  - `adults` (number)
  - `children` (number)
  - `diet` (string)
  - `message` (string)
  - `confirmedEvents` (`{ [eventId]: boolean }`)
  - `respondedAt` (timestamp | null)

Tout le reste du site (hero, histoire, infos pratiques, hébergement, cadeau, dress code, galerie, footer) reste codé en dur, inchangé — hors périmètre.

## Auth & règles de sécurité

Pas de page d'inscription publique. Le·s compte·s admin (Sophie / Ruiyuan) sont créés manuellement dans la console Firebase (Authentication → email/mot de passe). Le back office n'a qu'un écran de connexion classique.

Règles Firestore :

- **`events`** : `read: true` (public, nécessaire au site invité) · `write: if request.auth != null` (admin uniquement)
- **`guests`** :
  - `get: true` (n'importe qui avec le token exact peut lire *son propre* doc)
  - `list: if request.auth != null` (impossible d'énumérer la liste complète sans être connecté — empêche le brute-force des liens)
  - `create`, `delete` : admin uniquement
  - `update` : admin uniquement, **sauf** si l'écriture ne touche que le champ `rsvp` (permet à l'invité de répondre sans compte, mais l'empêche de modifier `assignedEvents`, `name` ou `side`)

## Back office (`admin/`)

Nouveau dossier `admin/index.html` + `admin/script.js` + `admin/styles.css` — même approche HTML/CSS/JS brut que le site principal, palette réutilisée mais UI utilitaire simple (outil interne, pas une pièce de design invité).

**Écran de connexion** : email + mot de passe (Firebase Auth). Erreur inline si échec.

**Onglet Invités** (vue par défaut) : tableau avec colonnes — Nom, Côté, Événements assignés (chips), Statut RSVP (badge "En attente" gris / "Confirmé" vert), Adultes, Enfants, Régime, Message, Lien (bouton copier), Actions (Modifier / Supprimer). Tri simple par colonne ; pas de filtres avancés dans ce périmètre (extension possible plus tard).

Bouton "+ Ajouter un invité" → formulaire : nom, côté (radio), cases à cocher pour les 4 événements → à l'enregistrement, génère le token aléatoire, crée le document Firestore, affiche immédiatement le lien prêt à copier.

**Onglet Événements** : tableau des 4 événements, édition (titre/heure/lieu/description en FR et ZH), ajout/suppression d'événement.

## Site invité (`index.html` / `script.js`)

Remplace entièrement la logique `INVITES` / codes de groupe actuelle.

- Au chargement, lit `?invite=<token>` dans l'URL, `getDoc(guests/<token>)`.
- **Pas de token, ou token introuvable** → vue teaser publique (identique au fallback "code invalide" actuel).
- **Token trouvé** → vue invité. Récupère la collection `events`, filtre sur `assignedEvents` du document invité, alimente la section Programme + les cases à cocher RSVP avec ça (remplace le filtrage par groupe `EVENTS.fr`/`EVENTS.zh` + `INVITES` actuel).
- Cette lecture étant asynchrone, un bref état de chargement apparaît avant le contenu — réutilise l'écran "loading" (fond bordeaux, 囍 qui pulse) déjà esquissé (mais inutilisé) dans le prototype Claude Design d'origine, plutôt que d'en inventer un nouveau.
- La soumission RSVP écrit désormais dans `guests/<token>.rsvp` via Firestore (`updateDoc`, restreint par les règles ci-dessus) au lieu de rester en état local uniquement — la mention "démonstration, aucun envoi réel n'est effectué" devient donc obsolète et sera retirée du texte à ce moment-là.
- Enveloppe, toggle de langue, compte à rebours, nav, et tout le reste (hero, histoire, infos, hébergement, cadeau, dress code, galerie, footer) : inchangés.

## Setup, gestion d'erreurs, déploiement

**Setup manuel (hors outillage agent, à faire par l'utilisatrice)** : créer un projet Firebase dans la console, activer Firestore + Auth (provider email/mot de passe), créer le·s compte·s admin. Étapes exactes fournies dans le plan d'implémentation. Les 4 événements existants seront seedés dans Firestore lors de l'implémentation pour que rien ne soit vide au premier chargement.

**Gestion d'erreurs** : échec de lecture Firestore côté site invité → repli sur la vue teaser publique (échoue de façon sûre, jamais de page cassée) + erreur console pour debug. Échec CRUD côté back office → bandeau d'erreur inline, le formulaire garde son contenu (rien n'est perdu). Collision de token quasi impossible (espace aléatoire) mais le code de création vérifie avant écriture.

**Hébergement** : recommandation Firebase Hosting pour le déploiement — gratuit, s'intègre nativement à Firestore, `firebase deploy` pousse les règles + les deux apps statiques (`/` et `/admin`) ensemble. Décision non bloquante, peut être prise plus tard.

**Tests** : pas de framework de test dans ce projet (site statique brut) — vérification manuelle via preview navigateur, comme pour le reste du site : parcours invité (token valide, invalide, écriture RSVP visible côté back office), parcours admin (connexion, ajout/édition/suppression d'invité, ajout/édition d'événement), et règles de sécurité (confirmer qu'un client public ne peut vraiment pas `list` les invités ni modifier des champs hors `rsvp`).

## Décisions actées (issues des questions de clarification)

- Backend : Firebase (Firestore + Auth), pas Supabase (quota gratuit).
- Auth admin : email + mot de passe Firebase Auth (pas de connexion Google, pas de PIN partagé).
- Liens d'invitation individuels remplacent **entièrement** les codes de groupe partagés.
- "Côté" (marié/mariée/deux) = métadonnée admin uniquement, n'affecte pas le rendu du site invité.
- Les 4 événements deviennent éditables depuis le back office (pas seulement l'assignation par invité).
- Ajout d'invités un par un via formulaire (pas d'import CSV/masse dans ce périmètre).
