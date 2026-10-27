# Plan d'implémentation — Multi-utilisateur et paramètres

> Découpage en sept phases, puis en fonctionnalités, puis en user stories.
> **Chaque user story est destinée à être implémentée seule**, dans l'ordre de
> sa numérotation.

Documents liés :
[décisions](../DECISIONS-MULTI-UTILISATEUR.md) ·
[règles accès](../REGLES-METIER-ACCES.md) ·
[règles paramètres](../REGLES-METIER-PARAMETRES.md) ·
[règles structurelles](../REGLES-METIER-STRUCTURE.md)

---

## Comment ce dossier est organisé

```
implementation/
├── README.md                    ← ce document : la vue d'ensemble
└── phase-N-<nom>/
    ├── README.md                ← ce que la phase construit, et pourquoi ici
    └── <fonctionnalité>/
        ├── README.md            ← de quoi parle la fonctionnalité
        └── US-NNN-<titre>.md    ← une user story implémentable seule
```

Les README de phase et de fonctionnalité sont des **synthèses** : ils donnent la
vue d'ensemble. Le détail exécutable — Given/When/Then, critères
d'acceptation, plan d'implémentation — est **uniquement** dans les user stories.

**La numérotation `US-NNN` est globale et croissante.** Elle donne l'ordre
d'implémentation recommandé à travers toutes les phases.

### Convention Gherkin

Mots-clés `Given` / `When` / `Then` / `And` en anglais, énoncés en français —
comme les valeurs de statut (`available`, `pending`, `on_hold`) qui restent en
anglais dans tout le projet.

---

## Le fil directeur

**Les élèves n'obtiennent un compte qu'en phase 5.** Les phases 1 à 4 ne
concernent que le personnel. L'application continue donc de se comporter comme
aujourd'hui pour ses utilisateurs actuels, et on évite l'état bancal où des
élèves peuvent se connecter sans rien avoir à consulter.

---

## Les sept phases

| Phase | Objet | État |
|---|---|---|
| [0 — Socle de migrations](phase-0-socle-migrations/) | Décider comment une modification de schéma est appliquée | Stories rédigées |
| [1 — Authentification du personnel](phase-1-authentification-personnel/) | Se connecter, verrouiller l'API par rôle | Stories rédigées |
| [2 — Bibliothèques](phase-2-bibliotheques/) | CRUD, archivage, portée | Stories rédigées |
| [3 — Paramètres : les durées](phase-3-parametres-durees/) | Remplacer les constantes en dur | À détailler |
| [4 — Gestion des utilisateurs](phase-4-gestion-utilisateurs/) | Comptes, invitations, SMTP | À détailler |
| [5 — Espace élève](phase-5-espace-eleve/) | Les élèves se connectent | À détailler |
| [6 — Limites, renouvellements, pénalités](phase-6-limites-renouvellements-penalites/) | Nouvelles règles de prêt | À détailler |
| [7 — SSO Microsoft](phase-7-sso-microsoft/) | Second fournisseur d'identité | À détailler |

---

## Résumé de chaque phase

### Phase 0 — Socle de migrations

Cette fonctionnalité ajoute une demi-douzaine de tables et une huitaine de
colonnes. `schema.sql` n'est joué qu'à la création du volume, `ddl-auto=update`
ne couvre qu'une partie du travail, et **la base a déjà dérivé**. Se tromper sur
une table d'authentification n'abîme pas une notice : cela **empêche les gens de
se connecter**.

À trancher : adopter Flyway, ou conserver des scripts numérotés joués à la main.

### Phase 1 — Authentification du personnel

Le modèle d'identité (`auth_identity`, `users.role`), la connexion par mot de
passe, le cookie de session, la réactivation de CSRF, l'amorçage du premier
`ADMIN`, et le verrouillage de **tous** les endpoints existants **par rôle**
(sans portée par bibliothèque, qui arrive en phase 2).

> **Bascule sans retour.** Le jour où la chaîne de filtres change, tous les
> appels du front renvoient 401 tant que la vue de connexion n'existe pas. Le
> back et le front doivent arriver ensemble.

### Phase 2 — Bibliothèques

`LibraryRepository` / `Service` / `Controller` — aucun n'existe. Archivage et
suppression quand la bibliothèque est vide. Table `librarian_library`,
`users.library_id`. Application de la portée sur les copies, emprunts et
réservations. Côté front, un vrai sélecteur de bibliothèque remplaçant le
`libraryId: 1` codé en dur à quatre endroits.

Correction incluse : `CopyServiceImpl.deleteCopyById` renvoie un 409 explicite
au lieu d'une violation de clé étrangère brute.

### Phase 3 — Paramètres : les durées

Table `app_setting` (global + surcharges), service de résolution, retrait de
`BORROWING_DURATION_WEEKS` et `HOLD_PICKUP_WINDOW_WEEKS`, `hold.expires_at` pour
la règle du gel, et la vue de paramètres qui remplace le `<h1>`.

**Inclut l'implémentation du scheduler d'expiration des réservations**, qui
n'existe pas : rendre la durée configurable sans la rendre effective serait pire
que de la laisser en dur.

### Phase 4 — Gestion des utilisateurs

Liste des utilisateurs, création de comptes du personnel, changement de rôle,
rattachement des bibliothécaires, désactivation. Couche SMTP et jetons
d'invitation. Import en masse des élèves.

La couche SMTP construite ici est celle dont dépend tout le backlog de
notifications.

### Phase 5 — Espace élève

Les élèves obtiennent une identité. Endpoints `GET /borrowings/me` et
`GET /holds/me` (inexistants), correction de la faille sur `POST /holds`,
verrouillage de `GET /users/search`, et l'interface élève — une surface
réellement distincte de l'application du personnel, pas une version filtrée.

### Phase 6 — Limites, renouvellements, pénalités

`borrowing.renewal_count`, `users.suspended_until`. Compteurs à l'emprunt et à
la réservation, endpoint de prolongation avec la règle anti-famine de la file
d'attente, suspension appliquée au retour.

**Phase la plus lourde, et la seule qui soit du développement de fonctionnalité
pur** plutôt que la sécurisation de l'existant. C'est aussi la seule qui peut
glisser sans bloquer les autres.

### Phase 7 — SSO Microsoft

Additif : une seconde valeur de `provider` dans `auth_identity`. Validation du
tenant, exigence d'`email_verified`, pas de création à la volée. Rien de la
phase 1 n'est réécrit — c'était tout l'intérêt de la table d'identités.

---

## Risques principaux

| Risque | Phase | Atténuation |
|---|---|---|
| Bascule tout-ou-rien du verrouillage de l'API | 1 | Back et front livrés ensemble ; recette sur un environnement dédié |
| Dérive du schéma réel vs `schema.sql` | 0, toutes | Raison d'être de la phase 0 |
| `users.email` sensible à la casse | 1 | Corriger le type ou normaliser **avant** que l'email devienne l'identifiant |
| Volume de la phase 6 au regard de sa priorité | 6 | Peut être décalée sans bloquer les autres |
