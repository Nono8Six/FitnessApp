# Fitness · interface

Interface de l’application, mode sombre, téléphone et PC. Vite, React 19, TypeScript, Tailwind 4. Le design est décrit dans [DESIGN.md](../DESIGN.md), l’ordre de construction dans le [plan](../PLAN_V1_FITNESS_APP.md).

En usage normal, `start-app.ps1` construit l’interface et le serveur du PC la sert. Pour travailler sur l’interface :

```powershell
# Terminal 1, racine du dépôt : serveur de l'application
.\.venv\Scripts\python.exe -m backend

# Terminal 2
cd frontend
npm ci
npm run dev        # http://localhost:5173 ; /api est relayé vers http://127.0.0.1:4330
npm run build      # typecheck + dist/
```

Polices et icônes sont embarquées : aucun accès Internet n’est nécessaire après `npm ci`.

## Organisation

- `src/styles/index.css` : jetons (couleurs, typographie, rayons, mouvement)
- `src/components/` : coque (navigation, en-tête repliable, bandeaux d’état), composants iOS, graphiques SVG
- `src/features/` : un dossier ou fichier par écran construit
- `src/lib/api.ts` : client commun du serveur (délai de 4 s, phrase d’erreur lisible, forme de la réponse vérifiée)
- `src/lib/server.ts` : état du serveur du PC (`/api/health`), vérifié toutes les 10 s et au retour sur l’onglet
- `src/lib/profiles.ts` : profils du serveur et profil de l’appareil (`localStorage`, clé `fitness.profile.v1`)

Aucune donnée de démonstration : un écran n’existe que lorsque sa brique le relie au serveur. Les écrans de référence du design (brique 0) restent consultables dans l’historique Git, commit `b9afbc0`, dossier `frontend/src/features/`, et dans [les captures](../docs/preuves/v1/brique-00/2026-10-04/INDEX.md).
