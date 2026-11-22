# Ouvrir une séance Foulée dans FitnessApp

Le bouton **Ouvrir dans FitnessApp** peut utiliser le même objet `foulee.treadmill.v1` que le programme tapis. Transmettre `format`, `athlete`, `title` et `blocks` avec leurs valeurs actuelles. Garder l’ordre des blocs et laisser `speed_kmh` à `null` pour une allure de course à renseigner.

```js
const url = new URL(fitnessAppAddress)
if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) {
  throw new Error('Vérifiez l’adresse de FitnessApp affichée dans le lanceur.')
}
const params = new URLSearchParams({
  programme: JSON.stringify({
    format: programme.format,
    athlete: programme.athlete,
    title: programme.title,
    blocks: programme.blocks,
  }),
})
url.hash = `#/seances/depuis-foulee?${params}`
// Utiliser url.href comme href du bouton dans la fiche de séance.
```

`fitnessAppAddress` est l’adresse affichée dans le lanceur FitnessApp. Sur le PC, l’adresse habituelle est `http://127.0.0.1:4330/`. Sur téléphone, mémoriser l’adresse Wi-Fi du PC saisie dans Foulée pour les prochaines séances. Le lien ouvre FitnessApp dans le navigateur avec le programme dans son fragment d’URL. Le PC doit être allumé et FitnessApp démarrée.

FitnessApp vérifie le profil et les consignes, demande l’allure si nécessaire et remplit son éditeur. La séance rejoint la bibliothèque lorsque l’utilisateur l’enregistre. La mise en ligne du bouton se fait dans le projet Sites de Foulée.

## Envoyer automatiquement les bilans vers Foulée

Le serveur FitnessApp envoie le résumé des séances réelles du profil Arnaud dès que le bilan est enregistré et que l’arrêt du tapis est confirmé. Une séance terminée en avance peut aussi être envoyée. Les séances simulées, annulées et interrompues sont exclues. Le site peut être fermé.

Foulée reçoit le nom, la date de début, la durée active, la distance complète quand elle est disponible et le ressenti. La séance garde le même identifiant si l’envoi doit être repris ou si le ressenti est ajouté après coup. FitnessApp attend la confirmation de Foulée. En cas de coupure, la reprise se fait aussi après un redémarrage du serveur.

La réception des bilans par le site privé [Foulée](https://foulee-objectif-arnaud.nono8six.chatgpt.site/) alimente le Journal de course et la Progression d’Arnaud.

### Activation sur le PC Windows

**Avec le navigateur.** Une fois le PC appairé à Foulée, FitnessApp ouvre automatiquement une page de transfert dans le navigateur par défaut quand un bilan est prêt. Le navigateur doit être connecté à Foulée avec le compte propriétaire. Il utilise sa connexion habituelle et redirige ensuite vers le serveur FitnessApp sur `127.0.0.1:4330` pour confirmer la réception. La page ne transporte le bilan que sous forme chiffrée pour le serveur Foulée. La clé de signature du PC est protégée dans le coffre Windows et seule sa clé publique est configurée côté Foulée.

Si la connexion à Foulée a expiré, reconnecter le compte dans le navigateur du PC. Le bilan reste en attente et FitnessApp réessaie à intervalles croissants, sans changer son identifiant. L’appairage est propre au PC. Pour un autre PC, actualiser la clé publique autorisée dans Foulée.

**Avec le jeton de service Sites.** Si le jeton est disponible, la voie serveur à serveur reste utilisable. Dans un terminal local, à la racine de FitnessApp, saisir le jeton à l’invite masquée, puis redémarrer le serveur.

```powershell
.\.venv\Scripts\python.exe -m backend.foulee activer
```

Le jeton est chiffré pour le compte Windows. L’activation couvre les nouvelles séances. Relancer la commande avec un nouveau jeton conserve les envois en attente.

Pour arrêter la synchronisation dans l’un ou l’autre mode, exécuter `.\.venv\Scripts\python.exe -m backend.foulee desactiver`, puis redémarrer FitnessApp.
