# Consulter les maquettes

Depuis `C:\GitHub\Fitness App` dans PowerShell :

```powershell
.\docs\design\etape-01\ouvrir-maquettes.ps1
```

Ouvrir [Aujourd’hui](http://127.0.0.1:4321/?screen=today&theme=light). Le serveur sert des fichiers statiques sur le PC uniquement ; Ctrl+C l’arrête. Le POC sur 4317 reste indépendant. Pas d’installation nécessaire.

Alternative : double-cliquer `index.html`. Le JavaScript est classique, sans import ni requête réseau ; les maquettes fonctionnent aussi depuis un fichier local. Le lien vers les documents peut être consulté avec l’éditeur de fichiers.

| Écran | Clair | Sombre |
|---|---|---|
| Aujourd’hui | [Ouvrir](http://127.0.0.1:4321/?screen=today&theme=light) | [Ouvrir](http://127.0.0.1:4321/?screen=today&theme=dark) |
| Direct | [Ouvrir](http://127.0.0.1:4321/?screen=direct&theme=light) | [Ouvrir](http://127.0.0.1:4321/?screen=direct&theme=dark) |
| Détail | [Ouvrir](http://127.0.0.1:4321/?screen=detail&theme=light) | [Ouvrir](http://127.0.0.1:4321/?screen=detail&theme=dark) |
| Coach | [Ouvrir](http://127.0.0.1:4321/?screen=coach&theme=light) | [Ouvrir](http://127.0.0.1:4321/?screen=coach&theme=dark) |
| Éditeur | [Ouvrir](http://127.0.0.1:4321/?screen=editor&theme=light) | [Ouvrir](http://127.0.0.1:4321/?screen=editor&theme=dark) |

Choix de thème dans l’en-tête, profil par son nom. Atelier replié en bas : états, texte long, texte agrandi à 200 %, vitesse/allure dans Direct. `state=invalid`, `state=disconnected`, `state=stale`, `state=empty` et `text=200` sont également accessibles directement dans l’URL.

Parcours à essayer : préparer, confirmer la présence, commencer la démonstration, Pause, reprise explicite, Arrêter, ouvrir le bilan fictif, donner un ressenti, consulter le coach, ouvrir ses sources, modifier et enregistrer un brouillon.

Les sauvegardes sont uniquement en mémoire de la page et disparaissent au rechargement. Rien ne commande le tapis et aucun appel IA n’est réalisé. Les graphiques sont des références SVG de conception ; leur implémentation de production relève des étapes futures.

[Règles de design](../../../DESIGN.md) · [Parcours](../ETAPE_01_PARCOURS_UI_UX.md) · [Preuves](../../preuves/v1/etape-01/2026-10-04/INDEX.md).
