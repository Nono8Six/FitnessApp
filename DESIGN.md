# Fitness · Référence de conception V1

4 octobre 2026. **Direction validée par Arnaud (brique 0 du [plan](PLAN_V1_FITNESS_APP.md)).** Mode sombre, téléphone et PC. Chaque brique construit ses écrans avec ces règles.

- Composants et écrans : [`frontend/`](frontend/README.md) (Vite, React, TypeScript, Tailwind)
- Captures de référence : [docs/preuves/v1/brique-00/2026-10-04](docs/preuves/v1/brique-00/2026-10-04/INDEX.md)
- Parcours et états : [docs/design/PARCOURS_ET_ETATS.md](docs/design/PARCOURS_ET_ETATS.md)

## 1. Principes

1. **Le chiffre d’abord.** Chaque écran a une valeur dominante. Les libellés sont courts : un nom, une unité.
2. **Aucun texte décoratif.** Pas d’accroche, de phrase de motivation, de mention « démonstration » ni de légende qui répète ce que montre l’écran. Un texte n’apparaît que s’il porte un fait (mesure, état, limite, source) ou une action.
3. **Les états remplacent les avertissements permanents.** Le STOP physique n’est mentionné que lorsque le canal est perdu ou incertain. L’absence de cardio s’affiche dans les données du bilan, pas sur chaque écran.
4. **Idiomes iOS natifs.** Grands titres repliables, listes groupées en retrait, feuilles modales, contrôle segmenté, interrupteurs, barre d’onglets translucide, activité en direct réduite au-dessus des onglets.
5. **Deux formats seulement.** Téléphone, de 360 à 899 px, et PC à partir de 900 px. Aucune mise en page tablette dédiée : entre 600 et 899 px, la colonne téléphone est centrée et limitée à 680 px.

Références observées : app Exercice d’Apple (minuteur jaune, boutons ronds Pause/Fin), Apple Fitness (anneaux, cartes noires, accent sportif), Apple Santé (en-tête du graphique remplacé par la valeur touchée), Forme pour la densité sombre. Ce sont des inspirations : aucune ressource Apple n’est redistribuée.

## 2. Couleurs (sombre)

Fond noir pur. La profondeur vient des surfaces grises superposées, sans bordure ni ombre de carte.

| Jeton | Valeur | Usage |
|---|---|---|
| `bg` | `#000000` | Fond de page, Direct |
| `surface` | `#1C1C1E` | Cartes, listes groupées, feuilles |
| `surface-2` | `#2C2C2E` | Listes dans une feuille, état pressé |
| `surface-3` | `#3A3A3C` | Blocs à venir |
| `fill-3` | `rgb(118 118 128 / .24)` | Boutons gris, champ de recherche, segmenté, stepper |
| `label` | `#FFFFFF` | Texte principal, valeurs |
| `label-2` | `rgb(235 235 245 / .60)` | Libellés, unités, sous-titres |
| `label-3` | `rgb(235 235 245 / .30)` | Désactivé, valeur inconnue, placeholder |
| `sep` | `rgb(84 84 88 / .65)` | Séparateurs 0,5 px |

Couleurs de rôle, une seule signification chacune :

| Rôle | Valeur | Où |
|---|---|---|
| Accent / vitesse | `#B4F000` | Action principale, vitesse mesurée, blocs de course, anneau, onglet actif. Texte noir dessus. |
| Durée | `#FFD60A` | Durée active (Direct, bilan), bouton Pause, marqueur de pause |
| Pente | `#BF5AF2` | Valeur et courbe de pente |
| Arrêt / erreur | `#FF453A` | Bouton Arrêter, canal perdu, commande inconnue, erreurs de saisie |
| Alerte | `#FF9F0A` | Mesures anciennes, arrêt demandé, coupure de mesure dans les courbes |
| Confirmé | `#30D158` | Connecté, interrupteurs, Reprendre, arrêt confirmé |
| Comparaison | `#64D2FF` | Seconde séance dans le bilan |
| Cible | blanc 55–60 %, tirets 4/4 | Consigne dans toutes les courbes |
| Cardio (futur) | `#FF375F` | Réservé, inactif tant qu’aucune source valide n’existe |

Les blocs faciles (échauffement, récupération, retour au calme) sont gris `#636366`. Les blocs durs (course, allure continue) utilisent l’accent. La couleur n’est jamais le seul signal : chaque état a un libellé ou une forme (tirets, marqueur, bande).

## 3. Typographie

Famille : `-apple-system, BlinkMacSystemFont, "SF Pro Text", "Inter Variable", system-ui`. Sur iPhone et Mac, SF Pro ; sur PC Windows, Inter variable embarquée localement (`@fontsource-variable/inter`), sans CDN. Les chiffres utilisent `ui-rounded` (SF Pro Rounded) quand il existe, toujours en chiffres tabulaires.

Échelle iOS (px, interligne, approche) :

| Style | Taille | Graisse | Usage |
|---|---|---|---|
| Large title | 34 / 41, −0,025 em | 700 | Titre d’écran |
| Title 1 | 28 / 34 | 700 | Nom de la prochaine séance |
| Title 2 | 22 / 28 | 700 | Réservé |
| Title 3 | 20 / 25 | 600 | Titres de section, bloc en cours |
| Headline | 17 / 22 | 600 | Boutons, titres de carte |
| Body | 17 / 22 | 400 | Lignes de liste, texte du coach |
| Subhead | 15 / 20 | 400 | Méta-données |
| Footnote | 13 / 18 | 400 | Libellés de mesure, légendes |
| Caption 2 | 11 / 13 | 500 | Axes de graphique |

Chiffres du Direct (téléphone / PC) : vitesse 104 / 168 px, graisse 700, approche −0,045 em. Durée 40 / 56 px, en jaune. Mesures secondaires 30 / 36 px. Unités en capitales, 14–30 px, `label-2`.

Formats : virgule décimale, espace insécable avant `:` `?` `%` et à l’intérieur de « », durées `17:24`, allure `7′36″ /km`. Une valeur inconnue s’écrit `--` en `label-3`, jamais `0`.

## 4. Grille et formes

- Marges : 16 px sur téléphone, 40 px sur PC. Contenu limité à 1180 px sur PC.
- Espacement par pas de 4 px. Entre sections : 28 à 36 px ; à l’intérieur d’une carte : 16 à 20 px.
- Rayons : carte 22 px, liste groupée 12 px, bouton 14 px (52 px de haut), bouton moyen 12 px (44 px), segmenté 9 px, feuille 14 px.
- Séparateurs de liste : 0,5 px en retrait, commençant après l’icône.
- Cibles tactiles : au moins 44 × 44 px. Pause et Arrêter : cercles de 68 px.

## 5. Navigation

| | Téléphone | PC |
|---|---|---|
| Principale | Barre d’onglets translucide : Aujourd’hui, Séances, Historique, Coach | Barre latérale de 248 px : les mêmes onglets plus Direct |
| Profil | Avatar à droite du grand titre, puis feuille de choix | Bas de la barre latérale |
| Séance en cours | Capsule « activité en direct » au-dessus des onglets : bloc, durée, vitesse, Pause | Carte compacte dans la barre latérale ; point vert animé sur Direct |
| Direct | Plein écran, sans onglets ; chevron pour réduire | Plein écran ; mesures à gauche, bloc et courbes à droite, commandes sous les mesures |
| En-tête | Grand titre qui se replie en barre floutée au défilement | Identique, sans avatar |

## 6. Composants

- **Boutons.** Principal : accent plein avec texte noir. Gris : `fill-3`. Désactivé : `fill-3` avec texte `label-3`, jamais un accent atténué. Effet de pression : échelle 0,97.
- **Liste groupée.** Lignes de 44 px minimum ; icône carrée de 32 px teintée à 18 % ; valeur à droite en `label-2` ; chevron `label-3`.
- **Feuille.** Remonte du bas avec poignée sur téléphone, centrée à 480 px sur PC. Annuler à gauche, action à droite ou bouton principal en bas. Échap ferme.
- **Segmenté.** Piste `fill-3`, curseur `#636366` qui glisse (300 ms).
- **Interrupteur.** 51 × 31 px, vert quand actif.
- **Stepper.** Valeur saisissable au clavier, avec ses boutons − / + de 44 px. Les erreurs s’affichent en rouge sous la ligne. Enregistrer est désactivé tant qu’une valeur est hors limites.
- **Anneau.** Trait de 11 px, piste à 22 %, extrémités arrondies.
- **Bandeau d’état.** Fond de la couleur de rôle à 15 %, icône et une phrase.

## 7. Graphiques

Composants SVG maison. ECharts n’est envisagé qu’à la brique 14 si le volume l’exige, avec ce même langage visuel.

- Axe Y à droite, grille horizontale de 0,5 px, repères temporels en pointillé ; au plus 4 repères sur téléphone et 6 sur PC.
- Mesure : trait continu de 2 à 2,5 px, aire en dégradé accent de 28 % à 0. Cible : escalier blanc pointillé. Pente : escalier violet dans une bande séparée, avec sa propre échelle, sous la vitesse.
- Données absentes : trou réel dans la courbe et bande orange à 20 %. Aucune interpolation.
- Pause : ligne jaune pointillée avec un repère en haut.
- Lecture : toucher ou survoler pour placer un curseur commun à la vitesse et à la pente ; l’en-tête affiche alors temps, valeur, cible et comparaison, comme dans Apple Santé. Les flèches du clavier déplacent le curseur, Échap le retire.
- Direct : fenêtre de 1 min, 5 min ou toute la séance ; point de mesure pulsé en bout de courbe.
- Profil de programme : barres dont la largeur représente la durée et la hauteur la vitesse. Dans le Direct, la partie réalisée est colorée et le reste en gris foncé.
- Séances préparées : vitesse en barres, avec axe partant de zéro et plafond adapté au maximum de la séance, arrondi au palier de 2 km/h supérieur (minimum 2). Hauteur de la zone vitesse : 96 px dans la bibliothèque, 112 px dans les détails et l’éditeur. Inclinaison en escalier violet séparé (0–10 %), même axe temporel. Le segment survolé ou touché est repéré sur les deux zones ; son type, sa durée et ses consignes remplacent les valeurs globales dans l’en-tête du graphique. La sélection tactile reste visible après le toucher. Précédent/suivant permet de lire les segments étroits ; le graphique de la bibliothèque ne déclenche pas l’ouverture de la séance.

## 8. Mouvement

Courbe `cubic-bezier(.32, .72, 0, 1)`.

| Élément | Durée |
|---|---|
| Entrée d’écran (fondu + 8 px) | 420 ms |
| Feuille | 460 ms |
| Segmenté, interrupteur | 300 ms |
| Anneau | 700 ms |
| Pression | 160 ms |

Le compte à rebours 3-2-1 a un effet « pop ». Pause et Arrêter agissent immédiatement, sans animation préalable. Avec `prefers-reduced-motion`, toutes les animations sont ramenées à 1 ms.

## 9. Règles de texte

Textes conservés, car chacun porte un fait ou une action :

« Commencer », « Avant de démarrer », « Clé de sécurité en place », « Bande libre », « Démarrer », « Pause », « Reprendre », « Arrêter », « Arrêt demandé », « Arrêt confirmé », « Aucune mesure depuis N s », « Dernière mesure X km/h, il y a N s », « Tapis déconnecté. État de la bande inconnu : utilisez le STOP physique. », « Résultat de la dernière commande inconnu. Utilisez le STOP physique, puis reconnectez. », « Coach hors ligne. Séances et historique restent disponibles. »

Interdits : sous-titres marketing, mentions « démonstration » ou « fictif », identifiants techniques (G01…) dans l’interface, signatures, rappels « facultatif », phrases qui répètent une valeur déjà affichée.

## 10. Limites

- Mode sombre uniquement. Les jetons sont regroupés pour qu’un thème clair puisse être ajouté sans toucher aux composants.
- Pas encore vérifié sur iPhone physique, Safari iOS, Android ni pendant un effort réel. Corriger les problèmes rencontrés à l'usage selon [AGENTS.md](AGENTS.md).
