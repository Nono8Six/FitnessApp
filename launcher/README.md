# Lanceur Windows Fitness

Double-cliquer sur **`Lancer Fitness.cmd`** à la racine, puis **Démarrer → Ouvrir l'application**. La fenêtre conserve l'état, la durée de fonctionnement, les adresses PC/téléphone et les 200 dernières lignes du journal. Choisir l'accès téléphone et le mode simulation avant le démarrage. **Arrêter** termine le serveur ; pendant la préparation, le bouton devient **Annuler**. Fermer la fenêtre demande l'arrêt du serveur qu'elle a démarré.

Un serveur Fitness lancé en console peut aussi être ouvert et arrêté depuis le lanceur. Celui-ci vérifie son identité et son canal local avant d'activer **Arrêter**. Fermer la fenêtre laisse ce serveur externe en marche ; seuls les serveurs démarrés par cette fenêtre s'arrêtent à sa fermeture. Pour un serveur externe, le journal suit les actions du lanceur ; les sorties du serveur restent dans sa console. Une ancienne version sans canal d'arrêt doit être arrêtée une fois avec `Ctrl+C`, puis relancée. Un autre service qui occupe le port reste intact. Aucun redémarrage automatique.

Si l'application répond mais que **Arrêter** reste indisponible, le message et le journal distinguent désormais un canal absent ou illisible, un format invalide, un autre dossier de projet et une identité différente. Le même refus n'est pas répété à chaque actualisation. Ne pas conclure qu'un serveur doit être redémarré à partir de la seule indisponibilité de son arrêt.

## Installation et mise à jour

Sur le PC de développement, `launcher/bin/Fitness Launcher.exe` est construit localement. Le double-clic vérifie les sources et reconstruit le lanceur si nécessaire. Les sources et `Cargo.lock` sont versionnés ; les exécutables, caches et dépendances restent ignorés par Git.

Les empreintes trient les fichiers dans un ordre indépendant de la version de PowerShell : construire avec PowerShell 7 puis ouvrir avec Windows PowerShell ne déclenche plus une reconstruction pour des sources identiques.

Pour construire sur un nouveau PC : Python 3.12, Node.js LTS, Rust stable, les outils de compilation C++ Microsoft et WebView2 doivent être disponibles. Depuis la racine :

```powershell
.\build-launcher.ps1
```

Ensuite, l'exécutable se lance sans Cargo ou Node tant que les interfaces sont construites et les dépendances Python installées. Garder l'exécutable dans `launcher/bin` à l'intérieur du projet. Le lanceur ne fournit pas encore de runtime Python embarqué ou d'installateur autonome : cela reste dans la brique 16. Les données conservent leur emplacement `%LOCALAPPDATA%\FitnessApp\reel` ou `simulation`.

Le mode console reste disponible : `start-app.ps1 -Reseau -Ouvrir`, avec `-Simulation`, `-Port` ou `-Reconstruire` au besoin. Pour un port personnalisé dans la fenêtre, définir `FITNESS_LAUNCHER_PORT` avant son ouverture ; par défaut, 4330.

## Fonctionnement

La fenêtre [Tauri 2](https://v2.tauri.app/develop/calling-rust/) réutilise React, les boutons et les couleurs de Fitness. Les quatre commandes IPC sont limitées à consulter l'état, démarrer, arrêter et ouvrir l'adresse locale calculée par Rust. Le frontend de production ne possède aucun serveur HTTP de contrôle.

Rust exécute `start-app.ps1 -Preparer`, puis un seul backend Python avec `--managed`. Les empreintes de contenu réutilisent les dépendances et les builds inchangés. La disponibilité vient de `/api/health`, avec un identifiant de corrélation propre au processus : ni un port ouvert ni un serveur voisin ne sont présentés comme notre serveur prêt.

Pour son propre serveur, l'arrêt passe par l'entrée standard héritée. Pour un serveur externe, Rust lit le canal privé dans le dossier de données (`launcher/servers/<pid>.json`), puis vérifie le projet, le port et l'identifiant de l'instance. La requête `/api/launcher/stop` exige la boucle locale, une clé aléatoire de 256 bits et l'identifiant exact ; elle refuse les origines navigateur et les clients réseau, même munis de la clé. La clé n'apparaît ni dans `/api/health`, ni dans l'interface ou les journaux ; le fichier est supprimé à la fermeture du serveur. Un fichier laissé après un crash ne correspond pas à une nouvelle instance.

Windows peut [rediriger les écritures AppData d'une application MSIX](https://learn.microsoft.com/en-us/windows/msix/desktop/desktop-to-uwp-behind-the-scenes). Si le canal habituel est absent, le lanceur cherche aussi le même fichier dans les caches `Packages/<famille>/LocalCache/Local`, sous le dossier du compte courant. Il applique à chaque candidat les mêmes contrôles du projet, du processus, du port, de l'instance et du format de la clé. Un canal illisible ou incompatible n'autorise aucun arrêt. Cette recherche ne déplace ni le fichier de contrôle ni les bases de données et respecte les dossiers personnalisés hors AppData.

Uvicorn termine son cycle de vie et ferme la base. Après 10 secondes sans arrêt, seul un processus détenu est forcé et l'erreur reste visible ; un serveur externe ne subit aucun arrêt forcé. Un Job Windows conserve les enfants du lanceur : sa disparition ferme aussi Python et les éventuels processus de préparation. Le POC et le tapis ne sont pas pilotés par ce lanceur.

## Vérifications

```powershell
# Depuis la racine
.\.venv\Scripts\python.exe -m unittest discover -s tests -p test_managed_server.py -v
.\.venv\Scripts\python.exe -m unittest discover -s tests -p test_launcher_control.py -v
.\.venv\Scripts\python.exe -m unittest discover -s tests -p test_prepare_helpers.py -v
.\.venv\Scripts\python.exe launcher/test_supervisor.py -v

# Depuis launcher/
cargo test --release --locked
cargo clippy --release --locked -- -D warnings
```

Les tests vérifient le véritable superviseur Windows et le backend avec des données et ports isolés : démarrage/arrêt, conservation des profils au redémarrage, annulation, fermeture du parent, crash, arrêt d'un serveur console, conservation de celui-ci à la fermeture du lanceur, serveur non vérifié et port occupé. Les contrôles SQLite vérifient l'intégrité après les arrêts. Les tests du canal vérifient aussi les refus sans clé, avec une origine navigateur, depuis le réseau et avec un ancien identifiant.

Pour vérifier les boutons dans Chrome avec la même supervision Rust :

```powershell
# Depuis la racine, terminal 1
$env:FITNESS_LAUNCHER_PORT = '4334'
$env:FITNESS_DATA_DIR = Join-Path $env:TEMP 'fitness-launcher-chrome'
.\.venv\Scripts\python.exe launcher/dev_bridge.py

# Depuis frontend/, terminal 2
npm run dev:launcher
# Ouvrir http://127.0.0.1:5175/launcher.html
```

Ce pont est réservé au développement, lié à `127.0.0.1:4391` et aux origines du serveur Vite sur 5175. Il est absent du lancement normal. Arrêter les deux terminaux après la vérification.

Vérification du 4 octobre 2026 : builds React et Windows réussis, Clippy sans avertissement ; 2 tests Rust, 9 tests du superviseur, 3 tests du canal local et 2 tests du backend géré réussis. Le scénario initial a été reproduit dans la fenêtre Windows, puis l'arrêt d'un serveur lancé en console a été effectué dans cette fenêtre et dans Chrome avec le vrai Rust : retour à « À l'arrêt », processus terminé, port fermé et SQLite intègre. Chrome ne présente aucune erreur console. Pendant l'arrêt, les boutons et options restent désactivés ; les options affichées correspondent encore au serveur en cours d'arrêt. Aucun essai Bluetooth ou téléphone physique.

Vérification du 7 octobre 2026 : le refus depuis l'Explorateur venait du canal stocké physiquement dans le cache MSIX de Codex, confirmé par `fsutil hardlink list`. Une relance depuis Codex pouvait le lire et ne prouvait donc pas le lancement depuis l'Explorateur. Après correction, double-clic sur l'exécutable dans l'Explorateur : processus enfant d'`explorer.exe`, bouton **Arrêter** actif, aucune erreur affichée. Le serveur habituel, son processus et son instance sont conservés. Le test de régression reproduit le refus avec l'ancien binaire, puis vérifie la découverte du canal redirigé, les refus en cas de projet/port/instance/clé invalides, l'arrêt propre et l'intégrité SQLite. Cinq scénarios ciblés du superviseur et trois tests du canal réussissent ; builds React et Windows réussis. Le défaut distinct des empreintes PowerShell a également été reproduit puis corrigé avec un test dédié. Aucun déplacement de données, arrêt du serveur habituel ou commande matérielle.
