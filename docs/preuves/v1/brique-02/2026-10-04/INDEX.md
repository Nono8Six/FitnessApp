# Brique 2 · Profils : preuves

4 octobre 2026. Vérifié dans un conteneur Linux : Python 3.12, Node 22, Chromium 1194 headless (Playwright 1.56). Windows, PowerShell, le téléphone physique et la validation d’Arnaud ne sont pas couverts ici.

## Captures (serveur réel, build de production, base neuve)

Téléphone 390 × 844 (×2), PC 1440 × 900. Locale fr-FR, fuseau Europe/Paris. Le dossier de données affiché est celui du conteneur de test.

| Étape | 390 | 1440 |
|---|---|---|
| 1. Aujourd’hui avec avatar (appareil neuf : premier profil du serveur) | [aujourdhui-390](aujourdhui-390.jpg) | [aujourdhui-1440](aujourdhui-1440.jpg) |
| 2. Feuille Profil : coche sur le profil courant, ligne Réglages | [feuille-profil-390](feuille-profil-390.jpg) | [feuille-profil-1440](feuille-profil-1440.jpg) |
| 3. Après choix d’Ophélie et rechargement | [aujourdhui-ophelie-390](aujourdhui-ophelie-390.jpg) | [aujourdhui-ophelie-1440](aujourdhui-ophelie-1440.jpg) |
| 4. Réglages | [reglages-390](reglages-390.jpg) | [reglages-1440](reglages-1440.jpg) |
| 4. Enregistrement refusé : valeur restaurée, message sous la ligne | [reglages-refus-390](reglages-refus-390.jpg) | [reglages-refus-1440](reglages-refus-1440.jpg) |
| 5. Unité changée puis rechargée | [reglages-unite-390](reglages-unite-390.jpg) | [reglages-unite-1440](reglages-unite-1440.jpg) |
| Lecture des profils refusée : bandeau, aucun avatar | [profils-illisibles-390](profils-illisibles-390.jpg) | [profils-illisibles-1440](profils-illisibles-1440.jpg) |
| 6. Serveur coupé : Réglages en lecture seule | [reglages-serveur-coupe-390](reglages-serveur-coupe-390.jpg) | [reglages-serveur-coupe-1440](reglages-serveur-coupe-1440.jpg) |
| 6. Serveur coupé : profils visibles, choix impossible | [feuille-serveur-coupe-390](feuille-serveur-coupe-390.jpg) | [feuille-serveur-coupe-1440](feuille-serveur-coupe-1440.jpg) |
| Serveur `--simulation --host 0.0.0.0` | [reglages-simulation-reseau-390](reglages-simulation-reseau-390.jpg) | [reglages-simulation-reseau-1440](reglages-simulation-reseau-1440.jpg) |

## Parcours Chrome : 64 contrôles réussis sur 64

Script : [parcours.cjs](parcours.cjs), lancé contre `python -m backend --port 4330` avec un dossier de données vide. Chaque format est un appareil distinct (contexte de navigateur séparé) : le PC démarre sur Arnaud alors que le téléphone a choisi Ophélie, ce qui vérifie le choix par appareil.

Pour chaque format :

- Appareil neuf : premier profil renvoyé par l’API. Valeur inconnue dans `fitness.profile.v1` : premier profil.
- Changement de profil depuis la feuille, écrit dans `fitness.profile.v1`, conservé au rechargement et après redémarrage du serveur. Échap ferme la feuille.
- Objectif : deux appuis sur +, rechargement, valeur relue dans l’interface et par `GET /api/profiles/ophelie`. Saisie clavier 20 : « Entre 1 et 14 », aucune requête envoyée. Saisie 4 + Entrée : enregistrée.
- Refus du serveur : la réponse PATCH est remplacée par un 422 dans le navigateur (le serveur n’accepte aucune valeur refusable depuis l’interface) ; la valeur enregistrée revient et le message du serveur s’affiche sous la ligne.
- Unité : changement, rechargement, valeur relue dans l’interface et par l’API.
- Lecture lente des profils (réponse retardée de 2,5 s) : rien à 0,5 s, « Connexion » à 1,4 s, retiré après réponse.
- Lecture des profils en erreur HTTP 500 : bandeau « Serveur du PC indisponible », aucun avatar ; Réessayer relit et retire le bandeau.
- Serveur arrêté : bandeau « Serveur du PC injoignable », stepper, champ et segmenté désactivés, informations conservées, profils non sélectionnables. Serveur relancé puis Réessayer : Réglages modifiables.
- Aucun défilement horizontal ; toutes les cibles (liens, boutons, champs, segments) mesurent au moins 44 px, zone de toucher effective comprise (segmenté : piste de 32 px, zone de 44 px).
- Aucune erreur console, hors les 4 ressources refusées pendant la coupure provoquée du serveur.

Mode simulation avec réseau : « Simulation » et « Mode Simulation » affichés, base séparée (Arnaud à 3 et km/h alors que la base réelle avait été modifiée), aucune erreur console. Le conteneur n’a pas d’interface Wi-Fi : l’adresse `192.168.1.23` de la capture 390 est injectée par le test dans `/api/health` pour vérifier l’affichage de la ligne « Adresse téléphone ». Sans adresse détectée (capture 1440), la ligne n’apparaît pas.

## Vérifications exécutées

| Contrôle | Résultat |
|---|---|
| `python -m unittest discover -s tests` | 43 tests OK : 27 existants (20 POC, 7 serveur, dont la santé qui vérifie le schéma), 16 nouveaux |
| `python -m compileall -q backend poc`, `node --check poc/static/app.js` | OK |
| `npm run typecheck`, `npm run build` | OK |
| Migration depuis zéro | base créée par Alembic, révision `0001`, colonnes attendues ; `PRAGMA journal_mode` = `wal`, `foreign_keys` = 1 |
| Profils par défaut | Arnaud et Ophélie, objectif 3, km/h ; deux démarrages : toujours deux lignes, réponse identique |
| Modification conservée | `PATCH` puis redémarrage : valeurs et `updated_at` conservés, `created_at` inchangé, l’autre profil intact |
| Réel / simulation | deux fichiers `fitness.db` ; une modification en réel n’apparaît pas en simulation |
| Migration ratée | révision 0002 de test qui crée une table, modifie un profil puis échoue : `StorageError`, aucune table créée, révision `0001` et profil intacts (DDL transactionnel) |
| Base illisible ou plus récente | fichier corrompu ou révision inconnue : démarrage refusé ; `python -m backend` affiche « Fitness : démarrage impossible » avec le chemin et la cause, code de sortie 1 |
| Contraintes SQLite | objectif 0 ou 15 et unité `mph` refusés par la base elle-même |
| PATCH | bornes 1 et 14 acceptées ; 0, 15, −1, booléen, décimal, texte, nul, `mph`, `KMH`, champ inconnu, `name`, `id`, corps vide, liste et JSON invalide : 422 avec une phrase ; profil inconnu : 404 ; rien n’est modifié |
| Corps des requêtes | `PATCH`, `POST`, `DELETE` sans `application/json` : 415 ; plus de 16 000 octets ou envoi par morceaux : 413 |
| Origine | origine étrangère : 403 en lecture et en écriture, rien n’est modifié |
| Dossier de données dans le dépôt | refusé au démarrage, rien n’est créé |
| POC | `poc/` et `start-poc.ps1` inchangés |

## Défaut trouvé et corrigé pendant la brique

Le premier parcours a montré que l’avatar ne changeait pas après le choix d’un profil, alors que `localStorage` était bien écrit : le store React ne signalait pas le changement du profil courant. Corrigé, puis vérifié par le parcours.

## Limites

- `start-app.ps1` (vérification de SQLAlchemy et Alembic) n’a pas été exécuté : pas de PowerShell dans ce conteneur.
- Téléphone physique, Safari iOS et Android non essayés. Le choix est mémorisé par navigateur : deux navigateurs du même téléphone ont chacun le leur.
- Le refus d’un enregistrement est simulé dans le navigateur ; le refus réel par le serveur est couvert par les tests Python.
- Deux appareils qui modifient le même réglage au même moment : la dernière écriture gagne ; l’autre appareil voit la nouvelle valeur au rechargement de la page ou après une coupure du serveur, pas en direct.
