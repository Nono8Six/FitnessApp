# Construction des programmes du catalogue

Révision `2026-10-05-method-1`, 5 octobre 2026. Principes vérifiés et règles appliquées dans `backend/training/catalog.py`. Aucun tirage aléatoire, aucune génération IA du catalogue.

## Ce que les sources établissent

- **Mise en route et retour au calme.** L’American Heart Association recommande 5 à 10 minutes à une allure plus lente au début et à la fin ; les transitions doivent laisser l’effort monter puis redescendre. FitnessApp conserve 5 minutes de marche de chaque côté. Ce minimum ne signifie pas que 5 minutes suffisent pour chaque personne et chaque intensité. [AHA, Warm Up, Cool Down](https://www.heart.org/en/healthy-living/exercise-and-physical-activity/fitness-basics/warm-up-cool-down), consulté le 5 octobre 2026, révisé le 16 janvier 2024.
- **Intensité relative.** Le CDC indique qu’un effort modéré permet de parler mais pas de chanter ; quelques mots seulement entre deux respirations caractérisent généralement un effort vigoureux. Une vitesse fixe ne prouve donc pas une intensité personnelle. L’interface donne le repère d’une conversation possible pour ces séances maîtrisées et invite à réduire les consignes si nécessaire. [CDC, How to Measure Physical Activity Intensity](https://www.cdc.gov/physical-activity-basics/measuring/index.html), consulté le 5 octobre 2026.
- **Course et récupération.** Le début du plan NHS alterne 1 minute de course et 1 minute 30 de marche, avec mise en route et retour au calme de 5 minutes ; le plan demande une allure confortable et progresse sur plusieurs semaines. FitnessApp reprend ce rapport au niveau facile et borne les passages pendant l’adaptation. Ses variantes ne reproduisent pas le plan complet NHS, ses vitesses ne sont pas prescrites par le NHS, et les niveaux ne représentent pas des semaines de progression. [NHS, Couch to 5K running plan](https://www.nhs.uk/better-health/get-active/get-running-with-couch-to-5k/couch-to-5k-running-plan/), consulté le 5 octobre 2026.
- **Marche inclinée.** Silder, Besier et Delp (2012) ont mesuré chez 16 sujets le coût métabolique, l’activité musculaire et la mécanique de la marche à 0, 5 et 10 % de pente. Cette étude soutient le principe d’un travail différent de la marche à plat, pas une garantie d’hypertrophie ou de perte de graisse ciblée, ni la validation des séquences FitnessApp. [Étude originale, Journal of Biomechanics, DOI 10.1016/j.jbiomech.2012.03.032](https://pmc.ncbi.nlm.nih.gov/articles/PMC4504736/), consultée le 5 octobre 2026.

## Choix de construction FitnessApp

Les règles ci-dessous sont des choix de produit inspirés de ces principes. Les chiffres exacts de vitesse, pente et durée des niveaux ne sont pas certifiés par les organismes cités.

| Format | Objectif de la structure | Adaptation à la cible |
|---|---|---|
| Marche active | Accumuler un volume de marche régulier, avec pente légère, pour viser une dépense énergétique | Changer le temps central ; conserver allure et pente |
| Marche en alternance | Découper la marche active, avec récupération plus lente à plat | Ajouter ou retirer des cycles, sans dépasser les durées nominales des passages |
| Marche en côte | Mise en route de la pente, plateau de travail plus incliné, phase de pente réduite | Répartir le temps entre les trois phases en conservant leurs proportions |
| Vagues de pente | Répéter des montées avec récupération à plat | Ajuster les cycles, en conservant le rapport montée/récupération |
| Allure régulière | Accumuler du temps de marche ou de course sans accélérations, dans une logique d’endurance aérobie | Changer le temps central ; ne pas ajouter de sprint pour augmenter les calories |
| Course et marche | Accumuler du temps de course interrompu par de la marche ; repère facile 1:00/1:30 | Plus de cycles pour une séance longue ; passage de course plafonné à 1, 3 ou 4 min selon le niveau |

Pour une alternance, le nombre de cycles permet de couvrir le temps central sans dépasser la durée nominale d’un cycle. Les secondes sont réparties entre efforts et récupérations selon leur rapport, avec arrondi et minimum de 30 secondes. Les mêmes allures et pentes sont répétées. À 30 minutes totales, Course et marche facile donne 8 cycles de 1:00/1:30 ; à 60 minutes, 20 cycles. Aucun passage facile ne devient une course continue de 10 minutes.

La cible calorique cherche une durée avec le calcul partagé de [l’estimation des calories](ESTIMATION_CALORIES.md), sur 15 à 60 minutes totales. Elle ne fait pas augmenter automatiquement l’intensité. Le poids absent ou une cible hors plage bloque l’ajout avec une explication. Les calories affichées ne prouvent pas la qualité de la prescription ni une dépense individuelle mesurée.

## Traçabilité et limites

La feuille Découvrir expose but, construction, adaptation, repère d’effort et liens vers les sources. Une nouvelle copie conserve la révision du catalogue et la cible dans sa provenance. Les copies déjà enregistrées et leurs anciennes versions restent intactes ; une modification manuelle ultérieure peut s’écarter de cette construction.

Ce catalogue propose des séances structurées, pas une prescription individualisée ni un plan de progression reçu sur plusieurs semaines. L’application ne connaît pas encore l’allure habituelle, la capacité à tenir cette allure ou la réponse réelle de la personne à l’effort. Le Coach demande l’allure habituelle lorsque cette précision est nécessaire ; son explication ne constitue pas une validation scientifique. La progression et la réception pendant l’effort restent hors de la brique 6.
