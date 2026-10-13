# Refonte du Coach IA

Audit du 13 octobre 2026, puis mise en œuvre décrite au §10. Les §§2 et 3 conservent le constat initial et la proposition pour rendre les changements vérifiables. Les sources scientifiques ont été consultées le 13 octobre 2026 ; leur date de publication est conservée pour éviter de présenter une étude ancienne comme une nouveauté.

## 1. Résultat attendu

Le Coach doit proposer la séance la plus adaptée aux informations disponibles sur le profil actif, expliquer ce choix et apprendre du résultat réel. Il doit retrouver les séances et conversations pertinentes, distinguer les faits des hypothèses, calculer avec les services métier et signaler ce qui manque.

« La meilleure séance parfaite » ne constitue pas une promesse vérifiable. Le produit peut viser une proposition argumentée, compatible avec les capacités connues et ajustable selon les réponses à l'effort. Il ne peut déduire une réponse physiologique individuelle exacte du poids et d'une consigne de tapis.

## 2. Ce que fait réellement le code publié

Référence examinée : `main`, commit `431fc0fd0e763522e3eb87518fc75e7d07599f95`, égal à `origin/main` après récupération du 13 octobre 2026. Le checkout était propre. Ce constat porte sur le code publié, pas sur un serveur Windows dont le chargement aurait été vérifié. Les données personnelles réelles d'Ophélie et ses conversations n'ont pas été consultées dans cet audit.

| Sujet | Constat vérifié | Conséquence pour le besoin |
|---|---|---|
| Profil | Nom, objectif hebdomadaire en nombre de séances, unité, poids actuel et dates générales. Pas de niveau sportif structuré, d'historique du poids ni de date propre à sa mesure. | Le niveau, les préférences et la récupération dépendent de ce qui a été dit et retrouvé. [Modèle](../backend/training/profiles.py), `ProfileOut` |
| Conversations | Messages et réponses persistants, même interrompus ; archives conservées et recherchables. | Bonne base durable à réutiliser. [Stockage](../backend/coach/store.py), `reserve`, `save_turn`, `conversations` |
| Contexte immédiat | Jusqu'à 24 échanges précédents de la conversation courante, sous un budget de 40 000 caractères sérialisés ; réponses abrégées après 6 000 caractères pour les quatre récentes, puis 1 500. | Conserver un échange en base ne garantit pas que son contenu influence la prochaine réponse. [Contexte](../backend/coach/runtime.py), `Runtime.context` |
| Souvenirs | Huit souvenirs les plus récemment modifiés injectés au départ ; les autres sont recherchables. Texte libre de 500 caractères, sans type de fait, date de validité ni gestion structurée des contradictions. | Une ancienne contrainte importante peut manquer au contexte initial. Le bouton Mémoriser ne suffit pas à constituer un suivi complet. [Outils](../backend/coach/tools.py), `profile_context` ; [stockage](../backend/coach/store.py), `memories` |
| Recherche | Recherche textuelle de sous-chaînes, pagination et lecture à la demande ; pas de synthèse longitudinale ni de récupération automatique des faits pertinents avant réponse. | Le modèle doit penser à chercher et trouver les bons mots. Six tours d'inférence et une taille de requête maximale de 100 000 caractères bornent ses recherches. [Stockage](../backend/coach/store.py), `conversations` ; [moteur](../backend/coach/runtime.py), `generate` |
| Séances réalisées | Bilans, mesures, interruptions, ressenti et profil figé existent, mais aucun outil du Coach ne les expose ; `activities.available` vaut `False`. | Le Coach ne peut pas analyser la progression réelle. Il voit principalement les programmes préparés et les déclarations. [Outils](../backend/coach/tools.py), `DEFINITIONS` et `profile_context` ; [bilans](../backend/recording/service.py) |
| Création de séance | Le modèle choisit les blocs, éventuellement à partir du catalogue. Le serveur vérifie les bornes, la somme des durées, les cinq minutes de début/fin et le minimum calorique transmis. | Pas encore de contrôle structuré de la capacité personnelle, de la récupération ou des contraintes effectivement demandées. [Propositions](../backend/coach/workout_proposals.py), `ProposalInput`, `validated_preview` |
| Calories | Équations ACSM partagées côté Python ; poids obligatoire pour un chiffre, distinction actives/totales et extrapolation signalée. | Base utile ; l'hypothèse marche/course peut cependant créer un gain artificiel. [Énergie](../backend/training/energy.py) |
| Sources scientifiques | Principes dans les instructions et sources du catalogue ; pas d'outil de recherche scientifique ni de corpus versionné propre au Coach. | Une explication convaincante du modèle ne constitue pas la preuve scientifique du programme. [Instructions](../backend/coach/runtime.py), `INSTRUCTIONS` ; [catalogue](../backend/training/catalog.py), `methodology` |

### 2.1 Trois vérifications concrètes

Contrôles exécutés avec le Python du projet, sur base temporaire indépendante, sans appel au fournisseur IA ni accès au tapis :

1. **Mémoire :** créer trente échanges puis une nouvelle demande, ainsi que neuf souvenirs datés. Le contexte contient 24 échanges et huit souvenirs. La contrainte placée dans le premier échange et le souvenir le plus ancien n'y figurent pas ; l'ancienne conversation reste retrouvable par recherche. Ce résultat montre une sélection limitée, pas une perte des données.
2. **Durée :** appeler `tools.execute(..., 'validate_workout', ..., user_text='Prepare une seance de 30 minutes maximum.')` avec des blocs de 300 + 2 100 + 300 secondes et `duration_sec=2700`. Résultat : `valid=True`. Le serveur vérifie la cohérence des 45 minutes fournies par le modèle, sans vérifier les 30 minutes demandées. Ce contre-exemple ne signifie pas qu'une réponse réelle du modèle enfreint systématiquement la demande.
3. **Énergie :** appeler `energy.estimate` pour 1 800 secondes à plat et un poids hypothétique de 70 kg. Résultat : 105,0 kcal actives à 6,0 km/h ; 213,5 à 6,1 km/h, avec `outside_range=True` dans le second cas. Ce sont les sorties de la convention actuelle, pas deux mesures physiologiques ni le poids d'Ophélie.

### 2.2 Fondations à conserver

Le profil est imposé par le serveur ; le modèle ne peut pas choisir celui d'une autre personne. Les outils sont limités et ne commandent pas le tapis. Une proposition nécessite une acceptation humaine avant de devenir une séance enregistrée. Les calculs sont centralisés ; les bilans conservent les données manquantes, la couverture et les snapshots du profil/programme. Ces mécanismes doivent être étendus, pas reconstruits.

Attention lors d'une évolution calorique : [metrics.py](../backend/recording/metrics.py) porte la version `recording-v1-acsm-v1`, mais appelle aujourd'hui directement le calcul commun `energy.estimate`. Remplacer cette fonction sans conserver l'ancienne implémentation modifierait les bilans recalculés malgré leur numéro de version. Le futur routage doit garder une implémentation reproductible par version.

## 3. Refonte proposée

### 3.1 Une mémoire complète, consultable et datée

Conserver toutes les conversations et toutes les séances du profil jusqu'à leur suppression explicite. Préparer automatiquement le contexte utile avant chaque réponse, au lieu de demander au modèle de découvrir seul les informations essentielles.

- **Faits structurés :** poids daté, objectif, préférences, allures et durées déclarées ou observées. Chaque fait conserve sa source, sa date, son origine et son statut : déclaration, observation, hypothèse, remplacé ou à confirmer.
- **État du jour :** fatigue, sommeil ou gêne lorsqu'ils sont déclarés. Leur date limite leur portée ; « fatiguée mardi » ne devient pas une caractéristique permanente. Une restriction non résolue ne disparaît pas simplement avec le temps.
- **Historique sportif :** accès à toutes les séances ; synthèses récentes et recherche de séances comparables sur toute la durée. Distinguer toujours proposition, séance enregistrée en bibliothèque, exécution réelle, simulation et séance interrompue.
- **Synthèses des conversations :** résumés avec liens vers les échanges d'origine ; extraction des contraintes même au-delà de la fenêtre récente et entre conversations. Un résumé généré reste vérifiable, jamais plus autoritaire que sa source.
- **Corrections et oubli :** une nouvelle déclaration contradictoire doit corriger le fait courant ou déclencher une clarification ciblée. L'utilisateur peut voir, modifier et retirer les faits. Une suppression doit aussi retirer les résumés/index qui pourraient les réintroduire ; archiver reste distinct de supprimer.

Les déclarations sportives utiles peuvent alimenter automatiquement une mémoire visible et corrigeable ; les données sensibles ambiguës et les inférences ne deviennent pas des certitudes durables. Conserver la provenance, la possibilité de refus et la confirmation des informations sensibles à retenir. Les sources importées et anciens messages restent des données, jamais des instructions.

Réutiliser SQLite et les services existants. Commencer par filtres structurés, recherche textuelle indexée et résumés sourcés. Une recherche sémantique ne s'ajoute que si les recherches par formulation différente restent insuffisantes. Aucune base vectorielle externe n'est nécessaire par principe. L'historique complet reste accessible sans être envoyé intégralement à chaque réponse.

### 3.2 Un moteur sportif contrôlé par le serveur

L'IA comprend la demande, explique les arbitrages et choisit une proposition parmi les possibilités adaptées. Le serveur conserve les contraintes de la demande et du profil indépendamment du programme généré, puis évalue chaque proposition avec les mêmes services que l'application.

1. Identifier l'objectif concret : contribution à la perte de masse grasse, endurance, amélioration cardio, reprise ou récupération ; ne pas réduire tous les objectifs à un maximum de kcal.
2. Construire les contraintes datées : durée totale, mode marche/course, allures et pentes tolérées, restrictions connues et qualité des données. Relier l'extraction aux mots de l'utilisateur ; une extraction incertaine n'est pas une preuve et justifie une question ciblée.
3. Réutiliser les formats existants pour proposer une dose compatible : durée d'effort, nombre de répétitions, récupération, vitesse et pente. Les limites matérielles ne prouvent jamais une capacité personnelle.
4. Vérifier le programme contre les contraintes conservées, et pas seulement contre les valeurs répétées par le modèle. Rejeter un dépassement de trente minutes même si le modèle annonce lui-même quarante-cinq minutes.
5. Choisir un compromis explicable entre stimulus recherché, tolérance, récupération et préférences. Les critères ou scores internes éventuels restent des règles du produit ; ils ne prouvent pas un optimum biologique.
6. Après une séance, rapprocher prévu, réalisé et ressenti ; actualiser les capacités avec prudence. Une baisse de vitesse, une pause ou une mesure manquante ne prouve pas à elle seule de la fatigue.

### 3.3 Des calculs explicables et reproductibles

Faire évoluer le moteur partagé en conservant les calculs historiques. Traiter d'abord l'ambiguïté marche/course : exploiter le déplacement connu et sa provenance, sans imposer un nouveau contrôle technique dans chaque écran. Une vitesse seule ne permet pas toujours de savoir comment la personne se déplace.

Empêcher la sélection d'une séance parce qu'elle exploite un changement de formule ou une extrapolation favorable. Utiliser les mesures réelles et leur couverture pour le bilan ; garder une prévision distincte avant départ. Afficher l'incertitude liée aux hypothèses, sans fabriquer un pourcentage de précision. Les détails scientifiques et la méthode restent consultables dans une explication repliable, conformément à [DESIGN.md](../DESIGN.md).

### 3.4 Ordre de réalisation recommandé

| Livraison | Résultat concret | Vérification discriminante |
|---|---|---|
| Mémoire, profil et accès aux bilans | Une nouvelle conversation retrouve les faits utiles et les anciennes séances du bon profil | Ancienne contrainte retrouvée, correction prise en compte, séance citée identique au bilan, aucun mélange de profils |
| Contraintes et calcul énergétique | Une carte ne dépasse plus la demande conservée et ne bénéficie pas artificiellement du seuil de 6 km/h | Refus des 45 min pour 30 min maximum ; traitement explicite du déplacement ambigu ; anciens bilans inchangés |
| Recommandation et suivi | Le choix et la progression changent en fonction des séances réelles et des retours pertinents | Cas représentatifs comparés : début/reprise, fatigue déclarée, marche préférée, ancienne restriction, cardio, données incomplètes |

Cet ordre propose une refonte du périmètre Coach, notamment de la brique 12 du [plan](../PLAN_V1_FITNESS_APP.md). Il ne coche aucune fonction non livrée et ne fait pas passer la réception matérielle pour acquise. Livrer chaque ensemble complet directement dans l'application, avec contrôles ciblés ; pas de prototype préalable.

## 4. Base scientifique

### 4.1 Perte de masse grasse et dépense de la séance

Le consensus ACSM de 2024 ne constate pas de supériorité générale du HIIT sur l'activité modérée à vigoureuse pour la régulation du poids, ni de mode d'activité unique supérieur pour perdre du poids. La réponse associe dépense, alimentation, comportements et différences individuelles. Une dépense ponctuelle élevée ne garantit donc pas une meilleure perte de masse grasse à terme. [ACSM, consensus 2024](https://doi.org/10.1249/MSS.0000000000003520).

L'oxydation des lipides pendant l'effort est encore une autre grandeur. Le protocole FATmax d'Achten et coll. mesure les échanges gazeux par calorimétrie indirecte ; ses résultats chez des cyclistes entraînés ne fournissent pas une vitesse de tapis universelle ni une zone personnelle déductible du seul âge. Ne pas transformer des kcal estimées en grammes de graisse corporelle perdus. [Étude originale, 2002](https://pubmed.ncbi.nlm.nih.gov/11782653/).

**Conséquence produit proposée :** traduire « brûler de la graisse en 30 minutes » en séance contribuant à l'objectif de perte de masse grasse, avec une dépense soutenable et une intensité compatible avec l'expérience. Comparer éventuellement plusieurs formats tolérables ; ne pas maximiser uniquement les kcal, la vitesse ou la pente.

### 4.2 Cardio et progression

L'OMS recommande aux adultes 150 à 300 minutes hebdomadaires d'activité aérobie modérée, ou l'équivalent vigoureux. Ce repère concerne la santé à l'échelle de la semaine ; il ne prouve ni l'intensité adaptée aujourd'hui, ni une dose de départ à imposer à une personne inactive. Toute activité compte. [OMS, synthèse des recommandations 2020, page publiée en 2021](https://www.who.int/europe/publications/i/item/9789240014886).

Le CDC distingue intensité absolue et intensité relative : le même exercice n'a pas la même difficulté pour chacun. Sur son échelle d'effort de 0 à 10, 5–6 correspond généralement au modéré, 7–8 au vigoureux ; parler mais ne pas chanter est un repère pratique du modéré. Ces repères ne constituent pas une mesure de seuil ventilatoire ou de VO2max. [CDC, 4 décembre 2025](https://www.cdc.gov/physical-activity-basics/measuring/index.html).

**Conséquence produit proposée :** décrire le niveau par les efforts effectivement maîtrisés, leur durée, les récupérations et le ressenti. Pour une demande cardio, relier la proposition à l'objectif précis, au volume récent et à la fatigue. Introduire la progression par ajustements explicites après des séances tolérées ; aucun pourcentage universel de progression ni score de fatigue arbitraire ne doit devenir une vérité physiologique.

### 4.3 Calories : calcul reproductible et limites identifiées

Les équations ACSM utilisées dans le projet estiment la consommation d'oxygène à partir de la vitesse et de la pente. Le tableau ACSM donne ses meilleures plages de précision : marche à 50–100 m/min, soit 3–6 km/h ; course au-dessus de 134 m/min, soit environ 8 km/h. Ce ne sont pas des frontières individuelles entre marche et course. [ACSM, Guidelines, 8e édition, tableau 7.2, p. 159, copie du texte original](https://www.pelvichealthinstitute.org/wp-content/uploads/2025/04/ACSMs-Guidelines-for-Exercise-Testing-and-Prescription-Eighth-Edition.pdf).

Avec `v` en m/min, `g` en fraction de pente, `m` en kg et `t` en minutes :

```text
VO2_marche = 3,5 + 0,1 × v + 1,8 × v × g
VO2_course = 3,5 + 0,2 × v + 0,9 × v × g
kcal_totales = VO2 × m × t / 200
kcal_actives = (VO2 − 3,5) × m × t / 200
```

La conversion retient environ 5 kcal par litre d'oxygène, une approximation lorsque le quotient respiratoire n'est pas disponible. [Support original de Jim Ross, ACSM Metabolic Calculations](https://www.summitmd.com/pdf/pdf/090626_aps09_970.pdf). Le repos standard de 3,5 ml/kg/min n'est pas le métabolisme de repos mesuré de la personne ; Byrne et coll. montrent des écarts dans un large échantillon. Ajouter des décimales ne résout pas cette limite. [Étude originale, 2005](https://pubmed.ncbi.nlm.nih.gov/15831804/).

L'appui sur les poignées peut réduire la consommation d'oxygène à vitesse et pente identiques. Il faut conserver cette information si elle est déclarée, sans inventer un coefficient correctif personnel. [Berling et coll., étude originale, 2006](https://pubmed.ncbi.nlm.nih.gov/17135860/).

La [convention actuelle du projet](ESTIMATION_CALORIES.md) passe automatiquement de marche à course au-delà de 6 km/h. Le contrôle du §2.1 donne un exemple de son effet. Ce saut vient du changement de formule ; il ne prouve pas un doublement réel de la dépense pour la même personne qui continue de marcher.

**Conséquences produit proposées :**

- Garder un seul moteur de calcul, appelé par le catalogue, le bilan et le Coach. Le modèle de langage ne fait pas les calculs de référence.
- Distinguer la prévision de la séance et le bilan calculé sur les mesures réellement reçues ; ne pas remplacer les mesures manquantes par des consignes.
- Conserver le poids utilisé, sa date, la méthode et sa version avec le résultat. Un nouveau poids ne réécrit pas silencieusement le passé.
- Décrire la provenance du déplacement : déclaré, inféré ou inconnu. Dans la zone ambiguë, utiliser ce qui est connu et expliquer l'extrapolation ; ne pas introduire de mélange de formules présenté comme validé.
- Afficher une estimation arrondie, les calories actives/totales clairement distinguées et la couverture des mesures. Une plage entre deux hypothèses peut être montrée comme scénario, jamais comme intervalle de confiance individuel validé.
- Ne pas ajouter une prime d'« afterburn », des grammes de graisse perdus, une VO2max ou un score médical à partir de ces seuls calculs.

### 4.4 Ce qu'apporte réellement un capteur cardio

La fréquence cardiaque permet d'observer une réponse à l'effort ; elle ne mesure pas directement les calories. Keytel et coll. construisent des modèles de dépense avec fréquence cardiaque, âge, poids, sexe et éventuellement aptitude aérobie, sur 115 adultes qui s'entraînent régulièrement. La performance statistique dans cet échantillon ne garantit pas la précision pour chaque utilisateur ni pour de brefs intervalles. [Étude originale, 2005](https://pubmed.ncbi.nlm.nih.gov/15966347/).

**Conséquence produit proposée :** conserver FC, origine du capteur, date et couverture si elles existent ; utiliser aussi le ressenti et la capacité à parler. Ne pas annoncer une zone personnelle exacte à partir d'une FC maximale estimée sur l'âge. Sans FC valide, le Coach reste utile grâce aux séances reçues et au ressenti ; il indique que l'intensité cardio n'a pas été mesurée. Le ressenti et la FC seuls ne sont pas un étalon de dépense permettant de calibrer les kcal individuellement.

## 5. Informations utiles à la personnalisation

Cette sélection est une proposition produit issue des limites ci-dessus, pas une nouvelle formule physiologique.

| Information | Utilisation concrète | Règle de fiabilité |
|---|---|---|
| Profil actif | Séparer strictement Ophélie et Arnaud | Aucun fait emprunté à un autre profil |
| Poids et date de mesure | Estimer la dépense avec la bonne masse | Poids absent = calories indisponibles, pas séance impossible |
| Allures et pentes réellement tolérées | Choisir une dose compatible avec les capacités connues | Une séance proposée ou simulée ne prouve pas une capacité réelle |
| Expérience, reprise récente, préférence marche/course | Choisir le format et expliquer les transitions | Une étiquette « intermédiaire » seule ne suffit pas |
| Séances réelles, dates, durée, interruptions, ajustements | Comparer prévu/réalisé et apprécier la continuité | Historique incomplet explicitement signalé |
| Effort ressenti et récupération déclarée | Adapter l'intensité et la prochaine séance | Conserver l'échelle, la date et les mots d'origine |
| Objectif, temps disponible, préférences | Optimiser sous contraintes utiles | Trente minutes incluent début, travail et retour au calme |
| Douleur, fatigue inhabituelle, restrictions déclarées | Éviter les propositions incompatibles | Ne pas diagnostiquer ; clarifier une restriction pertinente |
| Âge et contexte pertinent | Adapter les recommandations et certains modèles | Recueillir seulement si utile ; ne pas inventer à partir du prénom |
| FC et évaluations fiables, si disponibles | Documenter la réponse et améliorer la personnalisation | Séparer valeur mesurée, estimation et donnée indisponible |

La taille, le sexe ou l'âge n'améliorent pas par magie une équation ACSM qui ne les utilise pas. Leur collecte doit correspondre à un besoin explicite, à un modèle documenté ou à une adaptation pertinente. Les données de santé éventuellement déclarées demandent une mémoire sélective, visible et corrigeable par l'utilisateur.

## 6. Comportement attendu pour la demande d'Ophélie

Exemple de parcours à implémenter, sans prescription personnelle ni valeurs physiologiques supposées :

1. Identifier son profil, son poids daté, ses préférences et les restrictions connues.
2. Lire les séances récentes et retrouver les expériences comparables, même anciennes. Distinguer les séances réalisées, interrompues, prévues et simulées.
3. Retrouver les échanges qui changent la décision : marche préférée, pente mal tolérée, reprise, fatigue ou objectif modifié. Un résumé doit pouvoir renvoyer au fait d'origine.
4. Demander uniquement une information qui change réellement le choix et manque encore : tolérance connue, état du jour ou restriction pertinente.
5. Construire une proposition de trente minutes complètes à partir de capacités connues ; calculer les estimations avec le moteur partagé et vérifier les contraintes du tapis.
6. Expliquer brièvement pourquoi ce format convient aujourd'hui, sur quelles séances il s'appuie et comment reconnaître l'effort attendu. Présenter les kcal comme estimation, sans promesse de graisse perdue.
7. Après acceptation et réalisation, rapprocher proposition, mesures et ressenti ; enregistrer les faits utiles à la prochaine recommandation.

Une réponse réussie ne récite pas tout l'historique. Elle sélectionne les informations décisives tout en gardant accès aux archives. « Je me souviens » doit correspondre à un enregistrement retrouvé, pas à une phrase plausible.

## 7. Critères de vérification proposés

- Une ancienne conversation pertinente et une séance au-delà d'une simple liste récente peuvent être retrouvées avec leur date et leur origine.
- Changer de profil ne transmet ni séances, ni contraintes, ni souvenirs de l'autre utilisateur.
- Le poids actuel sert à une nouvelle prévision ; une ancienne séance conserve la masse et la méthode utilisées à l'époque.
- Une demande identique produit un argument différent lorsque des faits utiles changent : tolérance, arrêt récent, récupération ou préférence.
- L'absence de FC, de poids ou de bilan ne devient ni une valeur nulle physiologique, ni une réussite supposée.
- Une demande « maximum de graisse » ne contourne ni limites matérielles, ni intensité personnelle, ni restrictions connues.
- Les trente minutes annoncées correspondent à la somme des segments ; les calculs du Coach et de l'application concordent.
- Les références scientifiques servent à justifier un principe documenté. Elles ne sont pas présentées comme la validation clinique des vitesses et pentes choisies par l'application.
- Une contrainte apparaît encore après trente échanges, dans une nouvelle conversation ou après archivage ; une correction récente remplace sa portée actuelle sans effacer l'origine historique.
- Un souvenir supprimé ne revient pas par un résumé ou un index ; un échec de recherche n'est pas présenté comme une absence de fait.
- Le validateur confronte la carte à la durée et aux restrictions conservées, même si les paramètres fournis par le modèle les contredisent.
- Le nouveau moteur énergétique conserve les résultats historiques par version et distingue les hypothèses de déplacement des mesures.

## 8. Vérifications effectuées pour cet audit

- Lecture des instructions, du plan, du design et des services profil, mémoire, contexte, outils, propositions, catalogue, énergie et bilans, ainsi que des tests associés.
- `git fetch --no-tags origin main`, comparaison du checkout et avance rapide : dépôt initial propre et synchronisé au commit indiqué au §2.
- `.venv/Scripts/python.exe -m unittest tests.test_coach tests.test_energy tests.test_workout_proposals -q` : **45 tests réussis**. Ces tests utilisent des données isolées et des transports simulés ; ils ne mesurent pas la qualité des réponses du modèle réel.
- Trois vérifications supplémentaires décrites au §2.1 : fenêtre de mémoire, durée demandée et transition de formule calorique.
- Relecture des sources scientifiques et du document ; `git diff --check`.

Aucun code applicatif modifié pour cet audit, aucun appel réel au Coach, aucun bilan personnel analysé, aucune commande Bluetooth et aucune recette navigateur. La refonte proposée reste à implémenter ; un futur contrôle de pertinence doit inclure des réponses réelles et ne peut se limiter aux tests techniques.

## 9. Limites de cette recherche

Les recommandations populationnelles et les études citées orientent le produit ; aucune ne valide à elle seule un algorithme personnel FitnessApp. Il n'existe ici ni mesure de calorimétrie d'Ophélie, ni détermination de FATmax, ni démonstration d'une séance optimale individuelle. Des mesures plus riches peuvent améliorer une décision, sans supprimer l'incertitude.

Le lien Texas Tech utilisé dans `ESTIMATION_CALORIES.md` a renvoyé une erreur HTTP 404 lors de cette recherche. Le tableau ACSM original a été retrouvé dans la copie déjà référencée par ce même document. L'audit initial ne modifiait ni les équations, ni l'historique, ni les règles de commande du tapis. La mise en œuvre ultérieure est décrite au §10.

## 10. Mise en œuvre du 13 octobre 2026

### 10.1 Mémoire et profil

Migration additive `0010` : métadonnées et statut des souvenirs, contraintes des demandes/propositions, repère de reprise des archives, date du poids et historique des nouvelles saisies. Les tables et contenus existants sont conservés. Pas de dépendance ajoutée.

- Les allures confortables clairement déclarées en km/h sont retenues dès l'enregistrement du message, sans dépendre du succès du modèle. Les autres faits passent par `capture_context`, étape préalable obligatoire de chaque réponse, avec citation exacte et source du profil.
- Les corrections remplacent le fait courant ; les sources anciennes ne le rétablissent pas. Une modification dans Mémoire actualise aussi la valeur numérique appliquée par le serveur, avec validation de l'unité.
- L'état du jour a une validité de 24 h ; une allure déclarée confortable devient à actualiser après 90 jours. Ces fenêtres sont des choix prudents du produit, pas des durées de validité physiologique démontrées. Les restrictions sensibles restent à confirmer ; une restriction non résolue ne s'efface pas avec le temps.
- Retirer un souvenir le masque et empêche sa reprise automatique depuis sa citation ancienne. Le texte original reste conservé dans sa conversation : retirer un souvenir n'est pas supprimer toute la conversation.
- Les consignes ponctuelles, comme « ne l'enregistre pas », ne deviennent pas des préférences permanentes. L'ancien outil de proposition de préférence n'est plus exposé ; les cartes historiques restent consultables.
- Les anciens échanges sont examinés progressivement pendant les réponses, en plus d'une recherche liée à la demande. Toutes les conversations restent accessibles, même archivées. Le contexte sélectionne jusqu'à 24 faits avec priorité aux contraintes/capacités ; les autres restent lisibles par pagination. Aucune promesse de lecture intégrale des archives en un seul appel.

Implémentation : [mémoire](../backend/coach/memory.py), [stockage](../backend/coach/store.py), [moteur](../backend/coach/runtime.py), [écran Mémoire](../frontend/src/features/CoachMemory.tsx).

### 10.2 Bilans, recommandations et contraintes

Le Coach reçoit les résumés des cinq bilans récents, leurs sources, leur qualité, le ressenti et les cumuls reçus sur sept jours. `list_sessions`, `get_session`, `get_session_samples`, `get_feedback`, `get_progress` et `compare_sessions` donnent accès aux bilans du seul profil. Les métriques viennent du service existant et restent identiques à celles de l'écran Bilan ; les grandes lectures sont paginées ou explicitement abrégées.

`recommend_workout` fournit une base à partir d'une allure déclarée ou de blocs terminés, reçus avec une couverture suffisante et un ressenti déclaré au plus 6/10. Une observation de plus de 28 jours n'est pas utilisée comme preuve de capacité actuelle ; elle reste retrouvable. Une simulation ne sert pas à prouver une capacité réelle. Sans repère, la base propose une marche prudente en annonçant l'hypothèse. Cette construction est une règle FitnessApp, pas un modèle clinique validé ; l'IA peut adapter la dose avant validation.

Les contraintes explicites sont conservées en dehors des blocs du modèle : durée maximale, plafonds personnels, marche seule et minimum calorique. La validation et la proposition les contrôlent. Un minimum calorique oublié par le modèle est encore imposé côté serveur. Le poids et les limites courants sont revérifiés à l'acceptation d'une proposition non retouchée ; une retouche humaine conserve son auteur et la validation métier générale.

Implémentation : [lectures](../backend/coach/insights.py), [construction](../backend/coach/recommendations.py), [contraintes](../backend/coach/constraints.py), [propositions](../backend/coach/workout_proposals.py).

### 10.3 Estimation énergétique

`acsm-v2-movement` traite le déplacement prévu comme une hypothèse documentée. En l'absence de déplacement connu entre 6 et 8,04 km/h, le calcul ne fournit plus un nombre unique, mais deux scénarios. Le détail de la séance explique cette incertitude et la cible calorique ne peut pas être validée sur un nombre indisponible. Le catalogue renseigne son intention et l'éditeur la retire lorsque le type ou la vitesse change. Un ajustement de vitesse en Direct peut également rendre cette intention caduque.

Les anciens bilans `recording-v1-acsm-v1` restent calculés avec la formule v1 conservée ; les nouveaux utilisent v2. Le repos de 3,5 ml/kg/min et les 5 kcal/litre restent des approximations standard. Ni âge/taille supplémentaires, ni fréquence cardiaque non étalonnée, ni décimales supplémentaires ne sont présentés comme une précision individuelle.

### 10.4 Contrôles et limites

Suite backend complète : **197 tests réussis**, dont les nouveaux contrôles de mémoire, oubli, correction manuelle, sources, durée, cible calorique omise, session ancienne et conservation des calculs historiques. `npm run build` réussi, TypeScript inclus. Relecture du diff et contrôle d'espaces.

Les essais réels du modèle utilisent la connexion SIWC existante et une base indépendante en simulation, avec des déclarations et un bilan de vérification. Le premier essai a produit une séance de 30 min à l'allure déclarée, en marche, avec pente bornée. La reprise dans une autre conversation et la correction d'allure ont servi à corriger les consignes temporaires mémorisées à tort et l'ancien parcours de confirmation. Les résultats techniques ne prouvent ni la supériorité sportive de ces séances, ni le fonctionnement matériel du RUN500.

Le dernier essai réel a retenu la correction à 4,2 km/h sans confirmation supplémentaire et proposé exactement 25 min de marche, avec pente au plus 2 %, 68,6 kcal actives estimées et référence au bilan simulé. La réponse explique que la simulation ne prouve aucune tolérance physique. Le lien ouvre réellement le bilan : 20 min, 1,17 km, environ 45 kcal actives, ressenti 5/10. Chrome a vérifié la conversation et la mémoire avec citation/date au format 390 × 844 ; aucune nouvelle erreur console sur ce parcours. Les avertissements antérieurs correspondent aux arrêts volontaires du serveur de diagnostic. Les derniers ajustements de messages d'erreur ont été revérifiés par 38 tests ciblés réussis.

### 10.5 Vérification sur la base réelle et fin de recherche

Le redémarrage sur la base réelle applique `0010`. Une sauvegarde SQLite a précédé la migration ; les anciennes lignes des profils, conversations, messages, réalisations, mesures et programmes restent intactes. La vérification a confirmé la séparation des profils, y compris le refus HTTP 404 d'une conversation appartenant à un autre profil. Un historique absent reste absent ; il ne doit pas être reconstitué à partir d'un autre utilisateur.

Le premier appel réel avec recherche et proposition a atteint huit étapes après des citations corrigées par le modèle : la carte était valide, mais la réponse finale manquait. Le moteur réserve désormais une neuvième étape sans outils pour expliquer les résultats reçus et leurs limites. Il conserve la borne de huit étapes de recherche et le délai global ; si la préparation mémoire échoue encore, aucune réponse non préparée n'est produite. Régression protégée et **39 tests ciblés réussis**. Les descriptions des champs rappellent les secondes et les citations exactes, et les contraintes déjà extraites côté serveur ne sont pas recopiées inutilement.

Après correction et redémarrage, un appel réel dans une nouvelle conversation a retrouvé une ancienne proposition et la réalisation interrompue du même profil : réponse terminée en six appels, sans erreur d’outil. Un second message a produit une carte de 30 min et son estimation au poids courant, puis une réponse terminée en cinq appels, sans erreur. Le lien du bilan a été ouvert dans Chrome ; les valeurs historiques restent celles de v1. Les consignes de vérification n’ont ajouté aucun souvenir personnel et aucune séance n’a été sauvegardée. Aucun contrôle du tapis n’a été exercé. Les essais échoués restent explicitement visibles dans leur conversation de vérification.

Pas de mesure calorimétrique individuelle, pas d'essai matériel dans cette livraison. Aucun planning daté ajouté. Le modèle reste celui choisi dans le compte ; aucune API payante de secours et aucun service externe de mémoire/observabilité ajouté. Le serveur doit être relancé pour charger le code et migrer la base locale.
