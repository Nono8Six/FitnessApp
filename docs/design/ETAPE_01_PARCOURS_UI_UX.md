# Étape 01 · Parcours et maquettes UI/UX

4 octobre 2026. **Maquettes livrées, validation visuelle en attente.** Périmètre : conception des cinq écrans, deux formats, deux thèmes, états et graphiques. Aucun socle V1 construit.

## 1. Sources et hypothèses

Le [plan V1](../../PLAN_V1_FITNESS_APP.md), le [README POC](../../README.md), la [base factuelle RUN500](../BASE_FACTUELLE_CAHIER_DES_CHARGES_RUN500.md), les captures existantes PC/mobile et les fichiers `poc/static/` ont été inspectés. La console sert la compréhension de l’état matériel et de la sécurité ; elle n’est pas le modèle visuel de la V1.

Contraintes reprises : PC propriétaire du Bluetooth ; lecture seule à la connexion ; démarrage humain ; mesure et consigne distinctes ; résultat inconnu visible ; pas de reprise automatique ; STOP physique nécessaire en cas de canal perdu ; cardio à zéro dans les essais, donc indisponible dans les bilans.

Hypothèses de conception, à confirmer lors des étapes concernées :

| Hypothèse | Portée |
|---|---|
| Objectif fictif 4 séances/semaine pour les deux profils | Illustre un objectif choisi, aucune prescription réelle |
| Séance fictive de 30 min, 4 × 3 min à 8 km/h, récupération à 6 | Illustre les parcours V1, aucune extension des limites POC |
| Plafond de profil fictif 10 km/h, pente 3 % | Sert la validation de la maquette ; disponibilités à croiser avec matériel et réception future |
| Fenêtre mobile paysage 844 × 390 | Représentation Chrome ; zones sûres et clavier natif à recevoir physiquement |
| Historiques de démonstration pour Arnaud et Ophélie | Même scénario pédagogique, aucun historique personnel importé ou exposé |
| Ressenti facultatif 1–10 | Déclaratif, pas un score de récupération |

Bornes proposées du plan : 60 min et 120 segments exécutables après répétitions. Elles sont des exigences futures à recevoir, pas des capacités du POC. Ses programmes actuels restent limités à 1–3 blocs courts, 4 km/h et 3 %. Aucune étape de cadrage complète ni nouvelle campagne matérielle réalisée ici.

## 2. Parcours de référence

| Moment | PC | Téléphone | Décision / donnée conservée dans la V1 |
|---|---|---|---|
| Choisir son profil | Nom dans l’en-tête, sélection explicite | Nom et initiale en haut, sélection au toucher | Profil courant pour les consultations, aucune authentification ajoutée |
| Préparer | Aujourd’hui : prochaine séance, objectif, aperçu ; accès aux blocs | Programme en premier, grande action ; détails progressifs | Version complète du programme, limites et attribution affichées |
| Démarrer | Panneau de préparation : objectif, premier bloc, présence, puis Commencer | Même validation, texte court et case suffisamment grande | Profil et programme figés à cette action ; contrôleur futur valide tout avant envoi |
| Suivre | Direct, chiffres hiérarchisés, bloc/prochain bloc et courbe ; Focus volontaire | Composition tactile portrait ou paysage, commandes fixes | Durée active, provenance et âge des champs ; consigne distincte de la mesure |
| Pause | Pause sans confirmation préalable ; état d’arrêt à vérifier | Même position du bouton ; Reprendre au même emplacement | Point de reprise futur seulement s’il est reçu ; POC actuel interrompt le programme |
| Reprendre | Présence et arrêt stabilisé à confirmer | Une action humaine et un retour clair | Aucun redémarrage après erreur, STOP ou perte ; pas de répétition automatique d’une commande incertaine |
| Terminer | Arrêter immédiat, demande distincte de confirmation d’effet | Arrêter toujours visible à droite | Bilan après état réellement connu ; sinon alerte et STOP physique |
| Donner son ressenti | Détail : 1–10 et commentaire facultatifs, Enregistrer | Saisie après effort, jamais pendant une commande | Déclaration datée liée au profil d’origine ; modifications historisées ultérieurement |
| Analyser | Bilan, prévu/réalisé, courbes liées, événements, puis progression | Synthèse en tête, exploration au toucher, tableaux de valeurs | Calculs avec sources, couverture et périodes inconnues |
| Préparer la suite | Détail → Coach ou Composer ; proposition en brouillon | Même chaîne, édition tactile | Validation de tous les blocs et sauvegarde explicite ; retour Aujourd’hui pour démarrer |

Arnaud peut consulter Ophélie pendant une séance d’Arnaud : le Direct continue d’afficher « Arnaud · Séance en direct ». Aucun changement du profil de la séance. Le contexte du coach est renouvelé pour Ophélie, sans copier les sources d’Arnaud. Le bilan d’une séance existante garde son attribution, même si le profil courant a changé.

## 3. Navigation et cinq compositions

| Maquette / paramètre local | Premier niveau | Approfondissement | Adaptation tactile |
|---|---|---|---|
| A Aujourd’hui · `screen=today` | Prochaine séance, intention, durée, préparation | Blocs, objectif hebdomadaire, dernières séances | Programme avant objectif ; action 52 px, navigation inférieure |
| B Direct · `screen=direct` | Vitesse/allure, durée, distance, pente, bloc et transition | Fenêtre 1/5 min/séance, curseur, Focus | Portrait à une colonne ; paysage avec deux zones ; Pause/Arrêter fixes |
| C Détail · `screen=detail` | Trois indicateurs, prévu/réalisé et qualité | Courbes liées, plage, comparaison, valeurs, événements, ressenti, G05–G09 | Panneau de lecture au-dessous des courbes, slider et commandes explicites |
| D Coach · `screen=coach` | Profil, contexte, réponse et raisons | Sources ouvrables, proposition structurée, édition et brouillon | Conversation puis proposition ; l’enregistrement ne démarre aucune séance |
| E Éditeur · `screen=editor` | Nom, échauffement, groupe course/récupération, retour au calme | Répétitions, durée totale, aperçu, ajout/retrait, validation | Trois champs courts par bloc ; unités visibles ; aperçu après liste |

Les listes de bibliothèque/historique et les réglages ne sont pas de nouvelles maquettes de ce lot. Les destinations Séances/Historique ouvrent leur écran de référence. Cette convention est visible et documentée, sans simuler des fonctions serveur absentes.

## 4. États du §4.5

L’atelier replié au bas des maquettes permet de montrer les états. Les paramètres `state` ouvrent directement les états pour la capture. Les messages sont conçus pour la V1 ; aucun envoi réel n’est déclenché.

| État | Représentation et action | Paramètre |
|---|---|---|
| Première utilisation / aucun historique | Programme de départ, Créer ma première séance, historique vide et objectif à construire | `empty`, Aujourd’hui |
| Chargement | Zone stable « Chargement de votre prochaine séance… », pas de statistiques inventées | `loading`, Aujourd’hui |
| Erreur de lecture / réseau | Message compréhensible, données non actualisées, Réessayer | `error` |
| Tapis absent / déconnecté | État réel inconnu, mesures courantes `—`, STOP physique, commandes aux mêmes places | `disconnected`, Direct |
| Connexion en cours | Aucun démarrage avant confirmation, mesure courante inconnue | `connecting` |
| Autre écran propriétaire | Réglages indisponibles ; Pause/Arrêter restent accessibles si canal disponible | `owner` |
| Lecture seule | Demande de contrôle auprès du tapis nécessaire avant démarrage | `readonly` |
| Prêt | Préparer et confirmer sa présence, pas de démarrage automatique | `ready` |
| Démarrage | Demande en attente de mouvement ; consigne encore distincte | `starting` |
| Transition | Libellé de transition, cible et mesure séparées | `transition` |
| Active | Bloc courant, temps restant, prochain bloc, progression et commandes | `normal`, Direct |
| Pause | Temps conservé, reprise au même emplacement, effet d’arrêt à vérifier | `paused` |
| Reprise | Panneau de présence, aucun redémarrage automatique | `resuming` ; interaction Reprendre |
| Fin | Bilan et ressenti facultatif | `finished`, détail |
| Interruption | Statut explicite, part connu et trous conservés | `interrupted` |
| Donnée ancienne | Dernier relevé daté, valeur courante inconnue `—` | `stale`, Direct |
| Donnée manquante | Condition d’accès expliquée, aucune ligne de zéros | `missing` ; cardio toujours absent |
| Résultat de commande inconnu | Aucun nouvel envoi, STOP physique, aucune fausse réussite | `unknown` |
| Stockage en erreur | Derniers relevés non confirmés, diagnostic visible ; la V1 devra indiquer le dernier lot durable | `storage` |
| Coach déconnecté | Bibliothèque/historique disponibles, composeur désactivé | `coach-offline` |
| Autorisation refusée | Message de refus et cause d’indisponibilité | `denied` |
| Limite d’usage | Proposition déjà connue conservée, aucun faux nouvel appel | `quota` |
| Réponse IA interrompue | Réponse partielle signalée, enregistrement de proposition désactivé | `coach-interrupted` |
| Validation de séance invalide | Champ concerné et message, aperçu suspendu, enregistrer désactivé | `invalid`, Éditeur |

Les états d’infrastructure génériques disposent d’une alerte de présentation. Les décisions de reprise, durabilité, réception du contrôleur et autorisation OAuth appartiennent aux futures étapes ; les maquettes ne prouvent pas leur fonctionnement.

## 5. Graphiques G01–G10

| ID / emplacement | Question | Axes et unités | Interactions à réaliser dans la V1 | Donnée absente / ancienne |
|---|---|---|---|---|
| G01 · Direct et détail | Ai-je suivi ma consigne ? | X temps actif ou écoulé explicite ; Y vitesse km/h ou allure min/km | Fenêtre, curseur lié, zoom, sélection, retour complet, conversion vitesse/allure | Trou de mesure ; consigne indépendante maintenue ; dernière mesure avec âge, sans prolonger la courbe |
| G02 · Bande du Direct, second graphe du détail | Quelle pente et quel cardio pendant ce bloc ? | Même X que G01 ; Y pente %, cardio bpm dans une bande séparée si valide | Curseur et zoom communs, activer une série, lire source/âge | Pente absente = trou ; cardio absent = explication sans série ; ne pas mélanger bpm, % et km/h |
| G03 · Progression Direct et bas de G01 | Où suis-je dans le programme ? | X temps ; segments nommés, durée prévue/réalisée ; événements horodatés | Choisir un bloc, voir cible/réalisé, pauses, transitions et blocs sautés | Segment inconnu identifié ; une pause ne devient pas un bloc terminé |
| G04 · Détail, action Comparer | Qu’a changé une séance comparable ? | X durée active commune ou distance valide ; Y même unité et domaine commun | 2 ou 3 séances, choix alignement, masquer série, ouvrir séance, curseur commun | Pas d’alignement distance sans distance fiable ; ressentis absents affichés, pas de moyenne fictive |
| G05 · Objectif Aujourd’hui et progression du détail | Suis-je régulier ? | X semaine/mois daté ; Y minutes actives, km ou nombre de séances ; référence objectif | Choix unité/période, période précédente, toucher barre pour liste | Zéro seulement si période intégralement connue sans séance ; période inconnue en motif discontinu |
| G06 · Progression du détail, historique futur | Quand me suis-je entraîné ? | X jour de semaine ; Y semaine calendaire ; mois affiché | Mois précédent/suivant, mesure d’intensité, toucher jour et ouvrir séance | Aucun enregistrement distinct d’une donnée absente ; indication textuelle et marqueur en plus de la teinte |
| G07 · Progression du détail | Où ai-je passé mon temps ? | X durée valide par plage ; Y plages disjointes vitesse/allure ou pente ; min:s | Choix vitesse/pente, sélectionner une plage pour retrouver les périodes | Couverture affichée, temps inconnu exclu et compté ; aucune affectation des trous à zéro |
| G08 · Progression du détail et source coach | Ce programme semble-t-il plus facile ? | X séances datées comparables ; Y effort déclaré 1–10, performance dans bande propre | Filtre programme/version/durée, accès séance, masquer métrique | Ressenti absent écrit « Absent » ; aucun tracé qui comble ce point |
| G09 · Progression du détail | Quelles séances comparer ? | X allure moyenne min/km de périmètres compatibles ; Y effort 1–10 ; taille durée min | Toucher point, liste des points proches, sélectionner pour comparer | Séances sans ressenti ou distance compatible exclues avec compteur et raisons ; pas de conclusion causale |
| G10 · Détail, événements et qualité | Sur quelles données repose le bilan ? | X même temps, bandes par mesure/source ; Y catégorie ; taux % et durée valide | Toucher trou, remise à zéro ou source ; précision et provenance ; détail brut borné | Interruption et remise à zéro visibles ; pas de « 100 % » sur une source absente |

Règles communes : légendes constantes, axes lisibles, motifs/labels en plus des couleurs, descriptions accessibles et équivalent numérique. Export futur PNG/CSV avec unités et provenance ; aucune exportation analytique serveur créée ici. Calculs et agrégations futurs côté Python, pas dans deux moteurs indépendants.

Concret dans les maquettes : G01/G02 avec séries et trou commun, G03 avec blocs et pause, curseur tactile ou slider clavier, sélection explicite 10–15 min, zoom commun et résumé, G04 avec deux séries et synthèse descriptive ; G05 volume, G06 dates ouvrables, G07 durées par plage, G08 valeurs/absence, G09 deux points et exclusion, G10 couverture et événement de perte.

Limites assumées du prototype : la sélection prend une plage de référence fixe ; pas de pincement natif, brossage libre, troisième série, pipeline d’agrégation ou export. Ces interactions sont spécifiées pour l’étape graphique future. Ne pas confondre cette présentation avec leur implémentation.

## 6. Scénario de données et cohérence

Toutes les données sportives sont synthétiques dans `demo-data.js`. Elles ne viennent ni de `data/`, ni du RUN500, ni d’un compte. Le coach est un texte de présentation.

- Programme : 5 min à 6 km/h ; 4 × (3 min à 8 + 2 min à 6) ; 5 min à 5. Total 30 min, 10 segments, distance cible estimée 3,32 km.
- Direct : 17:24 actives, Course 3 (bloc 6), 36 s avant récupération, 12:36 restantes. Mesure 7,9 ; consigne 8,0 ; pente 1 %. Compteur fictif 2,01 km, granularité de 10 m.
- Détail : 30 min actives, pause de 2 min, 32 min écoulées. Compteur fictif 3,28 km ; distance estimée du programme distincte. Les moyennes de vitesse excluent les trous et ne sont pas forcées pour reproduire le compteur.
- Perte de mesure : 12:00–12:20 actives, 20 s ; couverture 1780 / 1800 = 98,9 %. La cible existe pendant ce trou ; vitesse et pente restent absentes. Pause à 14:00 actif avec durée 2 min.
- Sélection 10–15 : 5 min actives, 4:40 mesurées, vitesse moyenne environ 7,1 km/h, pente 0,6 %, compteur fictif 0,56 km et pause 2 min. Ce n’est pas une intégration exacte du compteur depuis une série de vitesse.
- G07 : 5:00 à 4–5,5 km/h ; 13:00 à 5,5–7 ; 11:40 à 7–9. Total 29:40, trous exclus. Bornes basses incluses, hautes exclues.
- Historique comparatif : 26 / 28 / 30 septembre, 30 min chaque fois ; distances 3,22 / 3,25 / 3,28 km ; ressentis absent / 6 / 5. Allure moyenne à périmètre compatible : 9,23 puis 9,15 min/km. Aucune amélioration causale déduite.
- L’historique fictif complet comprend 11 séances datées. Les agrégations de la même fixture donnent 60 / 75 / 80 / 90 min par semaine ; la semaine du 28 septembre comprend lundi 28, mercredi 30 et vendredi 2 octobre, 30 min chacun. Aujourd’hui affiche les deux plus récentes, le coach utilise les trois comparables du 26 au 30 septembre. Le calendrier montre les dix séances de septembre.

Les listes affichées sont des extraits du même historique fictif, dont les totaux sont calculés. La maquette de détail réutilise un tracé pédagogique commun lorsqu’on ouvre un extrait ; elle ne constitue pas un analyseur de séries sportives.

## 7. Vérification et réception

Les captures doivent être issues de Chrome, pas d’images de concept. Référence : cinq écrans, clair et sombre, à 390 × 844 et 1440 × 900 ; contrôle complémentaire à 430 × 932, 1024 × 768, 1920 × 1080, Direct 844 × 390. Les dimensions sont des pixels CSS de viewport, pas une preuve physique en millimètres.

Les [preuves datées](../preuves/v1/etape-01/2026-10-04/INDEX.md) distinguent la matrice de captures, la géométrie, les interactions, les contrastes et les limites. Contrôler les textes longs, les états vide/erreur/ancien, le focus, l’agrandissement à 200 %, la stabilité des commandes et la réduction du mouvement.

À recevoir par Arnaud : envie d’utiliser Aujourd’hui, lisibilité du Direct, cohérence des thèmes, navigation tactile, densité du détail, clarté des propositions et édition. Les appareils physiques et l’effort réel restent à vérifier dans leurs lots dédiés.

**Arrêt après l’Étape 01.** Aucune connexion tapis, commande de mouvement, mutation des données existantes, Étape 02/03, commit ou déploiement. La case Étape 01 reste non cochée jusqu’à réception humaine.
