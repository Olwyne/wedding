# Plafond de personnes par invitation — design

## Contexte

Chaque invitation (`guests/{token}`) représente un couple ou une famille avec un lien unique. Le formulaire RSVP public laisse actuellement saisir jusqu'à 12 adultes et 12 enfants sans lien avec le nombre réel de personnes invitées. Objectif : plafonner par invitation, et informer clairement l'invité de son max.

## 1. Modèle de données

Ajout sur chaque doc `guests`:
- `maxAdults` (number, défaut 1)
- `maxChildren` (number, défaut 0)

Invités existants sans ces champs : fallback en lecture `guest.maxAdults ?? 1`, `guest.maxChildren ?? 0` partout (admin, formulaire public, règles Firestore). Pas de script de migration — le plafond par défaut (1 adulte / 0 enfant) s'applique immédiatement à tous les invités existants tant qu'ils ne sont pas édités.

## 2. Admin (`admin/guests.js`)

- Panel création/édition invité (`openGuestPanel`) : deux champs nombre "Max adultes" (défaut 1, min 1) et "Max enfants" (défaut 0, min 0), à côté des champs côté/événements.
- `renderGuestRow` / tableau : nouvelle colonne "Max" affichant ex. `2A / 1E`.
- Sauvegarde (`setDoc`/`updateDoc`) inclut `maxAdults`, `maxChildren`.

## 3. Formulaire public (`script.js`)

- Au chargement du guest (autour de la ligne ~140-155), stocker `state.rsvp.maxAdults = guest.maxAdults ?? 1` et `state.rsvp.maxChildren = guest.maxChildren ?? 0`.
- Juste avant les champs adultes/enfants, phrase d'intro dynamique générée à partir du max, ex. "Vous êtes invité(s) pour 2 adultes et 1 enfant maximum" (accord singulier/pluriel, omission de la partie enfants si `maxChildren === 0`).
- Labels des champs : "Adultes (max 2) *" / "Enfants (max 1) *", valeurs dynamiques.
- Attribut HTML `max` des inputs `#r-adults`/`#r-children` = valeurs dynamiques (remplace le `12` codé en dur).
- Listeners `input` clampent la valeur saisie à `Math.min(value, max)`.

## 4. Firestore rules (`firestore.rules`)

Sur `match /guests/{guestId}`, la branche `update` correspondant à l'écriture publique du RSVP (`affectedKeys().hasOnly(['rsvp'])`) doit valider :

```
request.resource.data.rsvp.adults >= 0
&& request.resource.data.rsvp.adults <= (resource.data.maxAdults != null ? resource.data.maxAdults : 1)
&& request.resource.data.rsvp.children >= 0
&& request.resource.data.rsvp.children <= (resource.data.maxChildren != null ? resource.data.maxChildren : 0)
```

Empêche un contournement du plafond via un appel API direct (pas seulement via le formulaire).

## Hors scope

- Pas de notification/alerte admin si un invité tente de dépasser son max.
- Pas de gestion des invitations "enfant seul" (`maxAdults = 0`) — l'admin garde `maxAdults >= 1` par convention.
