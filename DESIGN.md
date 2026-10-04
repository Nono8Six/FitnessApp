# Fitness · Référence de conception V1

4 octobre 2026. **Maquettes livrées, validation visuelle d’Arnaud en attente.** Référence proposée pour l’Étape 01 uniquement. La case du plan reste ouverte.

- [Maquettes locales](docs/design/etape-01/index.html)
- [Parcours, états et contrat des graphiques](docs/design/ETAPE_01_PARCOURS_UI_UX.md)
- [Captures et vérifications Chrome](docs/preuves/v1/etape-01/2026-10-04/INDEX.md)
- [Contrastes mesurés](docs/preuves/v1/etape-01/2026-10-04/CONTRASTES.md)

## 1. Intention et références

Arnaud et Ophélie préparent une séance à la maison, en lumière naturelle ou le soir ; pendant l’effort, le téléphone est posé à proximité et le regard doit retrouver une mesure et les commandes immédiatement. Les deux thèmes servent ces deux scènes, sur tous les écrans.

La direction repose sur la typographie système, des alignements nets, une prochaine séance dominante, des chiffres utiles pendant l’effort et des graphiques progressifs. Les surfaces ne regroupent que des tâches cohérentes : programme, exploration des courbes, proposition du coach, aperçu d’édition. Les indicateurs secondaires, événements et historique utilisent des lignes et des séparateurs.

Références officielles consultées le 4 octobre 2026 :

| Référence | Observation | Décision propre à Fitness |
|---|---|---|
| [Apple Fitness+](https://www.apple.com/fr/apple-fitness-plus/), visuels de mesures en direct et de résumé | Mesures très hiérarchisées, énergie des accents sportifs, progression personnelle | Une mesure dominante dans Direct ; une action de préparation ; aucune donnée cardio fictive pour reproduire un écran Apple |
| [App Santé](https://support.apple.com/fr-fr/104997), résumé et points clés | Synthèse d’abord, accès à l’historique et au détail ensuite ; profil dans l’en-tête | Bilan en trois indicateurs puis courbes, événements, ressenti et exploration repliable |
| [HIG Charts](https://developer.apple.com/design/human-interface-guidelines/charts) | Données dominantes, axes sobres, description de la question, cible tactile élargie, patterns en plus des couleurs | Mesurée continue, cible discontinue, pente sur un axe séparé dans le détail, curseur lié et résumé textuel |
| [HIG Accessibility](https://developer.apple.com/design/human-interface-guidelines/accessibility) et [Dark Mode](https://developer.apple.com/design/human-interface-guidelines/dark-mode) | Références officielles pour les exigences d’accessibilité et d’apparence | Thèmes complets, état explicite, texte agrandissable, mouvements réduits. Nos mesures de contraste et dimensions sont consignées séparément |

Les règles chiffrées ci-dessous sont des décisions du projet ; elles ne sont pas attribuées à Apple. Aucune police ou ressource propriétaire Apple n’est redistribuée. Les visuels officiels servent l’observation, pas les assets de l’application.

## 2. Thèmes et palette

Clair / Sombre / Système dans l’en-tête de chaque écran. Système suit `prefers-color-scheme`, y compris si le système change pendant la consultation. Focus est un choix explicite, indépendant du thème. Il n’impose pas le sombre.

La maquette conserve les choix uniquement en mémoire. À l’implémentation : mémoriser `light | dark | system` par navigateur/appareil dans une préférence locale versionnée, avec repli sur Système ; garder la préférence de vitesse/allure par profil. Une fenêtre Focus n’altère pas la préférence persistante. Aucun stockage n’est créé à cette étape.

| Rôle CSS | Clair | Sombre | Usage |
|---|---|---|---|
| `bg` | `oklch(97.3% .003 260)` | `oklch(19.5% .016 260)` | Fond de page |
| `surface` | `oklch(99.5% .002 260)` | `oklch(25% .022 260)` | Navigation, tâche, champs |
| `layer` | `#e9edf3` | `#252e3b` | Regroupement, sélecteur, lecture ponctuelle |
| `text` | `#18212e` | `#edf2f8` | Texte principal |
| `muted` | `#536174` | `#a4b2c5` | Texte secondaire et unités |
| `line` | `#d4dce6` | `#354253` | Séparateur non essentiel |
| `control` | `#8090a3` | `#778ba4` | Contour essentiel de contrôle |
| `accent`, `focus` | `#0b65c9` | `#83baff` | Action principale, sélection et focus |
| `on-accent` | `#fdfdfe` | `#112137` | Texte sur l’action principale |
| `tint` | `#e8f1fe` | `#203954` | Sélection, contexte et plage explorée |
| `speed` | `#0967c8` | `#83baff` | Vitesse/allure mesurée |
| `target` | `#526176` | `#b5c1d2` | Consigne en trait discontinu |
| `incline` | `#7853b5` | `#be9afa` | Pente, repère de répétition |
| `sport` | `#267341` | `#82d6a0` | Volume réalisé et objectif |
| `error` | `#b52e3b` | `#ff9ca9` | Erreur et Arrêter |
| `error-bg` | `#fff0f1` | `#442630` | Fond d’erreur |
| `warning` | `#805800` | `#f0c56b` | État incertain ou ancien |
| `warning-bg` | `#fff5d9` | `#3e321e` | Fond d’alerte |
| `disabled` | `#e1e6ed` | `#2a3340` | Contrôle indisponible |
| `disabled-text` | `#697687` | `#a0aec0` | Libellé indisponible |
| `grid` | `#dce3ec` | `#374353` | Grille secondaire des graphiques |

Arrêter utilise un texte clair sur rouge en clair ; en sombre, texte `#29141a` sur corail clair. Le cardio futur utilisera un rôle corail distinct du contrôle, uniquement avec une source valide, un symbole cœur et un libellé. Aucun rôle cardio n’est activé dans les maquettes.

Contrastes : 4,5:1 pour le texte courant, 3:1 pour les grandes valeurs et éléments essentiels. Les 52 paires sémantiques du [rapport](docs/preuves/v1/etape-01/2026-10-04/CONTRASTES.md) passent ces seuils. Les séparateurs non essentiels sont volontairement discrets ; les contours des champs utilisent `control`. Cette mesure ne constitue pas une certification complète WCAG.

## 3. Typographie et chiffres

Famille : `-apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif`. Sur le PC Windows, Segoe UI ; sur les appareils Apple, police système native. Aucun téléchargement de police.

| Rôle | PC | Téléphone | Poids et règle |
|---|---:|---:|---|
| Texte courant | 16 px | 16 px ; prose compacte 15 px | 400, interligne 1,5 |
| Bouton | 16 px | 16 px | 650, interligne 1,35 |
| Légende / unité | 13–15 px | 12–14 px | 400–600, jamais seule pour porter un état critique |
| Titre de page | 36 px | 32 px | 720, interligne 1,15, approche −1 à −1,3 px |
| Titre de section | 23 px | 23 px | 680, interligne 1,25 |
| Titre de programme | 34 px | 30 px | 680, interligne 1,16 |
| Mesure Direct | 104 px ; 120 à ≥1600 | 76 px ; 64 en paysage | 650, chiffres tabulaires, unité 17–24 px |
| Mesures secondaires Direct | 34 px | 28 px ; 24 en paysage | 650, chiffres tabulaires |
| Valeurs du bilan | 38 px | 29 px | 650 |

Les valeurs ne changent pas de largeur à chaque actualisation. Virgule française, espace avant l’unité ; durées `17:24`, vitesse `7,9 km/h`, pente `1,0 %`, allure `7′36″ /km`. Une mesure indisponible est `—` accompagnée de « actuelle inconnue » ; la dernière valeur n’est conservée qu’avec son âge. Distance affichée par pas compatibles avec la source (10 m observés dans le POC), sans prétendre à une calibration.

Une seule grande mesure dans Direct. Le reste soutient sa lecture. Pas de score physiologique, de calories décoratives, de faux cardio ou de records sans méthode.

## 4. Grille, dimensions et responsive

Espacements : 4 / 8 / 12 / 16 / 20 / 24 / 32 / 40 / 48 / 56 px. Base 4 px, densité ajustée à la tâche. La dimension 20 px sert notamment les marges téléphone.

| Zone | PC | Téléphone portrait | Direct paysage |
|---|---|---|---|
| Navigation | Colonne 216 px ; 176 entre 761–1190 | Barre inférieure, 4 destinations, min. 74 px et safe area | Aucune navigation inférieure pendant l’effort |
| En-tête | 84 px ; 64 dans Direct | 72 px ; 64 dans Direct | 52 px, profil et thème visibles |
| Contenu | Maximum 1320 px, marge 48 ; 28 sur PC compact | Marge 20 px, une colonne | Marges 24 px, deux colonnes |
| Aujourd’hui | Programme dominant et semaine à droite | Programme, objectif, historique en séquence | Disposition portrait générale hors Direct |
| Détail | Courbes 65 %, ressenti/analyse 35 % | Bilan puis courbes, événements, ressenti et analyse | Défilement normal |
| Coach | Conversation 60 %, proposition 40 % | Conversation et proposition en séquence | Défilement normal |
| Éditeur | Blocs et aperçu latéral, aperçu sticky | Groupes de champs à toucher, aperçu ensuite | Défilement normal |
| Direct | Mesure et bloc côte à côte, mesures secondaires puis courbe | Mesure, bloc, indicateurs, courbe, commandes fixes | Mesure/bloc à gauche ; indicateurs/progression/courbe à droite |

Rupture principale : 760 px. Direct paysage : largeur 650–960 px et hauteur ≤500 px. À 1024 × 768, garder la navigation compacte. À 1920 × 1080, limiter la largeur de lecture ; ne pas étirer toutes les lignes.

Arrondis : 20 px programme PC, 18 téléphone ; 16 px tâches analytiques ; 11 px boutons ; 9 px champs ; 6–8 px sélecteurs et repères. Bordure 1 px, aucune ombre de panneau ; très légère ombre du segment sélectionné seulement. Aucun dégradé ou flou décoratif.

Les contenus longs reviennent à la ligne ; aucun titre de séance ne se réduit à une ellipse pendant l’effort. La page défile verticalement. Ne pas masquer une erreur par `overflow:hidden`. Les graphiques adaptent leur viewBox à leur largeur réelle : les libellés gardent 12 px et ne deviennent pas minuscules sur mobile.

## 5. Navigation et profils

PC : Aujourd’hui, Séances, Direct, Historique, Coach. Dans ces maquettes, Séances ouvre l’éditeur et Historique ouvre le détail de référence. La bibliothèque, la liste d’historique et les réglages complets restent décrits dans les parcours, hors des cinq écrans demandés.

Téléphone : Aujourd’hui, Séances, Historique, Coach. Accès au Direct via la préparation ; Focus reste volontaire. Profil et apparence restent en haut. Dans la V1, le profil ouvrira également les réglages. Le sélecteur de profil n’est pas une authentification.

Profil courant affiché en toutes lettres, même sur téléphone. La séance en cours affiche son profil d’origine dans son en-tête ; ce profil reste inchangé si l’on sélectionne l’autre profil de consultation. Le détail conserve l’attribution de la séance. Le contexte du coach est renouvelé lors d’un changement de profil, avec les sources du seul profil choisi.

## 6. Composants et commandes

- Bouton standard min. 44 px de hauteur, nom visible et accessible. Icônes vectorielles de 22 px, trait cohérent de 1,8 px. Icônes décoratives masquées aux lecteurs d’écran.
- Pause et Arrêter : min. 58 px en portrait/PC, 56 px en paysage ; largeur min. 44 px, cibles très larges. Ordre stable : Pause à gauche, Arrêter à droite. Fixées en bas du Direct, y compris en état déconnecté ou commande inconnue. L’espace de contenu réserve leur hauteur.
- Un arrêt demandé ne s’affiche pas comme un arrêt confirmé. Arrêter est immédiat, sans boîte de confirmation préalable ; la reprise demande une confirmation de présence et des conditions réelles à recevoir ultérieurement.
- Champs min. 46 px, libellé permanent, unité dessous. Bordure essentielle contrastée ; erreur locale avec texte, contour et attribut `aria-invalid`. Enregistrement désactivé quand les blocs sont invalides.
- Sélecteur segmenté : min. 44 px, état sélectionné par fond, texte et `aria-pressed`.
- Accordéon : en-tête min. 44 px, signe +/− et contrôle natif. Les informations critiques restent visibles sans ouverture.
- État vide : une phrase concrète et une action utile. Chargement : emplacement stable et libellé ; aucune animation nécessaire.
- Alerte : symbole, titre/phrase compréhensible, état explicite. Rouge pour erreur, ambre pour inconnu/ancien, texte pour toutes les distinctions.
- Désactivé : style atténué et attribut natif `disabled`, avec cause visible à proximité. Focus : anneau 3 px, décalage 3 px. Navigation clavier et champs natifs.

## 7. Graphiques

Voir le contrat G01–G10 dans les [parcours](docs/design/ETAPE_01_PARCOURS_UI_UX.md). La maquette utilise du SVG local pour figer le langage visuel ; elle ne crée pas une seconde bibliothèque analytique de production. ECharts reste la proposition du plan pour l’étape future dédiée.

Traits : mesure 2,7 px continue ; cible 1,8 px, tirets 6/5 ; pente 2 px ; curseur 1 px pointillé. Repères d’interruption : bande neutre avec contour discontinu, trou réel dans les séries mesurées ; cible conservée comme consigne. Aucun lissage et aucune courbe à travers les données absentes. La pause est un événement de durée affichée, même sur un axe de temps actif.

Axes de vitesse 0 / 5 / 10 km/h dans le scénario de référence. Pente sur axe 0 / 1 %, unités propres ; les plages de production s’adapteront aux données sans déformer une comparaison. Volume et distributions partent de zéro. Allure min/km orientée de façon explicite, labels minutes/secondes. Maximum quatre repères temporels sur une vue mobile compacte.

Dans Direct, la pente compacte constitue une bande inférieure du graphique et n’utilise pas l’échelle km/h ; le détail fournit la lecture exacte sur l’axe %. Dans la V1, les courbes du Direct seront dans des bandes liées avec unités explicites dès qu’elles deviennent explorables.

Curseur commun à la vitesse et à la pente. Sur téléphone : toucher une période et lire le panneau textuel sous le graphique ; aucune infobulle flottante sous le doigt. Slider natif utilisable au clavier et au toucher. Zoom et plage se partagent entre les séries ; réinitialisation visible. Résumé : durée couverte, distance compatible, moyenne, pente, qualité et événements.

G04 : comparaison par séries identifiées et motifs de trait distincts ; n’aligner sur distance que si elle est disponible et cohérente. Les équivalents textuels indiquent valeurs, sources, couverture et exclusions. Une source absente ne produit ni zéro ni segment artificiel.

## 8. Mouvement et textes

Transitions de fond/couleur 160 ms, sans transition de géométrie. Le focus clavier, Pause et Arrêter sont traités immédiatement. Le changement d’écran ne lance aucune séquence décorative. Respect de `prefers-reduced-motion: reduce` : suppression des transitions et animations, sans perte d’information.

Textes à réutiliser : « Préparer la séance », « Commencer », « Pause », « Arrêter », « Arrêt demandé, effet à vérifier », « Mesures anciennes », « Résultat de commande inconnu », « Cardio indisponible », « Enregistrer le brouillon », « Comment c’était ? ». Les maquettes ajoutent « démonstration » pour éviter toute confusion ; les écrans de la V1 utiliseront la provenance réelle.

Le coach explique à partir des faits disponibles, cite ses sources et propose des blocs modifiables. Il n’exécute jamais le démarrage. L’utilisateur peut ignorer le ressenti ; ni questionnaire long obligatoire, ni culpabilisation pour un objectif non atteint.

## 9. Frontière de cette référence

Cette livraison contient des fichiers statiques et un serveur HTTP de consultation sur `127.0.0.1:4321`. Pas de React, de nouvelle API, d’OAuth, de SQLite ou d’intégration du contrôleur. Les valeurs 5–8 km/h et le programme de 30 min illustrent la V1 future : ils ne modifient pas les limites actuelles du POC et ne constituent aucune réception matérielle.

La direction sera figée après réception visuelle humaine. Tests sur appareils physiques, Safari/iPhone, Android, regard à distance pendant l’effort et réception matérielle restent ouverts. Ne pas entreprendre l’Étape 02 ou 03 sur la seule base de cette référence.
