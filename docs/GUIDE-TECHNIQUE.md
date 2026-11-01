# Guide Technique - Booksnap

> Documentation technique complète : démarrage, développement local et architecture Docker.

---

## Table des Matières

- [Guide Technique - Booksnap](#guide-technique---booksnap)
  - [Table des Matières](#table-des-matières)
  - [1. Démarrage Rapide](#1-démarrage-rapide)
    - [Prérequis](#prérequis)
    - [Lancer l'application (Production)](#lancer-lapplication-production)
    - [URLs des services](#urls-des-services)
    - [Connexion à la base de données via pgAdmin](#connexion-à-la-base-de-données-via-pgadmin)
      - [Depuis pgAdmin Docker (par défaut)](#depuis-pgadmin-docker-par-défaut)
      - [Depuis un client sur l'hôte](#depuis-un-client-sur-lhôte-dbeaver-psql-pgadmin-installé-localement)
      - [Si la connexion échoue](#si-la-connexion-échoue)
  - [2. Développement Local](#2-développement-local)
    - [Workflow Recommandé : Hybride](#workflow-recommandé--hybride)
    - [Option 1 : DB Docker + Code Local (Recommandé)](#option-1--db-docker--code-local-recommandé)
      - [Terminal 1 - Base de données](#terminal-1---base-de-données)
      - [Terminal 2 - Backend](#terminal-2---backend)
      - [Terminal 3 - Frontend](#terminal-3---frontend)
      - [Avantages de cette approche](#avantages-de-cette-approche)
    - [Charger les fixtures de développement](#charger-les-fixtures-de-développement)
    - [Environnement des vérifications de bout en bout](#environnement-des-vérifications-de-bout-en-bout)
      - [Mise en place](#mise-en-place)
      - [Repartir de zéro](#repartir-de-zéro)
      - [À savoir](#à-savoir)
    - [Tests de bout en bout automatisés (Playwright)](#tests-de-bout-en-bout-automatisés-playwright)
    - [Option 2 : Tout en Docker (Simulation Production)](#option-2--tout-en-docker-simulation-production)
      - [Quand utiliser cette option ?](#quand-utiliser-cette-option-)
    - [Comparaison des Approches](#comparaison-des-approches)
    - [Résumé : Quel Workflow Choisir ?](#résumé--quel-workflow-choisir-)
    - [Configuration IDE](#configuration-ide)
      - [IntelliJ IDEA (Backend)](#intellij-idea-backend)
      - [VS Code (Frontend)](#vs-code-frontend)
  - [3. Architecture Docker](#3-architecture-docker)
    - [Structure des fichiers](#structure-des-fichiers)
    - [Relation entre les fichiers](#relation-entre-les-fichiers)
      - [docker-compose.yml référence les Dockerfiles](#docker-composeyml-référence-les-dockerfiles)
    - [Flux de construction](#flux-de-construction)
    - [Orchestration (docker-compose)](#orchestration-docker-compose)
      - [Comparaison Dockerfile vs docker-compose](#comparaison-dockerfile-vs-docker-compose)
    - [Communication entre services](#communication-entre-services)
      - [Injection des variables](#injection-des-variables)
  - [4. Choix Techniques](#4-choix-techniques)
    - [Pourquoi Vite ?](#pourquoi-vite-)
      - [Le problème sans bundler](#le-problème-sans-bundler)
      - [Avantages de Vite](#avantages-de-vite)
      - [Commandes Vite](#commandes-vite)
      - [Quand exécuter `npm run build` ?](#quand-exécuter-npm-run-build-)
      - [Flux développement → production](#flux-développement--production)
    - [Pourquoi Nginx ?](#pourquoi-nginx-)
      - [Besoins d'une SPA en production](#besoins-dune-spa-en-production)
      - [Avantages de Nginx](#avantages-de-nginx)
      - [Configuration SPA (nginx.conf)](#configuration-spa-nginxconf)
  - [5. Référence des Commandes](#5-référence-des-commandes)
    - [Commandes Docker](#commandes-docker)
    - [Commandes Backend (Maven)](#commandes-backend-maven)
    - [Commandes Frontend (Vite)](#commandes-frontend-vite)
    - [Cheatsheet Rapide](#cheatsheet-rapide)

---

## 1. Démarrage Rapide

### Prérequis

| Outil | Version | Requis pour |
|-------|---------|-------------|
| Docker | 20+ | Production / DB locale |
| Docker Compose | 2.0+ | Orchestration services |
| Java | 17+ | Développement backend |
| Maven | 3.9+ | Build backend |
| Node.js | 20+ | Développement frontend |

### Lancer l'application (Production)

```bash
# 1. Cloner le projet
git clone <repo-url>
cd booksnap

# 2. Copier la configuration
cp .env.example .env

# 3. Lancer tous les services
docker compose up --build

# Le schéma est créé automatiquement par Flyway au démarrage du backend.
# La base est vide : voir "Charger les fixtures de développement" ci-dessous
# pour la peupler.
```

### URLs des services

| Service | URL | Description |
|---------|-----|-------------|
| **Frontend (stack Docker)** | http://localhost:3000 | Conteneur nginx, `${FRONTEND_PORT:-3000}` |
| **Frontend (`npm run dev`)** | http://localhost:5000 | Serveur de dév Vite, `strictPort: true` |
| **Backend API** | http://localhost:8080 | API REST Spring Boot |
| **pgAdmin** | http://localhost:5050 | Interface base de données |

> Les deux frontends n'écoutent **pas** sur le même port. Le conteneur nginx de
> `docker compose up` est publié sur `3000` ; le serveur de dév Vite, lui, est fixé sur
> `5000`. Au quotidien seule la base
> vient de compose : c'est donc `5000` qu'on ouvre.

### Connexion à la base de données via pgAdmin

> **Trois mots de passe différents** interviennent ici. Les confondre est de loin
> l'erreur la plus fréquente :
>
> | Étape | Identifiants | Source |
> |-------|--------------|--------|
> | 1. Se connecter à l'UI pgAdmin | `PGADMIN_DEFAULT_EMAIL` / `PGADMIN_DEFAULT_PASSWORD` | `.env` |
> | 2. *Master password* pgAdmin | choisi par vous au tout premier lancement | à mémoriser |
> | 3. Se connecter au serveur PostgreSQL | `POSTGRES_USER` / `POSTGRES_PASSWORD` | `.env` |
>
> L'étape 3 n'accepte **ni** le mot de passe pgAdmin de l'étape 1, **ni** le master
> password de l'étape 2, **ni** les valeurs de `.env.example` (`changeme…`) : c'est
> `POSTGRES_PASSWORD` tel qu'il est dans **votre** `.env`.

1. Lancer les services : `docker compose up -d db pgadmin`
2. Ouvrir pgAdmin : http://localhost:5050 (port = `PGADMIN_PORT`)
3. Se connecter avec `PGADMIN_DEFAULT_EMAIL` / `PGADMIN_DEFAULT_PASSWORD` (`.env`)
4. Au premier lancement, pgAdmin demande de définir un **master password** : il chiffre
   les mots de passe de connexion enregistrés, il est local à pgAdmin et n'a aucun
   rapport avec PostgreSQL
5. Clic droit sur "Servers" → "Register" → "Server..."
6. Configurer la connexion :

#### Depuis pgAdmin Docker (par défaut)

pgAdmin tourne **dans** le réseau `booksnap-network` : il joint PostgreSQL par son nom
de service `db` sur le port **interne** 5432, pas par le port publié sur l'hôte.

| Onglet | Champ | Valeur |
|--------|-------|--------|
| **General** | Name | `booksnap` (ou autre nom de votre choix) |
| **Connection** | Host name/address | `db` |
| **Connection** | Port | `5432` |
| **Connection** | Maintenance database | `booksnap_db` (= `POSTGRES_DB`) |
| **Connection** | Username | `booksnap` (= `POSTGRES_USER`) |
| **Connection** | Password | valeur de `POSTGRES_PASSWORD` dans `.env` |

> **Attention** : depuis ce conteneur, `localhost` désigne *pgAdmin lui-même*, pas la
> base. Utiliser `db`.

#### Depuis un client sur l'hôte (DBeaver, psql, pgAdmin installé localement)

Là c'est l'inverse : on passe par le port publié, celui de `DB_PORT` dans `.env`
(**5433** dans la configuration locale actuelle, pas 5432).

| Champ | Valeur |
|-------|--------|
| Host | `localhost` |
| Port | `${DB_PORT}` de `.env` |
| Database / User / Password | idem tableau ci-dessus |

```bash
# Vérifier les identifiants sans passer par une UI
docker exec -e PGPASSWORD="$POSTGRES_PASSWORD" booksnap-postgres \
  psql -h db -U booksnap -d booksnap_db -c 'select current_user'
```

> Le `-h db` n'est pas décoratif : sans lui, `psql` passe par la socket Unix, que
> `pg_hba.conf` accepte en `trust`. La connexion réussit alors **même avec un mauvais
> mot de passe** et ne prouve rien.

#### Si la connexion échoue

| Symptôme | Cause | Correctif |
|----------|-------|-----------|
| `password authentication failed for user "booksnap"` (HTTP 401 dans les logs pgAdmin) | mauvais mot de passe saisi à l'étape 3 | reprendre `POSTGRES_PASSWORD` dans `.env` |
| Idem, alors que `.env` semble correct | le volume `booksnap-db-data` a été initialisé avec un **ancien** mot de passe — `POSTGRES_PASSWORD` n'agit qu'au tout premier démarrage sur un volume neuf | `ALTER USER booksnap PASSWORD '…';` ou `docker compose down -v` (perd les données) |
| `could not translate host name "db"` | client hors du réseau Docker | utiliser `localhost` + `DB_PORT` |
| `Connection refused` sur `localhost:5432` | le port publié est `DB_PORT` (5433) | corriger le port |
| Le serveur enregistré a disparu | le service `pgadmin` n'a pas de volume : `docker compose down` efface `/var/lib/pgadmin` | ré-enregistrer, ou ajouter un volume au service |

```bash
# Voir l'erreur exacte renvoyée par PostgreSQL
docker logs --tail 30 booksnap-pgadmin
```

---

## 2. Développement Local

### Workflow Recommandé : Hybride

```
┌─────────────────────────────────────────────────────────────────┐
│                   DÉVELOPPEMENT QUOTIDIEN                        │
│                                                                 │
│   ┌─────────────┐     ┌─────────────┐     ┌─────────────┐      │
│   │  PostgreSQL │     │   Backend   │     │  Frontend   │      │
│   │   (Docker)  │◄────│   (Local)   │◄────│   (Local)   │      │
│   │   :5432     │     │   :8080     │     │   :5000     │      │
│   └─────────────┘     └─────────────┘     └─────────────┘      │
│         ▲                   ▲                   ▲               │
│         │                   │                   │               │
│   docker compose         IntelliJ IDEA       npm run dev       │
│   up db                  (Run/Debug)           (Vite)          │
└─────────────────────────────────────────────────────────────────┘
```

**Avantage** : Base de données isolée + Hot Reload complet pour le code

---

### Option 1 : DB Docker + Code Local (Recommandé)

#### Terminal 1 - Base de données
```bash
# Lancer PostgreSQL + pgAdmin
docker compose up db pgadmin
```

#### Terminal 2 - Backend

Lancer **depuis IntelliJ IDEA** (voir [Configuration IDE](#configuration-ide)), ou en
ligne de commande avec le wrapper Maven — il n'y a pas de Maven sur le PATH, et le
wrapper se lance **depuis `server/`** : spring-dotenv lit `server/.env` dans le
répertoire courant, c'est de là que viennent les identifiants de la base.

```bash
cd server && ./mvnw spring-boot:run
```

> **Note** : Les variables d'environnement (`DB_HOST`, `POSTGRES_USER`, etc.) doivent être configurées dans votre IDE. Voir la section [Configuration IDE](#configuration-ide).
>
> C'est ce démarrage-là, depuis l'IDE, qui joue les migrations Flyway
> (`server/src/main/resources/db/migration`) et crée le schéma.

#### Terminal 3 - Frontend
```bash
cd web

# Installer les dépendances (première fois)
npm install

# Lancer avec Hot Reload
npm run dev

# Ouvrir http://localhost:5000
```

#### Avantages de cette approche
- DB isolée et réinitialisable (`docker compose down -v`)
- Schéma créé automatiquement par Flyway au premier démarrage du backend
- pgAdmin disponible pour debug
- Hot Reload complet (frontend ET backend)

---

### Charger les fixtures de développement

Contrairement à l'ancien `schema.sql`/`dewey.sql`/`seed.sql` monté dans
`/docker-entrypoint-initdb.d/`, **rien ne peuple la base automatiquement**. Le
volume `booksnap-db-data` démarre vide ; Flyway construit le schéma au premier
démarrage du backend, puis les fixtures se chargent à la main :

```bash
# Une fois le backend démarré au moins une fois sur un volume neuf
server/scripts/load-dev-fixtures.sh
```

Pour revenir à l'état des fixtures après avoir sali les données (sans toucher
au schéma ni au volume) :

```bash
server/scripts/reset-dev-db.sh
```

`reset-dev-db.sh` vide les tables métier, recharge les données de référence
Dewey depuis `V2__dewey_reference_data.sql`, puis rejoue `seed.sql` et
`covers.sql`. Ne pas jouer `server/sql/reset.sql` seul — il ne vide ni Dewey ni
`cover`, ce que `reset-dev-db.sh` gère. Les deux scripts acceptent
`--database NOM` et `--yes`.

---

### Environnement des vérifications de bout en bout

Chaque spec (`docs/implementation/…/US-NN-…-spec.md`) se termine par une
section **Vérification de bout en bout** : un parcours manuel dans le
navigateur, avec Alice (admin), Bob (bibliothécaire) et Clara (élève). Ce
parcours se joue sur la **base jetable `booksnap_e2e`**, pas sur la base de
développement : les prêts et les réservations laissent des lignes définitives
dans `lifecycle_event`, et les comptes Alice/Bob/Clara n'existent que là.

L'environnement tourne sur ses propres ports, **`:8180`** (backend) et
**`:5180`** (frontend). Il ne touche ni à `:8080`, ni à `:5000`, ni à la base de
développement : un backend lancé depuis IntelliJ peut continuer à tourner à
côté.

#### Mise en place

```bash
# 0. La base du conteneur
docker compose up -d db

# 1. Terminal 1 — backend sur :8180. Le script supprime et recrée
#    booksnap_e2e, puis Flyway y construit le schéma au démarrage.
cd server
BOOKSNAP_E2E_BACKEND_PORT=8180 scripts/run-e2e-backend.sh --database booksnap_e2e

# 2. Terminal 2 — une fois le backend démarré
#    (curl http://127.0.0.1:8180/actuator/health répond UP)
server/scripts/load-dev-fixtures.sh --database booksnap_e2e --yes
BOOKSNAP_E2E_PASSWORD=<mot de passe> server/scripts/load-e2e-accounts.sh --database booksnap_e2e

# 3. Terminal 2 — frontend sur :5180, avec un proxy /api vers :8180
cd web
BOOKSNAP_API_ORIGIN=http://127.0.0.1:8180 npx vite --port 5180 --strictPort
```

Le mot de passe est la constante `E2E_PASSWORD` de
`web/test/e2e/support/accounts.js`, partagée par les trois comptes.

Ouvrir ensuite **http://localhost:5180**. Pour jouer deux personnes à la fois
(Alice et Bob), ouvrir un second navigateur ou une fenêtre privée : la session
est un cookie, une seule par navigateur.

| Personne | Rôle | Email |
|---|---|---|
| Alice Martin | admin | `alice.martin@example.com` |
| Bob Johnson | librarian | `bob.johnson@example.com` |
| Clara Dupont | user (élève) | `clara.dupont@example.com` |

Les fixtures contiennent aussi six autres élèves (Daniel Smith, Emma Wilson…),
10 livres et 20 copies. Ces élèves n'ont pas de mot de passe : ils servent de
cibles (emprunteurs, doublons d'email…), on ne se connecte pas avec. Quand une
vérification a besoin d'un état particulier (un second administrateur, par
exemple), la spec indique la requête à jouer dans `psql` :

```bash
docker exec -it booksnap-postgres sh -c 'psql -U "$POSTGRES_USER" -d booksnap_e2e'
```

#### Repartir de zéro

Arrêter le backend (Ctrl+C dans le terminal 1), puis rejouer les étapes 1 et 2 :
la base est recréée vide à chaque lancement de `run-e2e-backend.sh`. Vite peut
continuer à tourner.

Il n'y a donc **rien à nettoyer** après une vérification sur `booksnap_e2e`.

#### À savoir

- **La suite automatique utilise les mêmes ports et la même base.**
  `npm run test:e2e` refuse de démarrer si `:8180` ou `:5180` sont occupés, et
  recrée `booksnap_e2e` à chaque exécution. Arrêter l'environnement manuel avant
  de lancer la suite, et inversement.
- **Le backend lancé par le script se recompile** à chaque démarrage : il
  reflète donc le code courant de la branche. Après une modification du
  backend, il faut le relancer (étapes 1 et 2). Vite, lui, recharge le front à
  chaud.
- **Fixtures d'abord, comptes ensuite, après chaque démarrage du backend.**
  `load-e2e-accounts.sh` ne crée pas d'utilisateurs : il donne un rôle et un mot
  de passe à Alice, Bob et Clara, qui viennent des fixtures. S'il répond
  `expected 3 local accounts … found 0`, les fixtures ne sont pas chargées :
  soit l'étape a été sautée, soit le backend a été relancé depuis, ce qui
  recrée la base vide.
- **Pas de compte admin de bootstrap** sur cette base : le script le désactive,
  car les fixtures apportent leurs propres comptes.
- **Port déjà pris** : `ss -ltnp | grep -E '8180|5180'` montre le processus,
  souvent un reste d'une exécution interrompue. Attention : `run-e2e-backend.sh`
  recrée la base **avant** que Spring ne découvre que le port est occupé. Un
  lancement en double vide donc `booksnap_e2e` sous le backend déjà en place.
  Arrêter les deux, puis tout relancer (étapes 1 et 2).

---

### Tests de bout en bout automatisés (Playwright)

Les scénarios des specs sont aussi écrits comme tests Playwright dans
`web/test/e2e/`. La suite monte elle-même l'environnement décrit ci-dessus
(même base jetable, mêmes ports, mêmes comptes), puis l'arrête à la fin :

```bash
cd web

# Toute la suite (installe Chromium au premier lancement)
npm run test:e2e

# Un seul fichier
npx playwright test edit-account.spec.js

# Les tests d'une US, ou un test par son titre
npx playwright test -g "US-03"
npx playwright test -g "correcting a name"

# Mode interactif, pour voir le navigateur et rejouer pas à pas
npx playwright test --ui
```

Après un échec : `npx playwright show-report` affiche le rapport HTML, et
`web/test-results/` contient une trace par test en échec (DOM, réseau, console),
à ouvrir avec `npx playwright show-trace <fichier>.zip`. La base `booksnap_e2e`
reste en place après l'exécution, on peut l'inspecter avec `psql`.

---

### Option 2 : Tout en Docker (Simulation Production)

```bash
# Construire et lancer tous les services
docker compose up --build
```

#### Quand utiliser cette option ?
- Tester l'intégration complète avant un commit
- Vérifier que les Dockerfiles fonctionnent
- Démonstration à un collègue/recruteur
- Debug d'un problème spécifique à Docker

---

### Comparaison des Approches

| Critère | DB Docker + Code Local | Tout Docker |
|---------|------------------------|-------------|
| **Vitesse itération** | Rapide | Lente |
| **Hot Reload** | Complet | Limité |
| **Proche production** | Moyen | Excellent |
| **Setup initial** | Simple | Très simple |
| **Reset DB** | `reset-dev-db.sh` (données) ou `down -v` (volume) | `down -v && up` |

---

### Résumé : Quel Workflow Choisir ?

```
┌─────────────────────────────────────────────────────────────────┐
│                                                                 │
│   Développement quotidien ?                                     │
│          │                                                      │
│          ▼                                                      │
│   ┌──────────────┐                                              │
│   │ docker       │ + IDE pour backend + npm run dev             │
│   │ compose up db│                                              │
│   └──────────────┘                                              │
│                                                                 │
│   Tester avant commit ?                                         │
│          │                                                      │
│          ▼                                                      │
│   ┌──────────────────────┐                                      │
│   │ docker compose up    │  Vérifie que tout fonctionne         │
│   │ --build              │  ensemble comme en production        │
│   └──────────────────────┘                                      │
│                                                                 │
│   Démo / Production ?                                           │
│          │                                                      │
│          ▼                                                      │
│   ┌──────────────────────┐                                      │
│   │ docker compose up    │  One-liner pour lancer l'application           │
│   └──────────────────────┘                                      │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

### Configuration IDE

#### IntelliJ IDEA (Backend)

1. Ouvrir le dossier `server/` comme projet Maven
2. Configurer les variables d'environnement de la Run Configuration. **Reprendre les
   valeurs de votre `.env`**, ne pas recopier celles ci-dessous à l'aveugle :
   ```
   DB_HOST=localhost
   DB_PORT=5433          # = DB_PORT dans .env : le port publié sur l'hôte, pas 5432
   POSTGRES_USER=booksnap
   POSTGRES_PASSWORD=…   # = POSTGRES_PASSWORD dans .env
   POSTGRES_DB=booksnap_db
   ```
   Le backend lancé depuis l'IDE tourne **hors** de Docker : il joint la base par
   `localhost:${DB_PORT}`, contrairement au conteneur `backend` qui utilise `db:5432`.
3. Lancer `BooksnapApplication.java` avec le bouton Run

#### VS Code (Frontend)

1. Ouvrir le dossier `web/`
2. Installer l'extension "Lit Plugin"
3. Terminal intégré : `npm run dev`

---

## 3. Architecture Docker

### Structure des fichiers

```
booksnap/
├── docker-compose.yml      # Orchestrateur des services
├── .env.example            # Template des variables d'environnement
├── server/
│   ├── Dockerfile          # Build backend (Maven → JAR → JRE)
│   ├── src/main/resources/db/migration/  # Migrations Flyway (schéma, source de vérité)
│   │   ├── V1__baseline_schema.sql
│   │   ├── V2__dewey_reference_data.sql
│   │   ├── V3__drop_orphan_enum_types.sql
│   │   ├── V4__users_email_citext.sql
│   │   └── V5__auth_identity.sql
│   └── sql/                # Scripts de développement, joués à la main
│       ├── seed.sql        # Données de démonstration
│       ├── covers.sql      # Couvertures des livres seedés
│       └── reset.sql       # Vidage des tables métier (via reset-dev-db.sh)
└── web/
    ├── Dockerfile          # Build frontend (npm → Vite → Nginx)
    └── nginx.conf          # Configuration serveur web
```

### Relation entre les fichiers

| Fichier | Responsabilité |
|---------|----------------|
| `server/Dockerfile` | **Comment** construire l'image backend |
| `web/Dockerfile` | **Comment** construire l'image frontend |
| `docker-compose.yml` | **Comment** exécuter tout ensemble |

#### docker-compose.yml référence les Dockerfiles

```yaml
backend:
  build:
    context: ./server          # Pointe vers server/
    dockerfile: Dockerfile     # Utilise server/Dockerfile

frontend:
  build:
    context: ./web             # Pointe vers web/
    dockerfile: Dockerfile     # Utilise web/Dockerfile
    args:
      VITE_API_BASE_URL: ...   # Argument de build
```

---

### Flux de construction

```
                    docker compose up --build
                              │
              ┌───────────────┴───────────────┐
              ▼                               ▼
    ┌─────────────────────┐         ┌─────────────────────┐
    │  server/Dockerfile  │         │   web/Dockerfile    │
    ├─────────────────────┤         ├─────────────────────┤
    │ Stage 1: Maven      │         │ Stage 1: Node       │
    │  - pom.xml          │         │  - npm install      │
    │  - mvn package      │         │  - vite build       │
    ├─────────────────────┤         ├─────────────────────┤
    │ Stage 2: JRE        │         │ Stage 2: Nginx      │
    │  - Copie JAR        │         │  - Copie dist/      │
    │  - Lance l'app      │         │  - Sert les assets  │
    └─────────────────────┘         └─────────────────────┘
              │                               │
              ▼                               ▼
    ┌─────────────────────┐         ┌─────────────────────┐
    │  booksnap-backend   │         │  booksnap-frontend  │
    │     container       │         │     container       │
    └─────────────────────┘         └─────────────────────┘
              │                               │
              └───────────────┬───────────────┘
                              ▼
                   ┌─────────────────────┐
                   │  booksnap-network   │
                   │   (réseau partagé)  │
                   └─────────────────────┘
```

---

### Orchestration (docker-compose)

Ce que docker-compose.yml ajoute aux Dockerfiles :

| Fonctionnalité | Description |
|----------------|-------------|
| **Réseau** | Crée `booksnap-network` pour la communication |
| **Variables** | Injecte `DB_HOST`, `POSTGRES_PASSWORD` depuis `.env` |
| **Arguments build** | Passe `VITE_API_BASE_URL` au frontend |
| **Dépendances** | `depends_on` : attend que la DB soit prête |
| **Health checks** | Vérifie que chaque service répond |
| **Volumes** | Monte les scripts SQL pour init DB |

#### Comparaison Dockerfile vs docker-compose

| Aspect | Dockerfile | docker-compose.yml |
|--------|------------|-------------------|
| **Portée** | Une seule image | Plusieurs services |
| **Build** | Définit les étapes | Déclenche les builds |
| **Runtime** | CMD par défaut | Env, ports, volumes |
| **Réseau** | Aucun | Réseau partagé |
| **Secrets** | Non | Lit depuis `.env` |

---

### Communication entre services

```
┌──────────────────────────────────────────────────────────┐
│                    booksnap-network                       │
│                                                          │
│   ┌────────┐       ┌─────────┐       ┌──────────────┐   │
│   │   db   │◄──────│ backend │◄──────│   frontend   │   │
│   │ :5432  │       │  :8080  │       │ (via browser)│   │
│   └────────┘       └─────────┘       └──────────────┘   │
│                                                          │
│   Les conteneurs utilisent les noms de service          │
│   (db, backend) comme noms d'hôte                       │
└──────────────────────────────────────────────────────────┘
```

#### Injection des variables

**Backend (connexion DB)** :
```
docker-compose.yml              →     application.properties
───────────────────                   ──────────────────────
environment:                          spring.datasource.url=
  DB_HOST: db                    →      jdbc:postgresql://${DB_HOST}:${DB_PORT}
  DB_PORT: 5432
```

**Frontend (URL API)** :
```
docker-compose.yml              →     web/Dockerfile
───────────────────                   ──────────────
args:                                 ARG VITE_API_BASE_URL
  VITE_API_BASE_URL: http://...  →   RUN npm run build  # URL intégrée
```

---

## 4. Choix Techniques

### Pourquoi Vite ?

#### Le problème sans bundler

| Problème | Impact |
|----------|--------|
| Centaines de requêtes HTTP | Chaque `import` = une requête |
| Pas de minification | Fichiers volumineux |
| Pas de tree-shaking | Code mort inclus |
| Variables d'environnement | Impossible à injecter |

#### Avantages de Vite

| Avantage | Description |
|----------|-------------|
| **Rapidité** | esbuild (Go) - 10-100x plus rapide que Webpack |
| **Hot Module Replacement** | Modifications instantanées |
| **ESM natif** | Pas de bundling en dev |
| **Configuration minimale** | Fonctionne out-of-the-box |
| **Tree-shaking** | Élimine le code non utilisé |
| **Variables d'environnement** | `import.meta.env.VITE_*` |

#### Commandes Vite

| Commande | Quand l'utiliser |
|----------|------------------|
| `npm run dev` | Développement quotidien (HMR) |
| `npm run build` | Génère `dist/` pour production |
| `npm run preview` | Teste le build localement |

#### Quand exécuter `npm run build` ?

- Avant de déployer en production
- Dans le Dockerfile (automatique)
- Pour tester la version production
- Dans la CI/CD

#### Flux développement → production

```
┌─────────────────────────────────────────────────────────────┐
│                     DÉVELOPPEMENT                            │
│   npm run dev  →  Vite Dev Server (HMR, localhost:5000)     │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                     PRODUCTION                               │
│   npm run build  →  dist/  →  Nginx (localhost:80)          │
└─────────────────────────────────────────────────────────────┘
```

---

### Pourquoi Nginx ?

#### Besoins d'une SPA en production

| Besoin | Raison |
|--------|--------|
| Fichiers statiques | HTML, JS, CSS, images |
| SPA Fallback | Routes → `index.html` |
| Compression | Réduire les transferts |
| Cache headers | Performance |
| Sécurité | Headers XSS, clickjacking |

#### Avantages de Nginx

| Avantage | Description |
|----------|-------------|
| **Ultra-léger** | Image Alpine ~25 MB |
| **Haute performance** | Milliers de connexions |
| **Compression native** | gzip intégré |
| **Cache intégré** | Headers configurables |
| **Battle-tested** | Utilisé partout |

#### Configuration SPA (nginx.conf)

```nginx
server {
    listen 80;
    root /usr/share/nginx/html;

    # SPA Fallback - toutes routes → index.html
    location / {
        try_files $uri $uri/ /index.html;
    }

    # Cache 1 an pour assets hashés
    location ~* \.(js|css|png|jpg|svg|woff2)$ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }

    # Pas de cache pour index.html
    location = /index.html {
        add_header Cache-Control "no-cache";
    }

    gzip on;
}
```

---

## 5. Référence des Commandes

### Commandes Docker

> **Persistance des données** : Par défaut, les données de PostgreSQL sont sauvegardées dans un volume Docker. Elles persistent même après `docker compose down`. Utilisez le flag `-v` pour supprimer le volume et réinitialiser la base de données.

```bash
# === DÉMARRAGE ===

# Lancer tous les services
docker compose up --build

# Lancer seulement la DB (dev)
docker compose up db

# Lancer DB + pgAdmin
docker compose up db pgadmin

# === GESTION ===

# Voir les logs
docker compose logs -f backend

# Reconstruire un service
docker compose up --build frontend

# Arrêter tous les services
docker compose down

# Reset complet (supprime les données)
docker compose down -v

# État des services
docker compose ps
```

### Commandes Backend (Maven)

> Il n'y a **pas de Maven sur le PATH** : on passe par le wrapper `./mvnw`,
> toujours **depuis `server/`** (spring-dotenv y lit `server/.env`). Les tests
> sont des `@SpringBootTest` sur la base de développement : il faut que
> `docker compose up -d db` tourne.

```bash
cd server

# Lancer l'application
./mvnw spring-boot:run

# Avec un profil spécifique
./mvnw spring-boot:run -Dspring-boot.run.profiles=dev

# Lancer les tests
./mvnw -q test

# Une seule classe de test
./mvnw -q test -Dtest=NomDeLaClasse

# Build sans tests
./mvnw clean package -DskipTests

# Vérifier les dépendances
./mvnw dependency:tree
```

### Commandes Frontend (Vite)

```bash
cd web

# Installer les dépendances
npm install

# Développement (Hot Reload)
npm run dev
# → http://localhost:5000

# Build production
npm run build
# → Génère dist/

# Prévisualiser le build
npm run preview
# → http://localhost:5000

# Linter
npm run lint

# Tests de bout en bout (base PostgreSQL du conteneur requise)
npm run test:e2e
```

### Cheatsheet Rapide

```bash
# DEV QUOTIDIEN
docker compose up db          # Terminal 1
# Backend : depuis IntelliJ IDEA, ou `cd server && ./mvnw spring-boot:run` — Terminal 2
npm run dev                   # Terminal 3 (web/)

# Première fois sur un volume neuf : charger les fixtures une fois le backend démarré
server/scripts/load-dev-fixtures.sh

# TEST INTÉGRATION
docker compose up --build

# TESTS
cd server && ./mvnw -q test   # backend (base de dev)
cd web && npm run test:e2e    # bout en bout (base jetable booksnap_e2e)

# VÉRIFICATION DE BOUT EN BOUT D'UNE SPEC (:8180 + :5180, base booksnap_e2e)
# voir "Environnement des vérifications de bout en bout"

# RESET DES DONNÉES (garde le schéma et le volume)
server/scripts/reset-dev-db.sh

# RESET COMPLET (supprime le volume ; il faut ensuite redémarrer le backend
# pour rejouer les migrations, puis recharger les fixtures)
docker compose down -v && docker compose up db
server/scripts/load-dev-fixtures.sh

# LOGS
docker compose logs -f backend
docker compose logs -f frontend
```

---

**Dernière mise à jour** : 2026-11-01
