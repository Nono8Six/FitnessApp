# Brique 2 · Profils : preuves

4 octobre 2026. Complément du même jour, à la demande d’Arnaud : créer, renommer et supprimer des profils, chacun avec ses propres données. Toutes les captures et tous les contrôles ci-dessous portent sur la version complétée (schéma `0002`).

Vérifié dans un conteneur Linux : Python 3.12, Node 22, Chromium 1194 headless (Playwright 1.56). Windows, PowerShell et le téléphone physique ne sont pas couverts ici. Ce dossier conserve les contrôles déjà réalisés ; les prochaines livraisons suivent les contrôles proportionnés d'[AGENTS.md](../../../../../AGENTS.md).

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
| 7. Nouveau profil : nom déjà pris refusé | [nouveau-profil-refus-390](nouveau-profil-refus-390.jpg) | [nouveau-profil-refus-1440](nouveau-profil-refus-1440.jpg) |
| 7. Nouveau profil : saisie | [nouveau-profil-390](nouveau-profil-390.jpg) | [nouveau-profil-1440](nouveau-profil-1440.jpg) |
| 8. Renommage en un nom déjà pris : nom restauré, message | [reglages-renommage-refus-390](reglages-renommage-refus-390.jpg) | [reglages-renommage-refus-1440](reglages-renommage-refus-1440.jpg) |
| 9. Confirmation de suppression | [suppression-confirmation-390](suppression-confirmation-390.jpg) | [suppression-confirmation-1440](suppression-confirmation-1440.jpg) |
| Lecture des profils refusée : bandeau, aucun avatar | [profils-illisibles-390](profils-illisibles-390.jpg) | [profils-illisibles-1440](profils-illisibles-1440.jpg) |
| 6. Serveur coupé : Réglages en lecture seule | [reglages-serveur-coupe-390](reglages-serveur-coupe-390.jpg) | [reglages-serveur-coupe-1440](reglages-serveur-coupe-1440.jpg) |
| 6. Serveur coupé : profils visibles, choix impossible | [feuille-serveur-coupe-390](feuille-serveur-coupe-390.jpg) | [feuille-serveur-coupe-1440](feuille-serveur-coupe-1440.jpg) |
| Serveur `--simulation --host 0.0.0.0` | [reglages-simulation-reseau-390](reglages-simulation-reseau-390.jpg) | [reglages-simulation-reseau-1440](reglages-simulation-reseau-1440.jpg) |

## Parcours Chrome : 96 contrôles réussis sur 96

Script : [parcours.cjs](parcours.cjs), lancé contre `python -m backend --port 4330` avec un dossier de données vide. Chaque format est un appareil distinct (contexte de navigateur séparé) : le PC démarre sur Arnaud alors que le téléphone a choisi Ophélie, ce qui vérifie le choix par appareil.

Pour chaque format :

- Appareil neuf : premier profil renvoyé par l’API. Valeur inconnue dans `fitness.profile.v1` : premier profil.
- Changement de profil depuis la feuille, écrit dans `fitness.profile.v1`, conservé au rechargement et après redémarrage du serveur. Échap ferme la feuille.
- Objectif : deux appuis sur +, rechargement, valeur relue dans l’interface et par `GET /api/profiles/ophelie`. Saisie clavier 20 : « Entre 1 et 14 », aucune requête envoyée. Saisie 4 + Entrée : enregistrée.
- Refus du serveur : la réponse PATCH est remplacée par un 422 dans le navigateur (le serveur n’accepte aucune valeur refusable depuis l’interface) ; la valeur enregistrée revient et le message du serveur s’affiche sous la ligne.
- Unité : changement, rechargement, valeur relue dans l’interface et par l’API.
- Création : Créer désactivé tant que le nom est vide ; « arnaud » refusé par le serveur (« Un profil s’appelle déjà Arnaud ») ; « Léa 390 » créé avec l’identifiant `lea-390`, objectif 3 et km/h, puis choisi sur l’appareil.
- Renommage : « Léa 390 B. » enregistré, identifiant inchangé, relu après rechargement ; « Ophélie » refusé, nom restauré, message sous la ligne.
- Suppression : confirmation, profil absent du serveur (404), appareil repassé sur le premier profil et choix effacé de `fitness.profile.v1`, profil absent de la feuille après rechargement.
- Lecture lente des profils (réponse retardée de 2,5 s) : rien à 0,5 s, « Connexion » à 1,4 s, retiré après réponse.
- Lecture des profils en erreur HTTP 500 : bandeau « Serveur du PC indisponible », aucun avatar ; Réessayer relit et retire le bandeau.
- Serveur arrêté : bandeau « Serveur du PC injoignable », nom, stepper, champ, segmenté et suppression désactivés, informations conservées, profils non sélectionnables, « Nouveau profil » inactif. Serveur relancé puis Réessayer : Réglages modifiables.
- Aucun défilement horizontal ; toutes les cibles (liens, boutons, champs, segments) mesurent au moins 44 px, zone de toucher effective comprise (segmenté : piste de 32 px, zone de 44 px). Feuille ouverte : seules ses cibles sont mesurées, la page derrière étant couverte.
- Aucune erreur console, hors les 4 ressources refusées pendant la coupure provoquée du serveur.

Mode simulation avec réseau : « Simulation » et « Mode Simulation » affichés, base séparée (Arnaud à 3 et km/h alors que la base réelle avait été modifiée), aucune erreur console. Le conteneur n’a pas d’interface Wi-Fi : l’adresse `192.168.1.23` de la capture 390 est injectée par le test dans `/api/health` pour vérifier l’affichage de la ligne « Adresse téléphone ». Sans adresse détectée (capture 1440), la ligne n’apparaît pas.

## Vérifications exécutées

| Contrôle | Résultat |
|---|---|
| `python -m unittest discover -s tests` | 52 tests OK : 27 existants (20 POC, 7 serveur, dont la santé qui vérifie le schéma), 25 nouveaux |
| `python -m compileall -q backend poc`, `node --check poc/static/app.js` | OK |
| `npm run typecheck`, `npm run build` | OK |
| Migration depuis zéro | base créée par Alembic, révision `0002`, colonnes attendues ; `PRAGMA journal_mode` = `wal`, `foreign_keys` = 1 |
| Migration 0001 → 0002 | une base créée par la première livraison, avec profils modifiés, passe à `0002` sans perte |
| Profils par défaut | Arnaud et Ophélie, objectif 3, km/h, créés seulement dans une base sans profil ; deux démarrages : toujours deux lignes ; un profil par défaut supprimé n’est pas recréé |
| Création | nom nettoyé (espaces), objectif et unité par défaut ou fournis ; identifiant dérivé du nom (`lea`, `lea-2`, `profil` pour un nom sans lettre latine), jamais modifié ; nom vide, 41 caractères, caractère de contrôle, nombre, identifiant ou horodatage imposé : 422 |
| Noms uniques | « ARNAUD », « OPHÉLIE » refusés (409), à la création comme au renommage ; changer la casse de son propre nom est accepté |
| Suppression | renvoie les profils restants ; profil supprimé : 404 ; dernier profil : 409 « Il faut garder au moins un profil » ; nom et identifiant libérés réutilisables |
| Données propres à chaque profil | une table d’essai liée à `profiles.id` avec `ON DELETE CASCADE` : supprimer Arnaud supprime ses lignes, pas celles d’Ophélie (transaction annulée ensuite) |
| Écritures concurrentes | les écritures prennent le verrou SQLite dès le début (`BEGIN IMMEDIATE`) : la vérification du nom et du dernier profil ne peut pas être contournée par deux requêtes simultanées |
| Modification conservée | `PATCH` puis redémarrage : valeurs et `updated_at` conservés, `created_at` inchangé, l’autre profil intact |
| Réel / simulation | deux fichiers `fitness.db` ; une modification en réel n’apparaît pas en simulation |
| Migration ratée | révision 0002 de test qui crée une table, modifie un profil puis échoue : `StorageError`, aucune table créée, révision `0001` et profil intacts (DDL transactionnel) |
| Base illisible ou plus récente | fichier corrompu ou révision inconnue : démarrage refusé ; `python -m backend` affiche « Fitness : démarrage impossible » avec le chemin et la cause, code de sortie 1 |
| Contraintes SQLite | objectif 0 ou 15 et unité `mph` refusés par la base elle-même |
| PATCH | bornes 1 et 14 acceptées ; 0, 15, −1, booléen, décimal, texte, nul, `mph`, `KMH`, champ inconnu, `id`, nom vide, trop long, avec contrôle ou non textuel, corps vide, liste et JSON invalide : 422 avec une phrase ; profil inconnu : 404 ; rien n’est modifié |
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
- « Chacun ses données » : aujourd’hui, les seules données d’un profil sont son nom, son objectif et son unité. Les séances, conversations et mesures des briques suivantes suivront la règle vérifiée ci-dessus (clé étrangère en cascade).
- Un profil supprimé ne se récupère pas. Ce n’est pas une protection : tout appareil du réseau peut créer, renommer ou supprimer n’importe quel profil.
- Un appareil dont le profil a été supprimé ailleurs bascule sur le premier profil au rechargement ou à sa prochaine modification refusée (404).
- Deux appareils qui modifient le même réglage au même moment : la dernière écriture gagne ; l’autre appareil voit la nouvelle valeur au rechargement de la page ou après une coupure du serveur, pas en direct.
