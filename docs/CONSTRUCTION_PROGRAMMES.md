# Construction des programmes du catalogue

Révision `2026-10-07-calories-4`, 7 octobre 2026. Principes et règles appliquées dans `backend/training/catalog.py`. Aucun tirage aléatoire, aucune génération IA du catalogue.

## Ce que les sources établissent

- **Mise en route et retour au calme.** L’American Heart Association recommande 5 à 10 minutes à une allure plus lente au début et à la fin ; les transitions doivent laisser l’effort monter puis redescendre. FitnessApp conserve 5 minutes de chaque côté, divisées en deux allures pour monter puis redescendre progressivement. Ce minimum ne signifie pas que 5 minutes suffisent pour chaque personne et chaque intensité. [AHA, Warm Up, Cool Down](https://www.heart.org/en/healthy-living/exercise-and-physical-activity/fitness-basics/warm-up-cool-down), consulté le 5 octobre 2026, révisé le 16 janvier 2024.
- **Intensité relative.** Le CDC indique qu’un effort modéré permet de parler mais pas de chanter ; quelques mots seulement entre deux respirations caractérisent généralement un effort vigoureux. Une vitesse fixe ne prouve donc pas une intensité personnelle. L’interface donne le repère d’une conversation possible pour ces séances maîtrisées et invite à réduire les consignes si nécessaire. [CDC, How to Measure Physical Activity Intensity](https://www.cdc.gov/physical-activity-basics/measuring/index.html), consulté le 5 octobre 2026.
- **Course et récupération.** Le début du plan NHS alterne 1 minute de course et 1 minute 30 de marche, avec mise en route et retour au calme de 5 minutes ; le plan demande une allure confortable et progresse sur plusieurs semaines. FitnessApp reprend ce rapport au niveau facile et borne les passages pendant l’adaptation. Ses variantes ne reproduisent pas le plan complet NHS, ses vitesses ne sont pas prescrites par le NHS, et les niveaux ne représentent pas des semaines de progression. [NHS, Couch to 5K running plan](https://www.nhs.uk/better-health/get-active/get-running-with-couch-to-5k/couch-to-5k-running-plan/), consulté le 5 octobre 2026.
- **Marche inclinée.** Silder, Besier et Delp (2012) ont mesuré chez 16 sujets le coût métabolique, l’activité musculaire et la mécanique de la marche à 0, 5 et 10 % de pente. Cette étude soutient le principe d’un travail différent de la marche à plat, pas une garantie d’hypertrophie ou de perte de graisse ciblée, ni la validation des séquences FitnessApp. [Étude originale, Journal of Biomechanics, DOI 10.1016/j.jbiomech.2012.03.032](https://pmc.ncbi.nlm.nih.gov/articles/PMC4504736/), consultée le 5 octobre 2026.

## Construction par objectif et difficulté

Catalogue général commun à Arnaud et Ophélie : choix d’objectif, durée ou calories, puis difficulté. Le poids du profil sert uniquement à l’estimation calorique. Aucun tirage aléatoire et aucun appel IA pour le recalcul.

Les règles sont des choix FitnessApp inspirés des principes ci-dessus. Les vitesses, pentes, récupérations et plafonds exacts ne sont pas des prescriptions validées par ces organismes. La difficulté décrit une dose proposée ; elle n’identifie ni débutant, ni athlète confirmé.

| Format | Ce qui répond à l’objectif | Différences entre Facile / Intermédiaire / Soutenu |
|---|---|---|
| Cardio continu | Accumuler du volume régulier, adapté au niveau du programme | Marche à 4,5 km/h et 1 % / marche à 5 km/h et 2 % / course à 9 km/h à plat ; tout le temps central |
| Cardio en alternance | Découper l’effort actif et conserver la récupération | Marche active aux premiers niveaux ; Soutenu : course à 10 km/h et footing à 8,1 km/h ; passages de 3 min / 1 min 30 maximum, jusqu’à 12 cycles |
| Marche en côte | Préparer la montée, maintenir un plateau, diminuer la pente avant la fin | Vitesse constante de 4 / 4,3 / 4,6 km/h ; pic de 3 / 5 / 7 % ; travail en pente au plus 15 / 25 / 35 min |
| Vagues de pente | Répéter des côtes avec récupération plus lente à plat | Côte de 2 / 3 / 4 min ; récupération de 2 min ; au plus 4 / 6 / 6 cycles ; pic de 3 / 5 / 7 % |
| Allure régulière | Construire du temps d’endurance sans accélération finale | Marche à 4,8 km/h / course à 8,5 km/h plafonnée à 30 min / course à 10 km/h sur tout le temps central |
| Course et marche | Limiter la durée des courses et séparer les passages par de la marche | Course de 1 / 3 / 4 min ; marche de 1 min 30 / 2 min / 1 min 30 ; au plus 8 / 6 / 10 cycles |

Le plafond de huit minutes de course facile reprend le volume de course du premier entraînement NHS comme repère de construction, sans reproduire son dernier passage ni son plan sur neuf semaines. Les autres plafonds sont des limites de volume éditoriales ; ils ne prouvent pas une tolérance individuelle. En cardio/endurance Soutenu, la dose permet de couvrir les 50 minutes centrales d’une séance de 60 minutes : la durée demandée n’est plus remplie par un complément de marche. Les deux formats de marche inclinée conservent leur objectif de marche, même au niveau Soutenu.

### Adapter sans dénaturer

- **Début et fin :** 2 min à 3 km/h puis 3 min de marche plus active au début ; 2 min de marche facile puis 3 min à 3 km/h à la fin. Ces dix minutes sont incluses dans la durée choisie. Aucun sprint, même au niveau Soutenu.
- **Continu :** la durée change le temps de travail. Au niveau Soutenu, Cardio continu et Allure régulière courent pendant tout le temps central, puis passent au retour au calme. L’endurance Intermédiaire conserve un plafond de 30 minutes de course et une transition facile ; son éventuel supplément reste en marche.
- **Pyramide de pente :** 20 % de mise en route, 60 % de plateau et 20 % de réduction de pente, à la seconde près. La vitesse reste constante ; une durée longue n’ajoute pas de pente.
- **Alternances :** le nombre de cycles couvre la fenêtre de travail, au plus jusqu’au plafond. Le budget global effort/récupération garde son rapport à une seconde près, réparti entre des passages égaux à une seconde près. Le temps de course ou de côte par passage ne dépasse jamais le modèle. Une cible courte raccourcit les passages, pas l’échauffement.
- **Temps restant aux niveaux/format plafonnés :** après le plafond, marche facile à plat. Un supplément de 1 à 29 s complète la dernière récupération ; à partir de 30 s, il constitue un segment distinct. Les programmes cardio/endurance Soutenu n’ont aucun tel complément. Tous les segments satisfont les bornes métier.

Exemple **Course et marche · Facile** :

| Durée totale | Course | Récupérations entre passages | Marche facile supplémentaire | Échauffement + retour au calme |
|---|---|---|---|---|
| 15 min | 2 × 1 min = 2 min | 2 × 1 min 30 = 3 min | 0 | 10 min |
| 30 min | 8 × 1 min = 8 min | 8 × 1 min 30 = 12 min | 0 | 10 min |
| 60 min | 8 × 1 min = 8 min | 8 × 1 min 30 = 12 min | 30 min | 10 min |

Exemple **Allure régulière · Soutenu** : 30 minutes donnent 5 minutes d’échauffement, 20 minutes de course à 10 km/h puis 5 minutes de retour au calme ; 60 minutes donnent 50 minutes de course centrale. **Cardio en alternance · Soutenu** conserve de la course entre les efforts, avec récupération en footing. **Course et marche · Soutenu** conserve uniquement la marche prévue dans ses cycles, sans ajout final : à 60 minutes, environ 36 min 21 de course et 13 min 39 de récupération, en plus des dix minutes de début/fin.

La cible calorique cherche la première durée d’au moins 15 min qui atteint la cible estimée, avec le calcul partagé de [l’estimation des calories](ESTIMATION_CALORIES.md). Depuis le 7 octobre, cette durée peut dépasser une heure : le plafond de 60 min ne bloque plus artificiellement 200 kcal sur certains formats faciles. Le niveau, les allures, les pentes, l’échauffement, le retour au calme et les récupérations sont conservés. Les formats à volume plafonné gardent leur complément de marche facile ; en cardio/endurance Soutenu, les cycles ou la course couvrent tout le temps central, même au-delà d’une heure. Un bloc dépassant une heure est réparti en blocs consécutifs de mêmes consignes ; la limite de 120 segments reste technique. La durée demandée explicitement dans le mode Durée reste sélectionnable entre 15 et 60 min. Poids absent, cible sous le minimum de 15 min ou construction trop longue : explication et ajout bloqué, sans remplacer l’inconnu par zéro. Les nouvelles copies conservent la cible et la nouvelle révision ; les séances déjà enregistrées restent inchangées.

La dépense estimée doit être croissante sur la durée, y compris aux changements de nombre de cycles et au passage des plafonds : c’est la condition de validité de la recherche calorique. L’API et l’ajout utilisent la même construction ; la dose affichée réconcilie travail, récupération, marche facile et dix minutes de début/fin. La recherche choisit une durée atteignant le minimum estimé demandé, plutôt que l’arrondi le plus proche qui pouvait rester légèrement en dessous. Les contrôles historiques par seconde couvraient 15 à 60 min ; aucune suite de tests ni recette navigateur relancée pour la modification du 7 octobre, conformément à la demande d’Arnaud.

## Traçabilité et limites

L’aperçu expose le temps de travail ciblé, la récupération, le complément facile, le nombre de passages et le plafond. « Pourquoi ce programme ? » explique l’objectif, la construction, l’adaptation et les sources. Les copies nouvelles enregistrent la révision du catalogue et la cible dans leur provenance.

Cette révision remplace les modèles du catalogue. Les versions personnelles déjà enregistrées restent consultables ; une modification manuelle peut s’écarter de ces règles. Le Coach reçoit les mêmes principes de volume borné, sans enregistrement autonome.

Ces séances générales ne sont ni une prescription de haut niveau ni un plan de progression individuel. Pour personnaliser comme un coach, il faut connaître les allures réellement maîtrisées, l’expérience, la récupération et les réponses à l’effort ; objectif, durée et difficulté seuls ne suffisent pas. Le Coach demande les précisions utiles sans inventer de capacités. La progression sur plusieurs semaines et l’adaptation pendant l’effort restent hors de la brique 6.
