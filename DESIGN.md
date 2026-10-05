# Fitness · Référence de conception V1

4 octobre 2026. **Direction validée par Arnaud (brique 0 du [plan](PLAN_V1_FITNESS_APP.md)).** Mode sombre, téléphone et PC. Chaque brique construit ses écrans avec ces règles.

- Composants et écrans : [`frontend/`](frontend/README.md) (Vite, React, TypeScript, Tailwind)
- Captures de référence : [docs/preuves/v1/brique-00/2026-10-04](docs/preuves/v1/brique-00/2026-10-04/INDEX.md)
- Parcours et états : [docs/design/PARCOURS_ET_ETATS.md](docs/design/PARCOURS_ET_ETATS.md)

## 1. Principes

1. **Le chiffre d’abord.** Chaque écran a une valeur dominante. Les libellés sont courts : un nom, une unité.
2. **Aucun texte décoratif.** Pas d’accroche, de phrase de motivation, de mention « démonstration » ni de légende qui répète ce que montre l’écran. Un texte n’apparaît que s’il porte un fait (mesure, état, limite, source) ou une action.
3. **Les états remplacent les avertissements permanents.** Le STOP physique n’est mentionné que lorsque le canal est perdu ou incertain. L’absence de cardio s’affiche dans les données du bilan, pas sur chaque écran.
4. **Idiomes iOS natifs.** Grands titres repliables, listes groupées en retrait, feuilles modales, contrôle segmenté, interrupteurs, barre d’onglets en capsule flottante translucide, activité en direct réduite au-dessus des onglets.
5. **Deux formats seulement.** Téléphone, de 360 à 899 px, et PC à partir de 900 px. Aucune mise en page tablette dédiée : entre 600 et 899 px, la colonne téléphone est centrée et limitée à 680 px.
6. **Mesures à la manière de Forme.** Chaque mesure a sa couleur de rôle, sa valeur en chiffres arrondis et son unité en capitales dans la même couleur (`2,5 KM`, `≈ 145 KCAL`). Les cartes résument, le détail est un toucher plus loin.

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
| Durée | `#FFD60A` | Durée active ou prévue (Direct, bilan, séances), bouton Pause, marqueur de pause |
| Distance | `#2FB4FF` | Distance prévue ou mesurée |
| Énergie | `#FF375F` | Kcal actives estimées, puis mesurées |
| Pente | `#BF5AF2` | Valeur et courbe de pente, dénivelé équivalent |
| Arrêt / erreur | `#FF453A` | Bouton Arrêter, canal perdu, commande inconnue, erreurs de saisie |
| Alerte | `#FF9F0A` | Mesures anciennes, arrêt demandé, coupure de mesure dans les courbes |
| Confirmé | `#30D158` | Connecté, interrupteurs, Reprendre, arrêt confirmé |
| Comparaison | `#64D2FF` | Seconde séance dans le bilan |
| Cible | blanc 55–60 %, tirets 4/4 | Consigne dans toutes les courbes |
| Cardio (futur) | `#FF6482` | Réservé, inactif tant qu’aucune source valide n’existe |

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
| Principale | Capsule flottante translucide centrée en bas, onglet actif sur fond `fill-3` : Aujourd’hui, Séances, Historique, Coach | Barre latérale de 248 px : les mêmes onglets plus Direct |
| Profil | Avatar à droite du grand titre, puis feuille de choix | Bas de la barre latérale |
| Séance en cours | Capsule « activité en direct » au-dessus des onglets : bloc, durée, vitesse, Pause | Carte compacte dans la barre latérale ; point vert animé sur Direct |
| Direct | Plein écran, sans onglets ; chevron pour réduire | Plein écran ; mesures à gauche, bloc et courbes à droite, commandes sous les mesures |
| En-tête | Grand titre qui se replie en barre floutée au défilement ; date ou version en `label-2` sous le titre ; boutons d’écran (+) à côté de l’avatar, puis dans la barre repliée | Identique, sans avatar |

## 6. Composants

- **Boutons.** Principal : accent plein avec texte noir. Gris : `fill-3`. Désactivé : `fill-3` avec texte `label-3`, jamais un accent atténué. Effet de pression : échelle 0,97.
- **Liste groupée.** Lignes de 44 px minimum ; icône carrée de 32 px teintée à 18 % ; valeur à droite en `label-2` ; chevron `label-3`.
- **Feuille.** Remonte du bas avec poignée sur téléphone, centrée à 480 px sur PC (640 px pour un aperçu avec graphique). Annuler à gauche, action à droite ou bouton principal fixé en bas sur un fond translucide, toujours visible pendant le défilement. Échap ferme. Dans une feuille, listes, grilles et cartes passent en `surface-2`.
- **Segmenté.** Piste `fill-3`, curseur `#636366` qui glisse (300 ms).
- **Capsules de filtre.** 36 px, `fill-3` ; la capsule choisie passe en blanc avec texte noir, comme les filtres d’Apple Fitness. Sur téléphone, la rangée défile horizontalement jusqu’au bord ; sur PC, elle passe à la ligne. Libellés courts (« Marche inclinée ») ; les titres de section gardent le nom complet.
- **Menu déroulant.** Remplace les sélecteurs natifs : capsule ou ligne avec la valeur et un chevron, liste flottante translucide de 220 px minimum, coche à gauche, icône à droite, séparateur épais entre groupes. Flèches, Début/Fin, Échap et clic extérieur ; le focus revient au déclencheur.
- **Recherche.** Champ iOS de 36 px avec loupe et effacement rond, partagé par Coach et Mes séances.
- **Repli.** Ligne de liste groupée avec chevron qui pivote (« Comprendre l’estimation », « Pourquoi ce programme ? », « Fraîcheur des mesures ») ; le contenu est fait de lignes libellé / valeur en retrait.
- **Interrupteur.** 51 × 31 px, vert quand actif.
- **Stepper.** Valeur saisissable au clavier, avec ses boutons − / + de 44 px. Les erreurs s’affichent en rouge sous la ligne. Enregistrer est désactivé tant qu’une valeur est hors limites.
- **Grille de mesures.** Cellules `surface` séparées par des filets de 1 px, libellé en Subhead blanc, valeur 26 px colorée. Deux colonnes sur téléphone, une ligne sur PC. Valeur inconnue : `--` en `label-3`.
- **Carte de séance.** Carte entière cliquable avec chevron : pastille ronde de l’activité (accent sur fond accent à 16 %), nom, mesures colorées, profil compact. Pas de bouton « Voir » redondant.
- **Section.** Titre Title 2 à gauche, action en accent à droite (« Changer »), comme « Exercices / Plus de détails » dans Forme.
- **Chargement.** Squelette de la forme du contenu (pulsation), libellé réservé aux lecteurs d’écran.
- **Coach.** Liste façon Messages : champ de recherche iOS (36 px, loupe, effacement), segmenté Récentes/Archivées, lignes titre + date relative + archivage. Bulle de l'utilisateur à droite en `surface-2`, réponse du coach en texte libre sous sa pastille. Saisie en capsule qui grandit, bouton d'envoi rond accent, vidée dès que le serveur accepte le message. Confirmation éphémère avec Annuler au-dessus de la saisie. Questions du coach dans une carte `surface` : par question, pastille numérotée (coche accent une fois répondue), capsules de filtre qui passent à la ligne et « Autre » qui ouvre un champ en capsule ; compteur « 2/3 » et Envoyer en bouton principal. Seule la dernière réponse terminée est interactive ; les anciennes questions restent lisibles, atténuées.
- **Séances.** Segmenté Découvrir/Mes séances ; le bouton + ouvre un menu Créer avec ChatGPT / Nouvelle séance. Découvrir commence par deux capsules de réglage (cible « 30 min » ou « 200 kcal », qui ouvre une feuille Cible, et difficulté en menu), puis les capsules d’objectif : les formats apparaissent dans le premier écran du téléphone. La feuille d’aperçu montre objectif et description, les réglages en liste groupée (cible, valeur avec − / +, difficulté), les prévisions, le graphique, la répartition de l’effort en barre proportionnelle avec légende, les segments, puis Pourquoi ce programme ? ; Ajouter à mes séances reste fixé en bas. Mes séances : recherche, menus Objectif/Niveau, cartes compactes, état vide avec Découvrir et Créer avec ChatGPT ; une valeur historique inconnue n’est pas catégorisée automatiquement.
- **Détail d’une séance.** Modifier dans la barre de navigation. Pastille, objectif, niveau et version, puis l’action principale ; viennent ensuite prévisions, graphique et segments. Les actions secondaires (Ajuster avec ChatGPT, Dupliquer, Version en menu, Supprimer) suivent sur téléphone et forment la colonne de droite sur PC.
- **Segments.** Blocs consécutifs dans une même liste groupée, chaque répétition dans la sienne avec « Répéter N fois · durée » en en-tête. Chaque ligne porte un repère vertical (accent pour l’effort, gris pour les blocs faciles), le type, vitesse et pente colorées, et la durée en jaune.
- **Proposition de séance.** Dans Coach, carte compacte avec une étiquette d’état (Proposition ou Ajustement en violet, Enregistrée en vert, Ignorée en gris), objectif/niveau et explication ; Afficher le détail révèle prévisions, graphique et blocs. Enregistrer, Modifier et Ignorer restent distincts. Un ajustement affiche avant acceptation une liste Avant → Proposition où seules les valeurs modifiées sont barrées puis remplacées en blanc, et la comparaison repliable des consignes ; l’éditeur existant sert aux retouches, avec les mêmes prévisions serveur. Dans l’éditeur, type de bloc, objectif et niveau utilisent le menu déroulant.
- **Tapis.** Ligne dans Réglages : nom de l’appareil et état avec pastille colorée (vert connecté, orange pulsé pendant recherche ou connexion, rouge si l’état est indisponible). La feuille s’ouvre sur l’appareil (icône Bluetooth, nom, état, capsule « Lecture seule ») ; puis appareils trouvés avec Connecter, recherche, mesures en grille de deux colonnes, fraîcheur repliable, capacités lues (plages et pas) et Déconnecter en ligne de liste. Simulation reste dans le titre fixe de la feuille. Mesure absente, cardio invalide ou mesure ancienne : `--`, avec âge et état explicites. Perdre l'observation ne reconnecte pas le tapis.
  Pendant une séance, la capsule décrit le contrôle actif et la déconnexion reste désactivée ; l’observation seule n’autorise aucun mouvement.
- **Explication repliable.** Faits en lignes courtes libellé / valeur, une seule phrase de limite. Jamais de paragraphes.
- **Consignes du Direct.** Vitesse et pente en deux lignes ; − / + de 44 px encadrent la cible colorée. Une ligne indique le décalage pour les blocs restants ; la suite et le profil du programme reflètent ce réglage. Les mesures reçues restent distinctes. Commandes de protection accessibles pendant l’application ; réglages désactivés en pause, en observation seule et sans mesures fraîches. Les grandes valeurs gardent un interligne de 1,2, sans marge négative sur le libellé ; le format court en hauteur conserve les deux réglages au-dessus de Pause/Arrêter.
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
  Le curseur commun vitesse/pente conserve la sélection au toucher, se déplace aux flèches du clavier et affiche l’heure de la mesure. Les grandes mesures actuelles restent distinctes. L’axe des courbes inclut les pauses ; la progression et la durée principale utilisent le temps actif. Les courbes restent figées après la fin.
- Profil de programme : barres dont la largeur représente la durée et la hauteur la vitesse. Dans le Direct, la partie réalisée est colorée et le reste en gris foncé.
- Séances préparées : échelles fixes et complètes **0–16 km/h** pour la vitesse et **0–10 %** pour l’inclinaison, même axe temporel. Ne pas adapter le plafond au maximum de la séance. Zones vitesse/pente de 176/144 px, ramenées à 144/128 px lorsque le graphique fait moins de 360 px de large. Barres vertes/grises avec valeurs, escalier violet avec aire et points de repère ; valeurs inscrites sur les segments assez larges (30 px minimum). Le segment survolé ou touché est repéré sur les deux zones ; son type, sa durée et ses consignes remplacent les valeurs globales dans l’en-tête du graphique. La sélection tactile reste visible après le toucher. Précédent/suivant permet de lire les segments étroits ; toucher le graphique interactif n’ouvre rien d’autre.

Les prévisions affichent durée, distance, **kcal actives estimées** et dénivelé équivalent dans une grille de mesures (2 × 2 sur téléphone, 4 colonnes sur PC). Le signe ≈ accompagne les calories ; un poids absent donne un tiret et une action vers les réglages, jamais zéro. Le dénivelé porte le libellé « Dénivelé équiv. » ; l’explication de l’estimation précise qu’il s’agit d’une montée équivalente prévue. Le détail repliable explique le total avec repos, le poids actuel et les limites sans surcharger la lecture du graphique. Les cartes de bibliothèque et d’Aujourd’hui restent compactes : mesures colorées et profil compact non interactif (barres sur l’échelle fixe 0–16 km/h, escalier de pente 0–10 %). Le graphique interactif n’apparaît que dans la séance et l’éditeur. Le choix marche/course est automatique selon la vitesse, sans sélecteur ni ligne supplémentaire dans l'éditeur ; dans les réglages, le poids utilise une saisie décimale effaçable avec validation et état d'enregistrement.

Dans Découvrir, les réglages Durée/Calories et difficulté précèdent les formats. Le même réglage apparaît dans la feuille d’aperçu. La cible calorique porte sur les calories actives estimées avec le poids du profil ; les formats hors plage affichent leur limite. Toute modification recalcule les mesures et segments côté serveur, avec un chargement explicite qui empêche l’ajout d’un ancien aperçu. Les mesures dans cette feuille restent en deux colonnes, même sur PC, pour conserver des libellés et valeurs lisibles.

La feuille contient Pourquoi ce programme ?, replié par défaut : but, construction, adaptation, effort recherché et sources consultables. Les liens ouvrent les références officielles dans un autre onglet. Les vitesses restent des valeurs de départ, jamais une mesure de capacité ; le texte distingue les principes sourcés des paramètres FitnessApp. Les alternances ajoutent des cycles en gardant des passages bornés, plutôt que d’étirer une course ou une récupération.

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
