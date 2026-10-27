# US-02 — Créer une bibliothèque

[← Feature](../README.md)

| | |
|---|---|
| **Feature** | Bibliothèques |
| **Statut** | approved |
| **Nature** | feature |
| **Dépend de** | [US-01](../US-01-voir-bibliotheques/US-01-voir-bibliotheques-spec.md) |
| **Bloque** | US-03 |
| **Portée** | db + back + front |
| **Casse l'existant ?** | Non — `library.name` devient `citext NOT NULL` ; les deux noms existants passent tels quels |

---

## Story

**En tant qu'** administrateur
**je veux** ajouter une bibliothèque depuis Settings
**afin d'** ouvrir BookSnap à un nouveau site de l'école sans `INSERT` à la main,
et sans risquer deux bibliothèques qui ne diffèrent que par la casse.

---

## Contexte

### `library.name` est sensible à la casse, et nullable

Schéma réel (`\d library`) : `name character varying(255)`, sans `NOT NULL`,
`library_name_key UNIQUE (name)`. « Primary » et « primary » coexisteraient ;
une bibliothèque sans nom est acceptée. Les données actuelles sont saines :
`Preschool`, `Primary`, aucun nom nul, aucun doublon de casse.

`V1__baseline_schema.sql`, en-tête, ligne 24 : `library.name` fait partie des
colonnes « `varchar(255)` là où » `schema.sql` disait autre chose. `V4` a fait
passer `author.name` et `genre.name` en `citext` et dit explicitement :

```sql
-- `library.name` n'est PAS concernée : schema.sql la déclarait `TEXT`, pas
-- `CITEXT`. Sa dérive vers varchar(255) n'a pas d'effet sur la casse.
```

La décision P2-7 de la phase 2 revient dessus : « Primary » et « primary » sont
le même site. `V4` est le modèle à suivre : gardes `DO $$ … RAISE EXCEPTION …
$$` qui nomment les valeurs en conflit avant de convertir, puis vérification que
l'index unique existe toujours après la conversion. La dernière migration
appliquée est `V10__lifecycle_event.sql`.

### Les règles du nom dans le reste du code

`.claude/CLAUDE.md` : pour les colonnes `citext`, seul `trim()` reste à faire
côté application — « `citext` folds case, not whitespace » — et les noms sont
enregistrés tels que saisis. La recherche par nom n'ignore la casse que grâce à
`?stringtype=unspecified` dans l'URL JDBC ; l'entité doit déclarer
`columnDefinition = "citext"` pour que `ddl-auto=validate` passe.

### Les erreurs côté front

Les vues distinguent un conflit par `error.status === 409` et affichent le
message reçu (`account-view.js:132`, `hold-modal-bks.js:238`).

Règles : [règles accès §3](../../../business-rules/REGLES-METIER-ACCES.md) —
créer une bibliothèque : `ADMIN` seulement.

---

## Décisions et non-objectifs

- **Le nom est enregistré tel que saisi, espaces de bord retirés.** Pas de mise
  en forme de la casse : `BookApiMapper` en faisait une pour les auteurs, et elle
  produisait `J.k. Rowling` (`.claude/CLAUDE.md`).
- **Unicité sans tenir compte de la casse**, garantie par la base (`citext` +
  index unique), pas seulement par une vérification préalable : deux créations
  simultanées du même nom donnent une bibliothèque et un `409`, jamais deux
  bibliothèques ni un `500`.
- **255 caractères au plus.** La colonne `citext` n'a plus de limite ; la limite
  reste celle d'avant, côté application.
- **Le message de doublon nomme la bibliothèque existante**, avec sa casse à
  elle : saisir « primary » répond `A library named "Primary" already exists.`
  Sauf quand seule la base détecte le doublon (deux créations simultanées) : la
  violation de l'index annule la transaction, plus rien ne peut y être lu, et le
  message nomme alors le nom saisi, espaces de bord retirés.
- **La migration ne corrige rien d'elle-même** : un doublon de casse ou un nom
  nul arrête le démarrage avec la liste des lignes en cause, comme `V4`. Fusionner
  deux bibliothèques, c'est déplacer leurs copies — une décision humaine.
- **Une bibliothèque créée est vide** : aucune copie, aucun rattachement.

**Hors périmètre de cette story** : renommer (US-03) ; `is_active` (US-017) ;
le parcours de première installation, qui réutilisera ces règles.

---

## Scénarios

### Scenario: l'administrateur ajoute une bibliothèque

```gherkin
Given les bibliothèques "Preschool" et "Primary"
And un administrateur sur Settings
When il clique sur "Add a library", saisit "Secondary" dans "Name" et clique sur "Create"
Then la section "Libraries" liste "Preschool", "Primary", "Secondary"
And le formulaire d'ajout est refermé
```

### Scenario: l'API crée la bibliothèque

```gherkin
Given un administrateur connecté
When il crée une bibliothèque nommée "Secondary"
Then la réponse est 201 avec l'identifiant et le nom "Secondary"
And la liste des bibliothèques contient "Secondary"
```

### Scenario: les espaces de bord sont retirés

```gherkin
Given un administrateur connecté
When il crée une bibliothèque nommée "  Secondary  "
Then la bibliothèque est enregistrée sous le nom "Secondary"
```

### Scenario: la casse saisie est conservée

```gherkin
Given un administrateur connecté
When il crée une bibliothèque nommée "école du Lac"
Then la bibliothèque est enregistrée sous le nom "école du Lac"
```

### Scenario: un nom qui ne diffère que par la casse est refusé

```gherkin
Given la bibliothèque "Primary"
When un administrateur crée une bibliothèque nommée " PRIMARY "
Then la réponse est 409 avec le message "A library named \"Primary\" already exists."
And aucune bibliothèque n'est créée
```

### Scenario: le doublon est signalé dans le formulaire

```gherkin
Given la bibliothèque "Primary"
And un administrateur sur Settings, formulaire d'ajout ouvert
When il saisit "primary" et clique sur "Create"
Then le formulaire reste ouvert, avec "primary" dans "Name"
And il affiche "A library named \"Primary\" already exists."
And la liste ne change pas
```

### Scenario: le doublon que seule la base détecte

```gherkin
Given aucune bibliothèque "Secondary" au moment de la vérification préalable
And une autre création de "Secondary" validée entre-temps
When la création est enregistrée et que l'index unique la rejette
Then la réponse est 409 avec le message "A library named \"Secondary\" already exists."
```

### Scenario: nom vide dans le formulaire

```gherkin
Given un administrateur sur Settings, formulaire d'ajout ouvert
When il laisse "Name" vide, ou n'y saisit que des espaces, et clique sur "Create"
Then le formulaire affiche "Enter a name for the library."
And aucune bibliothèque n'est créée
```

### Scenario: nom vide refusé par l'API

```gherkin
Given un administrateur connecté
When il crée une bibliothèque sans nom, avec "" ou avec "   "
Then la réponse est 400
```

### Scenario: nom trop long refusé par l'API

```gherkin
Given un administrateur connecté
When il crée une bibliothèque dont le nom fait 256 caractères
Then la réponse est 400
```

### Scenario: l'ajout est abandonné

```gherkin
Given un administrateur sur Settings, formulaire d'ajout ouvert avec "Secondary" saisi
When il clique sur "Cancel"
Then le formulaire est refermé
And aucune bibliothèque n'est créée
```

### Scenario: réservé à l'administrateur

```gherkin
Given un utilisateur connecté de rôle "LIBRARIAN" ou "USER"
When il crée une bibliothèque
Then la réponse est 403
And aucune bibliothèque n'est créée
```

### Scenario: la base refuse un doublon de casse

```gherkin
Given la bibliothèque "Primary"
When une ligne "PRIMARY" est insérée directement dans "library"
Then l'insertion échoue sur "library_name_key"
```

### Scenario: la base refuse un nom nul

```gherkin
When une ligne sans nom est insérée directement dans "library"
Then l'insertion échoue sur la contrainte NOT NULL de "name"
```

---

## Critères d'acceptation

- [x] Nouvelle migration : `library.name` passe en `citext NOT NULL` ; l'index
      `library_name_key` existe après la conversion. Commentaires de la migration
      en anglais.
- [x] Avant de convertir, la migration s'arrête avec un message qui nomme les
      valeurs et leurs `id` si des noms ne diffèrent que par la casse, et les `id`
      des noms nuls — même forme que les gardes de `V4`.
- [x] Entité `Library` : `name` déclaré `citext`, non nul.
- [x] `POST /api/v1/libraries` `{ name }` → `201` avec `{ id, name }` ; `400`
      (`ApiError`) si le nom est absent, vide après `trim()` ou dépasse 255
      caractères ; `409` (`ApiError`) si le nom est pris à la casse près, que le
      conflit soit vu par la vérification préalable ou par l'index unique ;
      `ADMIN` seulement.
- [x] La règle est déclarée dans le groupe « Libraries » de `SecurityConfig` et
      ajoutée à `ApiAuthorizationMatrixTest` avec `ADMIN_ONLY`.
- [x] Le champ « Name » du formulaire n'accepte pas plus de 255 caractères.
- [x] Le `.bru` de l'endpoint est dans `server/API/LibraryController/`.
- [x] Critères permanents :
  - [x] Chaque scénario a un test automatisé nommé `US-02: <titre du scénario>`
  - [x] Toute la suite passe (`./mvnw -q test` depuis `server/`), et
        `npm run test:e2e` dans `web/`
  - [x] `npm run lint` dans `web/` ne signale aucune nouvelle erreur
  - [x] Le changement de schéma est une nouvelle migration ; aucune migration
        appliquée n'est modifiée
  - [x] Le backend démarre avec `ddl-auto=validate`
  - [x] Commentaires de code en anglais, réduits à ce que le code ne peut pas dire

---

## Vérification de bout en bout

**Préparation** : `docker compose up -d db` ; vérifier les données avant de
démarrer le backend :

```bash
docker exec booksnap-postgres sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "SELECT LOWER(name), count(*) FROM library GROUP BY 1 HAVING count(*) > 1" -c "SELECT id FROM library WHERE name IS NULL"'
```

→ aucune ligne dans les deux cas. Puis backend et `npm run dev` ; compte admin et
compte bibliothécaire.

1. Démarrer le backend → Flyway applique la migration, `validate` passe.
   `psql` : `\d library` → `name citext not null`, `library_name_key` présent.
2. Admin, **Settings** → « Add a library », saisir `  Secondary  `, « Create » →
   la liste montre Preschool, Primary, Secondary.
3. « Add a library », saisir `primary`, « Create » → le formulaire reste ouvert
   avec « A library named "Primary" already exists. » ; la liste ne change pas.
   « Cancel » → formulaire refermé.
4. « Add a library », « Create » sans rien saisir → « Enter a name for the
   library. »
5. Bruno, admin : `createLibrary` avec `"   "` → `400` ; avec 256 caractères →
   `400`.
6. Bruno, bibliothécaire : `createLibrary` → `403`.
7. `psql` : `INSERT INTO library (name) VALUES ('PRIMARY');` → erreur sur
   `library_name_key` ; `INSERT INTO library (name) VALUES (NULL);` → erreur
   `NOT NULL`.
8. Garde de la migration, dans une transaction annulée sur `booksnap_e2e` (après
   un `npm run test:e2e`) : `BEGIN;`, repasser `name` en `varchar`, insérer
   `primary`, exécuter le premier bloc `DO` de la migration → l'erreur nomme
   `primary` et les deux `id` ; `ROLLBACK;`.

**Nettoyage** : `DELETE FROM library WHERE name = 'Secondary';` sur la base de
développement.

---

## Points de vigilance

- **Ne pas se contenter de la vérification préalable.** « Le nom existe-t-il ? »
  puis « enregistrer » laisse une fenêtre : la violation de `library_name_key`
  doit devenir le même `409`, pas tomber dans un gestionnaire générique qui
  répondrait `400` ou `500`.
- **Ne pas retirer `stringtype=unspecified`** de l'URL JDBC : sans lui, la
  vérification préalable compare en `text`, trouve « primary » libre, et seul
  l'index sauve la mise.
- **Ne pas `lower()` ni mettre en forme le nom avant de l'enregistrer** : `citext`
  s'occupe de la comparaison, le nom affiché est celui qui a été saisi.
- **Le doublon se cherche sur le nom déjà `trim()`é** : chercher `" PRIMARY "`
  tel quel ne trouve rien (`citext` ignore la casse, pas les espaces), et c'est
  l'index qui refuserait — avec le bon code seulement si le premier point de
  cette liste est fait.
- **Ne pas modifier `V1` ni `V4`** pour corriger leurs commentaires : checksum
  Flyway. La nouvelle migration suffit.
- **Les tests d'intégration tournent sur la base de développement** : une
  bibliothèque créée par un test validé y reste. Préférer des écritures annulées
  en fin de test.
