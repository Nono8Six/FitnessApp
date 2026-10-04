# Brique 1 · Audit et lancement Windows

4 octobre 2026. Base auditée : `main`, commit `b2ec8d1`, identique à `origin/main` après fetch. Environnement : Windows, Python 3.12.10, Windows PowerShell 5.1, PowerShell 7, Node 24.14.0, npm 11.4.1 et Chrome réel via le MCP.

## État du plan

| Livrable | Constat |
|---|---|
| Brique 0 · Design | Validation d’Arnaud déjà consignée dans le plan ; référence préservée |
| Brique 1 · Socle | Implémentée, auditée et corrigée ; validation d’Arnaud toujours attendue |
| Briques 2 à 17 | Non implémentées ; les composants de référence ne constituent pas des fonctions livrées |
| POC RUN500 | Sources et lanceur inchangés, règles critiques vérifiées en simulation ; aucune commande matérielle pendant cet audit |

Les cases de validation humaine restent inchangées. Aucun profil, stockage SQLite, coach, historique ou contrôle du tapis n’est ajouté à l’application.

## Corrections livrées

- `Lancer Fitness.cmd` appelle le lanceur existant et ouvre le navigateur après l’écoute effective du serveur. Le contexte de modules Windows PowerShell est préparé dans le processus du lanceur, y compris lorsqu’il est lancé depuis PowerShell 7. Aucune politique d’exécution n’est désactivée.
- `start-app.ps1` vérifie Python 3.12 et les dépendances, détecte les changements de manifests et de sources par leur contenu, réutilise le build inchangé et signale explicitement les ports occupés. Les messages français s’affichent correctement. Un fichier supprimé ou modifié avec un ancien horodatage ne laisse plus un build périmé.
- `frontend/src/lib/server.ts` vérifie le format des réponses avant de déclarer le serveur disponible, partage la requête en cours entre les appelants et nettoie ses abonnements. Le suivi est suspendu quand l’onglet est masqué et reprend immédiatement lorsqu’il revient au premier plan.
- Le badge Simulation conserve le dernier mode vérifié pendant une perte de connexion. Le chargement, les réponses invalides et les erreurs HTTP ont des états visibles ; les diagnostics sont consignés dans la console. Réessayer a une cible tactile de 44 × 44 px.
- Le serveur compresse les ressources avec le middleware GZip existant de Starlette. Les fichiers internes de suivi du build ne sont pas servis. La page « Interface non construite » utilise une empreinte CSP précise pour son style, sans autoriser tous les styles intégrés ; les réponses refusées gardent les en-têtes de sécurité et ne sont pas mises en cache.

## Vérifications effectuées

| Contrôle | Résultat |
|---|---|
| `python -m unittest discover -s tests -v` | 27 tests réussis, dont 20 règles critiques du POC ; tests existants complétés sur les fichiers internes et les réponses d’erreur |
| `python -m compileall -q backend poc` | Réussi |
| `node --check poc/static/app.js` | Réussi |
| `npm run typecheck`, `npm run build` | Réussis ; installation par `npm ci`, manifests et lockfile inchangés |
| `python -m pip check` | Aucune dépendance cassée |
| Lanceur Windows PowerShell 5.1 | Premier lancement : préparation des dépendances et build ; relances : réutilisation |
| `Lancer Fitness.cmd` depuis PowerShell 7 | Serveur démarré, navigateur ouvert automatiquement ; accès réseau avec `-Reseau` |
| Port déjà occupé | Refus explicite, même si le serveur existant écoute sur `0.0.0.0` et le nouveau lancement sur `127.0.0.1` ; aucun second serveur lancé |
| HTTP sur IP réseau | `/` et `/api/health` accessibles depuis ce PC par l’adresse affichée ; ce contrôle ne constitue pas un essai sur téléphone physique |
| Chrome 390 × 844 et 1440 × 900 | Écran vide réel, aucune donnée de démonstration, aucun débordement horizontal, aucune erreur console en fonctionnement normal |
| Panne API provoquée | Bandeau visible, badge Simulation conservé, récupération avec Réessayer |
| Réponse HTTP 200 de format invalide | Refus visible « Réponse du serveur invalide » et diagnostic ; récupération après remise en service de la vraie réponse |
| Onglet masqué | Aucune requête `/api/health` pendant une observation de 12 secondes ; une requête immédiate lors du retour |
| Build absent | HTTP 503 explicite, page sombre affichée correctement dans Chrome, aucune violation CSP |

Les avertissements console des pannes provoquées sont attendus. Les interceptions réseau et les réglages temporaires de test Chrome sont rétablis après les essais.

## Mesures de lancement et transfert

Mesures locales ponctuelles, dépendances déjà installées :

| Essai | Serveur prêt | Reconstruction |
|---|---:|---|
| Sources inchangées | 2,56 s | Non |
| Ajout d’un fichier avec un horodatage vieux d’un jour | 5,86 s | Oui |
| Suppression de ce fichier temporaire | 4,33 s | Oui |
| Relance finale inchangée | 1,97 s | Non |

Le fichier de vérification a été supprimé et le build final reconstruit. Aucun téléchargement pendant ces quatre essais. Ces durées ne sont pas des garanties pour d’autres PC.

| Ressource du build | Sans compression | GZip reçu par HTTP | Réduction |
|---|---:|---:|---:|
| JavaScript `index-CPpMtsYb.js` | 231 833 octets | 72 217 octets | 68,8 % |
| CSS `index-DvDtCGd-.css` | 27 179 octets | 6 393 octets | 76,5 % |

Le contenu décompressé reçu est identique au contenu original. Le cache immuable des ressources est conservé.

## Captures de Chrome sur Windows

- [Aujourd’hui · téléphone](windows-aujourdhui-390.jpg) et [PC](windows-aujourdhui-1440.jpg).
- [Simulation](windows-simulation-390.jpg) et [coupure avec badge conservé](windows-simulation-coupure-390.jpg).
- [Chargement](windows-chargement-390.jpg) et [réponse invalide](windows-reponse-invalide-390.jpg).
- [Build absent](windows-build-absent.jpg).

## Réception restante

Téléphone physique sur le Wi-Fi, Safari iOS/Android et validation d’Arnaud. Les essais Bluetooth réels restent ceux déjà documentés dans le dossier RUN500 ; cet audit ne les prolonge pas. Les fonctions des briques suivantes attendent toujours leur construction et leur propre réception.
