# Lanceur Windows Fitness

Double-cliquer sur **`Lancer Fitness.cmd`** à la racine, puis **Démarrer → Ouvrir l'application**. La fenêtre conserve l'état, la durée de fonctionnement, les adresses PC/téléphone et les 200 dernières lignes du journal. Choisir l'accès téléphone et le mode simulation avant le démarrage. **Arrêter** termine le serveur ; pendant la préparation, le bouton devient **Annuler**. Fermer la fenêtre demande aussi l'arrêt.

Un serveur Fitness déjà lancé ailleurs est signalé et peut être ouvert. Le lanceur ne l'arrête pas et ne le remplace pas. Un autre service qui occupe le port produit une erreur explicite. Aucun redémarrage automatique.

## Installation et mise à jour

Sur le PC de développement, `launcher/bin/Fitness Launcher.exe` est construit localement. Le double-clic vérifie les sources et reconstruit le lanceur si nécessaire. Les sources et `Cargo.lock` sont versionnés ; les exécutables, caches et dépendances restent ignorés par Git.

Pour construire sur un nouveau PC : Python 3.12, Node.js LTS, Rust stable, les outils de compilation C++ Microsoft et WebView2 doivent être disponibles. Depuis la racine :

```powershell
.\build-launcher.ps1
```

Ensuite, l'exécutable se lance sans Cargo ou Node tant que les interfaces sont construites et les dépendances Python installées. Garder l'exécutable dans `launcher/bin` à l'intérieur du projet. Le lanceur ne fournit pas encore de runtime Python embarqué ou d'installateur autonome : cela reste dans la brique 16. Les données conservent leur emplacement `%LOCALAPPDATA%\FitnessApp\reel` ou `simulation`.

Le mode console reste disponible : `start-app.ps1 -Reseau -Ouvrir`, avec `-Simulation`, `-Port` ou `-Reconstruire` au besoin. Pour un port personnalisé dans la fenêtre, définir `FITNESS_LAUNCHER_PORT` avant son ouverture ; par défaut, 4330.

## Fonctionnement

La fenêtre [Tauri 2](https://v2.tauri.app/develop/calling-rust/) réutilise React, les boutons et les couleurs de Fitness. Les quatre commandes IPC sont limitées à consulter l'état, démarrer, arrêter et ouvrir l'adresse locale calculée par Rust. Le frontend de production ne possède aucun serveur HTTP de contrôle.

Rust exécute `start-app.ps1 -Preparer`, puis un seul backend Python avec `--managed`. Les empreintes de contenu réutilisent les dépendances et les builds inchangés. La disponibilité vient de `/api/health`, avec un identifiant de corrélation propre au processus : ni un port ouvert ni un serveur voisin ne sont présentés comme notre serveur prêt.

L'arrêt passe par l'entrée standard héritée, sans endpoint réseau d'arrêt. Uvicorn termine son cycle de vie et ferme la base. Après 10 secondes sans arrêt, seul le processus détenu est forcé et l'erreur reste visible. Un Job Windows conserve les enfants du lanceur : sa disparition ferme aussi Python et les éventuels processus de préparation. Le POC et le tapis ne sont pas pilotés par ce lanceur.

## Vérifications

```powershell
# Depuis la racine
.\.venv\Scripts\python.exe -m unittest discover -s tests -p test_managed_server.py -v
.\.venv\Scripts\python.exe launcher/test_supervisor.py -v

# Depuis launcher/
cargo test --release --locked
cargo clippy --release --locked -- -D warnings
```

Les tests vérifient le véritable superviseur Windows et le backend avec des données et ports isolés : démarrage/arrêt, conservation des profils au redémarrage, annulation, fermeture du parent, crash, serveur externe et port occupé. Les contrôles SQLite vérifient l'intégrité après les arrêts.

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

Réception du 4 octobre 2026 : builds React et Windows réussis ; 2 tests Rust et 6 tests du superviseur réussis ; commandes du backend géré vérifiées ; démarrer, ouvrir Fitness et arrêter effectués dans Chrome avec le vrai Rust. La fenêtre Windows a été compilée et son processus vérifié ; son rendu WebView2 et ses clics natifs restent distincts du parcours Chrome, les outils natifs n'étant pas disponibles dans cette session. Aucun essai Bluetooth ou téléphone physique.
