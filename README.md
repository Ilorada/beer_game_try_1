# 🍺 Beer Game — l'effet coup de fouet

> Ce dépôt contient aussi **[Quiz Supply Chain](quiz-app/README.md)** (dossier `quiz-app/`), une application qui génère des milliers de QCM à partir de tes cours pour préparer un examen de 80 questions en 3 h.

Une version multijoueur en ligne du **Beer Distribution Game** (créé au MIT Sloan dans les
années 1960), le classique de la gestion des opérations pour démontrer l'**effet coup de
fouet** (*bullwhip effect*) : comment de petites variations de la demande client s'amplifient
en remontant une chaîne d'approvisionnement.

## Le jeu

Quatre rôles forment une chaîne linéaire :

```
Client → Détaillant → Grossiste → Distributeur → Usine
```

Chaque semaine, chaque rôle :
1. reçoit une livraison de son fournisseur (avec un délai de transport),
2. reçoit une commande de son client en aval (avec un délai de transmission),
3. l'honore avec son stock disponible (le manque devient du *backlog*, facturé),
4. décide combien commander à son propre fournisseur — **sans voir le stock ni les
   commandes des autres rôles**.

C'est justement ce manque de visibilité, combiné aux délais, qui produit l'amplification :
une petite hausse de la demande finit par déclencher des à-coups de commande massifs chez le
grossiste, le distributeur puis l'usine.

Coûts (réglages par défaut, modifiables dans `server/src/types.ts`) :
- stock excédentaire : 0,5 $ / unité / semaine
- rupture (backlog) : 1 $ / unité / semaine

Objectif : minimiser le **coût total de l'équipe**, pas seulement le sien — c'est une
chaîne d'approvisionnement partagée.

Si une salle démarre avec moins de 4 joueurs humains, les rôles restants sont pris en charge
par une IA simple (stratégie "order-up-to") pour que la partie ne soit jamais bloquée.

## Architecture

- `server/` — Node.js + Express + Socket.IO. Contient le moteur de simulation
  (`gameEngine.ts`, pur et testable), la gestion des salles (`roomManager.ts`) et le câblage
  temps réel (`index.ts`). En production, ce même serveur sert aussi les fichiers statiques
  du client : **un seul service à déployer**.
- `client/` — React + TypeScript (Vite), connecté au serveur via `socket.io-client`. Graphiques
  (effet coup de fouet, stocks) avec Recharts.

Chaque joueur ne reçoit, via `game:state`, que les informations visibles par son propre rôle —
exactement comme à la table de jeu physique. Les résultats complets (toutes les commandes,
tous les stocks) ne sont révélés qu'à la fin de la partie, pour le débriefing.

## Lancer en local

Prérequis : Node.js 20+.

```bash
npm run install:all   # installe les dépendances de server/ et client/
npm run dev            # lance le serveur (port 3001) et le client (port 5173) en parallèle
```

Ouvrez http://localhost:5173, créez une salle, et ouvrez d'autres onglets/navigateurs pour
incarner les autres rôles.

## Tests

```bash
npm test          # tests du moteur de jeu (équilibre stable + amplification du coup de fouet)
npm run typecheck # vérification TypeScript des deux packages
```

## Build & déploiement

```bash
npm run build   # build le client (client/dist) puis compile le serveur (server/dist)
npm start       # lance le serveur de production, qui sert aussi le client
```

Variables d'environnement utiles :
- `PORT` (serveur) — port d'écoute, défaut `3001`.
- `CLIENT_ORIGIN` (serveur) — origine autorisée pour CORS/Socket.IO si le client n'est pas
  servi par ce même serveur (déploiement séparé).
- `VITE_SERVER_URL` (client, à la compilation) — URL du serveur si différente de l'origine du
  site (déploiement séparé du client et du serveur).

Ce projet se déploie facilement en un seul service sur une plateforme comme Render, Railway
ou Fly.io : build command `npm run build`, start command `npm start`.

## Personnaliser une partie

À la création de la salle, l'hôte choisit :
- la durée (en semaines),
- le motif de demande client : `classic` (choc brutal 4 → 8), `random`, ou `seasonal`
  (vagues sinusoïdales).

D'autres paramètres (délais, coûts, stock initial) sont fixés dans
`server/src/types.ts` (`DEFAULT_SETTINGS`).
