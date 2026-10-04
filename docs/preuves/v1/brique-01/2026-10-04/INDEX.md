# Brique 1 · Socle : preuves

4 octobre 2026. Livraison initiale vérifiée dans un conteneur Linux, Python 3.11, Node 22, Chromium 1194 headless, PowerShell 7.4. À ce moment, Windows réel, Windows PowerShell 5.1 et le téléphone physique sur le Wi-Fi n’avaient pas été vérifiés.

Un [audit complémentaire sur Windows](AUDIT_WINDOWS.md) a depuis vérifié le lanceur, le double-clic, les relances et Chrome sur ce PC. Le téléphone physique sur le Wi-Fi et la validation d’Arnaud restent attendus.

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
