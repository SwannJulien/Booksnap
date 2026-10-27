# US-03 — Renommer une bibliothèque

[← Feature](../README.md)

| | |
|---|---|
| **Feature** | Bibliothèques |
| **Statut** | approved |
| **Nature** | feature |
| **Dépend de** | [US-02](../US-02-creer-bibliotheque/US-02-creer-bibliotheque-spec.md) |
| **Bloque** | — |
| **Portée** | back + front |
| **Casse l'existant ?** | Non — le nom d'une bibliothèque change partout où il est affiché, rien d'autre |

---

## Story

**En tant qu'** administrateur
**je veux** corriger le nom d'une bibliothèque depuis Settings
**afin de** rectifier une faute de frappe ou suivre le nouveau nom d'un site sans
toucher aux copies qui y sont rangées ni aux étiquettes déjà imprimées.

---

## Contexte

### Le nom n'est référencé nulle part ailleurs

Copies et réservations désignent leur bibliothèque par `id`
(`copy_library_id_fkey`, `hold_library_id_fkey`). Le nom n'est lu qu'au moment
de construire une réponse :

```java
// server/src/main/java/net/booksnap/domain/copy/mapper/CopyApiMapper.java
protected LibraryDTO mapLibrary(net.booksnap.domain.library.Library library) {
    ...
    return new LibraryDTO(library.getId(), library.getName());
}
```

Le QR code d'une copie contient l'`id` de la bibliothèque, pas son nom :

```java
// server/src/main/java/net/booksnap/utils/qr/QRCodeService.java
String qrContent = String.format("COPY:%d:LIB:%d:BOOK:%d:CHK:%s",
    copy.getId(),
    copy.getLibrary().getId(),
    copy.getBook().getId(),
    generateChecksum(copy.getId()));
```

### Ce que US-02 a posé

`library.name` est `citext NOT NULL` avec `library_name_key` ; les règles de nom
(espaces de bord retirés, casse conservée, 255 caractères au plus, unicité sans
tenir compte de la casse, `409` même quand seul l'index voit le conflit) et le
message de doublon sont ceux de
[US-02](../US-02-creer-bibliotheque/US-02-creer-bibliotheque-spec.md#décisions-et-non-objectifs).

`LibraryNotFoundException` est traduite en `404` `ApiError` avec le message
`Library not found: <id>` (`GlobalExceptionHandler:150`).

Règles : [règles accès §3](../../../business-rules/REGLES-METIER-ACCES.md) —
renommer une bibliothèque : `ADMIN` seulement.

---

## Décisions et non-objectifs

- **Mêmes règles de nom qu'à la création**, mêmes messages — un seul ensemble de
  règles pour un nom de bibliothèque.
- **Changer seulement la casse de son propre nom est permis** (« primary » →
  « Primary ») : le conflit se cherche parmi les *autres* bibliothèques.
- **Renommer est en place, dans la ligne** : le nom devient un champ pré-rempli
  avec « Save » et « Cancel ». Pas de fenêtre modale pour un seul champ.
- **Enregistrer sans rien changer réussit** et referme le champ.
- **Renommer n'est pas déplacer** : aucune copie, aucune réservation ne change.

**Hors périmètre de cette story** : archiver, supprimer (US-017, US-018).

---

## Scénarios

### Scenario: l'administrateur renomme une bibliothèque

```gherkin
Given les bibliothèques "Preschool" et "Primary"
And un administrateur sur Settings
When il clique sur "Rename" sur la ligne "Primary"
And remplace le nom par "Primary School" et clique sur "Save"
Then la section "Libraries" liste "Preschool", "Primary School"
And la ligne n'est plus en édition
```

### Scenario: le champ de renommage est pré-rempli

```gherkin
Given la bibliothèque "Primary"
And un administrateur sur Settings
When il clique sur "Rename" sur la ligne "Primary"
Then la ligne montre un champ contenant "Primary", un bouton "Save" et un bouton "Cancel"
```

### Scenario: l'API renomme la bibliothèque

```gherkin
Given la bibliothèque "Primary" d'identifiant 2
When un administrateur renomme la bibliothèque 2 en "  Primary School  "
Then la réponse est 200 avec l'identifiant 2 et le nom "Primary School"
```

### Scenario: les copies suivent le nouveau nom

```gherkin
Given une copie rangée dans la bibliothèque "Preschool"
When un administrateur renomme "Preschool" en "Nursery"
Then la copie est toujours rattachée à la même bibliothèque
And la copie, demandée par son identifiant, porte la bibliothèque "Nursery"
```

### Scenario: renommer vers un nom pris est refusé

```gherkin
Given les bibliothèques "Preschool" et "Primary"
When un administrateur renomme "Primary" en "preschool"
Then la réponse est 409 avec le message "A library named \"Preschool\" already exists."
And "Primary" garde son nom
```

### Scenario: le conflit est signalé dans la ligne

```gherkin
Given les bibliothèques "Preschool" et "Primary"
And un administrateur sur Settings, ligne "Primary" en édition
When il saisit "preschool" et clique sur "Save"
Then la ligne reste en édition, avec "preschool" dans le champ
And elle affiche "A library named \"Preschool\" already exists."
```

### Scenario: le conflit que seule la base détecte

```gherkin
Given la bibliothèque "Primary", et aucune autre "Secondary" au moment de la vérification préalable
And une création de "Secondary" validée entre-temps
When le renommage de "Primary" en "Secondary" est enregistré et que l'index unique le rejette
Then la réponse est 409 avec le message "A library named \"Secondary\" already exists."
```

### Scenario: changer seulement la casse de son propre nom

```gherkin
Given la bibliothèque "primary"
When un administrateur la renomme "Primary"
Then la réponse est 200 avec le nom "Primary"
```

### Scenario: enregistrer sans changement

```gherkin
Given un administrateur sur Settings, ligne "Primary" en édition
When il clique sur "Save" sans modifier le nom
Then la ligne n'est plus en édition
And la section liste toujours "Primary"
```

### Scenario: abandonner le renommage

```gherkin
Given un administrateur sur Settings, ligne "Primary" en édition avec "Primary School" saisi
When il clique sur "Cancel"
Then la ligne affiche "Primary" et n'est plus en édition
And la bibliothèque s'appelle toujours "Primary"
```

### Scenario: nom vide dans la ligne

```gherkin
Given un administrateur sur Settings, ligne "Primary" en édition
When il vide le champ, ou n'y laisse que des espaces, et clique sur "Save"
Then la ligne affiche "Enter a name for the library."
And la bibliothèque s'appelle toujours "Primary"
```

### Scenario: nom vide ou trop long refusé par l'API

```gherkin
Given la bibliothèque "Primary" d'identifiant 2
When un administrateur renomme la bibliothèque 2 en "   ", ou en un nom de 256 caractères
Then la réponse est 400
And la bibliothèque s'appelle toujours "Primary"
```

### Scenario: bibliothèque inconnue

```gherkin
When un administrateur renomme la bibliothèque 999999999
Then la réponse est 404 avec le message "Library not found: 999999999"
```

### Scenario: réservé à l'administrateur

```gherkin
Given un utilisateur connecté de rôle "LIBRARIAN" ou "USER"
When il renomme une bibliothèque
Then la réponse est 403
And la bibliothèque garde son nom
```

---

## Critères d'acceptation

- [x] `PUT /api/v1/libraries/{id}` `{ name }` → `200` avec `{ id, name }` ;
      `400` (`ApiError`) si le nom est absent, vide après `trim()` ou dépasse 255
      caractères ; `404` (`ApiError`) si l'`id` est inconnu ; `409` (`ApiError`)
      si le nom est pris par une autre bibliothèque, à la casse près, que le
      conflit soit vu par la vérification préalable ou par l'index unique ;
      `ADMIN` seulement.
- [x] La règle est déclarée dans le groupe « Libraries » de `SecurityConfig` et
      ajoutée à `ApiAuthorizationMatrixTest` avec `ADMIN_ONLY`.
- [x] Le champ de renommage n'accepte pas plus de 255 caractères.
- [x] Le `.bru` de l'endpoint est dans `server/API/LibraryController/`.
- [x] Critères permanents :
  - [x] Chaque scénario a un test automatisé nommé `US-03: <titre du scénario>`
  - [x] Toute la suite passe (`./mvnw -q test` depuis `server/`), et
        `npm run test:e2e` dans `web/`
  - [x] `npm run lint` dans `web/` ne signale aucune nouvelle erreur
  - [x] Le backend démarre avec `ddl-auto=validate`
  - [x] Commentaires de code en anglais, réduits à ce que le code ne peut pas dire

---

## Vérification de bout en bout

**Préparation** : `docker compose up -d db`, backend, `npm run dev` dans `web/` ;
compte admin et compte bibliothécaire. Noter l'`id` d'une copie du Preschool
(`SELECT id FROM copy WHERE library_id = 1 LIMIT 1;`).

1. Admin, **Settings** → « Rename » sur Primary → champ pré-rempli « Primary »,
   « Save », « Cancel ».
2. Saisir `  Primary School  `, « Save » → la liste montre Preschool, Primary
   School.
3. « Rename » sur Primary School, saisir `preschool`, « Save » → « A library
   named "Preschool" already exists. » ; vider le champ, « Save » → « Enter a
   name for the library. » ; « Cancel » → Primary School.
4. « Rename » sur Preschool → `Nursery`, « Save ». Bruno `CopyController/getCopy`
   sur la copie notée → `library: { id: 1, name: "Nursery" }`. `psql` :
   `copy.library_id` de cette copie vaut toujours 1.
5. « Rename » sur Nursery → `Preschool` ; « Rename » sur Primary School →
   `Primary`. Puis « Rename » sur Primary → `primary`, « Save » → accepté ; le
   remettre en `Primary`.
6. Bruno, admin : `renameLibrary` sur `999999999` → `404`.
7. Bruno, bibliothécaire : `renameLibrary` sur 2 → `403`.

**Nettoyage** : l'étape 5 remet les noms d'origine ; vérifier en `psql` que la
table contient `Preschool` et `Primary`.

---

## Points de vigilance

- **Exclure la bibliothèque elle-même de la recherche de doublon.** Chercher
  « primary » parmi *toutes* les bibliothèques trouve « Primary » — elle-même — et
  refuse un simple changement de casse.
- **Ne rien faire aux copies.** Le renommage ne touche qu'une ligne de
  `library` ; un test qui attendrait un changement sur `copy` se trompe.
- **Les étiquettes imprimées restent valables** : le QR code porte
  `LIB:<id>`, pas le nom. Ne pas régénérer les QR codes.
- **`LibraryDTO` n'a pas à changer** pour que les copies montrent le nouveau nom :
  il est construit à chaque réponse à partir de l'entité.
