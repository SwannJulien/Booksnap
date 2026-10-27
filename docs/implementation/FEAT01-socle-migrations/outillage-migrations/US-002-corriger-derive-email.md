# US-002 — Corriger la dérive de `users.email` (sensibilité à la casse)

[← Fonctionnalité](README.md) · [← Phase 0](../README.md) · [← Plan](../../README.md)

| | |
|---|---|
| **Phase** | 0 — Socle de migrations |
| **Fonctionnalité** | Outillage de migrations |
| **Dépend de** | [US-001](US-001-adopter-flyway.md) |
| **Bloque** | Toute la phase 1 — l'email devient l'identifiant de connexion |
| **Portée** | Back + base |

---

## Récit

**En tant qu'** usager de Booksnap
**je veux** que mon adresse email soit reconnue quelle que soit la casse saisie
**afin de** pouvoir me connecter avec `Alice@school.org` comme avec
`alice@school.org`, sans créer un second compte à mon insu.

## Contexte

`schema.sql` déclare `users.email` sur un domaine `email` basé sur `citext`
(insensible à la casse). **La base en service porte un
`character varying(255)`** — sensible à la casse — alors que `users_email_key`
en fait la clé d'unicité. Curiosité supplémentaire : `users.parent_email` est
bien le domaine `citext` dans la même table.

Aujourd'hui c'est sans conséquence : personne ne se connecte, et l'email ne sert
qu'à l'affichage et à la recherche. **Dès qu'il devient l'identifiant de
connexion, c'est un bug d'authentification** — et un risque de doublon de compte.

Voir [règles structurelles §7](../../../REGLES-METIER-STRUCTURE.md).

---

## Scénarios

### Scenario: la casse n'empêche pas de retrouver un compte

```gherkin
Given un utilisateur enregistré avec l'email "alice.martin@example.com"
When une recherche de compte est faite sur "Alice.Martin@Example.com"
Then le compte de Alice est trouvé
```

### Scenario: un doublon ne différant que par la casse est refusé

```gherkin
Given un utilisateur enregistré avec l'email "alice.martin@example.com"
When on tente de créer un utilisateur avec "ALICE.MARTIN@EXAMPLE.COM"
Then la création est refusée pour cause d'email déjà utilisé
And aucun second compte n'est créé
```

### Scenario: la migration détecte les doublons préexistants

```gherkin
Given une base contenant "bob@example.com" et "Bob@example.com" comme deux comptes distincts
When la migration de conversion en citext est jouée
Then la migration échoue explicitement
And le message identifie les emails en conflit
And aucune donnée n'est modifiée
```

### Scenario: `parent_email` reste inchangé

```gherkin
Given la colonne "users.parent_email" déjà sur le domaine "email"
When la migration est jouée
Then "users.parent_email" conserve son type
```

---

## Critères d'acceptation

- [x] `users.email` est insensible à la casse pour la comparaison **et** pour l'unicité.
- [x] La migration est **refusée proprement** s'il existe des doublons ne différant que par la casse, avec la liste des conflits.
- [x] `users_email_key` reste une contrainte d'unicité effective après conversion.
- [x] L'entité JPA `User` reste fonctionnelle sans changement de type Java (`String`).
- [x] `UserRepository.searchActiveUsers` continue de fonctionner ; si elle utilise `LOWER(...)`, elle est simplifiée ou laissée telle quelle mais vérifiée.
- [x] Une décision explicite est prise et documentée pour `genre.name` et `author.name` — voir points de vigilance. (`library.name` est déclaré `TEXT` dans `schema.sql`, pas `CITEXT` : son passage en `varchar(255)` n'affecte pas la casse.)
- [x] `ddl-auto=validate` (si activé en US-001) accepte le schéma après migration.

---

## Plan d'implémentation

1. **Inventorier les conflits avant toute écriture** :

   ```sql
   SELECT LOWER(email), COUNT(*), ARRAY_AGG(id)
   FROM users GROUP BY LOWER(email) HAVING COUNT(*) > 1;
   ```

   S'il y a des lignes, **traiter ces comptes à la main d'abord** : ils
   représentent de vraies personnes en double, avec potentiellement des emprunts
   de part et d'autre. Aucune fusion automatique.

2. **Écrire `V<n>__users_email_citext.sql`** :
   - Garde qui fait échouer la migration si des doublons subsistent (bloc
     `DO $$ ... RAISE EXCEPTION ... $$`).
   - `ALTER TABLE users ALTER COLUMN email TYPE email USING email::email;`
     Le domaine `email` existe déjà et porte sa propre contrainte `CHECK` de
     format — **vérifier que toutes les valeurs existantes la respectent**,
     sinon la conversion échoue ligne par ligne.
   - L'extension `citext` est déjà installée (`CREATE EXTENSION citext` en tête
     de `schema.sql`) — le confirmer sur la base réelle.

3. **Vérifier l'index d'unicité.** Un changement de type reconstruit l'index ;
   confirmer que `users_email_key` est bien reconstruit sur le nouveau type et
   qu'il rejette désormais les variantes de casse.

4. **Décider pour les autres colonnes.** `genre.name` et `author.name` sont
   déclarés `CITEXT` dans `schema.sql` et sont en `character varying(255)` sur la
   base en service (vérifié) : décider de les aligner maintenant, ou consigner la
   dérive comme acceptée. `library.name` est déclaré `TEXT`, pas `CITEXT` — sa
   dérive vers `varchar(255)` ne change rien à la casse.

   ```bash
   docker exec booksnap-postgres sh -c \
     'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "\d users" -c "\d genre" -c "\d author" -c "\d library"'
   ```

5. ~~**Aligner `schema.sql`**~~ — caduc depuis l'US-001 : `schema.sql` est
   obsolète et ne fait plus autorité. Le réaligner recréerait la seconde source
   de vérité que le socle de migrations vient de supprimer.

6. **Vérifier** : recherche d'utilisateur avec une casse différente, tentative
   de création d'un doublon en casse différente, et non-régression de
   `GET /users/search`.

---

## Points de vigilance

- **⚠️ La migration seule ne suffit pas — `stringtype=unspecified` est
  obligatoire.** Le pilote JDBC envoie les paramètres de `setString()` typés
  `varchar`, et PostgreSQL résout alors `citext = varchar` en comparaison
  `text` : la casse redevient significative. Mesuré sur la base convertie,
  `WHERE email = $1` renvoie **0 ligne** avec un paramètre `varchar` et 1 ligne
  avec un paramètre inféré en `citext`. L'asymétrie est piégeuse : l'**unicité**
  reste protégée dans tous les cas (la valeur est convertie en `citext` à
  l'écriture avant indexation), seule la **recherche** casse. Sans ce paramètre,
  un doublon serait refusé mais le compte resterait introuvable — soit le pire
  des deux mondes pour la connexion.
- **`ddl-auto=validate` échoue après la conversion** tant que les entités ne
  déclarent pas `columnDefinition`. Le validateur compare le nom du type reporté
  par le pilote : `"email"` pour `User.email` (nom du **domaine**), `"citext"`
  pour `Author.name` et `Genre.name`. Le type Java reste `String`.
- **La conversion de type verrouille la table.** Le volume de `users` est celui
  d'un établissement scolaire : l'opération est brève, mais à jouer hors des
  heures d'ouverture de la bibliothèque.
- **`citext` et les index.** Un index `citext` fonctionne, mais les index
  construits sur `LOWER(email)` deviennent redondants — vérifier s'il en existe.
- **Normaliser à l'écriture reste utile** même avec `citext` : stocker l'adresse
  telle que saisie est correct, mais l'affichage doit rester lisible. `citext`
  ne modifie pas la valeur stockée, seulement la comparaison.
- **Alternative si la conversion est jugée trop risquée** : normaliser
  systématiquement en minuscules dans le code, à l'écriture **et** à la lecture.
  Moins robuste — un seul chemin d'écriture oublié réintroduit le bug — et à ne
  retenir qu'en dernier recours.
