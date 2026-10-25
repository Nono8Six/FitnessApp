# Préparer une séance FitnessApp dans FitnessSyncer

Le bilan propose **Envoyer avec FitnessSyncer** sur PC et téléphone. Il ouvre le formulaire Notebook officiel prérempli. L'utilisateur vérifie puis enregistre la séance ; l'application FitnessSyncer de l'iPhone effectue ensuite l'écriture dans Santé.

**État au 25 octobre 2026 : préparation locale vérifiée ; réception du formulaire et de Santé/Forme non vérifiée.** La connexion au compte et un carnet vide ont été observés dans Chrome. Un premier lien sans calories a ouvert un onglet ; son inspection automatique a été refusée par la politique du navigateur (adresse signalée invalide). La version finale inclut obligatoirement les calories ; son lien a été contrôlé localement. Ne pas confondre cette préparation avec une séance enregistrée ou synchronisée.

## Premier essai

1. Créer un compte gratuit ou se connecter sur [FitnessSyncer](https://www.fitnesssyncer.com/sign-in). Installer son [application iPhone](https://apps.apple.com/fr/app/fitnesssyncer/id1159207899), puis utiliser le même compte. Le flux simple entre Notebook et Santé ne demande pas Pro, dans la limite gratuite de cinq tâches source/destination.
2. Dans FitnessApp, ouvrir un **bilan réel clôturé**, puis **Envoyer avec FitnessSyncer**. Choisir Marche ou Course selon la séance réalisée. Une estimation calorique unique est incluse automatiquement ; une plage demande de choisir sa borne basse ou haute. Vérifier le profil et l'absence d'import antérieur, puis ouvrir le formulaire. Ne pas enregistrer l'ancien formulaire de test sans calories.
3. Dans FitnessSyncer, comparer date, heure, type, durée, distance **et calories** avec le récapitulatif. Vérifier aussi vitesses, ressenti et note lorsqu'ils sont présents. Selon les préférences du compte, la distance peut être affichée en miles : changer l'unité affichée ou vérifier la conversion, sans recopier des kilomètres dans un champ de miles. Si une connexion a été demandée, revenir au bilan et rouvrir le lien : la redirection déconnectée observée arrive au carnet et ne conserve pas le formulaire complet.
4. Enregistrer **une seule fois** dans le carnet. Vérifier la fiche enregistrée avant toute nouvelle tentative.
5. Dans FitnessSyncer sur l'iPhone, ouvrir les réglages Apple Health/Santé, activer la publication des activités et accorder les autorisations d'écriture correspondantes, puis **Sync Now**. Se limiter aux catégories utiles à cet essai.
6. Dans Santé, rechercher **Exercices**, ouvrir **Afficher toutes les données**, puis la séance à la date attendue. Vérifier la source FitnessSyncer, l'activité, le début, la durée et la distance. Les libellés peuvent varier avec iOS. Comparer séparément les échantillons d'**énergie active** de source FitnessSyncer à la valeur choisie, pas à la dépense totale de la journée. La conservation d'une vitesse, d'un ressenti ou d'une note dans FitnessSyncer ne garantit pas leur affichage dans Santé.
7. Dans Forme/Fitness, vérifier la présence de la séance et son effet sur Bouger. La réception du workout ne prouve pas l'ajout de pas ni le résultat sur tous les anneaux.

Si la séance figure dans le carnet mais pas dans Santé, vérifier les autorisations puis synchroniser à nouveau depuis l'iPhone, sans recréer l'activité. Une correction ou suppression dans un service ne garantit pas sa propagation dans l'autre.

## Contrat et conversions

Le lien utilise `https://www.fitnesssyncer.com/notebook-editor?new&taskType=Activity`. Aucun OAuth, jeton ou mot de passe n'est stocké dans FitnessApp. Il s'agit de l'intégration par liens officiellement documentée, **pas d'un appel REST authentifié ni d'une confirmation du serveur**.

| Champ transmis | Valeur FitnessApp | Règle |
|---|---|---|
| `activity` | `Walking` ou `Running` | Choix explicite ; aucune déduction depuis une vitesse ou une plage calorique |
| `title` | Titre générique FitnessApp et activité sur tapis | Aucun nom de profil ou de programme personnel |
| `date` | Début du bilan, instant UTC en millisecondes | Fuseau explicite obligatoire ; aucun remplacement par la date du jour |
| `duration` | Durée active, secondes arrondies | Pauses exclues ; pas de durée murale |
| `distanceKM` | Compteur complet, mètres divisés par 1 000 | Absente si indisponible, partielle, négative ou non finie |
| `calories` | Kcal actives estimées, arrondies à l'entier | Obligatoires et couverture complète ; borne basse/haute choisie explicitement si plage |
| `speed_avg` | Vitesse moyenne mesurée divisée par 3,6 | Mètres/seconde, uniquement avec couverture complète |
| `speed_max` | Maximum des points de vitesse mesurés divisée par 3,6 | Mètres/seconde ; phases de mouvement seulement, jamais une consigne |
| `rpe` | Ressenti enregistré de 1 à 10 | Champ RPE du destinataire (échelle documentée Borg CR10) ; absent si non renseigné |
| `comment` | Référence, début UTC, durée, calories et plage, vitesses, pente moyenne complète, ressenti, limites | La pente n'a pas de champ dédié Activity ; la note ne rend pas l'écriture idempotente |

URL construite avec `URLSearchParams` : séparateur décimal invariant, caractères spéciaux encodés. Les champs absents ne sont jamais transformés en zéro. Les vrais zéros exploitables sont conservés. Aucun poids, nom de profil, pas, fréquence cardiaque, coordonnées ou énergie de repos n'est transmis. Courbes et événements ne sont pas transportables par les champs simples de ce formulaire. Le navigateur ouvre le lien externe avec `noopener noreferrer`. Les données transmises figurent dans l'URL et donc potentiellement dans l'historique du navigateur.

La documentation décrit `date` en entier long mais ne cite que String/Integer/Double dans les liens Notebook : la conservation effective de ce champ reste à confirmer dans le formulaire connecté. Sa valeur locale attendue est affichée avec secondes et fuseau. Aucun `endDate` n'est fabriqué : le résumé ne transporte pas la chronologie des pauses. Si le destinataire déduit la fin du début et de la durée active, elle précède l'arrêt réel lorsqu'il y a eu des pauses.

À la demande d'Arnaud, les **calories sont obligatoires**. En l'absence d'estimation complète, l'envoi est désactivé avec explication. Une plage marche/course n'est pas réduite à sa moyenne : les deux bornes restent dans la note et l'utilisateur choisit celle à transmettre dans le champ numérique. Les bornes sont des minima/maxima cumulés, pas des séances intégralement marchées ou courues ; sélectionner Course ne recalculera pas le bilan. La dépense totale avec repos n'est jamais substituée aux calories actives. Le champ générique `calories` ne précise pas suffisamment sa conversion vers l'énergie active Apple : celle-ci reste à vérifier sur l'iPhone.

## Contrôles et doublons

Les deux exporteurs partagent `frontend/src/lib/workoutExport.ts`, afin de conserver les mêmes exclusions : simulation, séance ouverte, phase non exportable, arrêt non confirmé, entrées perdues, durée active absente/invalide et début invalide. FitnessSyncer ajoute le contrôle du fuseau, des pauses et des calories. Le contrat Raccourcis existant est conservé. Un ressenti sauvegardé dans le bilan est immédiatement répercuté dans les données de l'export, sans rechargement.

Un repère d'**ouverture demandée** est conservé dans ce navigateur, pour ce profil et ce bilan. Il ne confirme pas l'ouverture de l'onglet, la sauvegarde, la synchronisation ni l'absence de doublons. Le lien normal évite une dépendance aux fenêtres ouvertes par script. Si le stockage local est refusé, l'interface le dit et conserve le repère en mémoire pour cette page. Le repère ne suit pas les autres appareils. La case de confirmation est retirée après un clic et après modification des options.

FitnessApp ne peut pas lire les données Santé de l'iPhone ni le résultat du formulaire d'un autre domaine. Aucun état « synchronisé » n'est enregistré automatiquement. Les erreurs réseau de FitnessSyncer doivent être lues sur sa propre page ; aucun nouvel envoi n'est déclenché en arrière-plan.

## Vérifications effectuées et restantes

- Contrat local : douze tests ciblés, dont les quatre tests existants Raccourcis. Secondes/km/millisecondes, m/s, changement d'heure, valeurs absentes et partielles, calories obligatoires, choix d'une borne sans moyenne inventée, maximum mesuré hors pause et hors consignes, refus des séances invalides, caractères spéciaux et liste exacte des champs transmis.
- Build TypeScript/Vite réussi. Aucun changement du backend, des calculs ou des données de séances.
- Chrome, application réelle : ouverture du bilan, récapitulatif, choix explicite, activation conditionnelle, retrait de la confirmation lors d'un changement d'activité, aide dépliée et décodage du lien sans l'envoyer. Contrôle PC et 390 × 844, aucun débordement horizontal ni erreur console observés.
- Accès déconnecté FitnessSyncer : redirection de l'éditeur vers la connexion avec retour au carnet constatée. Les instructions demandent donc une connexion préalable.
- Compte connecté et carnet vide observés ensuite ; clic réel sur le premier lien et repère d'ouverture persistant après rechargement. Inspection de l'onglet destinataire bloquée par le contrôle automatique du navigateur, sans contournement. La version enrichie est contrôlée par son récapitulatif et son URL, sans nouvel envoi.
- **Restent ouverts :** réception et sauvegarde du formulaire connecté, date conservée, type d'exercice Apple et caractère intérieur, conversion des calories, vitesses/ressenti/note réellement conservés, gestion des pauses, source/distance dans Santé, Forme et comportement des imports répétés. Aucune écriture Santé effectuée par ces contrôles.

## Références officielles

- [Liens Notebook et modèle de données API](https://www.fitnesssyncer.com/api/documentation.html)
- [Notebook et sauvegarde d'une entrée](https://www.fitnesssyncer.com/support/notebook?lang=en)
- [Lecture/écriture Apple Health et synchronisation iPhone](https://www.fitnesssyncer.com/support/apple-health)
- [Limites de synchronisation et doublons](https://www.fitnesssyncer.com/support/sync-faq)
- [Application gratuite et plafond de cinq tâches](https://apps.apple.com/fr/app/fitnesssyncer/id1159207899)
- [Exercices tiers dans Fitness, selon Apple](https://support.apple.com/fr-fr/guide/iphone/iph392b962da/ios)
