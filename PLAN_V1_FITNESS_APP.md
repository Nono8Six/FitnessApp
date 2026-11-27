# FitnessApp — Plan V1

État partagé au 27 novembre 2026. Les cases **Livrée** correspondent aux fonctions publiées sur `main`. Les essais sur appareils physiques sont suivis dans les briques de réception.

## Objectif de la V1

Chaque profil définit son objectif et ses disponibilités. Le coach prépare une semaine, explique les ajustements et s’appuie sur les séances réalisées, manquées ou écourtées et sur le ressenti. Le suivi se fait dans FitnessApp. Un 10 km fin mars 2027 est un exemple d’objectif daté. Une habitude régulière suit le même parcours sans échéance obligatoire.

## Ce qui reste à faire

- **Brique 11 — Progression.** Livrer l’affichage des bilans hors programme dans le calendrier, puis calculer les totaux semaine et mois et afficher la progression vers l’objectif. Les mêmes bilans et calculs alimentent Aujourd’hui, Bilans et Coach.
- **Briques 7 et 10 — Réception matérielle.** Vérifier la lecture seule, puis l’exécution et les protections sur le vrai RUN500. Vérifier le parcours sur téléphone physique.
- **Briques 14 à 17 — Suite de la V1.** Livrer les graphiques avancés, les imports et sauvegardes, compléter l’installation Windows et recevoir le parcours complet.

## Avancement

| Brique | État | Résultat ou critère restant |
|---|---|---|
| 0 · Design | Livrée | Direction visuelle sombre pour mobile et PC. [Référence de conception](DESIGN.md) |
| 1 · Socle | Livrée | Application réelle servie par le PC, accessible sur le réseau local. |
| 2 · Profils | Livrée | Création, choix, modification et suppression des profils. Données isolées par profil. |
| 3 · Séances manuelles | Livrée | Création, modification, duplication, suppression et choix de la séance pour Aujourd’hui. |
| 4 · Connexion ChatGPT | Livrée | Connexion sur le PC, permissions du forfait et modèles du compte, session conservée dans le coffre Windows. |
| 5 · Coach | Livrée | Conversations persistantes et recherchables, lectures du profil et de la bibliothèque, historique repris au fil des échanges. |
| 6 · Catalogue et séances personnalisées | Livrée | Six formats, trois niveaux, création et ajustement avec le coach, validation avant enregistrement. [Construction des programmes](docs/CONSTRUCTION_PROGRAMMES.md) |
| 7 · Tapis dans l’app | Logiciel livré | Vérifier la lecture seule sur le vrai RUN500 et sur téléphone physique. |
| 8 · Exécuter une séance | Livrée | Direct, pause, reprise, arrêt, retour au calme et poursuite côté PC pendant la navigation. Réception physique en brique 10. |
| 9 · Enregistrer et revoir | Livrée | Bilans du profil, historique paginé, mesures, qualité et ressenti. |
| 10 · RUN500 réel | Ouverte | Recevoir les séances courtes et longues, les interruptions et les plages du tapis. |
| 11 · Historique et semaine | Partielle | Objectif par profil et calendrier disponibles. Affichage de tout l’historique et calculs de progression à livrer. |
| 12 · Coach informé | Livrée | Analyse des bilans du profil, mémoire sourcée, personnalisation et liens vers les bilans utilisés. [Refonte Coach IA](docs/REFONTE_COACH_IA.md) |
| 13 · Programme et suivi avec le coach | Livrée | Programme selon l’objectif et le niveau, semaine à confirmer, suivi et adaptations après les bilans. |
| 14 · Graphiques avancés | Ouverte | Comparaisons, tendances, plages de vitesse et de pente, calendrier de pratique et qualité des données. |
| 15 · Données | Partielle | Des exports vers Santé sont disponibles. Imports FIT/TCX, exports CSV/JSON, sauvegarde, restauration et retrait de Foulée à terminer. |
| 16 · Usage quotidien Windows | Partielle | Lanceur livré. Python embarqué, installateur autonome, mise à jour et fonctionnement hors ligne à valider. |
| 17 · Réception finale | Ouverte | Parcours complet sur PC, iPhone et Android avec le vrai tapis. |

## Historique et Coach

### Brique 11 · Historique et semaine

Chaque profil peut définir et modifier son objectif, son repère de progression et une échéance facultative. Le coach peut suggérer un repère. Pour une habitude, le repère peut être le nombre de séances par semaine. Pour une course, il peut être la durée courue en continu. Plusieurs profils peuvent préparer la même course avec des points de départ différents.

- [ ] Afficher dans Semaine et Mois les bilans des séances hors programme, à leur date, et ouvrir le bilan correspondant.
- [ ] Calculer les totaux de la semaine et du mois sur plusieurs semaines de bilans. Les séances qui expliquent les totaux restent accessibles.
- [ ] Afficher dans Aujourd’hui la progression vers le repère du profil. Partager les calculs avec le Coach et tenir compte des mesures absentes ou partielles. Les simulations restent séparées.

### Brique 12 · Coach informé

Le Coach retrouve les bilans récents et anciens, leur qualité et le ressenti. Il cite les bilans utilisés et les chiffres reprennent les calculs de FitnessApp. La mémoire conserve la source et la date des faits utiles. L’utilisateur peut les corriger ou les retirer. Le contexte est limité et le Coach peut demander le détail des mesures si nécessaire. [Refonte Coach IA](docs/REFONTE_COACH_IA.md) · [Estimation des calories](docs/ESTIMATION_CALORIES.md)

### Brique 13 · Programme et suivi avec le coach

- L’utilisateur choisit ses créneaux, relit la proposition, déplace ou écarte des séances et confirme la semaine. Le coach fabrique une proposition pour la semaine en cours ou la suivante. Avec une échéance, il donne également les étapes jusqu’à la date.
- Aujourd’hui affiche la séance du jour et la suivante. Le Planning propose les vues Semaine et Mois, avec accès au détail par date. La semaine affiche les séances à faire avant les séances passées.
- **Préparer la suite** depuis un bilan donne au coach la séance et le ressenti. Il explique les adaptations, préserve les séances passées et en cours et propose une reprise faisable quand la semaine a été difficile. La date de l’événement reste fixe.
- Les programmes sur tapis suivent la validation de l’éditeur et leur durée réserve le retour au calme. Pour une sortie extérieure planifiée, l’utilisateur peut saisir la durée réelle, la distance et le ressenti.

Le 25 novembre, le modèle connecté a proposé et enregistré des semaines sur tapis et dehors dans une base isolée. Chrome a servi à vérifier le déplacement et la confirmation des séances, la saisie d’une sortie écourtée et la conservation du passé après adaptation.

## Réception du RUN500

### Brique 7 · Lecture seule

La recherche, la connexion, les capacités et les mesures ont été vérifiées en simulation. La lecture seule ne commande aucun mouvement. Restent la connexion au vrai RUN500 et l’affichage de ses capacités et mesures sur le téléphone. [Réception RUN500](docs/RECEPTION_RUN500.md)

### Briques 8 et 10 · Exécution et réception physique

Le PC conserve l’exécution quand le téléphone quitte ou suspend le Direct. À la fin du programme, l’application ajoute une minute de retour au calme à 5 km/h maximum, avec la pente du dernier bloc. **Terminer** demande l’arrêt immédiatement. La pause sur la console conserve le bloc et les réglages. Le signal a été rejoué en simulation et la reprise vérifiée dans Chrome le 27 novembre. La confirmation physique reste ouverte. [Règles d’exécution](docs/EXECUTION_SEANCE.md)

- [ ] Séance courte à basse vitesse avec transitions, pause sur la console, reprise après confirmation et arrêt.
- [ ] Séance de 30 minutes à basse vitesse.
- [ ] Vérifier les réactions au retrait de la clé, à la coupure Bluetooth, au verrouillage du téléphone, à la veille du PC et à l’arrêt du serveur.
- [ ] Recevoir progressivement les vitesses et pentes annoncées par le tapis. Pour chaque palier, conserver commande, réponse, mesure et observation humaine.

Le STOP physique et la clé restent les protections de dernier recours. Une commande incertaine exige une vérification. Un incident ou une reconnexion n’autorise aucun redémarrage automatique. Le POC reste disponible pour le diagnostic. [Faisabilité et limites](docs/FAISABILITE_RUN500.md) · [Réception et preuves](docs/RECEPTION_RUN500.md)

## Autres travaux V1

### Brique 14 · Graphiques avancés

- [ ] Comparer deux ou trois séances et lire les tendances, le ressenti, les plages de vitesse ou de pente et la qualité des mesures.
- [ ] Valider la fluidité sur 200 séances d’une heure, avec un détail chargé en moins d’une seconde. Les calculs restent côté Python et les SVG sont la base de l’interface. [Design des graphiques](DESIGN.md)

### Brique 15 · Données

- [ ] Exporter une séance ou l’historique en CSV et JSON. Importer des fichiers FIT et TCX sans doublon.
- [ ] Sauvegarder et restaurer la base. Vérifier qu’une restauration sur une base vide restitue les séances à l’identique.
- [ ] Retirer l’intégration Foulée et arrêter les synchronisations configurées. Les séances déjà dans FitnessApp sont conservées. [Intégration existante](docs/INTEGRATION_FOULEE.md)
- [ ] Vérifier l’enregistrement Santé sur les téléphones physiques. La relecture Santé Connect a été vérifiée sur Android 15 émulé. La réception dans Santé sur iPhone reste ouverte. [Configuration du téléphone](docs/ENREGISTREMENT_SANTE.md)

### Brique 16 · Usage quotidien Windows

Le lanceur Windows permet de démarrer, arrêter et ouvrir l’application et de consulter le journal. Restent Python embarqué, l’installateur autonome, une mise à jour qui préserve les données et la vérification des performances et de l’usage hors ligne. [Lanceur Windows](launcher/README.md)

### Brique 17 · Réception finale

- [ ] Préparer avec le Coach, courir, revoir le bilan et ajuster depuis le PC, un iPhone et un Android, sur le vrai RUN500.
- [ ] Vérifier que les chiffres du bilan, des graphiques, des exports et du Coach concordent.
- [ ] Vérifier la sécurité après incident ou reconnexion et la consultation et l’exécution d’une séance enregistrée lors d’une panne Internet.

## Règles permanentes

- Le PC héberge l’interface React et l’API FastAPI sur le réseau local. Un seul processus pilote le Bluetooth. Le Coach se connecte depuis le PC via Sign in with ChatGPT. Le coffre Windows conserve les jetons et les téléphones reçoivent uniquement les données de l’application.
- Le Coach accède aux données du profil actif par les services de FitnessApp. Ses propositions suivent la même validation que l’éditeur manuel. Seul l’utilisateur peut démarrer le tapis.
- SQLite conserve les données par profil, avec suppression en cascade après confirmation. Les modes réel et simulation restent séparés. Les sauvegardes utilisent l’API SQLite.
- Les mesures sont horodatées avec leur source et leur qualité. Le profil et le programme sont figés pour un bilan. Les calculs sont versionnés et partagés. Les données manquantes restent absentes, les coupures ne sont pas interpolées et les erreurs de stockage sont visibles. [Exécution et enregistrement](docs/EXECUTION_SEANCE.md)
- La méthode de travail, les contrôles et la publication sont dans [AGENTS.md](AGENTS.md).

**Hors V1.** Accès depuis Internet, pilotage par le cardio, synchronisation Garmin Connect, VO₂max et scores physiologiques, application native FitnessApp.

**Historique.** Les vérifications et décisions détaillées des livraisons précédentes restent consultables dans la [version détaillée du plan avant ce rangement](https://github.com/Nono8Six/FitnessApp/blob/dafa3676df5b4131f61d609ff2d88892a8431cf0/PLAN_V1_FITNESS_APP.md).
