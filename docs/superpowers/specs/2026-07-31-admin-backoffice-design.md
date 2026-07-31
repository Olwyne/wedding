# Admin Back-Office — Redesign & Blocs

**Date :** 2026-07-31  
**Projet :** Sophie & Ruiyuan — site de mariage  
**Scope :** Redesign complet de `/admin/`, nouveau tab Blocs, refonte UI tab Invités

---

## 1. Objectif

Transformer le back-office admin actuel (tabs basiques, styles wedding) en un vrai back-office fonctionnel. Trois sections : **Blocs** (nouveau), **Invités** (redesign UI), **Événements** (polish).

---

## 2. Layout & Design System

### Structure
- **Sidebar gauche fixe** (220px) : titre "S & R · Admin", navigation verticale, logout en bas
- **Zone contenu** (reste de l'écran) : header contextuel (titre + bouton action principal) + contenu
- Pas de responsive nécessaire (usage desktop uniquement)

### Palette
| Token | Valeur | Usage |
|-------|--------|-------|
| `--admin-sidebar` | `#1a1f2e` | Fond sidebar |
| `--admin-bg` | `#f5f6f8` | Fond contenu |
| `--admin-card` | `#ffffff` | Cards, tables |
| `--admin-accent` | `#6E1A1A` | Bouton primary, nav active |
| `--admin-text` | `#1a1a1a` | Texte principal |
| `--admin-muted` | `#6b7280` | Texte secondaire |
| `--admin-border` | `#e5e7eb` | Bordures |
| `--admin-danger` | `#dc2626` | Bouton supprimer |

### Typographie
`system-ui, -apple-system, Inter, sans-serif` — toute l'interface admin. Garamond reste réservé au site invité.

### Composants
- **Badge pill** : petite étiquette colorée (type de bloc, côté invité, statut RSVP)
- **Boutons** : `btn-primary` (bordeaux), `btn-secondary` (outlined), `btn-danger` (rouge), `btn-icon` (icône seule)
- **Table standard** : header gris clair, lignes alternées légères, bordures fines
- **Panneau slide-in** : formulaire qui apparaît depuis la droite (overlay semi-transparent), remplace les forms inline actuels
- **Toggle switch** : pour le champ `visible` des blocs

---

## 3. Tab Blocs (nouveau)

### Firestore — collection `blocks`

```
blocks/{auto-id}
  order:      number      // position d'affichage (1, 2, 3…)
  type:       'text' | 'image'
  visible:    boolean     // true = affiché sur le site invité
  title_fr:   string      // titre optionnel (peut être vide)
  title_zh:   string
  // si type === 'text'
  content_fr: string
  content_zh: string
  // si type === 'image'
  image_url:  string      // URL Firebase Storage ou URL externe
  alt_fr:     string
  alt_zh:     string
  caption_fr: string      // légende optionnelle
  caption_zh: string
  createdAt:  string      // ISO
  updatedAt:  string      // ISO
```

### UI Admin — liste

Table avec colonnes : `Ordre · Type · Titre (FR) · Visible · Actions`

- **Ordre** : boutons ↑ ↓ pour réordonner (swap avec le bloc adjacent)
- **Type** : badge pill — `TEXTE` (bleu) ou `IMAGE` (vert)
- **Visible** : toggle switch interactif (màj Firestore immédiate, sans rechargement)
- **Actions** : Modifier (ouvre slide-in) · Supprimer (confirmation)

Bouton "+ Ajouter un bloc" dans le header de section.

### UI Admin — formulaire (slide-in)

1. Sélection du type (uniquement à la création) : deux grandes cards cliquables — "Texte" / "Image"
2. Champs communs : `Titre FR` + `Titre ZH` (optionnels), `Visible` (toggle)
3. Champs texte : `Contenu FR` (textarea) + `Contenu ZH` (textarea)
4. Champs image :
   - Radio : "URL externe" | "Upload depuis mon appareil"
   - Si URL externe : champ input URL
   - Si upload : input `file`, upload vers Firebase Storage path `blocks/<timestamp>-<filename>`, affichage de la preview après upload
   - `Alt FR` + `Alt ZH` (accessibilité)
   - `Légende FR` + `Légende ZH` (optionnels)

### Rendu site principal

Les blocs visibles (`visible: true`) sont affichés dans une section dédiée du site invité, après le programme des événements, dans l'ordre croissant du champ `order`. Les blocs `visible: false` sont ignorés.

Rendu selon le type :
- **Texte** : titre (h2 bilingue si renseigné) + contenu (paragraphe bilingue)
- **Image** : titre optionnel + `<img>` avec `alt` bilingue + légende optionnelle

---

## 4. Tab Invités (redesign UI)

### Modèle de données — inchangé

```
guests/{token}          // token = code invité = doc ID
  name:           string
  side:           'marie' | 'mariee' | 'deux'
  assignedEvents: string[]   // IDs des événements Firestore
  rsvp: {
    status:         'pending' | 'confirmed'
    adults:         number
    children:       number
    diet:           string
    message:        string
    confirmedEvents: object
    respondedAt:    string | null
  }
  createdAt: string
```

L'URL invité reste `?invite=<token>` (token = doc ID).

### UI Admin — table

Colonnes : `Nom · Côté · Événements · RSVP · Adultes · Enfants · Lien · Actions`

- **Côté** : badge pill coloré — bordeaux (Marié), rose poudré (Mariée), gris (Les deux)
- **Événements** : pills avec nom court de chaque événement assigné
- **RSVP** : badge vert (Confirmé) ou orange (En attente)
- **Lien** : bouton icône clipboard, feedback "Copié !" pendant 1,5s
- **Actions** : Modifier · Supprimer

### UI Admin — formulaire (slide-in)

- `Nom` : champ texte
- `Côté` : 3 boutons toggle visuels (pas de radio brut) — "Marié" · "Mariée" · "Les deux"
- `Événements` : liste de cards cliquables (nom + heure de l'événement), style checkbox amélioré
- À la création : URL générée affichée avec bouton "Copier"

---

## 5. Tab Événements

Aucune modification fonctionnelle. Restyling uniquement pour cohérence avec le nouveau design system (sidebar, table standard, slide-in form).

---

## 6. Fichiers impactés

| Fichier | Changement |
|---------|------------|
| `admin/index.html` | Restructuration complète (sidebar + layout) |
| `admin/styles.css` | Réécriture complète (nouveau design system) |
| `admin/script.js` | Mise à jour routing sidebar |
| `admin/guests.js` | Refonte UI (slide-in, badges, toggle) |
| `admin/events.js` | Restyling pour cohérence |
| `admin/blocks.js` | Nouveau module (CRUD blocs + upload) |
| `script.js` | Lecture collection `blocks` + rendu section |
| `styles.css` | Styles section blocs site invité |
| `firestore.rules` | Ajouter `allow read: if true` sur `blocks` (site invité non authentifié) |

---

## 7. Hors scope

- Drag-and-drop pour réordonnancement (remplacé par boutons ↑↓)

---

## 8. Notes d'implémentation

- **`order` à la création** : `max(order existant) + 1`
- **Texte brut** : retours à la ligne préservés côté site invité (`\n` → `<br>` à l'affichage)
- **Firebase Storage** : règles d'upload — authentifié uniquement (`request.auth != null`); lecture publique pour les URLs des blocs
- Responsive admin (desktop uniquement)
- Éditeur rich text (Markdown ou WYSIWYG) — contenu texte brut uniquement
- Statistiques / dashboard
- Gestion des images déjà uploadées (pas de médiathèque)
