# FitnessApp — Objectifs et suivi avec le coach

Plan de travail actif au 27 novembre 2026. Chaque profil définit ce qu’il veut accomplir. Le coach prépare les séances et ajuste le programme au fil des bilans. L’application montre la progression vers le repère choisi et la prochaine action.

## 1. Définir l’objectif et le point de départ

**Livré sur `main`.** **Mon objectif**, depuis Aujourd’hui ou Planning, permet de créer et modifier un objectif actif par profil. L’utilisateur le décrit avec ses mots et ajoute une échéance si elle est utile. Le coach peut demander une précision et suggérer un repère. L’utilisateur confirme le repère, qui reste disponible dans les nouvelles conversations.

| Exemple d’objectif | Repère à confirmer |
|---|---|
| Trouver un rythme régulier | Trois séances réalisées par semaine |
| Courir 30 minutes en continu | Durée de course continue observée |
| Finir un 10 km fin mars 2027 | Étapes datées et repère choisi selon le niveau de départ |
| Retrouver le plaisir de bouger | Régularité des séances et évolution du ressenti déclaré |

Pour préparer la semaine, le coach s’appuie sur les séances récentes, le niveau déclaré, les jours disponibles, la durée maximale et le lieu d’entraînement. Il demande une précision quand elle peut changer le programme. Le poids reste facultatif et sert aux estimations caloriques. Demander une autre donnée personnelle uniquement si son utilité pour l’objectif est claire.

## 2. Préparer et ajuster les semaines

**Livré sur `main`.** Le coach propose la semaine en cours ou la suivante. Avec un objectif daté, il présente aussi les étapes jusqu’à l’échéance. Pour une habitude, il explique le repère de la semaine. Chaque séance précise son but, sa durée, l’effort attendu et le lieu prévu. L’utilisateur peut déplacer ou écarter une séance avant de confirmer. Aujourd’hui montre la séance du jour et la suivante. Le Planning permet de les retrouver dans les vues **Semaine** et **Mois**.

Après une séance, **Préparer la suite** transmet le bilan et le ressenti au coach. Le coach s’appuie aussi sur les séances manquées et écourtées. Il explique le changement qu’il propose, par exemple alléger, déplacer ou maintenir une séance. La modification prend effet après confirmation et conserve les séances passées ou en cours ainsi que la date de l’objectif. Une sortie extérieure prévue peut être renseignée avec sa durée réelle, sa distance et son ressenti.

Deux profils peuvent préparer le même 10 km avec des semaines différentes. Les séances, les progrès et les propositions restent propres à chaque profil.

## 3. Afficher les progrès à partir des bilans

**À terminer.** L’objectif et le repère sont enregistrés. Le suivi chiffré dans Aujourd’hui et les totaux par période restent à construire.

1. **Bilans visibles dans le Planning — livré sur `main`.** En Semaine et en Mois, les séances réalisées apparaissent à leur date locale, même sans programme accepté. Un bilan rattaché à une séance programmée le même jour apparaît une seule fois. Chaque bilan du jour peut être ouvert séparément. Le calendrier suit le profil affiché et le mode réel ou simulé.
2. **Calculer le repère confirmé.** Partir du repère existant. Quand il peut être mesuré, faire confirmer ce qui compte, la cible et la période. Calculer les totaux semaine et mois à partir des bilans du profil. Pour un repère qualitatif, montrer les observations utiles et leur période.
3. **Afficher le résultat et ses sources.** Dans Aujourd’hui, montrer l’objectif, le repère, le résultat et la prochaine action. Les séances qui expliquent le résultat sont ouvrables depuis le Planning ou Bilans. Le coach utilise les mêmes calculs et peut citer les bilans qui justifient son retour.
4. **Vérifier le parcours sur téléphone et PC.** Garder les actions et les informations essentielles lisibles dans les composants existants. Prévoir une première utilisation sans bilan, des mesures partielles et un chargement en échec avec possibilité de réessayer. [Référence d’interface](DESIGN.md)

### Critères de livraison

- [ ] Avec deux séances valides sur un objectif de trois séances par semaine, Aujourd’hui et le coach indiquent deux sur trois. Les totaux semaine et mois sont vérifiés autour d’un changement de période.
- [ ] Une séance écourtée ou hors programme contribue selon le repère confirmé. Une séance manquée reste visible au planning. Les séances simulées restent séparées des résultats réels.
- [ ] Pour la course en continu, afficher une durée seulement quand les mesures établissent la continuité. Si un bilan est incomplet, expliquer ce qui manque. Une estimation du temps couru n’est jamais présentée comme une mesure.
- [ ] Une séance difficile ou manquée mène à une proposition expliquée, vérifiable dans le planning, avec confirmation avant modification.
- [ ] Vérifier sur deux profils avec le même événement et des niveaux différents que les séances, bilans et progrès correspondent au profil affiché.

**Plan général archivé.** Les autres briques de FitnessApp restent consultables dans le [plan V1 général du 27 novembre](https://github.com/Nono8Six/FitnessApp/blob/4804a3e923ff6568bea9502f88e34e88f28eef97/PLAN_V1_FITNESS_APP.md).
