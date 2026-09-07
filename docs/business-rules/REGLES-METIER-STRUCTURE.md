# Règles métier — Contraintes structurelles de la base

> Les règles qui ne sont écrites nulle part dans le code applicatif mais que la
> base impose : clés étrangères, cascades, index uniques, triggers. Elles
> déterminent ce qui est **possible**, ce qui est **irréversible**, et ce qui
> **échoue** — souvent au pire moment.
>
> Toutes les contraintes de ce document ont été **vérifiées sur la base en
> service**, pas seulement lues dans les migrations.

Documents liés :
[règles emprunts/réservations](REGLES-METIER-EMPRUNTS-RESERVATIONS.md) ·
[règles accès](REGLES-METIER-ACCES.md) ·
[règles paramètres](REGLES-METIER-PARAMETRES.md)

---

## Table des matières

- [1. Pourquoi ce document existe](#1-pourquoi-ce-document-existe)
- [2. Supprimer un livre ou une copie](#2-supprimer-un-livre-ou-une-copie)
- [3. Supprimer un utilisateur](#3-supprimer-un-utilisateur)
- [4. Supprimer une bibliothèque](#4-supprimer-une-bibliothèque)
- [5. `copy.status` appartient aux triggers](#5-copystatus-appartient-aux-triggers)
- [6. Index uniques partiels : les règles invisibles](#6-index-uniques-partiels--les-règles-invisibles)
- [7. Dérive du schéma réel](#7-dérive-du-schéma-réel)
- [8. Les colonnes d'audit ne sont pas des clés étrangères](#8-les-colonnes-daudit-ne-sont-pas-des-clés-étrangères)
- [9. Récapitulatif des cascades](#9-récapitulatif-des-cascades)

---

## 1. Pourquoi ce document existe

Une partie des règles métier de Booksnap n'est pas dans le service : elle est
dans la définition des tables. Une clé étrangère sans `ON DELETE` **interdit**
une suppression ; une clé étrangère `ON DELETE CASCADE` la rend **silencieuse et
irréversible**. Les deux se voient mal en lisant le code Java.

Ces contraintes ne sont pas homogènes dans Booksnap. Certaines protègent,
d'autres détruisent, parfois sur la même entité.

---

## 2. Supprimer un livre ou une copie

### Les contraintes

```
copy.book_id       → book(id)     ON DELETE CASCADE
borrowing.copy_id  → copy(id)     (aucune action → NO ACTION)
hold.copy_id       → copy(id)     (aucune action → NO ACTION)
```

### Ce que cela implique

**Une copie qui a déjà été empruntée ne peut pas être supprimée.** `NO ACTION`
bloque la suppression tant qu'une ligne `borrowing` ou `hold` la référence — y
compris un emprunt `returned` vieux de trois ans. C'est une protection de
l'historique, et elle est souhaitable.

**Mais elle n'est pas gérée par le code.** `CopyServiceImpl.deleteCopyById:113`
appelle `deleteById` sans aucune vérification :

```java
public void deleteCopyById(Long copyId) {
    if (copyRepository.existsById(copyId)){
        copyRepository.deleteById(copyId);   // ← violation de FK si la copie a un historique
    } else {
        throw new CopyNotFoundException(copyId);
    }
}
```

L'appelant reçoit une `DataIntegrityViolationException` brute, pas un **409**
explicite. **Règle : la suppression d'une copie doit d'abord vérifier
l'existence d'un `borrowing` ou d'un `hold` et renvoyer un 409 explicite.**

**`DELETE /books/{id}` hérite du même mur.** Supprimer une notice tente de
supprimer ses copies en cascade ; si l'une d'elles a un historique, la cascade
échoue et **toute la suppression échoue**. L'endpoint est donc déjà inopérant
pour tout livre ayant été emprunté au moins une fois.

**Conséquence d'autorisation :** parce que la cascade traverse toutes les
bibliothèques, `DELETE /books/{id}` est réservé à l'`ADMIN`
([règles accès §4.1](REGLES-METIER-ACCES.md)).

---

## 3. Supprimer un utilisateur

### Les contraintes

```
borrowing.user_id    → users(id)  ON DELETE CASCADE
hold.user_id         → users(id)  (aucune action → NO ACTION)
notification.user_id → users(id)  (aucune action → NO ACTION)
```

### Ce que cela implique

L'asymétrie est ici **dangereuse dans les deux sens** :

- L'usager n'a **que** des emprunts → la suppression réussit et **détruit
  silencieusement tout son historique de prêts**.
- L'usager a une réservation ou une notification → la suppression **échoue** sur
  une violation de clé étrangère.

Le comportement dépend donc des données de la personne, ce qui est le pire cas
de figure : imprévisible, et destructeur quand il réussit.

> **Règle absolue : un utilisateur n'est jamais supprimé physiquement.** La
> désactivation (`is_active = false`) est la seule opération offerte par
> l'interface. Voir [règles accès §6](REGLES-METIER-ACCES.md).

---

## 4. Supprimer une bibliothèque

### Les contraintes

```
copy.library_id → library(id)  (aucune action → NO ACTION)
hold.library_id → library(id)  (aucune action → NO ACTION)
```

Une bibliothèque référencée par la moindre copie ou réservation **ne peut pas
être supprimée**.

### Pourquoi « supprimer quand c'est vide » ne suffit pas

Pour vider une bibliothèque qui ferme, il faudrait supprimer ses copies — ce que
la [§2](#2-supprimer-un-livre-ou-une-copie) interdit dès qu'une copie a un
historique d'emprunt. L'administrateur se retrouve dans une impasse : impossible
de supprimer la bibliothèque, impossible de la vider.

### La règle retenue

| Opération | Condition | Effet |
|---|---|---|
| **Archiver** (`library.is_active = false`) | toujours possible | La bibliothèque disparaît des sélecteurs, aucun nouvel emprunt ni réservation. Copies et historique restent consultables. |
| **Supprimer** | aucune `copy`, aucun `borrowing` actif, aucun `hold` actif | Suppression physique. Réservée à la bibliothèque créée par erreur. |

L'archivage est l'opération du quotidien ; la suppression ne sert qu'au cas
« créée par erreur, encore vide ».

---

## 5. `copy.status` appartient aux triggers

`copy.status` n'est **jamais** écrit par le code applicatif, hors action manuelle
« Update status ». Quatre triggers le synchronisent depuis `borrowing` et
`hold`. Le détail des règles est dans
[règles emprunts §5](REGLES-METIER-EMPRUNTS-RESERVATIONS.md).

Deux conséquences pour toute nouvelle fonctionnalité qui touche aux prêts :

1. **L'entité en mémoire est périmée** après une écriture déclenchant un
   trigger. Il faut `saveAndFlush(...)` puis `entityManager.refresh(copy)`.
2. **L'ordre des flushs détermine le statut final** quand plusieurs écritures
   ont lieu dans la même transaction. Un retour suivi d'une promotion de
   réservation ne fonctionne que si la mise à jour de l'emprunt atteint la base
   **avant** celle de la réservation.

Ces règles s'appliqueront telles quelles au renouvellement et à la suspension.

---

## 6. Index uniques partiels : les règles invisibles

Ces index portent des règles métier que rien ne signale dans le code Java.

| Index | Règle imposée |
|---|---|
| `uq_borrowing_one_active_per_copy` sur `borrowing(copy_id) WHERE status IN ('borrowed','overdue')` | Une copie ne peut avoir **qu'un seul emprunt actif**. Une double sortie échoue en base. |
| `uq_hold_one_active_per_user_book` sur `hold(user_id, book_id) WHERE status IN ('pending','active')` | Un usager ne peut avoir **qu'une réservation en cours par livre**. |
| `idx_hold_pending_queue` sur `hold(book_id, created_date) WHERE status = 'pending'` | Matérialise l'ordre de la file d'attente : `created_date` **est** la position. |

**À retenir pour les nouvelles tables :** un index unique partiel est la bonne
façon d'exprimer « une seule ligne dans tel état ». C'est aussi la seule façon
correcte de garantir une ligne globale unique dans `app_setting`
([règles paramètres §1](REGLES-METIER-PARAMETRES.md)).

---

## 7. Dérive du schéma réel

**Le mécanisme qui produisait la dérive est fermé depuis l'US-001.** Le schéma
appartient à Flyway (`server/src/main/resources/db/migration`), et
`ddl-auto=validate` interdit à Hibernate d'y toucher. La dérive **déjà
constituée**, elle, reste à résorber : les sections ci-dessous en font
l'inventaire.

### Comment la dérive s'est constituée

Trois chemins appliquaient chacun une partie des modifications, sans qu'aucun ne
sache ce que les deux autres avaient fait :

| Chemin | Ce qu'il appliquait | Ce qu'il ratait |
|---|---|---|
| `schema.sql` monté dans `/docker-entrypoint-initdb.d/` | tout, mais **uniquement** à la création du volume `booksnap-db-data` | toute base déjà existante |
| `ddl-auto=update` | tables et colonnes des entités JPA | énumérations, index partiels, triggers, domaines, colonnes hors entité — et **jamais** un changement de type |
| `ALTER` tapé à la main | ce qui était tapé | toutes les autres bases |

`schema.sql` et `dewey.sql` sont **supprimés** : ils n'étaient déjà plus montés
ni joués, remplacés par `V1__baseline_schema.sql` et `V2__dewey_reference_data.sql`.
`V1` a été généré depuis la base **en service**, pas depuis `schema.sql`, parce
que c'est elle qui faisait foi.

### Dérive résorbée

`V3__drop_orphan_enum_types.sql` a supprimé deux types énumérés que
`ddl-auto=update` avait créés en doublon, et quatre casts implicites associés :

| Type orphelin | Doublonnait | Utilisé par |
|---|---|---|
| `keystage` | `key_stage` | aucune colonne |
| `status` | `hold_status` | aucune colonne |

Leur origine mérite d'être retenue, parce qu'elle explique pourquoi la dérive
était silencieuse : à la création, Hibernate dérivait le nom du type PostgreSQL
du nom de la classe Java — trois enums Java s'appellent `Status`, un `KeyStage`.
À la validation, en revanche, il compare le **code JDBC** et pas ce nom. Le même
outil créait donc des types en trop sans jamais protester ensuite de leur
présence.

### Sensibilité à la casse — corrigée par V4

`V4__users_email_citext.sql` a converti les trois colonnes qui portaient une
contrainte UNIQUE tout en étant sensibles à la casse :

| Colonne | Avant | Après | Enjeu |
|---|---|---|---|
| `users.email` | `varchar(255)` | domaine `email` (`citext` + CHECK) | identifiant de connexion |
| `author.name` | `varchar(255)` | `citext` | dédoublement du catalogue |
| `genre.name` | `varchar(255)` | `citext` | idem |
| `users.parent_email` | domaine `email` | inchangé | était déjà conforme |
| `library.name` | `varchar(255)` | inchangé | `schema.sql` la déclarait `TEXT`, pas `CITEXT` |

`Alice@school.org` et `alice@school.org` sont désormais le même compte, et
« J.K. Rowling » / « J.K. ROWLING » le même auteur.

> #### `citext` seul ne suffit pas : `stringtype=unspecified` est obligatoire
>
> Le pilote JDBC envoie les paramètres de `setString()` typés `varchar` par
> défaut. PostgreSQL résout alors `citext = varchar` en comparaison **`text`**,
> et la casse redevient significative — silencieusement. Mesuré sur la base :
>
> | Comparaison | Résultat |
> |---|---|
> | `email = 'Alice@…'` (littéral non typé) | 1 ligne ✅ |
> | `email = 'Alice@…'::varchar` | **0 ligne** ❌ |
> | `email = 'Alice@…'::citext` | 1 ligne ✅ |
>
> D'où `?stringtype=unspecified` dans l'URL JDBC
> (`application.properties`) : le paramètre part non typé et le serveur l'infère
> en `citext`. **Retirer ce paramètre casse l'insensibilité à la casse sans
> qu'aucun test de schéma ni aucune erreur ne le signale.**
>
> L'asymétrie mérite d'être connue : l'**unicité** est protégée dans tous les
> cas, parce que la valeur est convertie en `citext` à l'écriture avant d'être
> indexée. Seule la **recherche** dépend du typage du paramètre. Un doublon
> serait donc refusé, mais le compte resterait introuvable.

Conséquence côté entités : `ddl-auto=validate` compare le nom du type déclaré
dans `@Column(columnDefinition = …)` à celui reporté par le pilote. `User.email`
porte `"email"` (le nom du **domaine**), `Author.name` et `Genre.name` portent
`"citext"`. Le type Java reste `String`.

`BookApiMapper` normalisait la casse en code (`toLowerCase()` pour les genres,
title-case pour les auteurs). **Supprimé** : ce contournement était devenu
redondant, et il était de toute façon imparfait —
`normalizeToTitleCase("j.k. rowling")` rendait `J.k. Rowling`, qui ne retrouvait
pas `J.K. Rowling`. Seul le `trim()` subsiste : `citext` normalise la casse, pas
les espaces.

La casse saisie est désormais **conservée au stockage** et ne sert plus à
distinguer. Vérifié de bout en bout : `"j.k. rowling"` retrouve `J.K. Rowling`,
`"MYSTERY"` retrouve `Mystery`, et un genre réellement nouveau (`"Space Opera"`)
est créé tel quel au lieu d'être aplati en minuscules.

### Dérive ouverte

Curiosité non élucidée : `users.parent_email` était déjà sur le domaine `email`
alors que `users.email` n'y était pas, dans la même table. `parent_email` n'est
mappé par aucun champ de l'entité `User` — Hibernate ne l'a donc ni créée ni
modifiée. Les deux colonnes ont divergé par un chemin qu'on ne peut plus
reconstituer. C'est précisément l'argument pour Flyway : une modification non
versionnée ne laisse aucune trace de quand ni pourquoi elle a eu lieu.

### Règle de travail

Toute modification de schéma est une **nouvelle migration** `V<n>__<description>.sql`
dans `server/src/main/resources/db/migration`, appliquée au démarrage du backend
depuis l'IDE. Jamais un `ALTER` tapé à la main sur la base en service — et jamais
la modification d'une migration déjà appliquée, dont Flyway vérifie le checksum.

Le schéma réel est désormais reconstituable depuis les migrations, mais la
commande reste le moyen le plus rapide de lever un doute sur un type :

```bash
docker exec booksnap-postgres sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "\d users"'
```

Ce que `validate` ne rattrapera pas : il tolère les variantes temporelles
PostgreSQL. Les champs d'audit `created_date` / `last_modified_date` sont
`timestamp with time zone` en base et `LocalDateTime` côté entité — écrits avec
fuseau, relus sans. Ce n'est pas de la dérive de schéma, mais c'est une
imprécision de modélisation qu'aucun outil ne signalera.

---

## 8. Les colonnes d'audit ne sont pas des clés étrangères

Dix tables portent `created_by`, `created_date`, `last_modified_by`,
`last_modified_date` — `author`, `book`, `borrowing`, `copy`, `cover`, `genre`,
`hold`, `library`, `users` et `auth_identity`. Elles sont remplies par
`AuditingEntityListener`, qui demande l'auteur courant à `AuditorAwareImpl`.

### Ce qui est enregistré : l'adresse email

`auth.getName()` renvoie le `username` du `UserDetails`, et
`AuthenticatedUser.getUsername()` renvoie l'email. **C'est un choix, pas un effet
de bord de l'API.**

| Option | Pour | Contre |
|---|---|---|
| Email | Lisible directement en base, sans jointure | Change si l'adresse change |
| Identifiant numérique | Stable définitivement | Illisible sans jointure |

L'email l'emporte parce que ces colonnes servent à **remonter une trace**, le
plus souvent depuis `psql` au moment où l'on cherche qui a saisi quoi. Un
identifiant numérique obligerait à une jointure à chaque fois, pour une colonne
qui n'est consultée que dans ce contexte.

Le prix est assumé : une adresse corrigée laisse les anciennes lignes au nom de
l'ancienne. **C'est un journal de ce qui était vrai au moment de l'écriture**, pas
une référence vers un compte.

> **Ne jamais transformer ces colonnes en clé étrangère vers `users`.** Une
> contrainte les rendrait sensibles à l'état du compte, alors qu'un utilisateur
> n'est de toute façon jamais supprimé ([§3](#3-supprimer-un-utilisateur)). Et la
> conversion serait à sens unique : le texte déjà écrit — `system`, `NULL`, ou une
> adresse dont le compte n'existe plus — ne se convertit pas en `bigint`.
>
> Le type est `varchar(255)` partout sauf sur `auth_identity`, en `text` : sans
> contrainte, c'est sans conséquence, mais la prochaine table auditée devrait
> trancher plutôt que copier au hasard.

### Les trois valeurs possibles

| Valeur | Origine |
|---|---|
| Une adresse email | Une écriture faite par une personne connectée |
| `system` | Le bootstrap admin, le scheduler de retards — aucune session |
| `NULL` | Les lignes chargées par `seed.sql` / `covers.sql`, qui écrivent en SQL direct |

Les lignes antérieures à l'authentification (US-005) portent `system` sans que
cela désigne quoi que ce soit : l'information n'a jamais été enregistrée, et
aucune reprise n'est possible.

**`anonymousUser` n'est pas dans cette liste, et c'est le seul vrai piège.**
Spring Security fournit une `Authentication` anonyme dont `isAuthenticated()`
renvoie `true` : un `AuditorAware` naïf enregistre donc la chaîne
`"anonymousUser"` — qui ressemble à un compte et n'en est pas un — au lieu de
retomber sur `system`. `AuditorAwareImpl` écarte explicitement
`AnonymousAuthenticationToken`, et `AuditorAwareImplTest` le vérifie.

### Les mises à jour en masse contournent tout ce mécanisme

Une requête `@Modifying` est traduite directement en SQL : aucune entité n'est
chargée, `AuditingEntityListener` ne voit jamais les lignes, et les colonnes
d'audit gardent leur valeur précédente. `BorrowingRepository.markOverdue` — le
passage en retard nocturne — est dans ce cas et renseigne donc `last_modified_by`
et `last_modified_date` lui-même.

Sans cela, la ligne continuerait de désigner le bibliothécaire qui a enregistré
l'emprunt : **une modification attribuée à quelqu'un qui ne l'a pas faite**, ce
qui est pire qu'une absence d'attribution. La règle vaut pour toute requête en
masse ajoutée plus tard sur une table auditée.

---

## 9. Récapitulatif des cascades

| Clé étrangère | Comportement | Effet d'une suppression du parent |
|---|---|---|
| `copy.book_id → book` | `CASCADE` | ⚠️ Détruit toutes les copies, **toutes bibliothèques confondues** |
| `book_genre.*`, `book_author.*` | `CASCADE` | Nettoyage attendu des tables de liaison |
| `borrowing.user_id → users` | `CASCADE` | ⚠️ **Détruit tout l'historique d'emprunts** de l'usager |
| `borrowing.copy_id → copy` | `NO ACTION` | 🛡️ Bloque la suppression de la copie |
| `hold.copy_id → copy` | `NO ACTION` | 🛡️ Bloque |
| `hold.user_id → users` | `NO ACTION` | 🛡️ Bloque |
| `hold.book_id → book` | `NO ACTION` | 🛡️ Bloque |
| `hold.library_id → library` | `NO ACTION` | 🛡️ Bloque |
| `copy.library_id → library` | `NO ACTION` | 🛡️ Bloque |
| `notification.user_id → users` | `NO ACTION` | 🛡️ Bloque |
| `notification.borrowing_id → borrowing` | `NO ACTION` | 🛡️ Bloque |

🛡️ protège l'historique · ⚠️ détruit sans avertissement
