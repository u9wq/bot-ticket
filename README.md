# bot-ticket

Bot de tickets Discord, écrit en Node.js avec discord.js v14.

Il n'y a aucune commande slash. Les commandes se tapent avec un **préfixe
personnalisable par serveur** (`+` par défaut), et toute la configuration se fait
depuis un **panneau interactif** : interrupteurs pour activer ou désactiver les
fonctionnalités, menus pour choisir les salons et les rôles, formulaires pour
modifier les textes. Aucun fichier à éditer en dehors du token.

## Installation

1. Crée une application sur https://discord.com/developers/applications, onglet
   **Bot** : copie le token et active **MESSAGE CONTENT INTENT**.
2. Invite le bot avec les permissions *Gérer les salons*, *Gérer les rôles*,
   *Voir les salons*, *Envoyer des messages*, *Gérer les messages*,
   *Intégrer des liens*, *Joindre des fichiers* et *Lire l'historique*.
3. Installe et lance :

```bash
npm install
cp .env.example .env    # puis renseigne TOKEN
npm start
```

4. Sur ton serveur, tape `+setup`.

Node.js 18.17 ou plus récent. `npm run check` vérifie le projet hors ligne,
sans token (voir plus bas).

## Mise en route en 2 minutes

`+setup` ouvre le panneau de configuration. La page d'accueil affiche une liste
de contrôle ; chaque page s'atteint avec le menu en bas du panneau.

| Page | Contenu |
| --- | --- |
| **Général** | préfixe, couleur, format du nom des salons, message d'accueil, rôles staff |
| **Salons** | catégorie Discord des tickets, catégorie des tickets fermés, logs, transcriptions |
| **Ouverture** | interrupteurs : prise en charge, mention du staff, formulaire, limite par membre |
| **Fermeture** | interrupteurs : confirmation, raison, fermeture par le membre, archivage, transcription, transcription en privé, avis, fermeture automatique |
| **Catégories de tickets** | création, émoji, description, message d'accueil, rôles dédiés, catégorie Discord dédiée, formulaire de 5 questions, ordre, activation |
| **Panneau public** | textes, bannière, style menu ou boutons, publication dans un salon |

Une fois publié, le panneau public se met à jour tout seul à chaque
modification : pas besoin de le republier.

## Commandes

`+help` affiche l'aide interactive, `+help <commande>` le détail d'une commande.
Mentionner le bot fonctionne aussi à la place du préfixe (`@bot help`), utile
quand on l'a oublié.

| Commande | Accès | Rôle |
| --- | --- | --- |
| `setup [page]` | Admin | panneau de configuration (`+setup fermeture` ouvre directement une page) |
| `prefix [nouveau]` | Admin | affiche ou change le préfixe |
| `sendpanel [#salon]` | Admin | publie le panneau d'ouverture |
| `new [catégorie]` | Tous | ouvre un ticket sans passer par le panneau |
| `close [raison]` | Staff, ou l'auteur si autorisé | ferme le ticket |
| `reopen` | Staff | rouvre un ticket archivé |
| `delete` | Staff | supprime un ticket fermé |
| `claim` / `unclaim` | Staff | prend en charge / libère le ticket |
| `add` / `remove <@membre>` | Staff | donne ou retire l'accès à un membre |
| `rename <nom>` | Staff | renomme le salon |
| `transcript` | Staff | génère la transcription HTML |
| `blacklist add\|remove\|list` | Staff | empêche un membre d'ouvrir des tickets |
| `stats` | Staff | total, tickets ouverts, satisfaction, staff le plus actif |

**Accès.** *Admin* : permission « Gérer le serveur », propriétaire du serveur ou
identifiant listé dans `OWNERS`. *Staff* : rôles staff choisis dans `+setup`,
plus les rôles propres à la catégorie du ticket. Un admin est aussi staff.

## Cycle de vie d'un ticket

1. Le membre choisit une catégorie dans le panneau public. Si la catégorie a
   des questions et que le formulaire est activé, il les remplit d'abord.
2. Le salon est créé dans la catégorie Discord de la catégorie de ticket, ou à
   défaut dans celle des tickets. Seuls l'auteur, le staff et le bot le voient.
3. Le message d'accueil affiche les réponses au formulaire et les boutons
   *Fermer*, *Prendre en charge* et *Transcription*.
4. À la fermeture : transcription HTML dans le salon prévu, log, demande d'avis
   en privé si activée. Avec l'archivage, le salon est verrouillé (l'auteur
   perd l'accès) et déplacé dans la catégorie des fermés, avec les boutons
   *Rouvrir* et *Supprimer*. Sans archivage, il est supprimé après 5 secondes.

## Architecture

```
src/
  index.js            point d'entrée : charge tout, puis se connecte
  core/
    config.js         variables d'environnement
    db.js             schéma SQLite
    settings.js       réglages par serveur (un document JSON fusionné avec les défauts)
    perms.js          niveaux everyone / staff / admin
    commands.js       registre et répartiteur des commandes à préfixe
    router.js         aiguillage des boutons, menus et modales
    ui.js             construction des messages Components V2
    help.js           aide interactive
  tickets/
    service.js        logique métier : ouvrir, fermer, rouvrir, prendre en charge…
    store.js          tout le SQL des tickets, catégories et liste noire
    views.js          messages publiés (panneau public, ticket, ticket fermé, avis)
    publish.js        publication et mise à jour du panneau public
    transcript.js     transcription HTML
    logs.js           journal
    features.js       catalogue des fonctionnalités activables
  setup/
    views.js          pages du panneau de configuration
    edits.js          formulaires de modification et leur validation
  components/         un fichier par espace d'interactions : setup, ticket, rating, help
  commands/           une commande par fichier, rangées par groupe
  events/             écouteurs Discord
scripts/check.js      vérification hors ligne
```

### Les commandes à préfixe

Une commande est un fichier de `src/commands/<groupe>/` qui exporte un objet :

```js
export default {
	name: 'rename',
	aliases: ['renommer'],
	description: 'Renomme le salon du ticket',
	usage: '<nom>',
	level: 'staff',   // everyone | staff | admin
	ticket: true,     // doit être tapée dans un ticket
	async run({ guild, ticket, raw, args, reply }) { … }
};
```

Le répartiteur lit le préfixe du serveur, retrouve la commande par son nom ou
un alias, vérifie le niveau d'accès et, pour `ticket: true`, charge le ticket et
sa catégorie. Aucune commande ne répète ces contrôles. Les arguments entre
guillemets sont regroupés : `+new "Support technique"`.

### Les interactions

Chaque identifiant de composant suit la forme `espace:action:arg…`, par exemple
`setup:toggle:claim` ou `ticket:open:3`. Un fichier de `src/components/` déclare
un espace et ses actions, et le routeur appelle la bonne fonction.

Tout l'état tient dans l'identifiant : pas de collecteur, pas de délai
d'expiration. Un panneau posté il y a trois semaines fonctionne encore après
un redémarrage. Le niveau d'accès est revérifié **à chaque clic** : un panneau
de configuration oublié dans un salon ne donne rien à qui n'est pas admin.

### Ajouter une fonctionnalité activable

1. Ajouter la clé dans `DEFAULTS.features` (`src/core/settings.js`).
2. Ajouter son entrée dans `src/tickets/features.js` (libellé, description,
   page *open* ou *close*).
3. Lire `settings.features.<clé>` là où elle s'applique, dans `service.js`.

L'interrupteur apparaît tout seul dans `+setup`.

### Choix techniques

- **better-sqlite3** plutôt que sqlite3 : API synchrone, sans callback. Pour des
  requêtes locales de quelques microsecondes, c'est plus simple et plus rapide,
  et les transactions sont de simples fonctions (numérotation des tickets
  sans doublon, réordonnancement des catégories).
- **Réglages en un document JSON par serveur** : ajouter un réglage ne demande
  aucune migration, les serveurs existants héritent de la valeur par défaut.
- **Components V2** : texte, boutons et menus vivent dans le même cadre. Limite
  de 40 composants par message, d'où les fonctionnalités réparties sur deux
  pages ; `npm run check` vérifie cette limite sur chaque page.
- **Fermeture atomique** : le ticket passe à « fermé » en base avant tout le
  reste, par une requête conditionnelle. Deux clics simultanés sur *Fermer*
  ne produisent qu'une seule fermeture et une seule transcription.

## Vérification

```bash
npm run check
```

Sans connexion à Discord ni token, sur une base jetable : charge tous les
modules, construit chaque page et chaque message sur un faux serveur (limite de
40 composants, validation des builders), teste la base de données et simule des
clics sur le panneau de configuration, y compris par un non-admin.
