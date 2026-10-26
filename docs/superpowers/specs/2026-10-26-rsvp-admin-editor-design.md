# Éditeur RSVP admin

**Date :** 2026-10-26  
**Auteur :** Sophie Boyer

## Problème

Le panneau "Réponse" dans le backoffice invités est en lecture seule. Quand un admin ajoute un accompagnant à posteriori ou corrige une réponse, le compteur du dashboard ne se met pas à jour car `guest.rsvp` n'est pas modifié.

## Solution

Transformer `openRsvpDetail` en `openRsvpPanel` — même panneau, même UX, mais avec des champs éditables et un bouton "Enregistrer" qui écrit directement dans `guest.rsvp` dans Firestore.

## Architecture

**Fichier unique :** `admin/guests.js`

- `openRsvpDetail(guest, eventById)` → renommée `openRsvpPanel(guest, events)`
- `events` (tableau) déjà disponible à l'appelant (ligne ~325, action `view-rsvp`)
- Save : `updateDoc(doc(db, 'guests', guest.id), { rsvp: newRsvp })`
- Après save : close + `renderGuestsTab()` — dashboard se recalcule au prochain chargement

Aucune nouvelle infrastructure. Règles Firestore non bloquantes pour admin avec perm `guests:write`.

## Champs éditables

| Champ | Contrôle |
|-------|---------|
| Statut | `<select>` : pending / confirmed / declined |
| Nom déclaré | `<input type="text">` |
| Email | `<input type="email">` |
| Téléphone | `<input type="text">` |
| Adultes | `<input type="number" min=0>` |
| Enfants | `<input type="number" min=0>` |
| Autres adultes (noms) | liste dynamique : inputs + bouton ✕ + bouton Ajouter |
| Enfants (noms) | idem |
| Événements confirmés | checkbox par événement (pattern existant `event-checkboxes`) |
| Allergies / régime | `<textarea>` |
| Message | `<textarea>` |
| Répondu le | `<div>` lecture seule — non modifié par l'admin |

## Data flow

1. Panel s'ouvre → pré-remplit depuis `guest.rsvp`
2. Admin édite → "Enregistrer"
3. Bouton désactivé pendant save (pattern existant)
4. `confirmedEvents` reconstruit : `{ [eventId]: true/false }` depuis checkboxes cochées
5. `respondedAt` conservé tel quel depuis l'objet RSVP original
6. Succès → fermeture + `renderGuestsTab()`
7. Erreur → message inline dans le panel (pattern `#block-error` existant)

## Tests

Test manuel : modifier le nombre d'adultes → sauvegarder → vérifier que le compteur du dashboard reflète le changement. Cohérent avec le reste du projet (pas de tests unitaires automatisés).

## Périmètre

- Modifie uniquement `admin/guests.js`
- Pas de changement aux règles Firestore
- Pas de changement au site public
- Pas d'email envoyé lors d'une modification admin (l'email de confirmation n'est déclenché que depuis le formulaire invité)
