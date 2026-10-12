<div align="center">

# 👑 Reign

**Colonisez, commercez et bâtissez sur une île en voxels faite main, directement dans votre navigateur.**

[English](README.md) · [Русский](README.ru.md) · [简体中文](README.zh-CN.md) · [Deutsch](README.de.md) · **Français**

[![Jouer à la démo](https://img.shields.io/badge/jouer-d%C3%A9mo%20contre%20les%20bots-f5b301?style=for-the-badge)](https://reign-khaki.vercel.app)

![TypeScript](https://img.shields.io/badge/TypeScript-6.0-3178c6?logo=typescript&logoColor=white)
![Svelte](https://img.shields.io/badge/Svelte-5-ff3e00?logo=svelte&logoColor=white)
![Three.js](https://img.shields.io/badge/Three.js-r180-000000?logo=threedotjs&logoColor=white)
![Node](https://img.shields.io/badge/Node-%E2%89%A520-339933?logo=nodedotjs&logoColor=white)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-17-4169e1?logo=postgresql&logoColor=white)
![Docker](https://img.shields.io/badge/Docker-ready-2496ed?logo=docker&logoColor=white)

<img src="docs/screenshots/home.jpg" alt="Menu principal de Reign avec l'île en voxels sur la table" width="100%">

</div>

Reign est une version multijoueur du grand classique du jeu de plateau où l'on colonise, commerce et
construit, faite de micro-voxels et jouable dans le navigateur. Chaque tuile, chaque pion, chaque
dé, chaque pile de cartes et la pièce chaleureuse autour de la table sont faits de minuscules voxels
maillés à la volée. Jouez à la partie classique complète avec des amis ou des bots, ou passez à
**Reign Extended** : des personnages dotés de pouvoirs, une pioche d'événements, de nouveaux
bâtiments et des îles de toutes formes et de toutes tailles.

> **Essayez tout de suite :** [reign-khaki.vercel.app](https://reign-khaki.vercel.app) fait tourner
> la version avec bots uniquement dans votre navigateur. Sans compte, sans installation.

> Le jeu est disponible en français, anglais, russe, chinois et allemand. Vous pouvez changer de
> langue dans les Paramètres ou directement sur l'écran de connexion.

## Sommaire

- [Points forts](#points-forts)
- [Captures d'écran](#captures-décran)
- [Modes de jeu](#modes-de-jeu)
- [Jouer ensemble](#jouer-ensemble)
- [Démarrage rapide](#démarrage-rapide)
- [Lancer Reign](#lancer-reign)
- [Configuration](#configuration)
- [Commandes](#commandes)
- [Triches de développement](#triches-de-développement)
- [Architecture](#architecture)
- [Ajouter du contenu](#ajouter-du-contenu)
- [Tests](#tests)
- [Licence](#licence)

## Points forts

- 🎲 **Le jeu de base complet.** Île aléatoire de 19 tuiles avec ports, placement initial en
  serpentin, production aux dés, le Voleur, les cartes développement, la Route la plus longue et
  l'Armée la plus puissante, échanges avec la banque, via les ports et entre joueurs ; le premier
  à 10 points l'emporte.
- 🧱 **Un monde de voxels vivant.** Des cultures qui ondulent, des moutons qui broutent, de l'écume
  sur les hauts-fonds, de vrais dés qui roulent, des cartes qui volent des tuiles jusqu'à votre main
  et une taverne chaleureuse autour de la table.
- 🏰 **Reign Extended.** 16 personnages avec traits et pouvoirs, un choix des personnages,
  13 cartes événement, ateliers, routes pavées et entrepôts, et des îles de 12 à 240 tuiles
  accueillant jusqu'à 8 joueurs.
- 🧑‍🤝‍🧑 **Fait pour jouer entre amis.** Comptes avec avatars en voxels, amis et statut en ligne,
  invitations, historique des parties, spectateurs, pigeon voyageur privé et retour dans une partie
  que vous avez quittée.
- 🤖 **Des bots qui appliquent toutes les règles.** Ils occupent n'importe quel siège libre,
  échangent, construisent, utilisent les pouvoirs des personnages et réagissent aux événements.
- 📖 **Une campagne en solo.** *La Couronne brisée* est une histoire pour un joueur seul à travers
  des îles faites à la main. Chaque mission a ses rivaux, ses règles particulières et trois étoiles à gagner.
- 🛡️ **Le serveur fait autorité.** Le serveur applique les règles et n'envoie à chaque joueur que ce
  qu'il a le droit de voir : les mains, la pioche et la graine des dés restent secrètes.
- 🌍 **Cinq langues.** Anglais, russe, chinois simplifié, allemand et français ; la langue suit celle
  de votre navigateur et se change dans les Paramètres ou sur l'écran de connexion.
- 📚 **Tutoriel intégré.** Un livret de règles complet et illustré pour les deux modes, accessible
  depuis le menu principal ou le menu en jeu.

## Captures d'écran

<table>
  <tr>
    <td width="50%"><img src="docs/screenshots/table.jpg" alt="Une partie en cours avec l'interface"><br><sub><b>À table.</b> Vos tuiles et vos revenus, la chronique, une plaque pour chaque joueur et le menu de construction.</sub></td>
    <td width="50%"><img src="docs/screenshots/closeup.jpg" alt="Gros plan sur l'île en voxels"><br><sub><b>De près.</b> Chaque tuile est un diorama miniature, ici avec un entrepôt, le Voleur et des moutons.</sub></td>
  </tr>
  <tr>
    <td><img src="docs/screenshots/lobby.jpg" alt="Le salon de Reign Extended"><br><sub><b>Le salon.</b> L'hôte règle le mode, l'île, les personnages, les bâtiments, les événements, les points et le chrono du tour.</sub></td>
    <td><img src="docs/screenshots/draft.jpg" alt="Le choix des personnages"><br><sub><b>Choix des personnages.</b> Seize personnages, chacun avec un trait et un pouvoir ; le premier à fonder sa colonie choisit en dernier.</sub></td>
  </tr>
  <tr>
    <td><img src="docs/screenshots/events.jpg" alt="Une carte événement est révélée"><br><sub><b>Pioche d'événements.</b> À chaque manche, une nouvelle carte apporte fêtes, tempêtes, comètes et bandits.</sub></td>
    <td><img src="docs/screenshots/islands.jpg" alt="Choix d'une île"><br><sub><b>Îles.</b> Des îles prédéfinies, un éditeur de cartes et un générateur d'îles aléatoires à graine.</sub></td>
  </tr>
  <tr>
    <td colspan="2"><img src="docs/screenshots/eight-players.jpg" alt="Une partie à huit joueurs sur une grande île"><br><sub><b>Grandes tablées.</b> Les grandes îles accueillent jusqu'à huit joueurs, avec une banque et une pioche agrandies en conséquence.</sub></td>
  </tr>
</table>

## Modes de jeu

L'hôte choisit le mode dans le salon, et chaque option ci-dessous est un interrupteur qu'il
contrôle.

### Classic

La partie standard, exactement comme elle s'est toujours jouée : l'île aléatoire de 19 tuiles, les
règles standard, de 2 à 4 joueurs et 10 points pour gagner.

### Reign Extended

Tout ce que contient Classic, et en plus :

| Fonctionnalité | Ce qu'elle apporte |
| --- | --- |
| **Personnages** | 16 personnages, chacun doté d'un trait qui modifie une règle, comme des échanges 3:1 avec la banque, des villes moins chères ou le vol de deux cartes. L'hôte peut les faire choisir à tour de rôle, en exclure certains, autoriser les doublons ou les désactiver. |
| **Pouvoirs** | Chaque personnage possède aussi un pouvoir qui vaut à peu près une carte développement : Jour de marché, Prévoyance, Maléfice, Bénédiction, Malice et d'autres encore. Une fois par partie, ou rechargé toutes les 4 ou 6 manches. |
| **Pioche d'événements** | 13 cartes événement, dont une est retournée à chaque manche ou toutes les deux manches : Fête des moissons, Comète, Séisme, Décret royal, Invasion de rats, Révolte des brigands et d'autres. L'hôte peut retirer n'importe quelle carte. |
| **Bâtiments** | **Ateliers** (+1 carte quand leur tuile vous rapporte), **routes pavées** (comptent double pour la Route la plus longue) et **entrepôts** (gardent 3 cartes à l'abri du Voleur et des événements). |
| **Îles** | Six formes prédéfinies, de l'île classique à un royaume de 37 tuiles, un éditeur de cartes pour créer vos propres îles et un générateur aléatoire (de 12 à 240 tuiles ; îles rondes, allongées, découpées ou reliées, avec des lacs). |
| **Grandes tablées** | Une île accueille un joueur pour cinq tuiles, de 4 à 8, en huit couleurs. La banque et la pioche grandissent avec la tablée. |
| **Règles maison** | Points de victoire de 3 à 30 (plafonnés selon la taille de l'île et de la tablée), limite de cartes en main sur un 7 de 3 à 20 et chrono du tour de 30 secondes à 3 minutes. |

## Jouer ensemble

- **Comptes.** Connectez-vous avec un nom d'utilisateur, un pseudo, un mot de passe et l'un des
  douze avatars en voxels, tous modifiables par la suite.
- **Amis.** Ajoutez des amis par leur nom d'utilisateur, voyez qui est en ligne, à une table ou en
  partie, et invitez-les dans votre salon.
- **Historique des parties.** Chaque partie est enregistrée, avec les personnages et les résultats,
  pour vous comme pour vos amis.
- **Liens d'invitation.** Créez un salon et partagez le lien ou le code du salon.
- **Spectateurs.** Saisir le code d'une partie en cours permet de la regarder sans voir la main de
  personne.
- **Pigeon voyageur.** Envoyez des messages privés à un autre joueur par pigeon voyageur. Vous seuls
  pouvez les lire.
- **Partir et revenir.** Un bot reprend le siège d'un joueur parti jusqu'à son retour. Une partie ne
  se termine que lorsque tout le monde est parti.
- **Pause.** Dans une partie contre des bots, ouvrir le menu met la table en pause.

## Démarrage rapide

Il vous faut **Node 20+** et **pnpm** (`corepack enable` vous fournit la bonne version).

```bash
pnpm install
pnpm dev          # serveur de jeu sur :8787 + Vite sur :5173
```

Ouvrez <http://localhost:5173>, créez un compte, puis cliquez sur **Jouer contre des bots** ou
**Créer un salon** et partagez le lien d'invitation. Pour jouer avec d'autres personnes sur votre
réseau local, ouvrez le jeu via l'adresse LAN de votre ordinateur (par exemple
`http://192.168.1.20:5173`) afin que le lien pointe vers elle.

Aucune base de données à configurer : sans `DATABASE_URL`, le serveur lance
[PGlite](https://pglite.dev) (Postgres compilé en WebAssembly) dans son propre processus et conserve
les données dans `./data/db`. Supprimez ce dossier pour repartir de zéro.

## Lancer Reign

### Build de production

```bash
pnpm build
pnpm start        # un seul processus sert la page, /api et le WebSocket sur http://localhost:8787
```

### Docker

```bash
docker compose up -d --build        # le jeu + Postgres sur http://localhost:8787
docker compose down                 # l'arrêter
```

L'image compile le client et exécute le serveur de production dans un petit conteneur sans
privilèges root, avec un contrôle de santé sur `/health`. Compose démarre aussi Postgres 17, avec
ses données dans le volume `db`.

Sans compose :

```bash
docker build -t reign .
docker run -p 8787:8787 -e DATABASE_URL=postgres://user:pass@host:5432/reign reign
```

Sans `DATABASE_URL`, le conteneur conserve ses données en interne avec PGlite (elles sont perdues
lorsque le conteneur est supprimé).

Pour développer sans installer Node, `docker compose --profile dev up --build` lance `pnpm dev`
depuis votre copie de travail, avec rechargement à chaud sur <http://localhost:5173>.

### Votre propre serveur en HTTPS

1. Copiez `.env.example` vers `.env`.
2. Définissez un vrai `POSTGRES_PASSWORD` (lettres et chiffres, par ex. `openssl rand -hex 24`).
3. Définissez `DOMAIN` et faites pointer son enregistrement DNS A vers le serveur.
4. Définissez `BIND=127.0.0.1` pour que le port 8787 ne réponde qu'en local et que les joueurs
   passent par HTTPS.

```bash
docker compose --profile https up -d --build   # jeu + Postgres + Caddy sur les ports 80 et 443
```

Caddy obtient et renouvelle un certificat Let's Encrypt et transmet la page, `/api` et le WebSocket
au jeu. Sans domaine, n'activez pas ce profil et jouez sur `http://<ip-du-serveur>:8787`.

### Build hors ligne (bots uniquement)

```bash
pnpm build:offline      # site statique dans dist/offline
pnpm dev:offline        # la même chose avec rechargement à chaud sur http://localhost:5173
```

Le build hors ligne n'a besoin ni de serveur ni de comptes : les règles et les bots tournent dans la
page, avec le même `Room` que celui du serveur, derrière un WebSocket de substitution. Vous occupez
un siège local face à des bots dans l'un ou l'autre mode, et votre pseudo, votre avatar et vos îles
enregistrées restent dans le navigateur. `vercel.json` compile cette version, si bien que le dépôt
se déploie tel quel sur Vercel ou sur n'importe quel hébergeur statique.

### Render

`render.yaml` déploie le jeu comme service web Node avec une base de données Render Postgres
gratuite. La même image Docker fonctionne aussi chez tout hébergeur prenant en charge les
WebSockets, comme Fly.io, Railway ou un VPS.

## Configuration

| Variable | Par défaut | Utilisée par | Signification |
| --- | --- | --- | --- |
| `PORT` | `8787` | serveur, compose | Port sur lequel le jeu écoute. |
| `DATABASE_URL` | *(vide)* | serveur | URL `postgres://`. Vide signifie PGlite intégré dans `./data/db`. |
| `NODE_ENV` | | serveur | Avec `production`, les triches de développement ne sont jamais activées. |
| `POSTGRES_PASSWORD` | `change-me` | compose | Mot de passe du Postgres fourni, à définir avant le premier démarrage. |
| `BIND` | `0.0.0.0` | compose | Adresse sur laquelle le port du jeu est publié. |
| `DOMAIN` | `localhost` | compose (`https`) | Domaine pour lequel Caddy obtient un certificat. |

## Commandes

| Entrée | Action |
| --- | --- |
| Glisser | Faire pivoter la table |
| Glisser avec le clic droit ou deux doigts | Déplacer la vue |
| Molette ou pincement | Zoomer |
| Survoler, puis cliquer | Prévisualiser un pion là où brillent les gemmes et les anneaux, puis le poser |
| `Esc` | Quitter le mode construction, fermer le panneau d'échange ou ouvrir le menu du jeu |
| `` ` `` | Ouvrir le panneau de triche (serveur de développement uniquement) |

Pendant la mise en place et lors du déplacement du Voleur, le plateau éclaire tous les emplacements
valides.

## Triches de développement

`pnpm dev` démarre le serveur avec `--dev`, ce qui dote chaque partie d'un panneau de triche :
appuyez sur `` ` `` ou cliquez sur le marteau sous le bouton du menu. Il permet de donner des cartes
à n'importe quel joueur ou une carte développement jouable, de truquer le prochain lancer, de
retourner l'événement de votre choix, de terminer la mise en place, d'accélérer les bots et de
gagner sur-le-champ. Chaque utilisation laisse une ligne `[cheat]` dans la chronique. `pnpm start`,
Docker et tout ce qui tourne avec `NODE_ENV=production` ne l'activent jamais, et le serveur y refuse
les messages de triche.

## Architecture

```
src/shared/   moteur de règles, géométrie du plateau, bots et protocole réseau (sans DOM ni Three.js)
  board/        maths hexagonales, topologie, îles prédéfinies, îles aléatoires
  rules/        configuration, moteur, requêtes, masquage des vues, bots, personnages, événements, bâtiments
src/server/   serveur HTTP + WebSocket Node : salons, sièges, reconnexion, bots, fichiers
              statiques, comptes et base de données (db.ts, accounts.ts, api.ts), présence et
              invitations (hub.ts)
src/client/   interface Vite + Svelte 5 au-dessus d'une scène Three.js
  scene/        moteur voxel (mailleur avec AO précalculée, shader voxel biseauté), relief de l'île,
                pions, salle, éclairage, caméra, dés, particules, post-traitement, portraits
  ui/           accueil, salon, HUD, échanges, dialogues, tutoriel, comptes, pigeon voyageur
  offline/      serveur intégré à la page pour la version avec bots uniquement
tests/        moteur, salons, comptes, contenu Extended et parties complètes simulées entre bots
scripts/      captures d'écran, tests de bout en bout et outils de développement
```

- **Le serveur fait autorité.** Les clients envoient des actions ; le serveur les vérifie avec le
  moteur partagé et envoie à chaque joueur une vue expurgée. Les mains des autres deviennent de
  simples nombres, et la pioche et la graine des dés ne sont jamais envoyées.
- **Le moteur est pur.** `applyAction(state, player, action)` renvoie un nouvel état ainsi que des
  événements. Ces événements pilotent les animations, les sons et la chronique.
- **Les plateaux sont des données.** Un `Board` se compose d'hexagones (terrain et numéro) et de
  ports ; la topologie en est déduite, donc n'importe quelle forme fonctionne.
- **Le contenu est fait de données.** Les ressources, les terrains, les coûts et la pioche de cartes
  développement se trouvent dans `src/shared/rules/config.ts` ; personnages, événements et bâtiments
  ont chacun leur propre fichier.
- **Classic reste classique.** Toute nouveauté est conditionnée à `state.mode === 'extended'`, et un
  test vérifie que les parties Classic restent inchangées.

## Ajouter du contenu

- **Personnages :** `rules/characters.ts`. Les traits se branchent via `costOf`, `tradeRatios`,
  `discardLimit` et `longestRoadMin` dans `rules/queries.ts` ; les pouvoirs passent par l'action
  `usePower`, et les bots reçoivent une règle dans `bot.ts`. Les portraits sont des bustes en voxels
  dans `scene/portraits.ts`.
- **Événements :** `rules/events.ts` contient les cartes et leurs effets.
- **Bâtiments :** `rules/buildings.ts` liste les options de l'hôte ; les modèles se trouvent dans
  `scene/board/`.
- **Ressources et tuiles :** étendez `config.ts`, puis ajoutez le terrain dans
  `scene/board/terrain.ts` et les modèles dans `scene/board/models.ts`.
- **Plateaux :** les îles prédéfinies sont dessinées en texte dans `board/maps.ts` ;
  `generateBoard(tiles, rng)` distribue les tuiles sur n'importe quelle forme.
- **Textes et langues :** tout texte lu par le joueur passe par `t('English text')` de
  `src/client/i18n` ; le texte anglais sert de clé. Chaque langue est un fichier dans
  `src/client/i18n/locales` qui associe l'anglais à sa traduction, et tout ce qui manque s'affiche
  en anglais. `pnpm i18n` liste ce qui manque à chaque langue. Une nouvelle langue, c'est un
  nouveau fichier de locale plus une ligne dans `languages.ts`.
- **Tutoriel :** chaque fonctionnalité d'Extended a une page dans `ui/tutorial/` et une ligne dans
  `chapters.ts`.

## Tests

```bash
pnpm test         # moteur de règles, salons, comptes et parties complètes simulées entre bots
pnpm check        # vérifications Svelte et TypeScript
node scripts/e2e.mjs http://localhost:8787 test-results/e2e 300   # test de fumée dans le navigateur contre un serveur en marche
```

Définissez `TEST_DATABASE_URL` pour exécuter aussi les tests de comptes sur un vrai serveur Postgres.

## Licence

Le code de Reign est **ouvert à la lecture**, mais ce n'est pas un logiciel open source au sens de
l'OSI. Il est publié sous la [PolyForm Noncommercial License 1.0.0](LICENSE).

- ✅ Lisez le code, lancez-le et apprenez-en.
- ✅ Forkez-le, ouvrez des issues, signalez des bugs et proposez des pull requests.
- ✅ Utilisez-le à des fins personnelles, de loisir, de recherche ou d'enseignement.
- ❌ Pas d'usage commercial : interdit de le vendre, de le faire payer ou d'en tirer un jeu ou un
  service commercial.
- ❌ Gardez la ligne de copyright `Required Notice` et la licence dans chaque copie, et ne présentez
  pas Reign ni un fork comme votre propre œuvre.

En ouvrant une pull request, vous acceptez que votre contribution soit diffusée sous la même
licence. Pour tout ce que la licence n'autorise pas, comme un usage commercial, demandez d'abord à
l'auteur.

<div align="center">
<sub>Fait de voxels, de dés et de beaucoup de moutons. 🐑</sub>
</div>
