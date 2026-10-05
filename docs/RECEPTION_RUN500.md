# Réception du POC RUN500 — 4 octobre 2026

**La connexion Windows–RUN500 et les commandes FTMS fonctionnent sur le tapis essayé.** Le téléphone atteint la console par le Wi-Fi, sans clé. Les essais matériels ont été limités à **1–2,5 km/h et 0–1 %**, avec présence humaine confirmée auprès du tapis. Cette réception valide le contrôle de base supervisé ; elle ne couvre pas encore une séance longue ni les pertes matérielles.

## 1. Appareil et version réellement testés

- Appareil BLE : **Domyos-TC-1921**, choisi dans la recherche Windows.
- Service standard FTMS présent ; Control Point avec écriture et indication, mesures et états notifiés.
- Plages lues sur l'appareil : vitesse 1–16 km/h par pas de 0,1 ; pente 0–10 % par pas de 0,5. Les limites du POC restent 4 km/h et 3 % ; les essais ci-dessous restent plus bas.
- Serveur corrigé : Python natif Windows, un processus, `0.0.0.0:4317`, PID 69916 à la réception. Ce PID est une observation datée, pas une configuration permanente.
- Console vérifiée dans Chrome à `http://192.168.1.23:4317/`. L'utilisateur confirme aussi son accès depuis le téléphone. Aucun changement du pare-feu ou publication Internet.

## 2. Résultats

| Essai exécuté | Résultat et preuve | Portée |
|---|---|---|
| Lecture passive, 30 relevés sur environ 30 s | Toutes les lectures connectées ; âge maximal vitesse/pente 0,4 s, réponse HTTP maximale 47 ms — [lecture-passive.json](preuves/lecture-passive.json) | Mesures fournies par le firmware, sans mesure externe de précision |
| Démarrer au minimum | Réponse FTMS positive et vitesse reçue à 1 km/h — [reception-demarrage.json](preuves/reception-demarrage.json) | Mouvement confirmé par l'utilisateur |
| Régler à 2 km/h | Cible reçue et stable — [reception-vitesse-2.json](preuves/reception-vitesse-2.json) | Changement physique confirmé par l'utilisateur |
| Monter à 1 %, revenir à plat | Cibles reçues à vitesse 2 km/h — [pente](preuves/reception-pente-1.json), [retour à plat](preuves/reception-retour-plat.json) | Montée et retour physiques confirmés par l'utilisateur |
| Pause | Réponse acceptée, vitesse nulle et contrôle désarmé — [reception-pause.json](preuves/reception-pause.json) | Arrêt de la bande confirmé par l'utilisateur |
| Trois blocs 10 s chacun | 2/0 → 2,5/1 → 2/0 ; chaque cible observée avant son chronomètre ; STOP final et vitesse nulle — [réception automatique](preuves/reception-automatique.json) | Programme exécuté deux fois ; l'utilisateur confirme les mouvements et l'arrêt du premier passage |
| Redémarrer après fin de programme | Réactivation prématurée refusée HTTP 409 sans écriture FTMS ; reprise à 1 km/h après stabilisation | Vérifié sur matériel avec la version corrigée |
| STOP pendant une commande de programme | Une commande était effectivement en attente ; sa réponse a été consommée, puis STOP a été envoyé depuis un autre écran ; vitesse nulle, programme interrompu, canal synchronisé | Cas réel, pas seulement simulation |
| Refus des consignes et de l'autre écran | Neuf cas refusés ; **zéro nouvelle commande FTMS** dans le journal | Minimum/plafond/pas, pente invalide, booléen, transition excessive, activation et vitesse d'un autre écran |
| Perte de contact avec l'écran propriétaire | Arrêt des lectures de ce client, observateur distinct encore actif ; STOP puis vitesse nulle vers 13 s après la dernière lecture, stable pendant 2 s | Silence de l'écran reproduit par l'API ; Bluetooth conservé. Ce n'est pas une coupure radio Wi-Fi ou BLE |
| Démarrer après perte de l'écran sans réactivation | HTTP 409 | Absence de reprise automatique |
| Déconnexion et reconnexion à l'arrêt | Tapis reconnecté en lecture seule, vitesse/pente nulles — [déconnexion](preuves/reception-deconnexion.json), [reconnexion corrigée](preuves/reception-reconnexion-corrigee.json) | Pas de déconnexion BLE forcée pendant un mouvement |
| Chrome après correction : Start, Pause, reprise, STOP | 1 km/h → zéro → 1 km/h → zéro ; contrôle désarmé après chaque arrêt ; attente affichée et bouton d'activation désactivé après Pause | [Pause](preuves/reception-chrome-pause-corrigee.json), [reprise](preuves/reception-chrome-reprise-apres-pause.json), [STOP final](preuves/reception-chrome-stop-final.json) |
| Export depuis Chrome | Fichier réellement téléchargé et relu, commandes/réponses/blocs présents — [export Chrome](preuves/reception-export-chrome.json) | Le téléchargement a réussi ; l'attente de l'événement par l'outil navigateur a expiré ensuite |
| Vérifications logicielles | **16 tests ciblés réussis**, compilation Python et syntaxe JavaScript valides ; aucune erreur ni alerte console Chrome au relevé final | Faux clients pour les réponses absentes/incorrectes ; distinct des essais BLE réels |

Le journal du passage automatique corrigé contient 21 demandes FTMS et 420 trames de mesure, **aucun événement d'erreur et aucune désynchronisation**. L'état final de ce passage est connecté, désarmé, vitesse 0 et pente 0. Une dernière observation après les essais Chrome confirme aussi cet état.

Confirmation utilisateur conservée séparément : « Oui, les mouvements et les arrêts correspondent », en réponse aux changements de vitesse, montée à 1 %, retour à plat, Pause et arrêt après les trois blocs. Cela ne transforme pas les autres scénarios en observations physiques indépendantes.

## 3. Deux défauts corrigés pendant la réception

### STOP pendant une procédure Bluetooth

Avant correction, annuler le programme annulait aussi l'attente de sa commande Bluetooth en cours. Le canal devenait incertain et le STOP suivant était bloqué. Le test logiciel a reproduit cette séquence.

La tâche de programme est désormais interrompue en laissant finir **la procédure déjà envoyée**, dans son délai maximal de quatre secondes. Après sa réponse, le contrôleur envoie STOP sur le même canal. Le contrôle est désarmé immédiatement. Aucune commande de mouvement supplémentaire ni répétition automatique n'est ajoutée. Le test réel confirme l'ordre réponse de pente → STOP → réponse STOP, sans désynchronisation. Ce STOP logiciel n'est pas un arrêt d'urgence instantané.

### Notifications d'arrêt tardives et reprise prématurée

Le premier passage de trois blocs a réussi, mais sa reprise trop rapide a échoué. Après la première indication de vitesse nulle et un état `0202`, le firmware a envoyé `0201` environ trois secondes après la réponse STOP, alors qu'une nouvelle commande Start avait déjà été acceptée. La protection a donc demandé un nouvel arrêt. Le journal conserve cet échec : [essai 1](preuves/reception-automatique-essai-1-echec.json), [trames correspondantes](preuves/reception-diagnostic-essai-1-echec.json).

Un essai avec six secondes de stabilisation a confirmé des reprises correctes après STOP et Pause : [diagnostic de reprise](preuves/reception-redemarrage-diagnostic.json). La version corrigée exige maintenant **quatre secondes sans nouvel événement d'arrêt**, puis une mesure de vitesse nulle reçue après le dernier événement. La même condition protège l'API et la console. Un nouvel événement d'arrêt renouvelle l'attente ; il n'est jamais ignoré. Cette durée est une précaution issue de ce RUN500, pas une exigence universelle du standard FTMS.

Le refus immédiat et la reprise après stabilisation ont ensuite été vérifiés sur matériel. Le test de non-régression couvre aussi l'événement tardif et une ancienne mesure de zéro. [Tests FTMS officiels : procédures Stop et Pause](https://files.bluetooth.com/wp-content/uploads/dlm_uploads/2024/10/FTMS.TS_.p6.pdf).

## 4. Ce qui reste à recevoir

- Retrait et réinsertion réels de la clé de sécurité ; STOP physique pendant un programme et vérification de l'absence de reprise.
- Coupure Bluetooth réelle pendant un mouvement, perte électrique/arrêt brutal du serveur, veille Windows : comportement exact du firmware encore inconnu.
- Téléphone verrouillé, Safari/Android et perte Wi-Fi réelle sur une séance prolongée. Le silence d'un client a été testé ; la suspension effective des navigateurs ne l'a pas été.
- Course à vitesse/pente supérieures aux essais, séance longue, dérive ou calibration des mesures. Les capacités annoncées 16 km/h/10 % ne sont pas des plages entièrement essayées.
- Profils, historique durable, Garmin, fréquence cardiaque et IA : hors du POC actuel. La valeur cardiaque zéro transmise sans capteur ne prouve aucune réception cardiaque.

La fonction logicielle peut demander STOP tant que la connexion Bluetooth reste utilisable. L'arrêt après perte BLE ou du PC n'est **pas garanti** par cette réception. Le POC reste destiné aux essais supervisés.

## 5. Reproduire et consulter les preuves

À exécuter uniquement après présence humaine confirmée, tapis connecté, arrêté et à plat :

```powershell
.\.venv\Scripts\python.exe scripts\run_reception.py --confirm-presence
```

Ce script commande réellement le tapis. Il limite ses cibles à 2,5 km/h et 1 %, s'arrête au premier échec et exporte ses actions et observations. `observe_reception.py` reste un outil de lecture seule. Les fichiers `reception-automatique.json` et `reception-diagnostic-final.json` sont remplacés à chaque exécution du script ; les conserver avant une nouvelle campagne.

Les preuves sont dans [preuves/](preuves/), avec journaux BLE et simulation distincts. Les captures et exports montrent des états observés à une date donnée. [Console finale](preuves/console-reception-finale.jpg), [mesures et commandes désarmées](preuves/console-mesures-commandes-finales.jpg). Ne pas publier les journaux Bluetooth contenant noms et adresses des appareils locaux.

## 6. Correction de la vitesse choisie après la première réception

L'utilisateur a ensuite signalé qu'une cible de 2 km/h donnait 1 km/h après démarrage, et que la saisie était limitée à 4. Le journal montre la cause : une commande à 2 était acceptée, puis « Démarrer au minimum » remplaçait cette consigne par 1. Il ne s'agissait pas d'une conversion entre km/h et une autre unité.

La version corrigée propose « Démarrer à 2 km/h » en fonction de la valeur saisie. Elle valide la cible avant toute écriture, démarre au minimum, attend une nouvelle mesure de mouvement puis applique la cible explicite. Un STOP console ou une perte de présence empêche la deuxième étape ; en l'absence de mouvement observé sous cinq secondes, STOP est demandé. En marche, « Appliquer » règle la vitesse. À l'arrêt, ce bouton est désactivé pour éviter une consigne préparée qui serait remplacée au démarrage.

La vitesse manuelle accepte désormais la plage annoncée par le tapis, jusqu'à 16 km/h. Les programmes de réception restent limités à 4 km/h et la pente à 3 %. Le script de réception utilise maintenant 16,1 comme cas hors plafond, pour ne pas envoyer involontairement l'ancienne valeur de refus 4,1 au tapis.

Vérification de cette modification :

- **20 tests ciblés passent.** Les quatre nouveaux cas couvrent la cible choisie, 4/8/16 en simulation et refus au-delà, STOP pendant le démarrage, absence de mouvement sans application de la cible.
- Chrome accepte les saisies 4, 8 et 16, avec minimum 1 et pas 0,1 ; 17 est invalide. Aucune de ces valeurs élevées n'a été envoyée au tapis réel — [preuve de saisie](preuves/vitesse-saisie-chrome.json).
- Un démarrage réel depuis Chrome, avec cible **2**, donne une mesure stable à **2**, suivi d'un STOP accepté et d'un retour à zéro — [observation](preuves/reception-vitesse-choisie-demarrage-2.json), [capture](preuves/vitesse-cible-2-mesuree-2.jpg), [arrêt](preuves/reception-vitesse-stop-final.json).
- Le [journal corrigé](preuves/vitesse-corrigee-diagnostic.json) confirme exactement : contrôle → vitesse 1 (`026400`) → Start (`07`) → vitesse 2 (`02c800`) → STOP (`0801`), sans erreur. Le [journal avant correction](preuves/vitesse-avant-correction.json) reste conservé.

La version servie pour ce dernier essai est le processus 21008 sur le port 4317. Ces identifiants sont datés. La validation à 16 concerne le logiciel et la saisie ; le matériel n'a pas été essayé à cette vitesse. Le tapis est laissé connecté, arrêté et désarmé.

## 7. Application : exécution préparée le 5 octobre 2026

La brique 8 implémente le démarrage, les transitions, Pause/Reprendre et STOP sur le transport FTMS réel partagé, avec le même moteur en simulation. La connexion passive devient contrôlable uniquement lors du départ explicitement confirmé : abonnement aux indications du Control Point et acquisition du contrôle, démarrage au minimum, mouvement observé, puis cible. L’autorisation de séance est bornée séparément de l’activation de 10 min du POC ; ses limites de programme restent intactes.

Le moteur de l’application impose **1–2,5 km/h et 0–1 %**, ainsi que les plages et pas lus. Les capacités annoncées 16/10 et les plafonds logiciels du diagnostic 4/3 ne sont pas une réception physique supplémentaire. Un programme hors périmètre est refusé, jamais réécrit.

Vérification logicielle : transport de test Bleak pour la branche réelle (souscription, réponses, refus, commande en vol suivie de STOP, absence de réponse, STOP accepté sans zéro, récupération passive), tests du POC conservés. Les essais de l’interface et la séance longue utilisent uniquement le simulateur, dans un dossier séparé. Voir [le plan, brique 8](../PLAN_V1_FITNESS_APP.md) et [le contrat d’exécution](EXECUTION_SEANCE.md) pour les résultats et limites.

**Aucun essai moteur sur le RUN500 pour cette livraison.** La brique 10 doit recevoir le parcours de l’application, la séance longue, les pertes réelles et les extensions de vitesse/pente. Les sujets physiques ouverts au § 4 restent ouverts, notamment l’arrêt sans PC/BLE et la suspension effective d’un téléphone.
