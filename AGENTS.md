# Instructions de travail partagé — FitnessApp

## Référence commune

- `main` sur GitHub (`Nono8Six/FitnessApp`) est la version commune. Tout le travail y est poussé directement (décision d’Arnaud du 4 octobre 2026).
- Un snapshot cloud, un chat, une branche locale nommée `work` ou le réglage initial `ref: main` ne prouvent pas que le checkout est à jour.
- Le plan courant est `PLAN_V1_FITNESS_APP.md`. Lire aussi `DESIGN.md` et les instructions des composants concernés. Présenter l'avancement d'après ces fichiers et les livrables vérifiés, sans inventer de validation humaine.

## Début de chaque tâche

Depuis la racine du checkout existant :

```bash
git status --short --untracked-files=all
git branch --show-current
git rev-parse HEAD
git fetch --no-tags origin main
git rev-parse origin/main
git rev-list --left-right --count HEAD...origin/main
git log --oneline --left-right HEAD...origin/main
```

- Annoncer la branche active, le commit et tout retard ou divergence avant de présenter le plan ou l'état du projet comme actuel. Les compteurs indiquent d'abord les commits propres à `HEAD`, puis ceux propres à `origin/main`.
- Si le fetch échoue, distinguer le dernier état connu de l'état distant actuel, dont la fraîcheur n'est pas vérifiée. Ne pas affirmer que le checkout est à jour.
- Si le checkout est propre et sur `main`, le mettre à jour avec `git merge --ff-only origin/main`.
- Travailler sur `main` à jour : `git switch main`, puis `git merge --ff-only origin/main`. Si `main` n'existe pas, utiliser `git switch --track -c main origin/main`.
- Si `origin/main` a avancé pendant le travail, récupérer et intégrer ses commits (`git pull --rebase origin main` pour ses propres commits non poussés) avant de pousser, sans effacer le travail de l’autre contributeur.
- En présence de modifications locales, de fichiers non suivis ou de commits propres à une autre tâche, les préserver et identifier leur propriétaire avant de changer de branche ou d'intégrer des changements qui les touchent. Continuer les travaux indépendants quand c'est possible.
- Ne pas utiliser `reset --hard`, `clean`, un stash automatique, un force-push ou une suppression de branche pour faire disparaître un écart. Ne pas modifier les fichiers d'un autre contributeur sans comprendre leur rôle.
- Le cloud fournit déjà un environnement isolé : utiliser le checkout existant. Ne créer un Git worktree que sur demande explicite.

## Commits et avancement

- Pousser directement sur `main`, par commits cohérents. Pas de branche ni de PR, sauf demande d’Arnaud.
- Le message de commit décrit le résultat concret, les vérifications exécutées et les limites.
- Relire `PLAN_V1_FITNESS_APP.md` avant chaque brique. Une seule brique en cours ; la suivante attend la validation d'Arnaud. Ne cocher une brique qu'après cette validation, dans un commit dédié.
- Les preuves et décisions durables vivent dans le dépôt, avec la fonction concernée. Les chats et brouillons cloud ne remplacent pas le suivi versionné.
- Avant de livrer, refaire un fetch, contrôler la différence avec `origin/main`, relire le diff et annoncer ce qui est local ou poussé. Ne jamais présenter un fichier local comme déjà disponible aux autres.

## Installation et vérifications

- Backend de diagnostic : Python 3.12, environnement `.venv`, dépendances de `requirements.txt`.
- Frontend : `frontend/`, dépendances verrouillées par `package-lock.json`. Installer avec `npm ci`, sans réécrire le lockfile. Si le cache npm par défaut n'est pas accessible, passer un dossier inscriptible avec `--cache <dossier>`.
- Après synchronisation, inspecter les manifests, scripts et nouveaux composants avant de réutiliser les anciennes instructions cloud.
- Préserver les vérifications TLS, les signatures et les sommes de contrôle. Ne jamais contourner une erreur d'intégrité ni inventer des secrets.
- Pour une modification de code, exécuter les contrôles pertinents et requis par le plan :

```bash
# Racine du dépôt
.venv/bin/python -m unittest discover -s tests -v
.venv/bin/python -m compileall -q poc
node --check poc/static/app.js

# Depuis frontend/
npm run typecheck
npm run build
```

- Distinguer tests réussis, échoués, non exécutés et vérifications matérielles. Un contrôle de syntaxe ou un port ouvert ne prouve pas qu'un parcours fonctionne.
- Les modifications UI demandent aussi le parcours réel dans Chrome aux dimensions indiquées dans le plan et l'absence d'erreur console. Un changement documentaire seul ne nécessite pas de tests applicatifs supplémentaires.
- Pour le travail d'installation, garder les sources, tests, manifests et lockfiles intacts hors des modifications explicitement demandées. `.venv/`, `frontend/node_modules/`, `frontend/dist/`, `frontend/*.tsbuildinfo`, `__pycache__/` et `data/` sont des sorties locales, ignorées par Git.

## Cloud et matériel

- Les dépendances peuvent être conservées par le snapshot. Les processus doivent être relancés dans chaque nouvelle machine. Publier un environnement ne synchronise pas automatiquement Git avec GitHub.
- POC cloud : depuis la racine, `.venv/bin/python -m poc.server --simulate --host 127.0.0.1 --port 4318`. Un seul processus, sans `--reload` ni workers multiples.
- Frontend cloud : depuis `frontend/`, `npm run dev -- --host 127.0.0.1 --port 5173 --strictPort`. Vérifier les réponses HTTP et les ressources chargées ; inspecter un serveur existant avant d'en lancer un autre.
- Les URL de boucle locale servent aux vérifications internes ; l'interface d'onboarding ne fournit pas de prévisualisation utilisateur pour ces URL.
- Le frontend actuel et le POC sont séparés tant que la brique de socle n'est pas réalisée. Ne pas annoncer une intégration complète ou des fonctions réelles si l'écran utilise encore des données de démonstration.
- Préserver le POC pour le diagnostic conformément au plan. Aucun mouvement réel sans présence confirmée. Pas de reprise ou de répétition automatique de commande incertaine.
- Les essais Bluetooth réels nécessitent le PC Windows proche du RUN500. Ne pas lancer `scripts/run_reception.py` pendant la configuration cloud. Les mesures simulées ne prouvent pas le fonctionnement du tapis.
- Ne jamais publier de secrets, jetons, fichiers de credentials ou journaux privés dans le dépôt, un commit ou le chat.
