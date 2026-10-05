# Exécution d’une séance — brique 8

5 octobre 2026. Moteur commun RUN500/simulateur dans `backend/training/execution.py`, transport FTMS partagé et Direct relié au WebSocket. La réception physique du nouveau parcours reste à faire ; les commandes réelles sont implémentées.

## Parcours et mesures

Aujourd’hui ou fiche de séance → préparation (connexion, compatibilité, clé, bande libre) → 3 secondes annulables → Direct. Les réglages conservent le choix au retour. Annuler une confirmation ou le compte à rebours ne commande aucun mouvement.

Le PC fige le profil, la version et les blocs avant le compte à rebours. Le temps actif commence après l’observation de la première consigne, se fige dès une demande de Pause/STOP et reprend au point conservé après l’effet de la reprise. Les transitions entre blocs pendant l’effort comptent dans ce temps. Pause cumulée : de la confirmation du zéro jusqu’à la consigne de reprise observée. Compte à rebours, lancement et stabilisation de l’arrêt sont donc des durées distinctes ; le temps mural ne correspond pas simplement à actif + pause.

La distance est la somme des deltas du compteur reçu pendant l’effort et la décélération ; aucune estimation vitesse × temps ne la remplace. Une remise à zéro rend la distance partielle. Les valeurs absentes/anciennes restent indisponibles ; le détail expose la dernière mesure avec son âge. Le cardio n’apparaît pas sans source. Vitesse et cible sont distinctes ; l’allure à zéro est `--`.

Le Direct et ses formes réduites lisent le même état. PC : mesures/commandes à gauche, bloc/progression/courbes à droite. Téléphone : plein écran sans onglets, commandes fixes de 68 px, détails défilants, capsule au-dessus des onglets. Courbes à un échantillon par seconde, au plus 9 000 points et 256 événements, curseur commun daté, interruptions non interpolées. Tout reste en mémoire jusqu’à la prochaine séance ou la fermeture du serveur. Aucun historique ni bilan enregistré.

## Contrôle et limites

| Sujet | Application | Diagnostic POC |
|---|---|---|
| Durée et segments | Validation métier existante : 60 min / 120 segments | 1–3 blocs de 5–60 s |
| Vitesse/pente réelles | 1–2,5 km/h / 0–1 %, ainsi que plage et pas effectivement lus | Programmes 4 km/h / 3 % ; manuel jusqu’à la plage annoncée |
| Simulation | Jusqu’à 16 km/h / 10 %, selon ses propres capacités | Plafonds existants conservés |
| Autorisation | Durée prévue + 30 s par segment + 900 s + 15 s, échéance absolue | Activation de 10 min conservée |

Ces plafonds distinguent le périmètre physiquement reçu (1–2,5/0–1) des capacités annoncées (16/10). Un programme incompatible est refusé avec le bloc et la limite ; aucun ajustement silencieux. La brique 10 reçoit le parcours réel et élargit les plafonds palier par palier.

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
- `POST /pause`, `/stop`, `/release`, `/recover` : identifiants client et séance ; une ancienne séance ne peut pas agir sur la suivante.
- `GET /state`, `WS /events?client_id=…` : état, instance et séquence, mesures avec qualité/âge, échantillons incrémentaux ; première lecture/reconnexion = snapshot borné. Le WebSocket accepte uniquement le heartbeat et ne commande aucun mouvement. Origine HTTP/WS contrôlée par les protections de l’application.

Vérifications logicielles : 52 tests ciblés (16 moteur/API, 9 tapis, 20 POC, 7 serveur) et `npm run build` réussis. Le faux transport Bleak teste la branche réelle, ses notifications et réponses, les refus, la sérialisation de STOP, le timeout, le STOP accepté sans zéro et la récupération passive. La simulation utilise des données extérieures distinctes sur le port 4331. `scripts/verify_execution_simulation.py` observe passivement une séance de 30 min, exige deux pauses et 1 800 s actives sans accélération ; il ne fournit aucun heartbeat propriétaire.

Les résultats de l’essai long et des parcours Chrome sont consignés dans la brique 8 du [plan](../PLAN_V1_FITNESS_APP.md). Aucun Bluetooth réel, appel Coach, modification de schéma ou source du lanceur n’est nécessaire à ces vérifications.
