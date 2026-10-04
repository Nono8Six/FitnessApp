# Instructions de travail partagé — FitnessApp

## Référence commune

- `main` sur GitHub (`Nono8Six/FitnessApp`) est la version commune. Tout le travail y est poussé directement (décision d’Arnaud du 4 octobre 2026).
- Un snapshot cloud, un chat, une branche locale nommée `work` ou le réglage initial `ref: main` ne prouvent pas que le checkout est à jour.
- Le plan courant est `PLAN_V1_FITNESS_APP.md`. Lire aussi `DESIGN.md` et les instructions des composants concernés. Présenter l'avancement d'après le code publié et les limites connues. Les cases du plan suivent la livraison, pas une validation humaine obligatoire.

## Développement

- Répondre en français. Avant un développement non trivial, expliquer brièvement ce qui va changer et comment, puis avancer dans le périmètre demandé.
- FitnessApp est un petit projet personnel : implémenter directement les fonctions réelles, pousser sur `main`, puis améliorer avec les retours d'usage. Pas de mockup, de prototype jetable ni de campagne d'essais comme étape préalable.
- Écrire du code professionnel, simple, robuste et maintenable. Inspecter et réutiliser les composants, services et bibliothèques existants ; améliorer ce qui peut être repris. Limiter les abstractions et les dépendances à un besoin concret.
- Respecter `DESIGN.md` et brancher les écrans sur l'API et les données réelles. Prévoir les états chargement, vide, erreur, désactivé et les formats téléphone et PC.
- Valider les entrées côté serveur, gérer les erreurs explicitement et préserver les données. Les messages doivent être compréhensibles, les logs utiles au diagnostic ; corriger les causes des bugs.
- Livrer des changements ciblés et complets. Faire le ménage des doublons et éléments obsolètes liés à la tâche, en préservant le travail concurrent et les données utilisateur.

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
- Ne pas utiliser `reset --hard`, `clean`, un stash automatique ou un force-push pour faire disparaître un écart. Ne pas modifier les fichiers d'un autre contributeur sans comprendre leur rôle.
- Le cloud fournit déjà un environnement isolé : utiliser le checkout existant. Ne créer un Git worktree que sur demande explicite.

## Commits et avancement

- Pousser directement sur `main`, par commits cohérents. Pas de branche ni de PR, sauf demande d’Arnaud.
- Cette publication est autorisée par la consigne permanente d'Arnaud : ne pas redemander une confirmation à chaque push ni lui demander d'essayer chaque brique avant de poursuivre.
- Après le push, récupérer `origin/main` et vérifier que le commit publié y est présent, ou en est un ancêtre si un autre contributeur a déjà avancé. Ne jamais forcer le push ; si la publication est bloquée, le signaler sans la déclarer réussie.
- Aucune branche obsolète : une branche dont les commits sont déjà dans `main` est supprimée, en local et sur GitHub (`git branch -d <nom>`, `git push origin --delete <nom>`). Vérifier d’abord avec `git branch -r --merged origin/main`.
- Le message de commit décrit le résultat concret, les vérifications exécutées et les limites.
- Relire `PLAN_V1_FITNESS_APP.md` avant chaque brique. Terminer une brique à la fois dans le périmètre demandé. Cocher les fonctions réellement implémentées à leur livraison et noter les limites utiles, dans le même commit ; aucun commit de validation humaine n'est requis.
- Garder les décisions durables et le suivi dans le dépôt, avec la fonction concernée. Un résumé court suffit ; aucune nouvelle collection de captures ou de rapports de tests n'est exigée.
- Avant de livrer, refaire un fetch, contrôler la différence avec `origin/main`, relire le diff et annoncer ce qui est local ou poussé. Ne jamais présenter un fichier local comme déjà disponible aux autres.

## Installation et vérifications

- Backend de diagnostic : Python 3.12, environnement `.venv`, dépendances de `requirements.txt`.
- Frontend : `frontend/`, dépendances verrouillées par `package-lock.json`. Installer avec `npm ci`, sans réécrire le lockfile. Si le cache npm par défaut n'est pas accessible, passer un dossier inscriptible avec `--cache <dossier>`.
- Après synchronisation, inspecter les manifests, scripts et nouveaux composants avant de réutiliser les anciennes instructions cloud.
- Préserver les vérifications TLS, les signatures et les sommes de contrôle. Ne jamais contourner une erreur d'intégrité ni inventer des secrets.
- Choisir le contrôle technique minimal utile au changement : compilation, syntaxe, requête API ou test ciblé. Après un résultat concluant, livrer ; élargir les contrôles seulement si une erreur ou un risque concret le justifie.
- Les tests concernent les calculs importants, les migrations et la conservation des données, les validations complexes, les bugs récurrents et la sécurité du tapis. Réutiliser les tests existants ; ajouter un test uniquement s'il protège une règle critique ou une régression. Pas de tests systématiques de composants simples ni de suite complète pour une petite modification.
- Pour le frontend, `npm run build` inclut déjà le contrôle TypeScript : inutile de le doubler par `npm run typecheck`. Utiliser Chrome pour diagnostiquer un problème visuel ou un parcours précis quand nécessaire ; pas de campagne multi-écrans, de captures obligatoires ni de recette sur chaque appareil à chaque brique.
- Une modification documentaire se vérifie par relecture du diff et `git diff --check`, sans tests applicatifs. À la livraison, résumer le changement, les choix importants et le contrôle effectué, avec les limites restantes ; ne pas annoncer un essai qui n'a pas eu lieu.
- Pour le travail d'installation, garder les sources, tests, manifests et lockfiles intacts hors des modifications explicitement demandées. `.venv/`, `frontend/node_modules/`, `frontend/dist/`, `frontend/*.tsbuildinfo`, `__pycache__/` et `data/` sont des sorties locales, ignorées par Git.

## Cloud et matériel

- Les dépendances peuvent être conservées par le snapshot. Les processus doivent être relancés dans chaque nouvelle machine. Publier un environnement ne synchronise pas automatiquement Git avec GitHub.
- Application cloud : depuis la racine, `.venv/bin/python -m backend --port 4330` (ajouter `--simulation` pour les données simulées). Un seul processus. Sur Windows : `.\start-app.ps1`.
- POC cloud : depuis la racine, `.venv/bin/python -m poc.server --simulate --host 127.0.0.1 --port 4318`. Un seul processus, sans `--reload` ni workers multiples.
- Frontend cloud : depuis `frontend/`, `npm run dev -- --host 127.0.0.1 --port 5173 --strictPort` ; `/api` est relayé vers le serveur de l'application sur 4330. Vérifier les réponses HTTP et les ressources chargées ; inspecter un serveur existant avant d'en lancer un autre.
- Les URL de boucle locale servent aux vérifications internes ; l'interface d'onboarding ne fournit pas de prévisualisation utilisateur pour ces URL.
- L'interface est servie par `backend/` ; le POC reste séparé jusqu'à la brique 7. Aucune donnée de démonstration dans l'interface : un écran n'apparaît que lorsque sa brique le relie au serveur.
- Préserver le POC pour le diagnostic conformément au plan. Aucun mouvement réel sans présence confirmée. Pas de reprise ou de répétition automatique de commande incertaine.
- Les essais Bluetooth réels nécessitent le PC Windows proche du RUN500. Ne pas lancer `scripts/run_reception.py` pendant la configuration cloud. Les mesures simulées ne prouvent pas le fonctionnement du tapis.
- Ne jamais publier de secrets, jetons, fichiers de credentials ou journaux privés dans le dépôt, un commit ou le chat.
