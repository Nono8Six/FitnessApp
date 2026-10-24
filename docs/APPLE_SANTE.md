# Apple Santé depuis le bilan

## Utilisation

Dans Chrome sur l’iPhone : **Bilans → séance → Envoyer vers Apple Santé**.
La feuille affiche les valeurs qui seront transmises. Ouvrir **Configurer le
raccourci sur l’iPhone** pour créer le raccourci gratuit **Fitness vers Santé**.
Après configuration, vérifier le profil et l’absence de cette séance dans Santé,
puis ouvrir Raccourcis. Choisir Marche ou Course dans l’action d’enregistrement.

Le bouton ne synchronise rien automatiquement. Il ne nécessite ni compte Strava,
ni abonnement, ni nouvelle application développée pour FitnessApp. L’app Apple
Raccourcis doit être installée. Le choix reste volontaire à chaque envoi.

## Contrat du raccourci, version 1

`frontend/src/lib/appleHealth.ts` prépare un JSON transmis directement dans le
lien `shortcuts://run-shortcut`, avec `input=text`. Aucune URL du PC à contacter,
aucun jeton et aucune requête vers un service de synchronisation.

| Clé | Contenu |
|---|---|
| `version` | Nombre `1` |
| `seance` | Identifiant du bilan ; ce champ n'assure pas la déduplication dans Santé |
| `debut` | Date du départ du bilan en ISO 8601 UTC, à convertir en date dans Raccourcis |
| `duree_secondes` | Durée active arrondie à la seconde, hors pauses |
| `distance_metres` | Distance mesurée complète, en mètres ; clé omise sinon |
| `calories_actives` | Kcal actives estimées, valeur unique et couverture complète ; clé omise sinon |

Ni nom de profil, ni poids, ni courbe, ni pas ne sont transmis. Le type Marche ou
Course est demandé par l’action Apple ; il ne déclenche aucun recalcul des kcal.

## Construction sur iPhone

Les instructions sont également disponibles dans la feuille du bilan.

1. Créer **Fitness vers Santé**. Obtenir le dictionnaire depuis **Entrée du raccourci**
   et conserver le résultat dans la variable **Séance**.
2. Lire `debut` depuis Séance et le convertir en date ; lire `duree_secondes`.
3. Ajouter une alerte avec Annuler, demandant de vérifier que le profil est le sien
   et que la séance n’existe pas déjà dans Santé.
4. Obtenir **Toutes les clés** de Séance. Tester la présence de `distance_metres`
   puis de `calories_actives` dans cette liste. Ne lire une clé facultative que dans
   la branche où elle existe : une absence ne devient jamais un zéro.
5. Utiliser l’action Santé **Log Workout** (enregistrement d’entraînement ; libellé
   français selon iOS), une fois par branche, selon ce tableau. Dans chaque action,
   utiliser le départ converti en date, la durée en **secondes** et le type d’activité
   **Demander à chaque fois**.

| Distance présente | Kcal présentes | Champs facultatifs à renseigner |
|---|---|---|
| Oui | Oui | `distance_metres` en mètres et `calories_actives` en kcal |
| Oui | Non | Distance seulement ; champ calories vide |
| Non | Oui | Calories seulement ; champ distance vide |
| Non | Non | Aucun ; laisser les deux champs vides |

6. Après les conditions, afficher une alerte invitant à vérifier l’entraînement
   enregistré dans Santé. Accepter les autorisations Santé nécessaires sur l’iPhone.

La configuration et notamment le comportement des champs facultatifs laissés
vides restent à recevoir sur iPhone. Aucune conversion d’un champ absent en valeur
mesurée n’est autorisée. Si iOS exige un champ absent, annuler plutôt que saisir zéro.

## Limites et protections

- Les simulations, séances en cours, annulées ou interrompues, arrêts non confirmés,
  pertes de données, dates invalides et durées actives nulles sont refusés.
- Les valeurs partielles ou absentes sont omises. Les kcal totales avec repos et
  les bornes d’une estimation ambiguë ne sont pas exportées.
- Raccourcis ne reproduit pas les pauses : avec la durée active, son heure de fin
  est reconstruite depuis le départ. Ce choix est indiqué si le bilan contient une pause.
- Aucun accusé de réception HealthKit. « Ouverture demandée » ne signifie pas
  « enregistré ». Le navigateur ne prétend jamais que la séance est synchronisée.
- Vérification manuelle des doublons obligatoire, notamment si une montre a déjà
  enregistré la séance. L’identifiant transmis n’est pas une clé HealthKit.
- Le raccourci est à créer sur iPhone. Aucun `.shortcut` non signé ni lien iCloud
  fictif n’est distribué. Le PC Windows ne dispose pas de l’outil Apple de signature.
- La présence dans Forme et les effets sur les anneaux restent à vérifier sur iPhone.

## Vérification du code

Depuis `frontend/` : `node --test tests/appleHealth.test.mjs` (Node avec prise en
charge native de TypeScript, Node 22.18+), puis `npm run build`.
Les tests couvrent les exclusions, les unités, les absences, le fuseau horaire et
l’encodage du lien. Ils ne remplacent pas un enregistrement Santé sur iPhone.

Références Apple : [lancement d’un raccourci depuis une URL](https://support.apple.com/guide/shortcuts/run-a-shortcut-from-a-url-apd624386f42/ios),
[actions de partage, dont Log Workout](https://support.apple.com/en-in/guide/shortcuts-mac/apdaf74d75a5/mac),
[signature avec l’outil Apple sur Mac](https://support.apple.com/en-gb/guide/shortcuts-mac/apd455c82f02/mac).
