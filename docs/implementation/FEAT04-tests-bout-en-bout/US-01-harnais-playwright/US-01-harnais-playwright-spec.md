# US-01 — Un harnais Playwright sur une base jetable

[← Fonctionnalité](../README.md)

| | |
|---|---|
| **Fonctionnalité** | Tests de bout en bout |
| **Statut** | approved |
| **Nature** | enabler |
| **Dépend de** | — |
| **Bloque** | [cycle-de-vie-livre-copie / US-06](../../cycle-de-vie-livre-copie/US-06-ecran-archive.md) |
| **Portée** | front (outillage de test) · scripts de base · docs |
| **Casse l'existant ?** | Non — une dépendance de développement et une commande s'ajoutent ; ni la base de développement ni un backend déjà lancé ne sont touchés |

---

## Objectif

Rendre possible, par une seule commande du projet, un test qui ouvre
l'application dans Chromium, s'y connecte avec un compte d'un rôle donné et
observe l'écran — contre un vrai backend et un vrai frontend branchés sur une
base jetable, reconstruite à chaque exécution. Tant que ce harnais n'existe pas,
aucun scénario d'interface ne peut devenir un test automatisé, et US-06 ne peut
pas tenir le critère permanent « chaque scénario a un test ».

## Contexte

Le niveau est déclaré absent :

```markdown
<!-- .claude/spec/conventions.md -->
| end-to-end | the app in a browser, as a librarian or admin drives it, against the real backend | — | `missing` (proposed: Playwright) |
```

et les instructions du projet interdisent aujourd'hui d'en faire une dépendance :

```markdown
<!-- .claude/CLAUDE.md -->
- **Playwright is allowed** for verifying UI — installing it (Chromium included) and
  driving a headless browser against `npm run dev` need no confirmation. It is not a
  project dependency: run it outside `web/package.json` (e.g. `npx` from a scratch
  directory) rather than adding it there, unless asked.
```

`web/package.json` n'a aucun script de test (`dev`, `build`, `preview`,
`start`, `lint`, `format`, `prepare`, `analyze`).

Ce qui existe déjà et sur quoi un harnais peut s'appuyer :

```js
// web/vite.config.js
const apiTarget = process.env.BOOKSNAP_API_ORIGIN || 'http://127.0.0.1:8080';
...
  server: {
    port: 5000,
    strictPort: true,
```

```properties
# server/src/main/resources/application.properties
spring.datasource.url=jdbc:postgresql://${DB_HOST:localhost}:${DB_PORT:5432}/${POSTGRES_DB}?stringtype=unspecified
```

```bash
# server/scripts/load-dev-fixtures.sh
Usage: load-dev-fixtures.sh [--database NAME] [--yes]
```

Les fixtures (`server/sql/seed.sql`) créent notamment Alice Martin, Bob Johnson
et Clara Dupont (`alice.martin@example.com`, `bob.johnson@example.com`,
`clara.dupont@example.com`), sans mot de passe et au rôle `user` par défaut
(`V7`). Le [socle commun du cycle de vie](../../cycle-de-vie-livre-copie/README.md#socle-commun-de-vérification)
fait déjà d'Alice l'administratrice et de Bob le bibliothécaire.

| Couche | Ce qui se passe aujourd'hui |
|---|---|
| Front | Aucun test, aucun lanceur de tests |
| Base | Une seule base de travail, celle du développeur ; les tests back y écrivent déjà (`conventions.md`, « Back integration hazard ») |
| Docs | `CLAUDE.md` et `conventions.md` disent que Playwright n'est pas une dépendance et que le niveau manque |

---

## Décisions et non-objectifs

Celles de la [fonctionnalité](../README.md#décisions-qui-valent-pour-toute-la-fonctionnalité)
s'appliquent : Playwright dépendance du projet, base jetable, interception
réservée aux états que les données réelles ne garantissent pas.

- **Playwright est une dépendance de développement de `web/`**, lancée par un
  script npm de `web/`. C'est là que vivent le frontend, son `node_modules` et
  son lint.
- **Chaque exécution reconstruit sa base jetable**, schéma par Flyway puis
  fixtures, et **la laisse en place à la fin**, pour qu'un échec puisse être
  examiné en psql. Rejeté : la supprimer à la fin, ce qui effacerait justement
  l'état qu'on veut regarder après un test rouge.
- **Le harnais lance son propre backend et son propre frontend**, sur des ports
  qui ne sont ni `:8080` ni `:5000`, et les arrête à la fin. Rejeté : réutiliser
  le backend de l'IDE, branché sur la base de développement.
- **Trois comptes, un par rôle**, tirés des fixtures et dotés d'un mot de passe
  connu des tests : Alice Martin `admin`, Bob Johnson `librarian`, Clara Dupont
  `user` — les mêmes personnes que le socle commun du cycle de vie.
- **Assumé, non confirmé** : Chromium seul.

**Hors périmètre de cette story** : tout test de fonctionnalité au-delà de la
connexion (chaque story écrit les siens) ; l'intégration continue ; le niveau
« front component ».

---

## Scénarios

### Scenario: un administrateur se connecte et se voit nommé

```gherkin
Given la base jetable construite par le harnais
When Alice Martin se connecte avec son adresse et le mot de passe des tests
Then la navigation affiche "Alice Martin"
```

### Scenario: chaque rôle a son compte de test

```gherkin
Given la base jetable construite par le harnais
When Bob Johnson, puis Clara Dupont, se connectent avec le mot de passe des tests
Then la navigation affiche "Bob Johnson", puis "Clara Dupont"
And le rôle renvoyé par /api/v1/auth/me est "librarian" pour Bob et "user" pour Clara
```

### Scenario: une exécution repart d'une base neuve

```gherkin
Given une exécution précédente a créé un livre dans la base jetable
When le harnais est relancé
Then ce livre n'existe plus dans la base jetable au début des tests
```

---

## Critères d'acceptation

- [ ] Playwright figure dans les `devDependencies` de `web/package.json` ; un
  script npm de `web/` lance toute la suite de bout en bout, et sort en échec
  dès qu'un test échoue.
- [ ] La commande ne demande rien d'autre que `docker compose up -d db` au
  préalable : elle construit la base, lance backend et frontend, joue les tests,
  arrête ce qu'elle a lancé.
- [ ] La base jetable est distincte de `$POSTGRES_DB`, dans le même conteneur
  `booksnap-postgres` ; le nombre de lignes de `book`, `copy`, `users` et
  `lifecycle_event` de la base de développement est identique avant et après une
  exécution.
- [ ] Un processus déjà à l'écoute sur `:8080` ou `:5000` n'est ni arrêté ni
  utilisé ; le harnais lance le backend depuis `server/` avec `./mvnw`
  (`.claude/CLAUDE.md`).
- [ ] Les tests sont des tests Playwright en JavaScript, nommés
  `US-NN: <titre du scénario>` ; ceux de cette story `US-01: …`.
- [ ] `npm run lint` dans `web/` ne signale aucune nouvelle erreur, fichiers de
  test compris.
- [ ] `.claude/CLAUDE.md` : la puce Playwright dit que c'est une dépendance du
  projet et donne la commande ; la section « Running locally » mentionne la
  suite de bout en bout.
- [ ] `.claude/spec/conventions.md` : la ligne « end-to-end » donne le harnais
  et son emplacement au lieu de `missing` ; « End-to-end setup » et « Back
  integration hazard » disent que la suite de bout en bout tourne sur la base
  jetable.
- [ ] Les fichiers produits par une exécution (rapports, traces) sont ignorés
  par git.
- [ ] Aucun `prettier --write` ni `npm run format` n'a été lancé.
- [ ] Les commentaires du code sont en anglais et limités à ce que le code ne
  peut pas dire.

---

## Vérification de bout en bout

**Préparation** : `docker compose up -d db`. Si possible, laisser le backend de
l'IDE tourner sur `:8080` pour vérifier qu'il n'est pas dérangé. Noter les
comptes de la base de développement :

```sql
SELECT (SELECT count(*) FROM book), (SELECT count(*) FROM copy),
       (SELECT count(*) FROM users), (SELECT count(*) FROM lifecycle_event);
```

1. Lancer la suite de bout en bout depuis `web/` → les tests `US-01: …`
   passent, la commande sort en succès.
2. Rejouer la requête de comptage sur la base de développement → mêmes valeurs.
3. Le backend de l'IDE répond toujours sur `:8080`
   (`curl -s localhost:8080/actuator/health`).
4. Ouvrir psql sur la base jetable → elle existe encore, avec les fixtures et
   les trois rôles posés (`SELECT email, role FROM users WHERE email LIKE
   'alice%' OR email LIKE 'bob%' OR email LIKE 'clara%';`).
5. Casser volontairement l'attendu d'un test (un autre nom attendu) et relancer
   → la commande sort en échec et nomme le test. Rétablir.
6. `npm run lint` dans `web/` → aucune nouvelle erreur.

**Nettoyage** : rien à faire ; la base jetable est reconstruite à la prochaine
exécution. Elle peut être supprimée en psql si on le souhaite.

---

## Points de vigilance

- **`strictPort: true` dans `vite.config.js`.** Le serveur Vite échoue au lieu
  de changer de port si `:5000` est pris — par le `npm run dev` du développeur,
  justement. Le frontend du harnais doit recevoir son propre port, et son proxy
  la cible du backend du harnais (`BOOKSNAP_API_ORIGIN` existe pour ça).
- **spring-dotenv lit `server/.env` depuis le répertoire de travail**
  (`.claude/CLAUDE.md`). Lancé ailleurs que depuis `server/`, le backend démarre
  sans identifiants de base ; lancé depuis `server/` sans surcharge, il se
  branche sur la base de développement. Il faut les deux : `server/` et la base
  jetable.
- **`?stringtype=unspecified` doit survivre** à toute surcharge de l'URL de la
  base : sans lui la connexion par e-mail devient sensible à la casse sans
  aucune erreur.
- **Ne pas lancer `server/sql/reset.sql` seul**, même sur la base jetable : il
  vide Dewey, que Flyway ne repeuple pas. Une base reconstruite de zéro, ou
  `reset-dev-db.sh --database …`, évite le problème.
- **Les fixtures n'ont pas de mot de passe.** Poser un mot de passe se fait
  dans la base jetable seulement ; un compte de la base de développement qui
  gagnerait un mot de passe de test serait une porte ouverte.
- **`class-methods-use-this` échoue déjà sur plusieurs fichiers** : vérifier
  qu'une erreur de lint est la sienne avant de la corriger.
