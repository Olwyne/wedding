---
name: Ruiyuan & Sophie — Mariage 2027
description: Site de mariage franco-chinois bilingue avec backoffice de gestion complet
colors:
  bordeaux: "#6E1A1A"
  bordeaux-deep: "#841f1f"
  gold: "#C1993F"
  gold-accent: "#b58f5a"
  chinese-red: "#B03A2E"
  navy: "#2F5FB0"
  cream: "#FBF6EC"
  cream-warm: "#F6ECD8"
  parchment: "#E7D6AE"
  parchment-light: "#EAD9BC"
  ink: "#2A211C"
  taupe: "#7a6252"
  pink: "#E4B4AC"
  gold-deep: "#876b2c"
  cream-on-dark: "#F4E9CE"
  admin-accent: "#6E1A1A"
  admin-blue: "#2563eb"
  admin-text: "#111827"
  admin-muted: "#5f6673"
  admin-bg: "#f5f6f8"
  admin-border: "#e5e7eb"
  admin-border-hover: "#d1d5db"
typography:
  display:
    fontFamily: "'Cormorant Garamond', serif"
    fontSize: "clamp(22px, 5.5vw, 86px)"
    fontWeight: 500
    lineHeight: 1
    letterSpacing: "normal"
  headline:
    fontFamily: "'Cormorant Garamond', serif"
    fontSize: "clamp(34px, 6vw, 58px)"
    fontWeight: 500
    lineHeight: 1.1
    letterSpacing: "normal"
  body:
    fontFamily: "'EB Garamond', serif"
    fontSize: "clamp(17px, 2.4vw, 20px)"
    fontWeight: 400
    lineHeight: 1.9
    letterSpacing: "normal"
  label:
    fontFamily: "'EB Garamond', serif"
    fontSize: "12px"
    fontWeight: 400
    lineHeight: 1.4
    letterSpacing: "0.3em"
  chinese-accent:
    fontFamily: "'Ma Shan Zheng', cursive"
    fontSize: "min(80vw, 560px)"
    fontWeight: 400
    lineHeight: 1
    letterSpacing: "normal"
  chinese-body:
    fontFamily: "'Noto Serif SC', serif"
    fontSize: "clamp(26px, 6vw, 44px)"
    fontWeight: 400
    lineHeight: 1.2
    letterSpacing: "normal"
  admin-body:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Inter', system-ui, sans-serif"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.5
    letterSpacing: "normal"
rounded:
  sm: "4px"
  md: "6px"
  lg: "8px"
  pill: "999px"
spacing:
  xs: "8px"
  sm: "14px"
  md: "22px"
  lg: "40px"
components:
  button-primary:
    backgroundColor: "{colors.gold}"
    textColor: "#3a1010"
    rounded: "{rounded.sm}"
    padding: "16px"
  button-outline:
    backgroundColor: "transparent"
    textColor: "{colors.parchment}"
    rounded: "{rounded.pill}"
    padding: "11px 22px"
  admin-button-primary:
    backgroundColor: "{colors.admin-accent}"
    textColor: "#ffffff"
    rounded: "{rounded.md}"
    padding: "8px 16px"
---

# Design System: Ruiyuan & Sophie — Mariage 2027

## Overview

**Creative North Star: "La Lettre Scellée" (The Sealed Letter)**

Le site public est une enveloppe de mariage chinoise traditionnelle (红包/invitation calligraphiée) réinterprétée en interface web : un rituel d'ouverture (enveloppe → sceau → lettre), puis un contenu qui alterne délibérément entre deux voix — le français en Cormorant Garamond/EB Garamond, italique et éditorial, et le chinois en Noto Serif SC avec des touches calligraphiques (Ma Shan Zheng) pour le caractère 囍 (double bonheur) et les accents. Le bordeaux profond et l'or forment la base formelle occidentale ; le rouge chinois (`--red`) est réservé aux éléments culturellement chinois (sous-titres 中文, caractère 囍, kickers), jamais interchangé avec le bordeaux. Rien n'est symétrique par accident : chaque paire de langues a sa propre couleur, sa propre police, son propre poids — la parité est structurelle, pas cosmétique.

Le backoffice (`admin/`) est volontairement un système visuel différent et c'est un choix assumé, pas un oubli : mode **Operate** pur, sobre, neutre (sans serif système, accent bleu `#2563eb` pour les éléments interactifs standards, bordeaux uniquement pour les actions de marque comme le bouton de connexion). Il ne cite jamais l'esthétique cérémonielle du site public — un outil de gestion n'a pas à rejouer l'enveloppe.

**Key Characteristics:**
- Rituel d'entrée obligatoire (enveloppe → sceau → lettre) avant tout contenu, jamais court-circuité
- Bordeaux + or = voix occidentale/formelle ; rouge chinois = voix culturelle chinoise, jamais confondus
- Labels et kickers en majuscules à tracking très large (0.2em à 0.5em) — signature constante du système
- Display italique en Cormorant Garamond pour tout nom propre ou date
- Admin = système neutre séparé, sans emprunt à l'esthétique du site public

## Colors

Palette à deux registres : une base bordeaux/or/crème côté site public (chaude, cérémonielle), et une base neutre gris/bleu côté admin (froide, fonctionnelle). Elles ne se mélangent jamais dans la même vue.

### Primary (site public)
- **Bordeaux Profond** (`#6E1A1A`, `--bordeaux`) : couleur de marque principale — fond de l'enveloppe/teaser, noms en hero, titres de section, boutons de navigation. Quatre tons plus profonds (`#611315`, `#4a0f11`, `#561414`, `#841f1f`…) servent exclusivement aux dégradés de fond (jamais comme couleur de texte à part entière).
- **Or** (`#C1993F`, `--gold`) : accent cérémoniel — anneaux de monogramme, séparateurs, bordures de champs de formulaire, sceau, bouton CTA principal (`.btn-submit`). Utilisé avec parcimonie, jamais en fond de grande surface. **Ne jamais l'utiliser comme couleur de texte sur fond clair/blanc** (contraste 2.66:1, sous le seuil AA) : réserver `--gold` aux fonds sombres (bordeaux, dégradés), aux traits/bordures et aux éléments décoratifs non textuels.
- **Or Profond** (`#876b2c`, `--gold-deep`) : variante assombrie de l'or, réservée au texte doré sur fond clair/blanc (ex. `.hotel-tag` sur `.hotel-card`). Contraste 5.04:1 sur blanc — passe AA avec marge. C'est le seul ton d'or autorisé pour du texte lisible sur fond clair.

### Secondary (site public)
- **Rouge Chinois** (`#B03A2E`, `--red`) : réservé au registre culturel chinois — caractère 囍, sous-titres en chinois, kickers ("SAVE THE DATE"), sélection de texte (`::selection`). **Ne jamais l'utiliser comme substitut du bordeaux** : ce sont deux voix distinctes, pas deux nuances d'une même couleur.
- **Navy** (`#2F5FB0`, `--navy`) : variante de thème pour certains blocs de contenu (ex. code vestimentaire, navette) quand l'admin choisit une teinte alternative au bordeaux pour une section — un accent de section, pas un accent global.

### Neutral (site public)
- **Crème** (`#FBF6EC`, `--cream`) : fond de page par défaut.
- **Crème sur Fond Sombre** (`#F4E9CE`, `--cream-on-dark`) : variante crème dédiée au texte sur fonds bordeaux/navy profonds (menu plein écran, bandeau navette, cartes à fond sombre, pied de page). Distincte de `--cream` (fond de page) et `--parchment` (texte secondaire sur fond sombre) — c'est le ton de texte principal sur surface sombre.
- **Parchemin** (`#E7D6AE` / `#EAD9BC`) : labels de formulaire, texte secondaire sur fond sombre.
- **Encre** (`#2A211C`, `--ink`) : texte de corps sur fond clair (quatre tons `ink`→`ink4` pour la hiérarchie de gris chauds).
- **Taupe** (`#7a6252`) : texte tertiaire, sous-titres de date.

### Neutral (admin)
- **Texte** (`#111827`) / **Atténué** (`#5f6673`) / **Fond** (`#f5f6f8`) / **Bordure** (`#e5e7eb`) / **Bordure au survol** (`#d1d5db`, `--border-hover`) : palette neutre standard d'outil de gestion. **Bleu** (`#2563eb`) sert à l'état actif de la navigation, aux liens et aux états d'interaction temporaires (survol de dépôt, focus) ; **bordeaux** (`#6E1A1A`, le même token que le site public) n'apparaît que sur les actions de marque (logo, bouton de connexion) — un rappel d'identité délibéré, pas une fusion des deux systèmes.
  - `--muted` est fixé à `#5f6673` (et non `#6b7280`) pour garantir ≥4.5:1 sur `--admin-bg` et sur blanc — toute nouvelle teinte de texte atténué doit repasser ce test de contraste avant d'être adoptée.

### Badges de statut (admin, exception documentée)
Les badges de statut (RSVP, prestataires) forment une mini-palette qualitative à part, distincte du chrome bleu/bordeaux ci-dessus — un indicateur de statut a besoin de plus de deux teintes pour rester lisible, et ce n'est pas une dérive : **ambre** (`#fef3c7`/`#92400e`) = en attente, **vert** (`#dcfce7`/`#15803d`) = confirmé, **rouge** (`#fee2e2`/`#b91c1c`) = refusé/rejeté, **jaune** (`#fef9c3`/`#854d0e`) = préféré, **violet** (`#ede9fe`/`#6d28d9`) = candidat. Toute nouvelle couleur de badge doit rester dans ce registre qualitatif (fond pastel + texte foncé de la même teinte) et ne jamais migrer vers le chrome de navigation/boutons.

### Named Rules
**La Règle des Deux Rouges.** Le bordeaux (`--bordeaux`) et le rouge chinois (`--red`) ne sont jamais interchangeables : le bordeaux porte la structure (titres, nav, CTA), le rouge porte le culturel (chinois, 囍, kickers). Un nouvel élément doit choisir son registre, jamais les deux à la fois.

**La Règle des Deux Ors.** `--gold` est pour fond sombre, bordures et décor ; `--gold-deep` est pour texte lisible sur fond clair. Un texte en or sur un fond blanc ou crème qui utilise `--gold` au lieu de `--gold-deep` est un bug de contraste, pas une variation de style.

## Typography

**Display Font:** Cormorant Garamond (serif, avec fallback `serif`)
**Body Font:** EB Garamond (serif) pour le français ; Noto Serif SC pour le chinois
**Accent Font:** Ma Shan Zheng (cursive calligraphique) — réservée au caractère 囍 et aux flourishes, jamais pour du texte lisible en continu
**Admin Font:** pile système sans-serif (`-apple-system, BlinkMacSystemFont, "Inter", system-ui`)

**Character:** Cormorant Garamond en italique porte toute la charge émotionnelle (noms, dates) — élégant, resserré, presque calligraphique. EB Garamond en roman porte la lecture courante, posée. Le contraste roman/italique fait toute la hiérarchie display vs corps, sans jamais changer de famille au sein du français.

### Hierarchy
- **Display** (500, `clamp(22px, 5.5vw, 86px)`, italique, line-height 1) : noms des mariés en hero (`.hero-name`).
- **Headline** (500, `clamp(34px, 6vw, 58px)`) : titres de section (`.section-title`).
- **Title** (500, 34px, italique) : noms dans la lettre de l'enveloppe (`.envelope-letter-names`).
- **Body** (400, `clamp(17px, 2.4vw, 20px)`, line-height 1.9) : texte de section (`.section-text`) — line-height délibérément généreux pour le ton épistolaire.
- **Label** (400, 12px, tracking `0.2em` à `0.5em`, majuscules) : kickers, boutons, hints de champ. Le tracking très large est une signature constante du système, pas un détail ponctuel.
- **Chinois** (Noto Serif SC, `clamp(26px, 6vw, 44px)`) : toujours en couleur rouge chinois, jamais en bordeaux.

### Named Rules
**La Règle du Tracking Large.** Tout label, kicker ou bouton en majuscules porte un `letter-spacing` d'au moins `0.12em` (jusqu'à `0.5em` pour les kickers). Un label en majuscules sans tracking large rompt la signature du système.

## Layout

Mise en page fluide par conception : quasiment aucune largeur fixe, tout est contenu par `max-width` (640px à 1000px selon la section) + `margin:0 auto`, et les grilles utilisent `repeat(auto-fit, minmax(...))` plutôt que des breakpoints explicites (`.places-grid`, `.hotels-grid`, `.gallery-grid` : `minmax(200–300px, 1fr)`). Une seule media query gouverne le site public (`@media(max-width:860px)` pour basculer la nav desktop vers le burger menu) — le reste de la responsivité vient de la fluidité native, pas de points de rupture multipliés.

L'admin suit un modèle classique d'outil de gestion : sidebar fixe (224px) + zone de contenu, qui se replie en barre horizontale défilable sous 880px (ajout récent suite à l'audit d'accessibilité). Les tableaux de données sont enveloppés dans des conteneurs `overflow-x:auto` plutôt que de forcer un redimensionnement des colonnes.

## Elevation & Depth

Deux philosophies distinctes et volontaires.

**Site public — profondeur par dégradé, pas par ombre.** La majorité des surfaces sont plates ou utilisent des dégradés radiaux/linéaires bordeaux (`--bordeaux-deep*`) pour suggérer de la profondeur atmosphérique plutôt que des ombres portées. Les rares ombres sont décoratives et douces (lettre de l'enveloppe : `0 24px 46px -22px rgba(0,0,0,.5)` ; sceau : ombres internes pour l'effet de cire).

**Admin — ombres structurelles discrètes.** Les cartes et tableaux utilisent systématiquement la même paire d'ombres : `0 1px 3px rgba(0,0,0,.08), 0 0 0 1px rgba(0,0,0,.04)` — une ombre douce + un liseré de 1px, qui sert de séparation de surface plutôt que d'élévation dramatique.

### Shadow Vocabulary
- **Surface admin** (`box-shadow: 0 1px 3px rgba(0,0,0,.08), 0 0 0 1px rgba(0,0,0,.04)`) : toute carte/tableau/panneau admin au repos.
- **Lettre d'enveloppe** (`box-shadow: 0 24px 46px -22px rgba(0,0,0,.5)`) : seul usage d'ombre dramatique du site public, réservé à l'objet central du rituel d'ouverture.

### Named Rules
**La Règle de l'Admin Plat.** L'admin n'emprunte jamais les dégradés atmosphériques du site public ; sa profondeur vient uniquement de la paire d'ombres standard ci-dessus.

## Shapes

Site public : coins doux et constants à 4px (`border-radius:4px`) sur à peu près tous les éléments interactifs (champs, boutons, cartes) sauf les éléments circulaires intentionnels (anneaux de monogramme, sceau, diamants de séparateur à 45°) et le bouton outline du teaser en pilule complète (`border-radius:999px`). Admin : coins un peu plus généreux (6–8px) sur cartes et boutons, cohérent avec un langage d'outil SaaS contemporain plutôt qu'avec le 4px cérémoniel du site public — encore une différenciation volontaire entre les deux systèmes.

## Components

### Buttons (site public)
- **Shape:** 4px de rayon, sauf le bouton outline du teaser (pilule, 999px).
- **Primaire (`.btn-submit`):** fond or plein, texte bordeaux très sombre (`#3a1010`), majuscules, tracking `0.16em`, padding 16px pleine largeur.
- **Outline (`.btn-outline`):** transparent, bordure or 1px, texte parchemin, pilule.
- **Toggle (`.rsvp-toggle-btn`):** fond translucide crème (6% opacité), devient teinté or (22% opacité) + bordure or quand actif.
- **Focus:** anneau `box-shadow` crème + bordeaux (ajouté lors de l'audit d'accessibilité — remplace l'`outline` supprimé sans alternative).

### Buttons (admin)
- **Primaire (`.btn-primary`):** fond bordeaux de marque, texte blanc, 6px de rayon — seul endroit où le bordeaux du site public apparaît dans l'admin.
- **Secondaire (`.sidebar-logout` etc.):** fond transparent, bordure neutre 1px, texte atténué.
- **Icône (`.btn-icon`):** bouton carré sans fond, icône SVG 14–16px au trait fin (`stroke-width:1.8`) — toujours accompagné d'un `aria-label` explicite (fermeture, suppression, actions). Cible tactile 44×44px sous `@media (pointer: coarse)` (densité desktop inchangée à la souris) — voir La Règle du Pouce dans Do's and Don'ts.

### Cards / Containers (admin)
- **Corner Style:** 8px.
- **Background:** blanc (`--admin-card`) sur fond `--admin-bg` gris très clair.
- **Shadow Strategy:** voir Elevation & Depth — paire d'ombres standard systématique.
- **Internal Padding:** 16–20px.

### Inputs / Fields (site public)
- **Style:** fond translucide crème 6%, bordure or 50% opacité, 4px de rayon, texte crème.
- **Label:** `<label class="field">` englobant visuellement le `<span class="field-label">` et le champ — association implicite label/input, pas de `for`/`id` séparé.
- **Focus:** anneau crème + bordeaux (voir Buttons).

### Inputs / Fields (admin)
- **Style:** bordure neutre 1px, fond blanc.
- **Focus:** bordure teintée accent + `box-shadow` de halo (pas de suppression d'`outline` sans remplacement, contrairement à l'ancien état du site public).

### Navigation
- **Site public:** nav flottante translucide (`backdrop-filter:blur(12px)`) sur fond crème 86% opacité, liens en EB Garamond 14px ; bascule en burger + menu plein écran bordeaux sous 860px.
- **Admin:** sidebar verticale fixe à icônes + libellés, item actif marqué par une bordure gauche bleue (desktop) ; devient une barre horizontale défilable à icônes sous 880px, avec le compte/déconnexion en fin de défilement.

### L'Enveloppe (composant signature)
Composant central et unique du site : enveloppe 3D en CSS pur (perspective, pochettes en triangles `border`), sceau circulaire avec dégradé radial imitant la cire, lettre qui glisse verticalement au clic. Seul élément du système à porter des animations en boucle (float, pulse) — désormais neutralisées sous `prefers-reduced-motion`. Ne pas répliquer cette mécanique ailleurs : elle est le rituel d'entrée, pas un patron réutilisable.

### Panneaux latéraux (admin)
Patron partagé (`admin/ui-panel.js`, fonction `mountPanel`) utilisé par les 12 panneaux `.panel-overlay`/`.panel` de l'admin (invités, blocs, événements, prestataires, utilisateurs, etc.) : `role="dialog"`, `aria-modal="true"`, `aria-labelledby` pointant automatiquement sur le `<h3>` du `.panel-header`, focus initial sur le premier élément interactif, piège à focus (Tab/Shift+Tab bouclent à l'intérieur du panneau), fermeture au clavier via Échap, et restitution du focus à l'élément déclencheur à la fermeture — même contrat clavier que `confirmDialog` (`ui-confirm.js`). Tout nouveau panneau latéral doit passer par `mountPanel` plutôt que ré-implémenter `appendChild`/`close()` à la main.

## Do's and Don'ts

### Do:
- **Do** garder le rouge chinois (`--red`) exclusivement pour le registre culturel chinois (囍, sous-titres chinois, kickers) et le bordeaux pour la structure/marque.
- **Do** tracker large (`0.12em`–`0.5em`) tout label ou bouton en majuscules.
- **Do** garder l'admin visuellement neutre et séparé de l'esthétique cérémonielle du site public — le bordeaux n'y apparaît que sur les actions de marque.
- **Do** fournir un style de focus visible et cohérent avec la palette (crème+bordeaux côté site public, halo accent côté admin) — jamais `outline:none` sans remplacement.
- **Do** utiliser `max-width` + `auto-fit`/`minmax` plutôt que des breakpoints multiples pour la fluidité du site public.
- **Do** mettre à jour `document.documentElement.lang` à chaque changement de langue sur le site public (`fullRender()` le fait déjà) — le site est bilingue à parité stricte, un `lang` figé casse la lecture par synthèse vocale de la moitié du contenu.
- **Do** passer par `mountPanel` (`admin/ui-panel.js`) pour tout nouveau panneau latéral admin plutôt que de réimplémenter `appendChild`/`close()` — voir Composants.
- **Do** bump le paramètre `?v=N` de chaque module/feuille de style modifié, et de tous ses importeurs, à chaque édition — les assets JS/CSS sont servis avec `Cache-Control: public, max-age=31536000` (voir `nginx.conf`), donc un fichier modifié sans bump de version ne sera jamais revu par un visiteur déjà passé sur le site.

### Don't:
- **Don't** utiliser le bordeaux et le rouge chinois comme s'ils étaient interchangeables.
- **Don't** répliquer le rituel d'enveloppe (animation 3D, sceau) comme patron générique pour d'autres composants.
- **Don't** emprunter les dégradés atmosphériques bordeaux du site public dans l'admin, ni l'inverse (les ombres structurelles de l'admin) sur le site public.
- **Don't** introduire de dépendance de build (bundler, framework) — le projet reste en JS vanilla / modules ES natifs (voir PRODUCT.md).
- **Don't** supprimer un `outline`/focus sans fournir un remplacement visible dans la même règle.
- **Don't** utiliser `--gold` comme couleur de texte sur fond clair — utiliser `--gold-deep` (voir La Règle des Deux Ors).
- **Don't** laisser un bouton icône (`.btn-icon`) sans cible tactile 44×44px effective sous pointeur grossier (`@media (pointer: coarse)`) — l'admin anticipe un usage tactile (voir le repli de la sidebar sous 880px).
