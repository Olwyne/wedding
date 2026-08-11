# Email invité pré-rempli par l'admin — design

## Contexte

L'admin connaît parfois déjà l'email d'un invité avant même que celui-ci réponde au RSVP. Aujourd'hui, `rsvp.email` n'existe qu'une fois l'invité a soumis sa réponse — rien ne permet de le renseigner à l'avance côté admin.

## Modèle de données

Sur chaque doc `guests`, nouveau champ optionnel `email: string` (distinct de `rsvp.email`, qui reste la valeur soumise par l'invité).

## Admin (`admin/guests.js`)

`openGuestPanel` : nouveau champ texte "Email" (type `email`, optionnel), sauvegardé comme `guest.email` sur `setDoc`/`updateDoc`. Pas de colonne dédiée dans le tableau — visible uniquement en ouvrant la fiche.

## Formulaire public (`script.js`)

`loadGuestData` : la valeur initiale de `state.rsvp.email` devient `guest.rsvp.email || guest.email || ''` — la réponse déjà soumise par l'invité prime si elle existe, sinon le pré-remplissage admin est utilisé. Le champ reste modifiable dans tous les cas (comportement actuel inchangé).

## Hors scope

- Pas d'envoi d'email automatique depuis l'admin (juste stockage/pré-remplissage).
- Pas de colonne Email dans le tableau des invités.
