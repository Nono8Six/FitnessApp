# Enregistrer une séance dans Santé

Sur le même Wi-Fi que le PC, ouvrez l’adresse de FitnessApp dans votre navigateur habituel. Gardez cette adresse pour retrouver vos réglages. Choisissez votre profil, puis **Réglages → Configurer l’enregistrement Santé**. Vous pouvez le faire avant votre première séance.

## Android 14 ou plus récent

1. Dans Chrome sur le téléphone, touchez **Installer FitnessApp Santé (.apk)** et ouvrez le fichier téléchargé. Le compagnon est gratuit et signé par le projet. Android peut demander votre accord pour cette installation. Le même APK est disponible en HTTPS [dans le dépôt FitnessApp](https://github.com/Nono8Six/FitnessApp/raw/refs/heads/main/frontend/public/fitness-sante.apk).
2. Revenez dans FitnessApp. Choisissez Marche ou Course et l’estimation calorique souhaitée si le bilan donne une plage. Confirmez votre profil et enregistrez ces réglages.
3. À la fin de la première séance, touchez **Enregistrer la séance**. Confirmez l’association au nom affiché et autorisez l’écriture de l’exercice, des calories actives et, si disponible, de la distance. Aux séances suivantes, le même bouton lance directement l’écriture. Le compagnon affiche une confirmation quand Santé Connect a accepté les données.

Le compagnon demande uniquement des autorisations d’écriture et fonctionne sans accès Internet. Il réutilise les identifiants du profil et du bilan pour mettre à jour ses propres données lors d’un nouvel envoi. Une séance enregistrée séparément par une montre possède sa propre source. Pour changer de navigateur, d’adresse du PC ou de profil, ouvrez **FitnessApp Santé → Dissocier**, puis associez la nouvelle configuration depuis un bilan. [Fonctionnement de l’écriture dans Santé Connect](https://developer.android.com/health-and-fitness/health-connect/write-data).

## iPhone

1. Dans les réglages de FitnessApp, choisissez votre activité habituelle. Touchez **Ouvrir l’éditeur de Raccourcis**, puis créez le raccourci avec le nom affiché, **FitnessApp Marche** ou **FitnessApp Course**. Le guide **Créer le raccourci** détaille les actions et les unités. Pour pratiquer les deux activités, vous pouvez dupliquer le premier raccourci, changer son nom et le type d’exercice de ses actions Santé.
2. Le raccourci lit le dictionnaire reçu du bilan. Il convertit `debut` en date et utilise `duree_secondes` en secondes et `calories_actives` en kcal. Lorsque la clé `distance_metres` est présente, il renseigne aussi la distance en mètres. Les champs et le type d’activité sont choisis pendant la configuration. Désactivez « Demander à chaque fois » pour ces valeurs.
3. Revenez dans FitnessApp, confirmez votre profil et enregistrez les réglages. À la fin d’une séance, touchez **Enregistrer la séance**. iOS peut demander de confirmer l’ouverture de Raccourcis et, au premier enregistrement, d’autoriser l’accès en écriture à Santé.
4. Pour le premier essai, vérifiez l’entraînement et ses valeurs dans **Santé → Parcourir → Activité → Exercices**. Le navigateur mémorise la demande et bloque un nouvel appui pour ce bilan. Si Raccourcis a été annulé, vérifiez l’absence de l’exercice avant d’autoriser un nouvel essai. Le navigateur ne reçoit pas de confirmation de Santé. Ce repère est propre au navigateur et à l’adresse du PC.

La création manuelle du raccourci se fait une fois sur l’iPhone. Le site ouvre l’éditeur Apple et transmet les valeurs directement à Raccourcis lors des séances suivantes. [Ouvrir l’éditeur](https://support.apple.com/guide/shortcuts/open-create-and-run-a-shortcut-apda283236d7/ios) · [Transmettre des données à un raccourci](https://support.apple.com/guide/shortcuts/run-a-shortcut-using-a-url-scheme-apd624386f42/ios).

## Valeurs enregistrées

L’export utilise le départ du bilan et la durée active. En cas de pause, l’heure de fin est donc reconstruite. La distance est envoyée lorsque sa mesure est complète. Les calories correspondent à l’estimation active, hors repos. Une estimation ambiguë utilise la borne basse ou haute choisie dans les réglages. Un bilan sans estimation calorique exploitable, simulé ou incomplet signale la raison qui empêche l’envoi. Le bouton **Modifier** permet de changer l’activité ou la préférence calorique avant l’envoi.

## Maintenance du compagnon Android

Les sources se trouvent dans `android/`. Le build web embarque `frontend/public/fitness-sante.apk`. Pour une mise à jour, incrémenter `versionCode` dans `AndroidManifest.xml`, puis lancer `android/build.ps1` avec un JDK 17 ou ultérieur, le SDK Android 35 et les Build Tools 35.0.0. Les paramètres `-Platform` et `-Tools` acceptent les répertoires du SDK.

La clé de signature est conservée hors du dépôt dans `%LOCALAPPDATA%\FitnessApp\android-signature`. Le mot de passe est protégé par le compte Windows. Le script vérifie la signature et le certificat du fichier distribué avant son remplacement. Empreinte SHA-256 du certificat de la version 1.0 : `d2b3f0439f0191d774e6ceb8829ad624fa9895c35ec47652a987c0ccf802d818`.
