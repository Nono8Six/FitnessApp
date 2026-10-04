# Calories prévues des séances

Complément à la brique 3, demandé le 4 octobre 2026. Les valeurs sont des prévisions avec le **poids actuel du profil**, pas un bilan d'activité réalisée. Le poids n'est pas figé dans les versions de programmes ; changer le poids recalcule leurs prévisions sans les modifier. Les futures séances réalisées devront conserver les paramètres utilisés au démarrage.

## Calcul partagé côté Python

Équations métaboliques ACSM : vitesse `v` en m/min, pente `g` en fraction (10 % = 0,10), consommation d'oxygène en ml/kg/min :

- Marche : `VO2 = 3,5 + 0,1 × v + 1,8 × v × g`.
- Course : `VO2 = 3,5 + 0,2 × v + 0,9 × v × g`.
- Calories totales : `VO2 × poids_kg / 200 × durée_minutes` (approximation de 5 kcal par litre d'oxygène).
- Calories actives : même calcul après retrait de la composante de repos standard de 3,5. Ce repos n'est pas le métabolisme basal individuel.

Les exemples de calcul du [support ACSM hébergé par Texas Tech](https://www.depts.ttu.edu/ksm/_documents/grad/acsm_comps/6c-23-2013_HFI_Metabolic_Calculations.pdf) explicitent ces équations et la conversion énergétique.

Chaque segment développé est calculé avant sommation, répétitions comprises. Arrondi après la somme (0,1 kcal dans l'API ; kcal entière et signe ≈ dans l'interface). Aucun calcul énergétique dupliqué en JavaScript. Sans poids, les calories valent `null`, jamais zéro.

Le dénivelé équivalent est géométrique : somme des `distance_bande_m × g / sqrt(1 + g²)`. Il représente une montée équivalente, pas un changement d'altitude du tapis.

## Déplacement et limites

Le déplacement (Auto, Marche, Course) est distinct du rôle du bloc (échauffement, récupération…). En Auto, l'application **suppose** la marche jusqu'à 6 km/h inclus, puis la course. C'est une convention de l'application, pas un seuil physiologique personnel. L'utilisateur peut la corriger par bloc. Les anciennes versions sans ce champ utilisent Auto à la lecture ; leur JSON reste intact.

L'ACSM indique les meilleures plages de précision : marche de 50 à 100 m/min (3–6 km/h), course autour de 134 m/min et au-delà (environ 8 km/h). Voir tableau 7.2, page imprimée 159, [ACSM Guidelines, 8e édition](https://www.pelvichealthinstitute.org/wp-content/uploads/2025/04/ACSMs-Guidelines-for-Exercise-Testing-and-Prescription-Eighth-Edition.pdf). Hors de ces plages, l'estimation reste disponible mais le détail signale l'extrapolation ; aucun mélange arbitraire des deux formules.

Ces équations n'apportent pas une précision individuelle garantie. Appui sur les poignées, économie de mouvement et changements rapides d'allure limitent l'estimation. Aucun pourcentage d'erreur individuel n'est inventé. Âge, taille et sexe ne sont pas collectés : ils n'entrent pas dans cette méthode. Aucune VO2max, perte de graisse ou zone cardio n'est déduite.

Le RUN500 transmet des calories calculées par son firmware, non étalonnées, et aucun cardio valide n'a été reçu lors du diagnostic (voir la base factuelle RUN500). Ce complément n'utilise pas ces données et ne démarre pas l'intégration du tapis.

## Stockage

Migration 0004 : colonne `profiles.weight_kg` nullable, borne de saisie 20–300 kg, finie et numérique. C'est une borne de validation de l'application, pas une capacité autorisée du tapis. Ajout de colonne sans recopie de la table parent afin de préserver les profils, réglages, séances, versions et sélections. Vider le champ efface le poids ; rien n'est envoyé à un service externe.
