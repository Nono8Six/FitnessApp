# Envoi des séances FitnessApp vers Apple Santé — recherche du 25 octobre 2026

Recherche documentaire préalable. Aucun compte connecté, aucune séance envoyée, aucun essai sur iPhone et aucun code applicatif modifié dans le cadre de cette recherche. Les possibilités documentées doivent être distinguées d'une réception effectivement observée dans Santé et Forme.

## Décision possible avec les informations disponibles

Raccourcis n'est pas la seule solution. Pour conserver Chrome et ne développer aucune application iPhone, les voies sérieuses sont **Raccourcis**, **Strava avec import de fichier**, **FitnessSyncer** et **un importeur local comme TCX to HealthKit**. Elles demandent toutes un relais sur l'iPhone pour écrire dans Santé ; ce relais peut être une application existante et gratuite.

| Voie | Coût documenté au 25 octobre 2026 | Parcours après la séance | Limite décisive |
|---|---|---|---|
| Raccourcis Apple | Gratuit | Bouton du bilan sur l'iPhone → raccourci configuré → Santé | Configuration initiale ; réception réelle non vérifiée |
| Strava, import manuel TCX/FIT | Gratuit | Export du bilan → import web Strava → application Strava iPhone → Santé | Plusieurs étapes ; pas quotidiens non garantis |
| Strava, notre propre API | Abonnement requis pour créer l'application API | Envoi depuis le backend → Strava → application iPhone → Santé | Ne respecte pas le budget zéro |
| FitnessSyncer | Gratuit jusqu'à cinq tâches source/destination | Formulaire web prérempli ou import de fichier → synchronisation dans l'application iPhone → Santé | Compte et cloud supplémentaires ; synchronisation à déclencher sur le téléphone |
| TCX to HealthKit | Gratuit, aucun achat intégré affiché | Fichier TCX téléchargé sur l'iPhone → partager avec l'importeur → Santé | Compatibilité exacte sans GPS et conservation des calories/pas à tester |
| Wahoo, import FIT direct | Offre de base gratuite | Import FIT dans l'application → partage manuel vers Santé | Parcours composite documenté, mais réception iPhone non démontrée |
| Saisie manuelle dans Fitness/Santé | Sans intégration payante | Recopier les valeurs de la séance | Aucun transfert automatique depuis FitnessApp |

Les sources et réserves de chaque ligne figurent dans les sections correspondantes. « Gratuit » décrit l'offre consultée, sans garantie sur les futures décisions tarifaires des éditeurs. La présence d'achats intégrés facultatifs ne signifie pas nécessairement que la fonction recherchée est payante.

Pour l'objectif « un bouton gratuit sans compte tiers », Raccourcis reste le chemin le plus direct après configuration. Pour éviter cette configuration, FitnessSyncer mérite un essai court de son formulaire, et TCX to HealthKit un essai d'import local. Strava est surtout intéressant si les séances doivent également apparaître dans Strava. Il ne faut pas lancer trois intégrations en parallèle.

## Ce que permettent réellement les API Apple

### HealthKit et le navigateur

Apple documente HealthKit comme un accès natif au magasin Santé : capacité à activer dans l'application, description de son usage et autorisations de lecture/écriture accordées par l'utilisateur. **Aucune API REST publique Apple permettant à notre serveur Windows ou au JavaScript de Chrome d'ajouter directement ces séances n'a été identifiée.** C'est une conclusion de l'architecture et des API documentées, pas une prétendue vérification de tous les services privés d'Apple. Installer le site comme PWA ne lui donne pas cette capacité native. [Configuration HealthKit](https://developer.apple.com/documentation/xcode/configuring-healthkit-access), [autorisations par type de données](https://developer.apple.com/documentation/healthkit/authorizing-access-to-health-data).

Les App Clips n'offrent pas un contournement sans installation : Apple indique explicitement que la disponibilité HealthKit y retourne faux. [Fonctions disponibles dans un App Clip](https://developer.apple.com/documentation/appclip/choosing-the-right-functionality-for-your-app-clip).

### WorkoutKit, fichiers et autres API

WorkoutKit crée et programme des **séances à effectuer** dans Exercice sur Apple Watch. Un fichier de programme d'entraînement n'est pas l'import des mesures d'une séance déjà terminée. Apple renvoie vers HealthKit pour les statistiques des séances réalisées. [WorkoutKit](https://developer.apple.com/documentation/workoutkit), [présentation Apple, WWDC 2023](https://developer.apple.com/videos/play/wwdc2023/10016/).

La documentation Santé explique l'export des données en XML et le partage avec des applications autorisées ; elle ne fournit pas d'import natif générique de nos fichiers FIT/TCX/JSON depuis le navigateur. Cela explique le rôle des importeurs ci-dessous. Les API de dossiers cliniques FHIR concernent les données médicales de fournisseurs pris en charge, pas un endpoint web de séances sportives. [Partage et export Santé](https://support.apple.com/en-ie/guide/iphone/iph5ede58c3d/ios), [configuration des dossiers cliniques](https://developer.apple.com/documentation/xcode/configuring-healthkit-access).

### Santé, Forme et pas : trois résultats à distinguer

Apple indique que les exercices d'applications compatibles peuvent apparaître dans le résumé Fitness et contribuer à l'anneau Bouger. Cela ne garantit pas que chaque importeur écrira toutes les données nécessaires, ni qu'une importation reproduira tous les anneaux d'une Apple Watch. [Synchroniser une application d'exercice tierce](https://support.apple.com/fr-fr/guide/iphone/iph392b962da/ios).

Une séance enregistrée et un nombre de pas sont des types de données distincts. L'énergie active exclut la dépense de repos. Le contrôle d'une intégration doit donc séparer : séance, durée, distance, calories **actives**, pas, puis résultat dans Forme. Il ne faut pas transformer une distance en faux comptage mesuré, ni additionner aveuglément un import à la même séance déjà enregistrée par une montre. [Types d'énergie et de pas HealthKit](https://developer.apple.com/documentation/healthkit/hkquantitytypeidentifier/activeenergyburned).

## Raccourcis Apple : solution existante, pas solution exclusive

L'application Apple est gratuite. Son schéma d'URL permet à un navigateur d'exécuter un raccourci déjà installé en lui transmettant du texte. Le raccourci peut ensuite traiter les valeurs et les enregistrer dans Santé avec les autorisations accordées sur l'iPhone. [Raccourcis dans l'App Store](https://apps.apple.com/fr/app/raccourcis/id1462947752), [exécution depuis une URL](https://support.apple.com/guide/shortcuts/run-a-shortcut-from-a-url-apd624386f42/ios), [actions de partage, dont enregistrement Santé](https://support.apple.com/en-in/guide/shortcuts-mac/apdaf74d75a5/mac).

Dans FitnessApp, le code publié prépare déjà un lien avec début, durée active, distance complète et calories actives exploitables. Il n'envoie pas de pas. Cela a été relu dans `frontend/src/lib/appleHealth.ts` pendant cette recherche. Le guide existant est `docs/APPLE_SANTE.md`.

La partie iPhone reste à configurer et à vérifier. Le clic ne prouve pas l'enregistrement. Un lien `shortcuts://` ouvert sur le PC ne pilote pas à distance Raccourcis sur l'iPhone : il faut ouvrir le bilan sur ce dernier, ou concevoir séparément un transfert entre les deux appareils. Aucun raccourci iCloud installable et vérifié n'a été livré à ce stade.

## Strava

### Conclusion pour notre besoin

**Strava constitue une autre passerelle possible vers Santé pour une séance de tapis sans GPS. La voie gratuite documentée passe par un import manuel de fichier. Une nouvelle intégration automatique utilisant notre propre application API Strava exige désormais un abonnement Strava : elle ne respecte donc pas la contrainte « 100 % gratuite ».** Ces deux parcours ne doivent pas être confondus. [Import des activités](https://support.strava.com/en-us/articles/15402066-how-do-i-get-my-activities-to-strava), [création d'une application API](https://developers.strava.com/docs/getting-started/).

Parcours gratuit envisageable : séance FitnessApp → export TCX ou FIT → import sur le site Strava → synchronisation par l'application Strava de l'iPhone → Santé. Il demande un compte Strava et l'application iPhone. L'appréciation de simplicité est une conclusion d'usage : pour un simple bouton en fin de séance, cette chaîne ajoute des manipulations et un intermédiaire par rapport à un raccourci Apple déjà configuré. Elle devient intéressante si l'utilisateur souhaite aussi conserver ses séances dans Strava.

### Sens exact de la synchronisation Apple

La documentation du **21 septembre 2026** prévoit type d'activité, durée, distance et calories avec **Send to Health**. L'exclusion des données tierces concerne leur **tracé GPS**. Dans le sens inverse, **Santé → Strava**, seules les séances Apple natives des trente derniers jours sont acceptées. Ne pas inverser ces restrictions. La connexion et les autorisations se configurent dans l'application Strava iPhone. Ni les pas quotidiens ni chaque anneau ne sont garantis par cette page. [Apple Health and Strava](https://support.strava.com/en-us/articles/15402024-apple-health-and-strava).

Une activité visible dans Strava ne constitue pas une preuve de sa réception dans Santé : le résultat doit être vérifié sur l'iPhone.

### Tapis sans GPS et données conservables

Strava accepte officiellement les activités intérieures issues d'un appareil **sans GPS**, à condition que le fichier soit compatible. Une carte n'est pas nécessaire. Son application mobile téléphone ne sait actuellement pas enregistrer une course intérieure et en mesurer la distance par podomètre ; l'application Apple Watch est un cas distinct. Lancer simplement l'enregistrement Strava sur l'iPhone ne remplace donc pas notre export du tapis. [Indoor, Treadmill, and Bike Trainer Activities, 16 septembre 2026](https://support.strava.com/en-us/articles/15401956-indoor-treadmill-and-bike-trainer-activities).

Pour les fichiers importés, les coordonnées sont optionnelles, contrairement aux horodatages des points. Les formats utiles sont :

| Format | Données documentées pertinentes | Limite pour notre décision |
|---|---|---|
| TCX | Points horodatés, temps, distance et calories des tours ; extensions pour cadence | Convient à un export simple ; seuls certains totaux sont interprétés |
| FIT | Temps, distance, calories, vitesse, fréquence cardiaque, cadence ; champs de foulées et cycles | Plus riche ; un champ lu par Strava ne garantit pas son transfert vers Santé |
| GPX | Format géographique et extensions de mesures | Peu adapté à un tapis ; aucun intérêt à inventer un parcours GPS |

Le JSON décrit récemment par Strava concerne seulement musculation, HIIT, Workout et CrossFit, pas un remplacement général des fichiers de course. Le traitement d'un upload est asynchrone : un accusé de réception HTTP ne prouve ni la création définitive de l'activité ni l'envoi à Santé. [Documentation des uploads](https://developers.strava.com/docs/uploads/).

### Gratuité réelle : import manuel contre API

Le service de base permet gratuitement d'enregistrer et partager des activités. L'import web accepte GPX, TCX et FIT jusqu'à 25 Mo. Le personnel Strava confirme explicitement des imports par lots de **15 fichiers pour les non-abonnés**, contre 25 pour les abonnés : l'import de fichiers n'est donc pas réservé à l'abonnement. Cela ne signifie pas un quota journalier illimité. [Is Strava Free?, 9 septembre 2026](https://support.strava.com/en-us/articles/15402187-is-strava-free), [How Do I Get My Activities to Strava?, 10 septembre 2026](https://support.strava.com/en-us/articles/15402066-how-do-i-get-my-activities-to-strava), [réponse officielle sur les lots d'import](https://communityhub.strava.com/insider-journal-9/account-access-series-part-2-locate-or-merge-1565).

En revanche, la documentation développeur indique à deux endroits qu'un **abonnement est nécessaire pour créer une application API**. La FAQ officielle mise à jour le **4 juin 2026**, après les changements annoncés le 1er juin, confirme cette condition et précise qu'il n'y a pas de supplément API pour l'abonné du Standard Tier. Un ancien message officiel de janvier 2023 indiquant que l'abonnement n'était pas requis est donc obsolète pour une nouvelle application. [Getting Started](https://developers.strava.com/docs/getting-started/), [FAQ API 2026](https://communityhub.strava.com/developers-knowledge-base-14/strava-api-faq-12906), [ancienne réponse de 2023](https://communityhub.strava.com/developers-api-7/register-an-app-w-o-subscription-3153).

### Détails utiles si la contrainte de gratuité change

- `POST /activities` crée une activité **manuelle** : nom, type, début, durée, distance facultative et indicateur d'intérieur. Il ne propose pas de paramètre calories ni de séries de fréquence cardiaque, cadence ou pas. Ce raccourci technique ne garantit pas la conservation de nos calories.
- `POST /uploads` accepte un fichier FIT/TCX/GPX, son type, un nom, une description, l'indicateur d'intérieur et un identifiant externe. Il faut ensuite vérifier le résultat du traitement. Les deux écritures exigent le scope OAuth `activity:write`.
- Le nombre de foulées présent dans un FIT ne constitue pas une preuve d'écriture d'échantillons de pas dans Santé.

[Référence API — activités et uploads](https://developers.strava.com/docs/reference/), [champs importés](https://developers.strava.com/docs/uploads/).

L'autorisation OAuth, les jetons de six heures et leur renouvellement ajoutent un service d'intégration à maintenir. Les secrets doivent rester côté serveur, pas dans le JavaScript du navigateur. Le domaine de retour `localhost` est prévu pour le développement. [Authentification](https://developers.strava.com/docs/authentication/), [Getting Started](https://developers.strava.com/docs/getting-started/).

Une nouvelle application commence avec un seul athlète. Une augmentation autonome jusqu'à dix est possible ; au-delà, Strava examine l'application. Les quotas initiaux documentés sont 200 requêtes par quinze minutes et 2 000 par jour, avec un sous-quota hors uploads de 100/1 000. L'augmentation à dix athlètes indique 400/4 000 au total et 200/2 000 en lecture. Les en-têtes et le tableau de bord restent la référence effective. [Rate Limits](https://developers.strava.com/docs/rate-limits/).

La FAQ qualifie de non conforme le fait de créer ses propres identifiants API pour les confier à une plateforme intermédiaire qui redistribue les données. Un service existant disposant de sa propre intégration approuvée est un cas différent ; on ne peut pas présumer de sa gratuité ni de sa capacité à importer nos séances. Les intégrations d'appareils existantes sont annoncées comme non affectées par les changements de juin. [FAQ API 2026](https://communityhub.strava.com/developers-knowledge-base-14/strava-api-faq-12906).

### Preuve encore manquante avant de retenir ce parcours

La documentation rend la voie fichier → Strava → Santé plausible et compatible avec l'absence de GPS. Elle ne constitue pas une recette effectuée avec FitnessApp. Le contrôle décisif serait une séance réelle courte, importée une seule fois, puis comparée dans les trois systèmes : début, durée, distance, énergie et type d'exercice. Il faudrait vérifier séparément les pas, la présence dans Forme, les anneaux et les éventuels doublons.

Il faudrait aussi déterminer explicitement si les calories envoyées sont actives ou totales : le nom `total_calories` d'un fichier ne suffit pas à établir comment chaque plateforme les interprète. Aucune promesse de conservation parfaite ni de synchronisation immédiate en arrière-plan n'est faite ici. Aucun abonnement ou essai payant n'a été activé pour cette recherche.

## FitnessSyncer : une autre voie gratuite depuis le PC

L'offre gratuite inclut jusqu'à **cinq tâches source/destination**, avec lecture et écriture Apple Health annoncées. L'abonnement Pro est facultatif pour ce petit nombre de connexions. [App Store France](https://apps.apple.com/fr/app/fitnesssyncer/id1159207899).

Le Notebook accepte la saisie d'une séance et les fichiers FIT/TCX. Il peut ensuite alimenter les destinations configurées. [Notebook](https://www.fitnesssyncer.com/support/notebook?lang=en).

Un lien officiel permet d'ouvrir le Notebook prérempli : activité, durée en secondes, distance en kilomètres, calories et pas. L'exemple de l'éditeur ne contient aucun GPS. Le schéma comprend des dates UTC en millisecondes, mais leur transmission par lien reste ambiguë : le texte cite String/Integer/Double, tandis que les dates sont de type Long. La définition des calories ne tranche pas suffisamment entre actives et totales. L'API OAuth permet également des écritures ; les applications personnelles ont une console dédiée, les autres usages demandent de contacter l'éditeur. [Documentation API, modèle Activity et Notebook Editor Links](https://www.fitnesssyncer.com/api/documentation.html). L'éditeur annonce une API gratuite pour ses propres données. [Présentation officielle](https://www.fitnesssyncer.com/).

Parcours envisagé : **bouton FitnessApp → formulaire web prérempli → enregistrer → ouvrir FitnessSyncer sur l'iPhone → Sync Now → Santé**. L'app iPhone est le relais d'écriture, après autorisation des catégories concernées. Les notifications de synchronisation nécessitent également une interaction ; le PC seul ne garantit pas un envoi silencieux immédiat. La documentation prévoit la publication d'activités dans Santé. [Intégration Apple Health](https://www.fitnesssyncer.com/support/apple-health), [matrice des services](https://www.fitnesssyncer.com/support/supported-apps-and-services).

Les mises à jour d'éléments déjà envoyés ne sont pas répercutées automatiquement, et la prévention des doublons n'est pas une garantie absolue. Les résumés journaliers de pas peuvent attendre le lendemain. [FAQ de synchronisation](https://www.fitnesssyncer.com/support/sync-faq).

**À vérifier avant d'intégrer ce bouton :** bonne date et bon fuseau, marche/course intérieure, énergie active, présence d'un véritable exercice dans Santé, écriture effective des pas et comportement lors d'un second envoi. Le champ `steps` dans un formulaire ne prouve pas à lui seul son arrivée dans le compteur quotidien Apple. Cette solution ajoute un compte et le stockage des données chez FitnessSyncer, contrairement à un import local.

## TCX to HealthKit : importeur local gratuit

L'application de Noah Nethery est affichée **gratuite, sans achat intégré**, et exige iOS 17. Elle importe les exercices TCX dans Santé ; le journal de versions annonce le partage depuis une autre app, le choix du type d'activité et l'association de distance/fréquence cardiaque à l'exercice. [App Store France](https://apps.apple.com/fr/app/tcx-to-healthkit/id6466232200).

L'éditeur indique que le traitement se fait sur l'appareil, sans connexion Internet ni collecte de données. [Politique de confidentialité](https://nethery.dev/tcx/privacy.html).

Parcours envisagé : **export TCX FitnessApp → télécharger sur l'iPhone → partager vers TCX to HealthKit → Santé**. Aucun compte sportif supplémentaire n'est nécessaire selon le fonctionnement décrit. La documentation ne confirme pas explicitement l'acceptation de notre fichier tapis sans coordonnées, les calories actives, les pas ou les doublons. Un essai du fichier réel reste donc nécessaire. Aucun code source public de cette application n'a été identifié pendant la recherche.

## Wahoo : parcours FIT à confirmer

L'offre de base Wahoo est gratuite et inclut les connexions à des applications tierces. [Offres Wahoo](https://eu.wahoofitness.com/fitness-apps).

Wahoo permet d'importer un fichier FIT externe puis de partager manuellement cette activité. Les activités importées ne sont pas retransmises automatiquement ; les saisies uniquement textuelles ne peuvent pas être partagées. Apple Health figure dans ses destinations. Le parcours **FIT direct → Wahoo → partage manuel Santé** est donc plausible, mais pas testé ici. [Import FIT et saisie manuelle](https://support.wahoofitness.com/hc/en-us/articles/18790709768850-Add-or-Edit-an-Activity-manual-text-entry-or-import-FIT-file-Wahoo-App), [destinations autorisées](https://support.wahoofitness.com/hc/en-us/articles/14467471126802-Authorized-Apps-Wahoo-app).

En revanche, les activités reçues de Strava par Wahoo ne peuvent pas être repartagées vers d'autres applications. **Ne pas recommander Strava → Wahoo → Santé comme contournement.** Ne pas confondre non plus Wahoo app et SYSTM, qui ont des fonctions différentes. [Restriction de retransmission Strava](https://support.wahoofitness.com/hc/en-us/articles/22432515054482-Auto-upload-completed-Strava-activities-to-Wahoo-app-SYSTM-history).

## Autres importeurs : gratuité insuffisante pour notre besoin

| Application | Obstacle documenté | Source primaire |
|---|---|---|
| RunGap | Écriture vers Santé réservée à Swag Bag payant | [Aide de l'éditeur](https://rungap.zendesk.com/hc/en-us/articles/222528287-Using-Apple-Health-with-RunGap) |
| HealthFit | Application payante à l'achat, 7,99 € affichés en France | [App Store](https://apps.apple.com/fr/app/healthfit/id1202650514) |
| Health Sync by appyhapps | Une semaine d'essai, puis licence payante | [App Store](https://apps.apple.com/fr/app/health-sync-by-appyhapps/id6480174471) |
| Health CSV Importer | Gratuit pour le poids ; pas et exercices réservés à Pro | [App Store](https://apps.apple.com/fr/app/health-csv-importer/id1275959806) |
| Health Data Importer | Gratuité limitée aux données datant d'au moins quatre ans | [App Store](https://apps.apple.com/fr/app/health-data-importer/id1158733998) |
| Health Import Tool | Cent séances gratuites, puis achat pour l'import illimité | [App Store](https://apps.apple.com/fr/app/health-import-tool/id6809584040) |
| Health Migrate | Lecture gratuite ; écriture Santé consommant des jetons payants | [App Store](https://apps.apple.com/fr/app/health-migrate/id6799583653) |

Un essai gratuit ou un quota initial ne répond pas à la demande d'usage durablement sans paiement. Ces applications ne sont pas qualifiées d'inutilisables : elles sortent simplement de cette contrainte budgétaire.

## Autres écosystèmes et projets ouverts

| Voie | Résultat de la vérification |
|---|---|
| Runkeeper | Exclut de l'envoi vers Santé les données tierces et les activités saisies sur son site. Ne constitue pas un relais de nos imports. [Aide officielle](https://help.runkeeper.com/en/hc/apple-health-how-to-connect-and-use-with-runkeeper) |
| Garmin Connect | Import de fichiers et envoi à Santé existent, mais le déclenchement Santé documenté suit une synchronisation d'appareil Garmin, app au premier plan. Relais sans appareil non établi. [Import](https://support.garmin.com/en-CA/?faq=Ht3ZP52Kju075uKvqTqu99), [Santé](https://support.garmin.com/en-AU/?faq=lK5FPB9iPF5PXFkIpFlFPA) |
| Polar Flow | Saisie web et export Santé documentés séparément ; transfert de ces saisies non prouvé. Aucun endpoint AccessLink d'import de notre séance identifié. [Saisie](https://support.polar.com/au-en/how-do-i-add-a-training-session-to-polar-flow-web-service-manually), [Santé](https://support.polar.com/en/support/connecting_polar_flow_with_apple_health), [API](https://www.polar.com/accesslink-api/) |
| HealthImportDemo | Import FIT cyclisme vers Santé, mais application Xcode à construire soi-même. [Dépôt auteur](https://github.com/axelrivera/HealthImportDemo) |
| Huawei Health Importer | Installation personnelle via Xcode, aucune application App Store annoncée. [Dépôt auteur](https://github.com/JordyThien/Huawei-Health-Importer) |
| Ischys | Gratuit et ouvert, mais limité à la musculation, sans cardio selon l'éditeur. [Site officiel](https://ischys.app/) |
| MyActivityLog / Hozz | Destinés essentiellement à sortir les données Santé vers un serveur. Le sens de circulation ne résout pas notre import. [MyActivityLog](https://myactivitylog.kleinlercher.me/), [Hozz](https://github.com/thatcube/hozz) |

Les outils annoncés comme « Apple Health API » ne sont pas nécessairement des API Apple : certains sont des applications de lecture/export, ou des SDK exigeant notre propre application native. Il faut vérifier leur sens de circulation et le relais iPhone. Par exemple, HealthAPI présente un accès aux données exportées depuis son app, pas une écriture directe de séances depuis Chrome. [Présentation du fournisseur](https://healthapi.app/apple-health-api).

Enfin, la saisie manuelle directement dans Fitness/Santé reste une possibilité sans intermédiaire. Apple documente l'ajout d'un exercice terminé avec durée, distance et calories estimées. Cela permet de vérifier les écrans de réception, mais ne constitue pas une intégration de FitnessApp. [Guide Apple](https://support.apple.com/fr-fr/guide/iphone/iphf16df7c54/ios).

## État du projet et vérification restante

Recherche effectuée à partir de `main`, commit `553c4b1bd55d8cc3f5632040a24ad0c9f679b8ee`, identique à `origin/main` après récupération distante au début de la tâche. Le bouton Raccourcis existant n'a pas été remplacé. Les voies TCX/FIT, Strava et FitnessSyncer ci-dessus sont des possibilités étudiées, pas des fonctions développées aujourd'hui.

Pour choisir, une seule séance représentative déjà effectuée suffit : relever son début, sa durée active, ses pauses, sa distance et ses calories actives, puis vérifier une fois le parcours retenu sur l'iPhone. Contrôler séparément la fiche Exercice, les valeurs Santé et Forme ; comparer aussi les valeurs après une tentative répétée pour détecter les doublons. Ne pas utiliser des valeurs fictives comme preuve de mesure du tapis.

La recherche confirme plusieurs solutions gratuites et précise leurs limites. Elle ne remplace pas cette réception sur appareil. Aucun compte tiers, achat, essai payant ou partage de données personnelles n'a été activé pendant ce travail.
