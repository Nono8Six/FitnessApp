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
