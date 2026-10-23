# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

- **Les mariés (Sophie Boyer & Ruiyuan Hu)** — propriétaires et administrateurs principaux. Organisent un mariage franco-chinois (24 juillet 2027) et pilotent toute la logistique (invités, budget, prestataires, plan de table, déroulé du jour-J, to-do) depuis le backoffice.
- **Témoins d'honneur / wedding planner** — utilisateurs admin secondaires, avec un accès backoffice limité par un système de permissions par section (lecture/écriture/aucun, voir `firestore.rules` et `admin/permissions.js`) plutôt qu'un accès total.
- **Invités** — visiteurs du site public. Deux états : sans invitation (teaser public, informations minimales) et avec invitation personnalisée (lien `?invite=TOKEN`), qui débloque le programme complet et le formulaire RSVP.

## Product Purpose

Un site de mariage sur-mesure et son backoffice de gestion associé, pour un mariage unique (pas un produit multi-tenant). Le site public informe et collecte les réponses (RSVP, régimes alimentaires, photos) ; le backoffice centralise toute l'organisation (invités, prestataires, budget, plan de table, témoins, déroulé jour-J, calendrier) pour que les mariés n'aient pas à jongler entre plusieurs outils.

## Positioning

Pas un concurrent des plateformes de mariage génériques (The Knot, Zola, Mariages.net) : un outil privé et bâti sur-mesure, bilingue français/chinois à parts égales (jamais une simple traduction secondaire), avec une divulgation progressive de l'information liée à l'invitation (teaser → enveloppe → site complet selon le statut d'invité et la confirmation de présence) et un backoffice qui réunit logistique d'événement et gestion de contenu dans un seul outil interne, avec des permissions fines par section plutôt qu'un accès admin binaire.

## Operating Context

- Déploiement : Firebase (Firestore + règles de sécurité `firestore.rules`) pour les données, Vercel pour l'hébergement (`vercel.json`), emails transactionnels via EmailJS côté client et Brevo côté serveur (`api/send-email.js`).
- Le site public (`index.html` / `script.js` / `styles.css`) et le backoffice (`admin/`) sont deux applications statiques séparées, sans framework (JS vanilla, modules ES), partageant la même base Firestore.
- Contenu bilingue FR/中文 géré en continu via le module "Blocs" du backoffice (CMS léger piloté par les mariés).
- Accès invité par token individuel (`?invite=TOKEN`) ; accès admin par email/mot de passe Firebase Auth, réservé aux comptes explicitement ajoutés dans la collection `admins`.

## Capabilities and Constraints

- RSVP avec adultes/enfants, régimes alimentaires, upload de photos/vidéos, sélection des événements auxquels l'invité participe.
- Visibilité des adresses des lieux conditionnée à la confirmation de présence (logique métier récente, voir historique Git).
- Permissions backoffice par section (`events`, `guests`, `blocks`, `vendors`, `budget`, `tables`, `dayof`, `todo`, `calendar`, `users`, `settings`, `witnesses`) avec granularité lecture/écriture par utilisateur admin.
- Pas de framework front-end : JS vanilla modulaire, pas de bundler. Toute nouvelle fonctionnalité doit rester compatible avec cette approche sans introduire de dépendance de build.
- Projet à usage unique (un seul mariage, une seule occurrence) — pas de considérations multi-tenant, multi-événement ou de montée en charge au-delà de l'échelle d'un mariage.

## Brand Commitments

- Identité bilingue FR/中文 non négociable : toute copie ou fonctionnalité visible des invités doit exister dans les deux langues, à parts égales (pas de langue "par défaut" dominante dans l'intention, même si le FR est la langue d'entrée actuelle du site).
- Noms et date fixes : Ruiyuan Hu & Sophie Boyer, 24 · 07 · 2027 — ces faits ne doivent jamais être modifiés par un travail de design ou de contenu sans demande explicite.
- Esthétique actuelle (palette bordeaux/or/crème, calligraphie Ma Shan Zheng, motif 囍) déjà établie dans le code — à documenter séparément via `/impeccable document`, pas à réinventer ici.

## Evidence on Hand

- Code source complet du site public et du backoffice (seule source de vérité produit actuelle, pas de specs séparées).
- `firestore.rules` fait foi pour le modèle de permissions.
- Pas de README produit, pas de maquettes externes identifiées : le code est la référence.

## Product Principles

1. **Le couple d'abord.** Le backoffice sert en priorité l'usage quotidien des mariés pendant la préparation du mariage ; tout ajout doit réduire leur charge mentale, pas l'augmenter.
2. **Parité FR/中文 stricte** sur tout ce qui est visible des invités — aucune fonctionnalité ne sort en une seule langue.
3. **Divulgation progressive respectée.** L'architecture teaser → invitation → RSVP → programme complet est une décision produit déjibérée (confidentialité envers les non-invités) ; ne pas la contourner pour simplifier un flux.
4. **Permissions fines, jamais un accès admin binaire** — tout nouvel écran backoffice doit s'intégrer au système de permissions par section existant.
5. **Pas de dépendance de build.** Rester en JS vanilla / modules ES natifs sauf décision explicite contraire.

## Accessibility & Inclusion

Standard WCAG AA, sans besoin spécifique signalé côté invités à ce jour (confirmé par les mariés). Le site public doit rester utilisable au clavier et par lecteur d'écran (RSVP compris) — voir les correctifs déjà appliqués (focus visible, `prefers-reduced-motion`) suite à l'audit `/impeccable audit`.
