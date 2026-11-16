# Le Bacito ☝️🤓

Petit bac multijoueur en temps réel pour le portail familial **Le Petit Perchoir**.
Servie sous `https://lepetitperchoir.fr/bacito/` (Worker Cloudflare **`famille-bacito`**).

## Comment on joue

1. **Lancer une partie** → une salle d'attente est créée. Les autres l'ouvrent avec **Rejoindre une partie**.
2. L'hôte règle le chrono (30 s à 5 min, 1:30 par défaut) et, s'il le veut, les lettres difficiles (K, Q, W, X, Y, Z),
   puis appuie sur **GO !**
3. Une lettre (jamais deux fois la même dans une partie) et 6 catégories sont tirées au sort. À la fin du chrono, les
   champs sont bloqués.
4. **Jury** : les copies passent une par une. Chacun vote 👎 (à gauche) ou 👍 (à droite) sur chaque réponse. Le joueur
   jugé ne vote pas. Une réponse est **acceptée si 👍 ≥ 👎** (égalité ou aucun vote = acceptée). Une case vide ne
   rapporte rien. Un avertissement s'affiche si la réponse ne commence pas par la lettre (le jury reste juge).
5. **Classement** cumulé. L'hôte peut **Rejouer** (mêmes joueurs, nouvelle lettre, nouvelles catégories, points cumulés).

Si l'hôte ne donne plus signe de vie depuis 45 s (téléphone en veille), les autres peuvent **prendre la main**. Si
l'hôte quitte la partie, elle passe au joueur arrivé le plus tôt. Le passage au jury est déclenché par le premier
téléphone qui voit le chrono terminé, pas seulement par celui de l'hôte.

## Données (Firestore)

Tout est rangé sous `families/{familyId}/apps/bacito/`. Aucune règle de sécurité n'est à modifier.

| Document | Contenu | Qui écrit |
|---|---|---|
| `rooms/{roomId}` | statut, hôte, réglages, manche, lettre, catégories, ordre de passage | l'hôte (et transactions) |
| `rooms/{roomId}/players/{uid}` | nom, présence (`lastSeen`), `scores: { "1": 4, "2": 3 }` | le joueur ; l'hôte pour les points |
| `rooms/{roomId}/answers/{manche}_{uid}` | la copie (6 réponses) | le joueur |
| `rooms/{roomId}/votes/{manche}_{cible}_{juré}` | `v: { "0": 1, "2": -1 }` | le juré |

- Un document par élément : deux téléphones n'écrivent jamais dans le même document en même temps.
- Les points sont stockés **par manche** au lieu d'un compteur `increment()`. Réécrire la même valeur ne change rien,
  donc un double appui ne peut pas doubler les points. Le total est recalculé à l'affichage.
- L'interface n'attend jamais une écriture. Un refus du serveur s'affiche en message en bas de l'écran.
- Le chrono utilise l'heure du serveur (mesurée grâce au battement de présence). Il se termine donc au même moment
  partout, même si l'heure d'un téléphone est mal réglée.
- Les copies des autres ne sont chargées qu'au moment du jury, pour économiser le quota de lectures.

Les vieilles salles ne sont pas supprimées. Elles n'apparaissent plus dans « Rejoindre » au bout de 3 h.

## Commandes

```
npm install
npm run dev      # http://localhost:5178/bacito/  (projet famille-dev, formulaire de connexion de dev)
npm run check    # svelte-check (types)
npm test         # tests unitaires + partie complète simulée à 3 joueurs
npm run build    # dist/
npm run demo     # http://localhost:5199/ : 3 téléphones côte à côte, SANS Firebase (fausse base locale)
```

## Déploiement

1. Créer le dépôt GitHub `app-bacito` et y pousser ce dossier.
2. Cloudflare → Workers & Pages → Créer → Importer un dépôt Git → `app-bacito`.
   - Nom du Worker : **`famille-bacito`** (obligatoire pour le routeur)
   - Commande de build : `npm run build`
   - Commande de déploiement : `npx wrangler deploy`
3. Ajouter la tuile dans le portail (id `bacito`, « Le Bacito ☝️🤓 », « Petit BAC », couleur `#1d4fa3`).

## Fichiers

- `src/lib/game.ts` : règles du jeu, logique pure et testée (tirages, votes, points, classement, lecture tolérante)
- `src/lib/firestore.ts` : lectures et écritures
- `src/lib/clock.ts` : décalage entre l'horloge du téléphone et celle du serveur
- `src/lib/*.svelte` : écrans (Menu, JoinList, RoomView → Lobby / Play / Judge / Results, SignedOut)
- `test/fake/` : fausses versions de `firebase/firestore` et `famille-core`, **pour les tests uniquement**
- `test/e2e/` : aperçu 3 joueurs (`npm run demo`)
