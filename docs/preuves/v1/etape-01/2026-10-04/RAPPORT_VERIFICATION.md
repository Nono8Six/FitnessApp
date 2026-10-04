# Vérification de la conception · Étape 01

4 octobre 2026. **Maquettes livrées, validation visuelle humaine en attente.**

## Résultats constatés

| Contrôle | Résultat / preuve |
|---|---|
| Cinq écrans, clair et sombre, PC et téléphone | 20 captures de référence à 390 × 844 et 1440 × 900, [matrice](captures-reference.json) |
| Formats complémentaires | 30 captures des cinq écrans à 430 × 932, 1024 × 768 et 1920 × 1080 ; 2 du Direct à 844 × 390, [géométrie](captures-complementaires.json) |
| Dimensions des fichiers | Dimensions exactes pour toutes les captures dont le nom spécifie largeur × hauteur, [inventaire](dimensions-captures.json) |
| Débordement horizontal | Aucun dans les 52 vues normales, les 46 états contrôlés et les 10 contrôles de texte long à 200 % |
| Commandes pendant l’effort | À 390 × 844 : Pause `(20,772,161.5,58)`, Arrêter `(193.5,772,161.5,58)` ; mêmes coordonnées en erreur, déconnexion, pause et donnée ancienne. Reprendre reprend la place de Pause |
| Courbe et commandes | Direct portrait : bas de courbe 723,03 px, note à 726 px et commandes à 757 px ; paysage : courbe 307,5 px et panneau de commandes 313 px. Aucun axe recouvert dans le scénario normal |
| Zones tactiles | Commandes 58 px en portrait/PC et 56 px en paysage ; champs 46, sélecteurs/Focus 44. Les régions des graphiques et sliders restent distinctes des commandes |
| Contrastes | 52 paires sémantiques mesurées, toutes conformes aux seuils utilisés ; [rapport](CONTRASTES.md) et [JSON](contrastes.json) |
| Préparation, reprise et arrêt | Présence requise avant démarrage/reprise ; profil de séance inchangé ; arrêt demandé distinct d’un effet confirmé, [interactions](interactions.json) |
| Éditeur | 18 km/h refusés pour le profil fictif limité à 10 ; 11 répétitions produisent 65 min et désactivent Enregistrer ; ajout/retrait change 30 → 32 → 30 min ; sauvegarde uniquement de présentation |
| Courbes et exploration | Curseur clavier montre 12:00 avec vitesse/pente absentes ; axes et curseur liés après zoom 10–15 min ; comparaison identifiée ; graphiques recalculés à l’ouverture de l’exploration |
| Coach | Sources ouvrables, source du 28 septembre ouvre bien cette séance ; brouillon enregistré sans démarrage ; accès à l’éditeur, [captures spécifiques](captures-interactions.json) |
| Clavier | Lien d’évitement visible au premier Tab, anneau bleu 3 px, position y=8 ; slider parcouru avec Home/PageUp |
| Thème Système | Suit successivement clair et sombre via l’émulation de la préférence système dans Chrome |
| Réduction du mouvement | `prefers-reduced-motion: reduce` donne des transitions de 0 s, sans supprimer les commandes |
| Texte à 200 % | Mode de maquette avec police de base 16 → 32 px, reflow et titre long : les cinq écrans à 390 et 1440 sans débordement ; [mesures](texte-200-et-long.json) |
| Console | Aucune erreur/alerte issue de l’origine des maquettes ; une erreur d’extension Chrome `Session fetch failed: HTTP 401` est conservée dans [console.json](console.json) |
| Syntaxe | `node --check` réussi pour `app.js` et `demo-data.js` |
| Préservation | 13 fichiers POC/tests/scripts/lanceur/README/dépendances comparés par SHA-256, tous inchangés ; [avant](fichiers-preserves-avant.json), [après](fichiers-preserves-apres.json) |
| Serveur | Python standard, `127.0.0.1:4321`, dossier de maquettes uniquement ; POC existant sur 4317 séparé, [processus](serveurs-locaux.json) |

## Corrections apportées après observation

Les premières vues Chrome ont montré des commandes Direct sous la zone visible sur PC, une courbe coupée en paysage, un sous-libellé coloré par un sélecteur trop large et des débordements à texte agrandi. La livraison fixe les commandes en bas, redistribue le paysage, réserve l’espace des axes, corrige le sélecteur et replie les groupes en colonne à 200 %. Les contrôles ont été rejoués après ces changements.

La progression du bloc courant représente 80 % du bloc de 3 min à 17:24 actives. Les valeurs inconnues lors d’une pause/interruption ne deviennent pas un zéro fictif. L’éditeur suspend son aperçu invalide et ses contrôles désactivés ont un style distinct.

## Comparaison aux décisions visuelles

- Aujourd’hui : programme dominant, action de préparation large, objectif hebdomadaire secondaire, historique sous forme de lignes.
- Direct : une mesure dominante, unités proches, bloc et prochain bloc immédiatement lisibles ; commandes stables ; courbe secondaire compacte.
- Détail : lecture du bilan avant exploration, cible discontinue, interruption réelle dans le tracé, pente avec son axe, qualité et ressenti accessibles.
- Coach : réponse rédigée dans le contexte du profil, sources consultables, programme structuré à droite sur PC et après la conversation sur téléphone.
- Éditeur : répétitions groupées, durée et unités explicites, aperçu temporel, erreur localisée et impossibilité d’enregistrer l’invalide.
- Clair/sombre : mêmes priorités, contraste et accents adaptés ; le sombre utilise des couches graphite et des actions plus lumineuses.

Les captures Apple sont des références officielles observées, séparées des captures des maquettes. Aucune image générée de concept n’est présentée comme un rendu d’application.

## Portée et limites

Ces preuves portent sur Chrome sur Windows avec un viewport imposé et des données synthétiques. Les dimensions sont des pixels CSS. Les captures de page complète sont plus hautes que le viewport et ont la largeur utile du document, hors barre de défilement ; elles complètent les cadrages exacts demandés.

Les 52 cadrages finaux utilisent l’API `screenshot` du MCP Chrome, avec un rectangle de capture égal au viewport. Le viewport réel et les dimensions JPEG enregistrées ont été contrôlés : aucun écart sur les 76 fichiers dont le nom indique les dimensions, états et vues agrandies compris. La galerie HTML est livrée comme fichier local ; son ouverture `file://` par le MCP est refusée par la politique de navigation. Les maquettes servies en HTTP local ont été ouvertes et vérifiées. La galerie peut être ouverte manuellement.

Le contrôle « texte 200 % » utilise le mode d’agrandissement de la maquette. Les réglages de taille système, le zoom natif des navigateurs mobiles, VoiceOver/TalkBack, le clavier virtuel, les safe areas et Safari/Android sur appareils physiques n’ont pas été reçus. Aucune preuve de lisibilité pendant une course réelle ni de mesure en millimètres.

Les gestes graphiques libres (pincement, sélection arbitraire, troisième comparaison), les exports, le calcul analytique de production et l’enregistrement durable restent aux étapes futures. Le détail réutilise une série pédagogique lorsque l’on ouvre un extrait d’historique ; aucun historique réel n’est analysé.

Aucune commande au tapis, OAuth, nouvelle API ou SQLite. Aucun commit, déploiement ou passage à l’Étape 02/03. Les fichiers `data/` et les anciennes preuves n’ont pas été modifiés par ce travail ; les journaux d’un POC encore actif peuvent évoluer indépendamment.

**La réception esthétique appartient à Arnaud. La case Étape 01 reste non cochée.**
