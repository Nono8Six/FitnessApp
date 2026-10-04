# RUN500 LAB — POC de connectivité et de commandes

Console locale Windows pour vérifier le Domyos RUN500 avant de construire l'application d'entraînement. Le PC gère le Bluetooth ; le téléphone affiche la même console par le réseau local.

Pour préparer l'application : [base factuelle du cahier des charges](docs/BASE_FACTUELLE_CAHIER_DES_CHARGES_RUN500.md), avec toutes les commandes trouvées, les fonctions actuelles, les preuves, les limites et les possibilités restant à développer.

**État au 4 octobre 2026 : connexion et commandes de base reçues sur le RUN500 réel, en essais supervisés à 1–2,5 km/h et 0–1 %.** Vitesse, pente, Pause, STOP, trois blocs, reprise et arrêt après silence de l'écran ont été vérifiés. L'utilisateur confirme les mouvements et les premiers arrêts. La saisie manuelle accepte désormais la plage annoncée, jusqu'à 16 km/h, et le bouton Démarrer applique la vitesse choisie après un départ au minimum. Les 20 tests ciblés passent. Les pertes BLE/PC, la clé physique et les vitesses élevées restent à recevoir. Voir le [compte rendu de réception](docs/RECEPTION_RUN500.md) et l'[analyse de faisabilité](docs/FAISABILITE_RUN500.md).

## Lancer

Dans PowerShell, depuis ce dossier :

```powershell
.\start-poc.ps1
```

Ouvrir <http://127.0.0.1:4317>. Python 3.12 a été utilisé pour la vérification. Le script prépare un environnement `.venv` dans ce dossier si nécessaire et installe les trois dépendances de `requirements.txt` depuis PyPI. Aucun compte ni service Cloud n'est nécessaire.

Pour le téléphone sur le même Wi-Fi :

```powershell
.\start-poc.ps1 -Reseau
```

Ouvrir sur le PC « Ouvrir cette console sur un téléphone ». Utiliser l'adresse de l'interface Wi-Fi du PC : la console s'ouvre directement, sans clé ni compte. Sur ce PC, l'adresse Wi-Fi vérifiée aujourd'hui est **http://192.168.1.23:4317** ; elle pourra changer.

Le serveur écoute alors sur les interfaces réseau du PC. L'accès est ouvert aux appareils pouvant joindre ce serveur, selon le choix de l'utilisateur ; le HTTP du POC n'est pas chiffré. Aucun accès Internet, tunnel, règle de pare-feu, DNS/mDNS ou réglage de veille n'est configuré par ce projet. L'affichage sélectionne les interfaces physiques actives avec une passerelle et exclut WSL, Hyper-V et les interfaces VPN. L'utilisateur confirme le fonctionnement depuis son téléphone, sans clé ; Chrome a également été vérifié via l'IP Wi-Fi.

Si une ancienne page demande encore une clé, l'actualiser pour charger la version actuelle. La présence physique et l'activation des commandes restent nécessaires avant de faire démarrer le tapis.

Un seul serveur peut utiliser ce port. Arrêter celui qui tourne avec `Ctrl+C` avant de relancer. Garder le PC et l'écran de contrôle éveillés pendant le test. Ne pas utiliser plusieurs workers ni `--reload` : une seule boucle asynchrone doit posséder la connexion BLE.

Pour tester sans matériel, sur un port distinct :

```powershell
.\start-poc.ps1 -Simulation -Port 4318
```

La bannière « MODE SIMULATION » est permanente. Les réponses et mesures y sont synthétiques ; elles ne prouvent aucune compatibilité matérielle.

## Première réception du tapis

1. Allumer le RUN500 près du PC. Fermer E-Connected, Kinomap, Zwift et QZ sur les autres appareils. Vérifier la disponibilité du STOP et de la clé de sécurité sur la console du tapis.
2. Cliquer « Rechercher en Bluetooth », puis connecter uniquement l'appareil identifié comme votre tapis. Aucun démarrage ni prise de contrôle n'est effectué à la connexion.
3. Lire les capacités, les plages et les mesures. Exporter le diagnostic avant les essais de mouvement. Si FTMS ou ses commandes ne sont pas disponibles, conserver le diagnostic : aucun protocole propriétaire n'est essayé automatiquement.
4. En étant auprès du tapis, bande libre, cocher la présence et activer le contrôle. Le logiciel demande l'autorisation FTMS et attend la réponse du tapis.
5. À l'arrêt, saisir 2 km/h puis cliquer « Démarrer à 2 km/h ». Le contrôleur démarre au minimum annoncé, attend une nouvelle mesure de mouvement puis applique 2 km/h. En marche, « Appliquer » change la vitesse. Vérifier les valeurs sur la console et le mouvement réel. Tester Pause et STOP ; chaque arrêt désarme le logiciel.
6. Après réactivation, démarrage et réglage à 2 km/h / 0 %, lancer les trois blocs. Ils durent 10 secondes chacun, après confirmation des cibles par la télémétrie : 2 km/h / 0 %, 2,5 km/h / 1 %, puis 2 km/h / 0 %. Le programme demande ensuite l'arrêt.
7. Exporter le diagnostic et noter séparément ce qui a été observé sur le tapis. Une réponse FTMS positive ne suffit pas à constater l'arrêt physique.

La vitesse manuelle suit la plage annoncée par le tapis, plafonnée à **16 km/h** ; la pente reste limitée à **3 %**. Les essais matériels documentés restent à 1–2,5 km/h et 0–1 %. Les programmes de réception gardent un plafond distinct de **4 km/h**, trois blocs de 5 à 60 secondes et des transitions à 0,5 km/h et 1 %. Ce sont des limites techniques, pas une prescription sportive. Le programme refuse de redémarrer un tapis arrêté.

## Comportement en cas de problème

- Une seule interface possède le contrôle ; Pause et STOP restent accessibles aux autres écrans de la console.
- Les mesures de vitesse et de pente doivent avoir moins de 5 secondes. Une valeur inconnue n'est pas remplacée par zéro.
- Après 12 secondes sans nouvelle lecture d'état par l'écran propriétaire, le PC désarme le contrôle et tente un arrêt. La mise en arrière-plan du navigateur peut provoquer cet arrêt.
- L'activation expire après 10 minutes. Pause, STOP et certains événements de la console désarment le contrôle.
- Après un arrêt, la réactivation attend quatre secondes sans nouvel événement d'arrêt et une nouvelle mesure de vitesse nulle. Le RUN500 peut envoyer sa dernière notification après avoir déjà annoncé zéro ; la console affiche cette attente.
- Un STOP pendant une commande de programme désarme immédiatement le contrôle, attend la réponse bornée de la commande déjà envoyée, puis transmet STOP. La procédure en cours n'est pas abandonnée pour tenter une nouvelle écriture sur un canal incertain.
- Un démarrage avec une vitesse choisie vérifie cette valeur avant toute écriture. Si le mouvement initial n'est pas observé sous cinq secondes, STOP est demandé et la consigne choisie n'est pas envoyée. Un arrêt console ou une perte de présence entre les deux étapes bloque également l'application de cette consigne.
- Le logiciel attend la réponse FTMS correspondant à chaque commande pendant 4 secondes. Il n'effectue aucune répétition automatique après une réponse absente ou une écriture incertaine.
- Un résultat incertain verrouille les commandes jusqu'à reconnexion. Sur un canal devenu incertain, le POC refuse aussi de présenter un STOP logiciel comme confirmé : **utiliser le STOP physique**, puis reconnecter.
- Si le Bluetooth est perdu, si Windows se met en veille ou si le processus s'arrête brutalement, **le logiciel ne peut pas garantir l'arrêt de la bande**. Le STOP physique et la clé de sécurité restent indispensables.

La connectivité et les commandes de base du POC sont reçues sur ce matériel. Ce n'est pas encore une application destinée aux séances longues : les modes de perte matérielle restent à vérifier, à proximité du tapis.

## Preuves et fichiers

Les journaux `data/ble-*.jsonl` et `data/simulation-*.jsonl` séparent les essais matériels et simulés. Ils enregistrent demandes, réponses brutes FTMS, mesures, capacités et erreurs avec date UTC. L'export contient le journal complet et l'état courant ; `hardware_verified: false` rappelle qu'une réception physique ne se déduit pas d'un fichier logiciel.

Le dossier `docs/preuves/` contient les captures de la console prises dans Chrome pendant la vérification. Les fichiers `data/` peuvent contenir les noms et adresses des appareils Bluetooth proches : les garder localement.

```powershell
.\.venv\Scripts\python.exe -m unittest discover -s tests -v
.\.venv\Scripts\python.exe -m compileall -q poc
node --check poc/static/app.js
```

Les tests ciblent les unités FTMS, les données tronquées, les limites, la fraîcheur des mesures, l'exclusivité du contrôle, les réponses absentes/incorrectes et l'interruption des programmes. Ils ne remplacent pas les essais physiques.

Les outils de réception réelle et leurs résultats sont décrits dans [docs/RECEPTION_RUN500.md](docs/RECEPTION_RUN500.md). `scripts/run_reception.py --confirm-presence` fait réellement démarrer le tapis ; `scripts/observe_reception.py` lit uniquement son état.

## Organisation

- `poc/ftms.py` : décodage des mesures et encodage du standard FTMS.
- `poc/controller.py` : connexion BLE, autorisation, commandes, programmes et journal.
- `poc/server.py` : serveur local et validation des requêtes.
- `poc/static/` : console responsive sans framework ni ressource externe.
- `tests/test_critical.py` : vérifications des règles critiques.

Les profils, l'historique SQLite, Garmin, la génération par ChatGPT et une PWA installable sont les étapes suivantes, après réception du contrôle matériel. Ils ne sont pas implémentés dans ce POC.
