# US-01 — L'administrateur voit les bibliothèques dans Settings

[← Feature](../README.md)

| | |
|---|---|
| **Feature** | Bibliothèques |
| **Statut** | approved |
| **Nature** | feature |
| **Dépend de** | — |
| **Bloque** | US-02 |
| **Portée** | back + front |
| **Casse l'existant ?** | Non — endpoint nouveau ; la page Settings des non-admins ne change pas |

---

## Story

**En tant qu'** administrateur
**je veux** voir dans Settings la liste des bibliothèques de l'école
**afin de** savoir quelles bibliothèques utilisent BookSnap sans ouvrir `psql`.

---

## Contexte

### La table existe, rien ne la lit

Schéma réel (`\d library`, base de développement) :

| Colonne | Type | Remarque |
|---|---|---|
| `id` | `bigint`, identity | |
| `name` | `varchar(255)`, nullable | `library_name_key` UNIQUE, sensible à la casse |
| `created_*`, `last_modified_*` | audit | |

Lignes : `1 Preschool`, `2 Primary`. Référencée par `copy_library_id_fkey` et
`hold_library_id_fkey`.

`server/src/main/java/net/booksnap/domain/library/Library.java` :

```java
@Entity
@Table(name = "library")
public class Library extends Auditable {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "name")
    private String name;
}
```

`server/src/main/java/net/booksnap/domain/library/repository/LibraryRepository.java`
existe, vide (`JpaRepository<Library, Long>`) ; son seul appelant est
`BookServiceImpl:90`, qui vérifie le `libraryId` d'un ajout de livre.
`LibraryNotFoundException` existe et est déjà traduite en `404` `ApiError`
(`GlobalExceptionHandler:150`). Il n'y a ni service ni contrôleur de
bibliothèque. `LibraryDTO(Long id, String name)` n'est utilisé que dans
`CopyResponse`.

### Aucune règle pour `/api/v1/libraries`

`SecurityConfig.authorize` ne nomme pas ce chemin ; il tombe dans la règle de
fin :

```java
// Closed by default, and never permitAll(): an endpoint added tomorrow is
// protected until someone opens it here on purpose, rather than the reverse.
.anyRequest().authenticated();
```

### Settings est une coquille vide, ouverte à tous

`web/src/views/settings-view/settings-view.js` :

```js
render() {
  return html` <h1>Settings View</h1> `;
}
```

La route `/settings` est un `_protectedRoute` (session requise, tout rôle) et
l'entrée de navigation « Settings » est rendue pour tout utilisateur connecté
(`booksnap-app.js:560`). `auth-state.js` expose déjà `isAdmin()`.

Règles : [règles accès §3](../../../business-rules/REGLES-METIER-ACCES.md) —
« Créer / renommer / archiver / supprimer une bibliothèque » : `ADMIN` seulement.

---

## Décisions et non-objectifs

Les décisions valables pour toute la feature sont dans le
[README](../README.md#décisions-valables-pour-toute-la-feature) : liste réservée
à l'`ADMIN`, pas d'endpoint de détail, pas de `is_active`.

- **Une bibliothèque affichée = son nom.** Pas d'identifiant, pas de nombre de
  copies : rien ne le demande aujourd'hui.
- **Tri par nom sans tenir compte de la casse** : « annexe » se range avant
  « Preschool ». Un tri sensible à la casse rangerait toutes les majuscules
  devant.
- **Un non-admin ne voit pas la section**, il ne reçoit pas de message : la page
  Settings reste ce qu'elle est pour lui. L'API, elle, répond `403`.

**Hors périmètre de cette story** : ajouter et renommer (US-02, US-03) ; le
contenu du reste de la page Settings, y compris son titre provisoire.

---

## Scénarios

### Scenario: l'administrateur voit les bibliothèques dans Settings

```gherkin
Given les bibliothèques "Preschool" et "Primary"
And un administrateur connecté
When il ouvre Settings
Then une section intitulée "Libraries" liste "Preschool" puis "Primary"
```

### Scenario: la liste est triée sans tenir compte de la casse

```gherkin
Given les bibliothèques "Preschool", "Primary" et "annexe"
When un administrateur demande la liste des bibliothèques
Then il reçoit "annexe", "Preschool", "Primary", dans cet ordre
And chacune porte son identifiant et son nom
```

### Scenario: aucune bibliothèque

```gherkin
Given aucune bibliothèque n'existe
And un administrateur connecté
When il ouvre Settings
Then la section "Libraries" affiche "No library yet."
```

### Scenario: la liste ne peut pas être chargée

```gherkin
Given un administrateur connecté
And la demande de la liste des bibliothèques échoue
When il ouvre Settings
Then la section "Libraries" affiche "The libraries could not be loaded."
```

### Scenario: un bibliothécaire ne voit pas la section

```gherkin
Given un bibliothécaire connecté
When il ouvre Settings
Then la page ne contient pas de section "Libraries"
```

### Scenario: un élève ne voit pas la section

```gherkin
Given un élève connecté
When il ouvre Settings
Then la page ne contient pas de section "Libraries"
```

### Scenario: l'API refuse la liste à un non-admin

```gherkin
Given un utilisateur connecté de rôle "LIBRARIAN" ou "USER"
When il demande la liste des bibliothèques
Then la réponse est 403
```

### Scenario: l'API refuse la liste sans session

```gherkin
Given aucune session
When la liste des bibliothèques est demandée
Then la réponse est 401
```

---

## Critères d'acceptation

- [x] `GET /api/v1/libraries` → `200`, tableau de `{ id, name }` ; `ADMIN`
      seulement.
- [x] La règle est déclarée dans `SecurityConfig`, dans un groupe « Libraries »
      (méthode et chemin nommés, comme les autres), et la ligne est ajoutée à
      `ApiAuthorizationMatrixTest` avec `ADMIN_ONLY`.
- [x] Service et contrôleur dans le domaine `net.booksnap.domain.library`, sur le
      modèle des autres domaines (interface de service + `Impl`).
- [x] Les appels front passent par un module de `web/src/api/` qui lève une
      `Error` portant `error.status` en cas d'échec ; la route est déclarée dans
      `API_ROUTES`.
- [x] La section est un composant de `web/src/features/library/`, avec son
      fichier `-styles.js` voisin ; `settings-view` la rend si `isAdmin()`.
- [x] Le `.bru` de l'endpoint est dans `server/API/LibraryController/`, avec un
      `folder.bru` qui documente les rôles comme `ArchiveController/folder.bru`.
- [x] Critères permanents :
  - [x] Chaque scénario a un test automatisé nommé `US-01: <titre du scénario>`
  - [x] Toute la suite passe (`./mvnw -q test` depuis `server/`), et
        `npm run test:e2e` dans `web/`
  - [x] `npm run lint` dans `web/` ne signale aucune nouvelle erreur
  - [x] Le backend démarre avec `ddl-auto=validate`
  - [x] Commentaires de code en anglais, réduits à ce que le code ne peut pas dire

---

## Vérification de bout en bout

**Préparation** : `docker compose up -d db` ; backend (`./mvnw spring-boot:run`
depuis `server/`, ou celui de l'IDE sur `:8080`) ; `npm run dev` dans `web/`.
Compte admin d'amorçage et un compte bibliothécaire (voir
[README](../README.md#préparation-commune-aux-vérifications)).

1. Se connecter en admin, ouvrir **Settings** → section « Libraries » :
   Preschool, puis Primary.
2. Bruno, connecté en admin : `LibraryController/getLibraries` → `200`,
   `[{ id: 1, name: "Preschool" }, { id: 2, name: "Primary" }]`.
3. `psql` : `INSERT INTO library (name) VALUES ('annexe');` → recharger Settings :
   annexe, Preschool, Primary. `DELETE FROM library WHERE name = 'annexe';`
4. Arrêter le backend, recharger Settings en admin → « The libraries could not be
   loaded. » Relancer le backend.
5. Se déconnecter, se connecter en bibliothécaire, ouvrir **Settings** → pas de
   section « Libraries ». Bruno, même compte : `getLibraries` → `403`.
6. Bruno `logout`, puis `getLibraries` → `401`.

**Nettoyage** : l'étape 3 supprime ce qu'elle insère.

---

## Points de vigilance

- **Ne pas ouvrir la liste à tout utilisateur connecté** par fidélité à
  l'ancienne US-014 et à P2-5 : la décision est révisée (README de la feature).
  Le sélecteur de US-022 lit `/auth/me`.
- **Ne pas compter sur `.anyRequest().authenticated()`** : sans règle explicite,
  un élève lirait la liste. La règle `ADMIN` doit être écrite, et la matrice est
  ce qui le prouve.
- **Masquer la section ne protège rien.** Le `403` de l'API est le contrôle ; la
  condition `isAdmin()` côté front n'est que de l'affichage.
- **Le tri doit ignorer la casse dès maintenant**, alors que `name` est encore un
  `varchar` (il devient `citext` en US-02) : sur la base de développement, un
  `ORDER BY` sur du texte range « Preschool, Primary, Zed, annexe » — majuscules
  d'abord, vérifié avec `psql`.
- **Ne pas inventer de `isActive` dans la réponse** : il arrive avec US-017.
