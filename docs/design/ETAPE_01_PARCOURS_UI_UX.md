# Étape 01 · Parcours, écrans et états

4 octobre 2026. **Refonte sombre livrée, validation visuelle en attente.** Périmètre : parcours, écrans téléphone et PC, états et graphiques. Le design est défini dans [DESIGN.md](../../DESIGN.md). Les maquettes sont dans [`frontend/`](../../frontend/README.md).

## 1. Contraintes reprises du POC

- Le PC possède le Bluetooth. La connexion se fait en lecture seule ; le démarrage est toujours humain.
- La mesure et la consigne restent distinctes ; un résultat de commande inconnu reste visible.
- Aucune reprise ni répétition automatique de commande. En cas de canal perdu ou incertain, le STOP physique est nécessaire.
- Le cardio vaut zéro dans les essais : il est donc indisponible dans les bilans.

Hypothèses de maquette : objectif de 4 séances par semaine pour Arnaud et 3 pour Ophélie ; programme de 30 min, 4 × 3 min à 8 km/h ; vitesses de 4,5 à 9 km/h ; pente de 0 à 3 %. Elles servent l’illustration et n’étendent pas les limites reçues du POC (1–2,5 km/h, 0–1 %).

## 2. Parcours

| Moment | Téléphone | PC | Décision |
|---|---|---|---|
| Choisir son profil | Avatar en haut à droite, puis feuille | Bas de la barre latérale | Pas d’authentification ; une séance en cours garde son profil d’origine |
| Préparer | Aujourd’hui : carte de la prochaine séance (durée, distance, plages, profil, structure) | Même carte, avec la semaine à droite | Modifier ouvre l’éditeur |
| Démarrer | Commencer → feuille « Avant de démarrer » : RUN500 connecté, clé de sécurité, bande libre | Même feuille, centrée | Démarrer reste désactivé tant que les deux confirmations manquent ; compte à rebours de 3 s annulable |
| Suivre | Direct plein écran ; durée, vitesse, cible, distance, pente, allure, bloc, suite, profil réalisé, courbes | Mesures à gauche, bloc et courbes à droite | Toucher la vitesse bascule km/h ↔ min/km |
| Quitter le Direct | Chevron : retour à l’app, capsule d’activité au-dessus des onglets | Carte d’activité dans la barre latérale | La capsule permet Pause et Reprendre |
| Pause | Bouton jaune, effet immédiat ; bandeau « En pause » avec durée | Identique | La durée active est figée |
| Reprendre | Bouton vert, puis feuille « Bande libre » | Identique | Aucun redémarrage sans confirmation |
| Arrêter | Bouton rouge, effet immédiat ; « Arrêt demandé » puis « Arrêt confirmé · 0,0 km/h » | Identique | Une demande n’est jamais présentée comme un arrêt confirmé |
| Bilan | Durée, distance, moyennes, courbes liées, blocs prévus et mesurés, ressenti, événements, données | Deux colonnes | Ressenti 1–10 facultatif ; Enregistrer n’apparaît qu’après un changement |
| Préparer la suite | Bilan → Coach → proposition → Enregistrer en brouillon ou Modifier | Proposition à droite de la conversation | Le coach ne démarre jamais une séance |

## 3. Écrans

| Écran | Route | Contenu principal |
|---|---|---|
| Aujourd’hui | `#/` | Prochaine séance, semaine (anneau, minutes, km, barres par jour), séances récentes |
| Séances | `#/seances` | Recherche, cartes de programme avec profil et durée, + pour créer |
| Éditeur | `#/seances/:id`, `#/seances/nouvelle` | Nom, blocs et répétitions avec steppers ; aperçu de durée, distance et profil ; Enregistrer |
| Direct | `#/direct` | Séance en cours ; sans séance : « Aucune séance en cours » |
| Historique | `#/historique` | Séances groupées par mois, avec le total du mois |
| Bilan | `#/historique/:id` | Voir le parcours « Bilan » ci-dessus |
| Coach | `#/coach` | Contexte d’accès, conversation, sources ouvrables, proposition structurée, composeur |

## 4. États

Les états sont présentés dans l’interface sans atelier ni panneau de démonstration. Pour la revue, le paramètre `?scenario=` les ouvre directement.

| État | Représentation | Accès |
|---|---|---|
| Première utilisation / aucun historique | Semaine à 0, « Aucune séance enregistrée. » | `?scenario=empty` |
| Prêt / confirmation de présence | Feuille « Avant de démarrer » | Commencer |
| Démarrage | Compte à rebours 3-2-1, Annuler | Démarrer |
| Séance active | Direct complet | `?scenario=live#/direct` |
| Transition | Courbe de rampe ; la cible change avant la mesure | Pendant la séance |
| Pause | Bandeau jaune avec durée de pause ; Reprendre | `?scenario=paused#/direct` |
| Reprise | Feuille « Bande libre » | Reprendre |
| Arrêt demandé | Bandeau orange avec vitesse mesurée | Arrêter |
| Fin | « Arrêt confirmé », synthèse, Voir le bilan | Après l’arrêt mesuré |
| Mesures anciennes | `--` en gris, dernière mesure datée, bandeau orange, point RUN500 orange | `?scenario=stale#/direct` |
| Tapis déconnecté | Bandeau rouge et STOP physique, commandes désactivées aux mêmes places | `?scenario=lost#/direct` |
| Résultat de commande inconnu | Bandeau rouge, STOP physique puis reconnexion | `?scenario=unknown#/direct` |
| Donnée manquante (bilan) | Trou dans la courbe, bande orange, événement, couverture 98,9 % | `#/historique/a10` |
| Cardio absent | « Non disponible » dans Données ; aucune série | Bilan |
| Validation invalide | Valeur rouge, message sous la ligne, Enregistrer désactivé | Éditeur, saisir 20 km/h |
| Coach hors ligne | Bandeau neutre, composeur désactivé | `?scenario=coach-offline#/coach` |

Restent à dessiner dans les étapes concernées : chargement, erreur de stockage, autre écran propriétaire, lecture seule, autorisation refusée, limite d’usage et réponse IA interrompue. Le bandeau d’état et l’état vide en sont les composants de base.

## 5. Graphiques

Le langage visuel est défini dans [DESIGN.md §7](../../DESIGN.md#7-graphiques).

| Plan | Présent dans les maquettes |
|---|---|
| G01 vitesse et cible | Direct (1 min / 5 min / séance) et bilan, avec curseur au toucher, à la souris et au clavier |
| G02 pente | Bande liée sous G01, même curseur |
| G03 progression | Profil des blocs réalisés et à venir, barre du bloc en cours |
| G04 comparaison | Bouton de date dans le bilan : seconde courbe cyan et valeur dans l’en-tête |
| G05 régularité | Barres par jour et anneau dans Aujourd’hui ; totaux mensuels dans l’Historique |
| G10 qualité | Bande de coupure, événements, couverture, source |
| G06–G09 | Non dessinés : étape 13. Ils reprendront les règles d’axes, de couleur et de curseur. |

## 6. Données de démonstration

Toutes les données sont synthétiques ([frontend/src/data/demo.ts](../../frontend/src/data/demo.ts)).

- **Séance de référence (30 sept., Arnaud) :** 30 min actives, 32 min au total ; coupure de mesure de 12:00 à 12:20 ; pause de 2 min à 14:00 ; 3,28 km ; couverture 98,9 %.
- **Direct de revue :** 17:24 actives, bloc 6/10 (Course 3), mesure 7,9 km/h pour une cible de 8,0.
- **Historique :** 11 séances pour Arnaud, 5 pour Ophélie. La semaine du 28 septembre compte 3 séances, 90 min et 9,8 km.

## 7. Vérification

Captures Chrome à 390 × 844 (×2) et 1440 × 900 : [INDEX](../preuves/v1/etape-01/2026-10-04-sombre/INDEX.md). Parcours automatisé vérifié sans erreur console : Commencer, confirmations, Démarrer, compte à rebours, Direct, Réduire, capsule, Pause, Arrêter, fin, bilan, profil.

À recevoir par Arnaud : envie d’utiliser Aujourd’hui, lecture du Direct à distance, navigation tactile, densité du bilan, coach et éditeur. Restent ouverts : appareils physiques, Safari iOS, Android, effort réel.
