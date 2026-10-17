# Calories prévues des séances

Méthode actualisée le 13 octobre 2026. Les prévisions utilisent le **poids actuel du profil** ; les bilans utilisent le poids figé au départ. Changer le poids recalcule les prévisions sans modifier les programmes ni les anciennes réalisations.

## Calcul partagé côté Python

Équations métaboliques ACSM : vitesse `v` en m/min, pente `g` en fraction (10 % = 0,10), consommation d'oxygène en ml/kg/min :

- Marche : `VO2 = 3,5 + 0,1 × v + 1,8 × v × g`.
- Course : `VO2 = 3,5 + 0,2 × v + 0,9 × v × g`.
- Calories totales : `VO2 × poids_kg / 200 × durée_minutes` (approximation de 5 kcal par litre d'oxygène).
- Calories actives : même calcul après retrait de la composante de repos standard de 3,5. Ce repos n'est pas le métabolisme basal individuel.

Les équations et plages figurent dans le tableau 7.2, p. 159, du [texte ACSM original, 8e édition](https://www.pelvichealthinstitute.org/wp-content/uploads/2025/04/ACSMs-Guidelines-for-Exercise-Testing-and-Prescription-Eighth-Edition.pdf). La conversion est explicitée dans le [support ACSM de Jim Ross](https://www.summitmd.com/pdf/pdf/090626_aps09_970.pdf). L'ancien lien Texas Tech était indisponible lors de la vérification du 13 octobre.

Chaque segment développé est calculé avant sommation, répétitions comprises. Arrondi après la somme (0,1 kcal dans l'API ; kcal entière et signe ≈ dans l'interface). Aucun calcul énergétique dupliqué en JavaScript. Sans poids, les calories valent `null`, jamais zéro.

Le dénivelé équivalent est géométrique : somme des `distance_bande_m × g / sqrt(1 + g²)`. Il représente une montée équivalente, pas un changement d'altitude du tapis.

## Déplacement et limites

La méthode `acsm-v2-movement` utilise le déplacement prévu lorsqu'il est connu (`movement`, marche ou course), ou le type Course. Le catalogue indique son intention de déplacement ; le Coach peut la transmettre dans ses blocs. Sans indication, l'application suppose la marche jusqu'à 6 km/h et la course à partir de 8,04 km/h. Entre les deux, elle ne choisit plus arbitrairement la course.

Un segment ambigu rend les calories actives/totales uniques indisponibles (`null`). Depuis la correction du 17 octobre, les fiches, le Direct et le bilan affichent alors les deux estimations disponibles (par exemple « ≈ 107–214 kcal »), avec une explication marche/course ; ils ne masquent plus les scénarios derrière « -- ». Le calcul fournit aussi les totaux sous les deux hypothèses, marche et course : ce sont des scénarios, pas un intervalle de confiance. Un minimum calorique ne peut pas être validé sur cette ambiguïté. Sans poids, toutes ces valeurs restent indisponibles. Exemple de contrôle : à plat, 70 kg et 30 minutes à 6,1 km/h, les scénarios donnent environ 106,8 et 213,5 kcal actives ; aucun doublement physiologique n'est affirmé.

Aucun sélecteur technique ajouté dans l'éditeur. Modifier le type ou la vitesse retire l'ancienne intention de déplacement afin de ne pas conserver une hypothèse devenue incohérente. Les anciens champs `gait` restent acceptés mais ignorés ; ils ne deviennent pas une nouvelle preuve. Les nouvelles mesures conservent l'intention du bloc : elle ne détecte pas la démarche physique et les appuis sur les poignées restent inconnus sauf déclaration.

L'ACSM indique les meilleures plages de précision : marche de 50 à 100 m/min (3–6 km/h), course autour de 134 m/min et au-delà (environ 8 km/h). Voir tableau 7.2, page imprimée 159, [ACSM Guidelines, 8e édition](https://www.pelvichealthinstitute.org/wp-content/uploads/2025/04/ACSMs-Guidelines-for-Exercise-Testing-and-Prescription-Eighth-Edition.pdf). Hors de ces plages, l'estimation reste disponible mais le détail signale l'extrapolation ; aucun mélange arbitraire des deux formules.

Ces équations n'apportent pas une précision individuelle garantie. Appui sur les poignées, économie de mouvement et changements rapides d'allure limitent l'estimation. Aucun pourcentage d'erreur individuel n'est inventé. Âge, taille et sexe ne sont pas collectés : ils n'entrent pas dans cette méthode. Aucune VO2max, perte de graisse ou zone cardio n'est déduite.

Les calories du firmware RUN500 ne servent pas d'étalon. Aucune dépense individuelle mesurée ni zone cardio personnelle n'est inventée à partir d'une fréquence cardiaque indisponible (voir la base factuelle RUN500).

## Stockage

Migration 0004 : poids nullable, fini, de 20 à 300 kg (validation de saisie, pas capacité autorisée du tapis). Migration additive 0010 : date de renseignement du poids et historique des nouvelles saisies/effacements, par profil. Les anciens poids sans date restent explicitement non datés. Le poids fait partie du contexte transmis au Coach quand il est utilisé.

Les anciennes réalisations `recording-v1-acsm-v1` continuent à appeler la formule historique `estimate_legacy`, conservée. Les nouvelles utilisent `recording-v1-acsm-v2`. Distance, pauses, qualité et intervalles valides gardent leurs règles. Aucune réécriture silencieuse des anciens bilans ; les prévisions de programmes, elles, utilisent la méthode courante.
