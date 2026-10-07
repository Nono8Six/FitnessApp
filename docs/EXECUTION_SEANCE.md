# Exécution d’une séance — brique 8

5 octobre 2026. Moteur commun RUN500/simulateur dans `backend/training/execution.py`, transport FTMS partagé et Direct relié au WebSocket. La réception physique du nouveau parcours reste à faire ; les commandes réelles sont implémentées.

## Parcours et mesures

Aujourd’hui ou fiche de séance → préparation (connexion, compatibilité, clé, bande libre) → 3 secondes annulables → Direct. Les réglages conservent le choix au retour. Annuler une confirmation ou le compte à rebours ne commande aucun mouvement.

Le PC fige le profil, la version et les blocs avant le compte à rebours. Le temps actif commence après l’observation de la première consigne, se fige dès une demande de Pause/STOP et reprend au point conservé après l’effet de la reprise. Les transitions entre blocs pendant l’effort comptent dans ce temps. Pause cumulée : de la confirmation du zéro jusqu’à la consigne de reprise observée. Compte à rebours, lancement et stabilisation de l’arrêt sont donc des durées distinctes ; le temps mural ne correspond pas simplement à actif + pause.

La distance est la somme des deltas du compteur reçu pendant l’effort et la décélération ; aucune estimation vitesse × temps ne la remplace. Une remise à zéro rend la distance partielle. Les valeurs absentes/anciennes restent indisponibles ; le détail expose la dernière mesure avec son âge. Le cardio n’apparaît pas sans source. Vitesse et cible sont distinctes ; l’allure à zéro est `--`.

Le Direct et ses formes réduites lisent le même état. PC : mesures/commandes à gauche, bloc/progression/courbes à droite. Téléphone : plein écran sans onglets, commandes fixes de 68 px, détails défilants, capsule au-dessus des onglets. Courbes à un échantillon par seconde, au plus 9 000 points et 256 événements dans le buffer d’observation du Direct, curseur commun daté, interruptions non interpolées. Depuis la brique 9, un journal SQLite indépendant conserve les mesures et événements pendant l’exécution, sans cette limite de lecture.

## Enregistrement et bilan

La ligne de séance et ses snapshots sont commités avant toute commande moteur. Les callbacks du tapis copient les données dans une file bornée de 8 192 entrées ; un worker écrit jusqu’à 1 024 entrées par transaction, hors de la boucle Bluetooth. Le journal diagnostic JSONL est lui aussi écrit par lots sur un thread. Le checkpoint durable correspond aux événements commités ; une panne conserve la file en attente, affiche le dernier repère confirmé et demande l’arrêt. Une saturation compte explicitement les entrées perdues et interdit d’afficher « Enregistré ».

Après fin ou arrêt confirmé, Direct attend la confirmation de clôture durable avant d’ouvrir `#/bilans/{id}`. Une commande incertaine reste dans Direct ; le bilan accessible depuis Aujourd’hui → Bilans n’affirme jamais un arrêt confirmé. Au redémarrage, les lignes ouvertes sont clôturées comme interrompues avec les données réellement conservées et sans réarmement. Les anciennes entrées restent immuables ; seul le ressenti facultatif 1–10 est modifiable.

Le calcul `recording-v1-acsm-v1` utilise les échantillons persistés et le poids figé. Moyennes : pondération par le delta de temps actif, valeur de l’extrémité gauche, deux extrémités disponibles espacées d’au plus 2 s, sans traverser une pause ou un état inconnu. Couverture : secondes valides / secondes actives. Distance : deltas non négatifs du compteur pendant l’effort et la décélération ; compteur absent, coupure ou remise à zéro rendent la lecture partielle. Aucune distance vitesse × temps. Énergie : méthode ACSM du service partagé sur les seules secondes où vitesse et pente sont conjointement disponibles ; ≈ et limites visibles. Absence et zéro restent distincts.

Direct affiche les calories actives ≈ et la vitesse moyenne en km/h, calculées par cette même réduction Python à chaque nouvel échantillon. Les sommes utilisent les valeurs non arrondies ; seul le résultat affiché est arrondi. Les totaux ne disparaissent pas lorsque les anciens points du buffer Direct sont évincés. La pause ne modifie ni dépense ni moyenne ; la couverture et les limites ACSM figurent dans État du tapis et des mesures.

Les graphiques du bilan distinguent mesure et consigne acceptée, partagent axe temporel et curseur et affichent les trous. Tous les points se consultent, en séance entière ou fenêtres de 5 min. Les blocs exposent programme initial, plage de consignes appliquées et moyenne mesurée. Événements et qualité se développent à la demande. Profil et programme sont figés ; une modification/suppression ultérieure du programme ne modifie pas le bilan. La suppression du profil supprime ses bilans en cascade.

## Contrôle et limites

### Ajuster pendant l’effort

Dans Direct, les boutons − / + changent la vitesse ou la pente du bloc actuel et de tous les blocs restants, par un décalage commun. Exemple : +0,5 km/h et +1 % transforme les blocs 2/0 puis 2,5/1 en 2,5/1 puis 3/2. Les durées, blocs déjà terminés, version enregistrée et échéance d’autorisation restent conservés. Pause/Reprendre conserve ces réglages ; une nouvelle séance repart du programme enregistré.

Seul le propriétaire peut ajuster, en phase « En cours » ou « Ajustement en cours », avec des mesures fraîches et un contrôle valide. Le serveur vérifie tous les blocs restants avant de changer les consignes ; une limite ou un pas incompatible refuse la demande entière. Le pas des boutons est de 0,5 km/h et 0,5 % sur le RUN500 ; il reste un multiple du pas Bluetooth lu. Chaque appui actualise immédiatement la cible demandée. Le navigateur regroupe les appuis sur 120 ms et sérialise les requêtes HTTP, en conservant uniquement la dernière cible en attente. Le moteur termine l’échange Bluetooth engagé, puis applique la dernière cible, sans attendre l’effet d’une cible remplacée et sans rejouer les valeurs intermédiaires. Une réponse inconnue bloque toujours le canal sans répétition. Le retour à « En cours » exige des mesures fraîches aux dernières cibles.

Les notifications FTMS `0x05` (nouvelle vitesse cible) et `0x06` (nouvelle pente cible), déjà présentes dans le journal de l’essai réel du 7 octobre, actualisent désormais les cibles de séance. Une cible ne remplace jamais une mesure : seules les notifications Treadmill Data alimentent vitesse, pente, distance et calculs. Un écho de notre échange en cours ne remplace pas une demande plus récente. Un réglage sur la console décale les blocs restants s’ils restent tous compatibles ; sinon le bloc actuel reprend le réglage physique, les suivants sont conservés et l’interface le signale. Le programme enregistré reste inchangé. Les formats suivent le [service FTMS Bluetooth SIG](https://www.bluetooth.com/specifications/specs/fitness-machine-service-1-0-1/).

Pause/STOP restent accessibles pendant cet échange et bloquent immédiatement toute commande suivante. Le décalage demandé figure dans les cibles des courbes, sans réécrire les mesures antérieures ; un repère « Ajustement » indique l’effet observé. Les contrôles sont désactivés sur les écrans observateurs et pendant une pause ou une perte d’observation.

| Sujet | Application | Diagnostic POC |
|---|---|---|
| Durée et segments | 30–3 600 s par bloc, 120 segments ; séances de plus d’une heure autorisées | 1–3 blocs de 5–60 s |
| Vitesse/pente réelles | 1–16 km/h / 0–10 %, restreints aux plages et pas effectivement lus | Programmes 4 km/h / 3 % ; manuel jusqu’à la plage annoncée |
| Simulation | Jusqu’à 16 km/h / 10 %, selon ses propres capacités | Plafonds existants conservés |
| Autorisation | Durée prévue + 30 s par segment + 900 s + 15 s, échéance absolue | Activation de 10 min conservée |

Le 7 octobre 2026, Arnaud a demandé le retrait des plafonds des premiers essais (2,5 km/h / 1 %). Réel et simulation utilisent désormais les mêmes bornes de conception des séances ; les capacités du tapis peuvent les réduire. Une plage inconnue, une valeur hors plage ou un pas incompatible bloque le programme avec le bloc concerné ; aucun ajustement silencieux. Les plages annoncées du RUN500 (1–16 km/h / 0–10 %) sont autorisées sans les présenter comme physiquement reçues. La réception matérielle du parcours complet reste ouverte en brique 10.

« Revérifier » conserve les deux confirmations de présence dans la préparation ouverte. Une nouvelle préparation ou reprise les remet à zéro. Un état PC ancien ou une perte de contact désactive le démarrage et retire le témoin vert du tapis.

La connexion seule reste passive. Après démarrage explicite : abonnement aux indications Control Point → Request Control accepté → vitesse minimale → Start accepté → mouvement fraîchement observé → pente/vitesse cibles → effet observé. À chaque étape les conditions de présence, autorisation, fraîcheur et contrôle sont revérifiées. Une réponse HTTP ou FTMS positive ne prouve pas l’effet physique. Réglages > Tapis décrit le contrôle actif et bloque les opérations de connexion/déconnexion pendant le mouvement ou une pause.

Une seule procédure FTMS attend sa réponse à la fois. Pause/STOP bloquent immédiatement les étapes suivantes, consomment la réponse déjà en vol puis envoient la commande protectrice. Aucun retry moteur. Résultat absent, canal incertain ou bande non arrêtée : état inconnu, reprise verrouillée. Un arrêt confirmé exige une réponse acceptée, quatre secondes sans état d’arrêt tardif, puis une nouvelle mesure de zéro après cette fenêtre.

## Propriétaire et récupération

Un identifiant aléatoire propre au document possède démarrage et reprise. Le contact propriétaire passe par heartbeat toutes les 3 s, indépendamment de l’observation. Les autres écrans peuvent demander Pause/STOP mais ne prolongent pas cette présence. Naviguer ou réduire conserve le propriétaire. Recharger est une fermeture suivie d’un nouvel observateur ; aucune récupération de commande.

Fermer le propriétaire demande STOP par `pagehide` ; si la requête n’arrive pas, 12 s de silence déclenchent la demande côté PC. Un téléphone verrouillé/suspendu peut cesser ses heartbeats : le PC demande alors STOP, même si un observateur reste ouvert. **L’arrêt matériel n’est pas garanti si le PC ou le Bluetooth est perdu.** Le STOP physique et la clé restent nécessaires dans ce cas. L’échéance absolue et le budget total de pause de 15 min ne sont jamais renouvelés par heartbeat.

Après résultat inconnu : STOP physique → déconnexion/reconnexion passive dans Réglages → mesures fraîches à zéro et stabilisation → Clore la séance interrompue. Cette clôture n’envoie aucune commande et ne transforme pas l’ancien arrêt inconnu en arrêt confirmé. Un nouveau départ exige une nouvelle préparation complète.

## API et vérification

- `POST /api/execution/prepare` : profil, séance et version ; compatibilité/préconditions.
- `POST /start` : mêmes champs, identifiant client, deux booléens stricts vrais.
- `POST /resume` : propriétaire, identifiant de séance, deux nouvelles confirmations.
- `POST /adjust` : propriétaire, identifiant de séance, `speed_offset` et `incline_offset` numériques stricts, finis ; compteurs absolus des décalages communs, dont la différence au dernier état est appliquée aux cibles restantes. Snapshot : `targets`, `offsets`, `adjustment_bounds`, `adjustment_note` ; phase `adjusting` jusqu’à l’effet observé.
- `POST /pause`, `/stop`, `/release`, `/recover` : identifiants client et séance ; une ancienne séance ne peut pas agir sur la suivante.
- `GET /state`, `WS /events?client_id=…` : état, instance et séquence, mesures avec qualité/âge, échantillons incrémentaux ; première lecture/reconnexion = snapshot borné. Le WebSocket accepte uniquement le heartbeat et ne commande aucun mouvement. Origine HTTP/WS contrôlée par les protections de l’application.

Vérifications logicielles : 52 tests ciblés (16 moteur/API, 9 tapis, 20 POC, 7 serveur) et `npm run build` réussis. Le faux transport Bleak teste la branche réelle, ses notifications et réponses, les refus, la sérialisation de STOP, le timeout, le STOP accepté sans zéro et la récupération passive. La simulation utilise des données extérieures distinctes sur le port 4331. `scripts/verify_execution_simulation.py` observe passivement une séance de 30 min, exige deux pauses et 1 800 s actives sans accélération ; il ne fournit aucun heartbeat propriétaire.

Les résultats de l’essai long et des parcours Chrome sont consignés dans la brique 8 du [plan](../PLAN_V1_FITNESS_APP.md). Ces vérifications de la brique 8 n’ont nécessité ni Bluetooth réel, ni appel Coach, ni modification de schéma ou source du lanceur. La migration additive et les contrôles de conservation du bilan figurent désormais dans la brique 9 du même plan.

Complément des ajustements : 29 tests moteur/API/tapis, build et parcours Chrome réussis. Conservation après pause, transition, retour au programme et nouveau départ ; refus atomique de borne/pas/propriétaire, STOP pendant le premier échange de deux consignes, refus FTMS et réponse inconnue sans retry. Les valeurs 2,5, 16,0 et l’allure 60′00″ sont vérifiées sans débordement sur les formats téléphone et PC. Réception physique des ajustements encore ouverte.
