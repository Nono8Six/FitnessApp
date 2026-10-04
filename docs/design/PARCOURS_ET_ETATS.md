# Parcours et états

Référence fonctionnelle des écrans, à appliquer brique par brique ([plan](../../PLAN_V1_FITNESS_APP.md)). Le rendu suit [DESIGN.md](../../DESIGN.md).

## 1. Contraintes du tapis

- Le PC possède le Bluetooth. La connexion se fait en lecture seule ; le démarrage est toujours humain.
- La mesure et la consigne restent distinctes ; un résultat de commande inconnu reste visible.
- Aucune reprise ni répétition automatique de commande. En cas de canal perdu ou incertain, le STOP physique est nécessaire.
- Le cardio est indisponible tant qu’aucune source valide n’existe.

## 2. Parcours

| Moment | Téléphone | PC | Règle | Brique |
|---|---|---|---|---|
| Choisir son profil | Avatar en haut à droite, puis feuille | Bas de la barre latérale | Pas d’authentification ; une séance en cours garde son profil d’origine | 2 |
| Composer | Séances → + ou Modifier → Éditeur | Éditeur et aperçu côte à côte | Validation serveur ; Enregistrer désactivé tant qu’une valeur est hors limites | 3 |
| Se connecter à ChatGPT | « Connexion depuis le PC » | Réglages → Se connecter avec ChatGPT | Retour OAuth sur `127.0.0.1` uniquement | 4 |
| Demander une séance | Coach → message → carte de proposition | Proposition à droite de la conversation | Même validation que l’éditeur ; Enregistrer crée une séance « ChatGPT » | 5–6 |
| Préparer | Aujourd’hui : prochaine séance (durée, distance, plages, profil, structure) | Même carte, semaine à droite | Modifier ouvre l’éditeur | 3, 11 |
| Démarrer | Commencer → « Avant de démarrer » : tapis connecté, clé, bande libre | Feuille centrée | Démarrer désactivé sans les deux confirmations ; compte à rebours 3 s annulable | 8 |
| Suivre | Direct plein écran : durée, vitesse, cible, distance, pente, allure, bloc, suite, profil réalisé, courbes | Mesures à gauche, bloc et courbes à droite | Toucher la vitesse bascule km/h ↔ min/km | 8 |
| Quitter le Direct | Chevron ; capsule d’activité au-dessus des onglets | Carte dans la barre latérale | Pause et Reprendre depuis la capsule | 8 |
| Pause | Bouton jaune, effet immédiat ; bandeau « En pause » | Identique | Durée active figée | 8 |
| Reprendre | Bouton vert, puis « Bande libre » | Identique | Aucun redémarrage sans confirmation | 8 |
| Arrêter | Bouton rouge ; « Arrêt demandé » puis « Arrêt confirmé · 0,0 km/h » | Identique | Une demande n’est jamais un arrêt confirmé | 8 |
| Bilan | Chiffres, courbes liées, blocs prévus et mesurés, ressenti, événements, données | Deux colonnes | Ressenti 1–10 facultatif | 9 |
| Analyser | Coach : question sur l’historique, sources ouvrables | Identique | Chiffres identiques au bilan | 12 |
| Planifier | Coach : semaine proposée, acceptée en tout ou partie | Identique | Aujourd’hui affiche la séance du jour | 13 |

## 3. États

| État | Représentation | Brique |
|---|---|---|
| Aucun historique | Semaine à 0, « Aucune séance enregistrée. » | 1 |
| Bibliothèque vide | « Aucune séance. » et + | 3 |
| Saisie invalide | Valeur rouge, message sous la ligne, Enregistrer désactivé | 3 |
| ChatGPT non connecté | Coach : bouton de connexion (PC) ou « Connexion depuis le PC » (téléphone) | 4 |
| Limite d’usage / indisponible | Bandeau neutre avec le message renvoyé ; la conversation reste lisible | 5 |
| Réponse interrompue | Message marqué incomplet ; aucune proposition enregistrable | 5 |
| Proposition invalide | Erreurs renvoyées à ChatGPT ; la carte n’apparaît qu’une fois valide | 6 |
| Coach hors ligne | Bandeau neutre, composeur désactivé ; séances et historique disponibles | 5 |
| Tapis absent / connexion en cours | Réglages > Tapis et feuille « Avant de démarrer » : état réel, Démarrer désactivé | 7 |
| Hors du périmètre reçu | Démarrage refusé, limite affichée | 8 |
| Démarrage | Compte à rebours, Annuler | 8 |
| Transition | La cible change avant la mesure ; rampe visible | 8 |
| Mesures anciennes | `--` en gris, dernière mesure datée, bandeau orange | 8 |
| Tapis déconnecté | Bandeau rouge, STOP physique, commandes désactivées aux mêmes places | 8 |
| Résultat de commande inconnu | Bandeau rouge, STOP physique puis reconnexion | 8 |
| Séance interrompue | Bilan marqué interrompu, données conservées | 9 |
| Donnée manquante | Trou dans la courbe, bande orange, événement, couverture | 9 |
| Erreur de stockage | Bandeau rouge, dernier lot confirmé indiqué | 9 |

## 4. Graphiques

| Plan | Emplacement | Brique |
|---|---|---|
| G01 vitesse et cible | Direct (1 min / 5 min / séance), bilan | 8, 9 |
| G02 pente | Bande liée sous G01, même curseur | 8, 9 |
| G03 progression | Profil des blocs réalisés et à venir | 8 |
| G05 régularité | Anneau et barres par jour, totaux mensuels | 11 |
| G04, G06–G10 | Comparaison, calendrier, distributions, ressenti, qualité | 14 |
