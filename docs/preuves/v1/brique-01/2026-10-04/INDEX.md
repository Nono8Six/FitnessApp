# Brique 1 · Socle : preuves

4 octobre 2026. Livraison initiale vérifiée dans un conteneur Linux, Python 3.11, Node 22, Chromium 1194 headless, PowerShell 7.4. À ce moment, Windows réel, Windows PowerShell 5.1 et le téléphone physique sur le Wi-Fi n’avaient pas été vérifiés.

Un [audit complémentaire sur Windows](AUDIT_WINDOWS.md) a depuis vérifié le lanceur, le double-clic, les relances et Chrome sur ce PC. La brique a été validée par Arnaud le 4 octobre 2026 (voir le [plan](../../../../../PLAN_V1_FITNESS_APP.md)). L'essai sur téléphone physique n'a pas de preuve versionnée.

## Captures (serveur réel, build de production)

Téléphone 390 × 844 (×2), PC 1440 × 900. Locale fr-FR, fuseau Europe/Paris.

- [aujourdhui-390](aujourdhui-390.jpg) · [aujourdhui-1440](aujourdhui-1440.jpg) : état vide réel, sans onglets (une seule destination)
- [simulation-390](simulation-390.jpg) · [simulation-1440](simulation-1440.jpg) : serveur lancé avec `--simulation`
- [serveur-injoignable-390](serveur-injoignable-390.jpg) · [serveur-injoignable-1440](serveur-injoignable-1440.jpg) : `/api/health` refusé, bandeau et bouton Réessayer

Les six captures : aucune erreur console, aucune requête en échec (hors coupure provoquée), aucun défilement horizontal.

## Vérifications exécutées

| Contrôle | Résultat |
|---|---|
| `python -m unittest discover -s tests` | 27 tests OK (20 du POC, 7 nouveaux du serveur) |
| `npm run typecheck`, `npm run build` | OK |
| `GET /api/health` | version, mode `reel` / `simulation`, dossier de données, interface présente, réseau |
| Données | `reel` et `simulation` dans deux dossiers distincts ; aucun dossier créé dans le dépôt |
| Fichiers servis | `index.html` (no-store), `assets/` (cache immuable), `icon.svg` ; tout autre chemin : 404 ; build absent : 503 explicite |
| Sécurité | hôte inconnu : 400 ; origine étrangère sur `/api` : 403 ; CSP `default-src 'self'` |
| Proxy de développement | `npm run dev` relaie `/api/health` vers le serveur |
| `start-app.ps1` | syntaxe valide (parseur PowerShell), ASCII ; logique testée sous PowerShell 7 : build à jour réutilisé, reconstruction après modification d’une source, `-Simulation`, `-Reseau` |
| POC | `poc/` et `start-poc.ps1` inchangés ; `python -m poc.server --simulate` répond |

## Défaut trouvé et corrigé pendant la brique

`frontend/src/data/demo.ts` n’avait jamais été versionné : la règle `data/` du `.gitignore` l’ignorait, donc le `frontend` de `main` ne compilait pas après un clone. Le fichier est supprimé et la règle est limitée à `/data/` (journaux du POC).

## Corrections après l’audit Windows

- Plus de ligne « Connexion au serveur… » au chargement : elle s’affichait à chaque ouverture puis disparaissait en décalant la carte. Rien n’apparaît pendant une connexion rapide ; au-delà d’une seconde, un indicateur discret « Connexion » se place à côté de la date, sans décaler la page. Mesuré dans Chromium avec une réponse retardée de 2,5 s : rien à 0,5 s, indicateur à 1,4 s, disparu après réponse, carte immobile ([capture](connexion-lente-390.jpg)).
- Une erreur HTTP affiche « Serveur du PC indisponible », sans code ; le code reste dans la console ([capture](serveur-indisponible-390.jpg)).
- `Lancer Fitness.cmd` active l’accès réseau (`-Reseau -Ouvrir`) : la fenêtre affiche l’adresse à ouvrir sur le téléphone. Non exécuté sous Windows dans cet environnement.
