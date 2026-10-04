# Fitness · interface

Interface de l’application, mode sombre, téléphone et PC. Vite, React 19, TypeScript, Tailwind 4. Le design est décrit dans [DESIGN.md](../DESIGN.md), l’ordre de construction dans le [plan](../PLAN_V1_FITNESS_APP.md).

```powershell
cd frontend
npm install
npm run dev        # http://localhost:5173, et sur le réseau local pour le téléphone
npm run build      # typecheck + dist/
```

Polices et icônes sont embarquées : aucun accès Internet n’est nécessaire après `npm install`.

## Organisation

- `src/styles/index.css` : jetons (couleurs, typographie, rayons, mouvement)
- `src/components/` : coque (onglets, barre latérale, en-tête repliable, activité en direct), composants iOS, graphiques SVG
- `src/features/` : Aujourd’hui, Séances, Éditeur, Direct, Historique, Bilan, Coach
- `src/lib/live.ts` : simulation de séance (aucune connexion au tapis)
- `src/data/demo.ts` : programmes et historique synthétiques

## Scénarios de revue (retirés à la brique 1)

Tant que les écrans utilisent `src/data/demo.ts`, ajouter `?scenario=` devant le `#` :

| URL | État |
|---|---|
| `/?scenario=live#/direct` | Séance en cours à 17:24 |
| `/?scenario=paused#/direct` | Pause |
| `/?scenario=stale#/direct` | Mesures anciennes |
| `/?scenario=lost#/direct` | Tapis déconnecté |
| `/?scenario=unknown#/direct` | Résultat de commande inconnu |
| `/?scenario=empty#/` | Aucun historique |
| `/?scenario=coach-offline#/coach` | Coach hors ligne |
