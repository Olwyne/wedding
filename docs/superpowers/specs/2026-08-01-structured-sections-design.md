# Sections structurées — remplace le seed générique de blocs

**Date :** 2026-08-01
**Projet :** Sophie & Ruiyuan — site de mariage
**Scope :** Nouvelle collection Firestore `sections`, nouveau tab admin "Sections", migration du rendu front, nettoyage du seed erroné.

---

## 1. Contexte / problème

Le tab **Blocs** de l'admin (`admin/blocks.js`, collection `blocks`) a été conçu pour du **contenu additionnel libre** : texte ou image, multi-instance, réordonnable, ajouté après le programme (voir `docs/superpowers/specs/2026-07-31-admin-backoffice-design.md`).

Le commit `7637f5c feat: seed all 10 front-end sections as blocks` a détourné ce système : les 10 sections statiques du site (déjà codées en dur dans `index.html`/`script.js` avec leur propre structure — hero avec compte à rebours, histoire en deux paragraphes, infos avec liste de lieux, etc.) ont été dupliquées dans `blocks` comme entrées génériques `type: 'text'`, tout le contenu de chaque section aplati dans un seul champ `content_fr`/`content_zh`.

Résultat : dans l'admin, tous les blocs affichent le même type "TEXTE" sans distinction, alors que chaque section a une disposition et des champs propres. Ce n'est pas un bug de code — le système `blocks` fonctionne comme prévu, c'est le seed qui a mal utilisé le modèle de données.

## 2. Objectif

Remplacer le contenu actuellement en dur des 10 sections du site invité + de la vue publique (teaser) par du contenu piloté par Firestore, avec un modèle de données structuré et différencié par type de section (au lieu d'un champ texte unique). Supprimer les entrées `blocks` mal-seedées. Le tab **Blocs** original redevient disponible pour du contenu libre supplémentaire, non touché par ce travail.

## 3. Modèle de données — collection `sections`

Un document par type de section, **ID = nom du type** (singleton, pas de multi-instance, pas de réordonnancement — l'ordre d'affichage reste fixé par la structure de la page comme aujourd'hui).

Champs communs à tous les documents : `visible: boolean` (défaut `true` — masque toute la section si `false`, même mécanisme que `#blocks-section.hidden` actuel), `updatedAt: string` (ISO).

```
sections/teaser        // vue non connectée (accueil public, avant lien perso)
  kicker_fr/zh          // ex T.pubKicker
  message_fr/zh         // ex T.pubMsg

sections/hero
  kicker_fr/zh           // ex T.heroKicker
  place_fr/zh            // ex T.heroPlace
  fusion_fr/zh           // ex T.heroFusion
  envInvite_fr/zh        // texte enveloppe fermée — ex T.envInvite
  envHint_fr/zh          // ex T.envHint

sections/story
  kicker_fr/zh, title_fr/zh
  p1_fr/zh, p2_fr/zh      // ex storyP1 / storyP2

sections/programme       // texte d'habillage seulement — la liste d'événements reste dans `events`, inchangée
  kicker_fr/zh, title_fr/zh, subtitle_fr/zh

sections/infos
  kicker_fr/zh, title_fr/zh
  mapBtnLabel_fr/zh       // ex T.mapBtn
  places: [{ zh, name_fr, name_zh, addr_fr, addr_zh, mapUrl }]   // ex PLACES[]

sections/hebergement
  kicker_fr/zh, title_fr/zh, intro_fr/zh, shuttle_fr/zh
  hotels: [{ tag_fr, tag_zh, name_fr, name_zh, desc_fr, desc_zh }]  // ex HOTELS[]

sections/rsvp            // texte d'habillage seulement — formulaire + données invité inchangés
  kicker_fr/zh, title_fr/zh, intro_fr/zh

sections/gift
  kicker_fr/zh, title_fr/zh, text_fr/zh

sections/dress
  kicker_fr/zh, title_fr/zh, text_fr/zh
  avoidColors: [{ hex, label_fr, label_zh }]   // ex T.avoid[]

sections/gallery
  kicker_fr/zh, title_fr/zh, hint_fr/zh

sections/contact
  title_fr/zh, text_fr/zh
```

11 documents au total.

## 4. UI Admin — tab "Sections"

Nouvel item de navigation sidebar, à côté de Blocs/Invités/Événements.

- Liste fixe des 11 sections (pas d'ajout/suppression/réordonnancement — singleton à position fixe) : `Nom de la section · Visible (toggle) · Modifier`.
- "Modifier" ouvre un panneau slide-in (réutilise le style `.panel`/`.panel-overlay` de `admin/blocks.js`), champs générés selon le type :
  - Champs texte simples/bilingues (input ou textarea selon longueur attendue).
  - Champs liste (`places`, `hotels`, `avoidColors`) : mini-éditeur répétable dans le même panneau — chaque item = un petit groupe de champs avec bouton "Supprimer", + bouton "Ajouter un item" en bas de la liste. Pas de réordonnancement des items (ordre = ordre du tableau, ajout à la fin).
- Sauvegarde : `setDoc(doc(db,'sections', type), data, { merge: false })` (écrase tout le document — cohérent avec un formulaire qui montre l'état complet).

## 5. Rendu front (`script.js`)

- Nouvelle fonction `fetchSections()` : `getDocs(collection(db, 'sections'))` une fois à `init()`, en parallèle de `loadGuestData()`/`fetchBlocks()`. Construit `sectionsMap` (clé = ID doc).
- Chaque fonction de rendu existante (`applyText`, `renderPlaces`, `renderHotels`, `renderAvoidColors`, etc.) lit d'abord `sectionsMap[type]?.champ`, avec **repli sur la valeur codée en dur actuelle** (`T.fr`/`T.zh`, `PLACES`, `HOTELS`, `T.avoid`) si le document ou le champ est absent — le site ne casse jamais avant/pendant la migration.
- `visible: false` sur un doc de section → masque toute la section (`section.hidden = true`), identique au mécanisme actuel de `#blocks-section`.
- `sections/teaser` pilote `#teaser` (kicker + message) ; `#blocks-public` et son contenu sont retirés (redondants avec `sections/teaser`).

## 6. Sécurité — `firestore.rules`

Ajouter, même pattern que `blocks` :

```
match /sections/{id} {
  allow read: if true;
  allow write: if request.auth != null;
}
```

## 7. Nettoyage / migration

- Suppression des 10 documents `blocks` mal-seedés (`audience: 'invite'`, tous `type: 'text'`) et du document public dupliqué (`audience: 'public'`, "Save the date") — **suppression de données de prod, confirmation demandée avant exécution**.
- `seed.html` : remplace les deux seeders actuels (`blocks`) par un seeder unique pour `sections/*` (11 docs, valeurs initiales = texte actuellement en dur dans `T.fr`/`T.zh`/`PLACES`/`HOTELS`/`T.avoid`).
- Tab **Blocs** (`admin/blocks.js`) : aucun changement de code — redevient utilisable pour du contenu libre supplémentaire, vide après le nettoyage.

## 8. Hors scope

- Upload/galerie photo réelle (section `gallery` reste un texte d'accroche, pas de grille d'images — non demandé).
- Réordonnancement des sections elles-mêmes (position fixée par la page).
- Édition du nom des mariés / de la date du mariage (actuellement en dur dans `index.html`, hors périmètre de cette demande).
- Réordonnancement des items dans les listes (`places`/`hotels`/`avoidColors`) — ajout/suppression seulement.

## 9. Tests

Pas de framework de test (site statique). Vérification manuelle par section : bascule visible on/off, édition de chaque champ (texte simple, paragraphe, ajout/suppression d'item de liste), rechargement du front, confirmation du rendu. Vérifier le repli sur les valeurs codées en dur en simulant un document manquant.
