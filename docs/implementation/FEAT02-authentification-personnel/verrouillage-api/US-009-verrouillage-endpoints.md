# US-009 — Verrouiller tous les endpoints par rôle

[← Fonctionnalité](README.md) · [← Phase 1](../README.md) · [← Plan](../../README.md)

| | |
|---|---|
| **Phase** | 1 — Authentification du personnel |
| **Fonctionnalité** | Verrouillage de l'API |
| **Dépend de** | [US-005](../authentification-session/US-005-connexion-mot-de-passe.md), [US-006](../authentification-session/US-006-csrf-et-cors.md), [US-007](../authentification-session/US-007-bootstrap-premier-admin.md) |
| **Doit être livrée avec** | [US-011](../login-frontend/US-011-vue-connexion.md), [US-012](../login-frontend/US-012-garde-de-routes.md), [US-013](../login-frontend/US-013-gestion-401-deconnexion.md) |
| **Portée** | Back |
| **Casse l'existant ?** | **Oui — bascule sans retour** |

---

## Récit

**En tant que** responsable de l'application
**je veux** que chaque endpoint exige une authentification et le bon rôle
**afin que** les données des élèves et le fonds documentaire ne soient plus
accessibles à quiconque connaît l'URL.

## Contexte

`SecurityConfig` fait `anyRequest().permitAll()`. Les 28 endpoints du projet
sont ouverts, y compris `GET /api/v1/users/search`, qui renvoie **nom, prénom et
email de tous les usagers actifs**.

Cette story applique la matrice des
[règles accès §3](../../../REGLES-METIER-ACCES.md), **sans** la portée par
bibliothèque (phase 2).

---

## Scénarios

### Scenario: un appel non authentifié est refusé

```gherkin
Given aucune session
When un endpoint métier est appelé
Then la réponse est 401
And aucune donnée métier n'est renvoyée
```

### Scenario: le répertoire des usagers est fermé

```gherkin
Given un utilisateur connecté de rôle "USER"
When il appelle la recherche d'utilisateurs
Then la réponse est 403
```

### Scenario: un bibliothécaire gère le fonds

```gherkin
Given un utilisateur connecté de rôle "LIBRARIAN"
When il crée une copie
Then l'opération réussit
```

### Scenario: un bibliothécaire ne supprime pas un livre

```gherkin
Given un utilisateur connecté de rôle "LIBRARIAN"
When il tente de supprimer un livre
Then la réponse est 403
```

### Scenario: un administrateur supprime un livre

```gherkin
Given un utilisateur connecté de rôle "ADMIN"
When il supprime un livre sans historique d'emprunt
Then l'opération réussit
```

### Scenario: un élève consulte le catalogue

```gherkin
Given un utilisateur connecté de rôle "USER"
When il recherche un livre
Then la réponse est 200
```

### Scenario: un élève n'accède pas aux emprunts globaux

```gherkin
Given un utilisateur connecté de rôle "USER"
When il appelle la liste de tous les emprunts
Then la réponse est 403
```

### Scenario: distinguer non authentifié et non autorisé

```gherkin
Given aucune session
When un endpoint réservé aux administrateurs est appelé
Then la réponse est 401 et non 403
```

### Scenario: la sonde de santé reste ouverte

```gherkin
Given aucune session
When l'endpoint de santé actuator est appelé
Then la réponse est 200
```

---

## Critères d'acceptation

- [x] Tout endpoint non explicitement ouvert exige une authentification (`anyRequest().authenticated()` en règle terminale).
- [x] La matrice des [règles accès §3](../../../../business-rules/REGLES-METIER-ACCES.md) est appliquée aux **28** endpoints existants.
- [x] `GET /api/v1/users/search` est interdit au rôle `USER`.
- [x] `DELETE /books/{id}` est réservé à `ADMIN`.
- [x] Restent ouverts sans authentification : les endpoints de connexion et la sonde de santé actuator.
- [x] **401** pour « non authentifié », **403** pour « authentifié mais rôle insuffisant » — jamais l'un pour l'autre.
- [x] Les corps d'erreur suivent le format existant (`ApiError`, `GlobalExceptionHandler`).
- [x] Aucun endpoint n'est oublié : la liste est vérifiée contrôleur par contrôleur.
- [x] La collection Bruno est mise à jour pour porter une session.
- [x] `GET /covers/{isbn}` est accessible à tout utilisateur authentifié — les couvertures s'affichent dans le catalogue.

---

## Plan d'implémentation

1. **Inventorier les endpoints** — la liste doit être exhaustive, un oubli
   laissant soit une faille, soit une fonctionnalité cassée :

   ```bash
   cd server/src/main/java/net/booksnap
   for f in $(find . -name "*Controller.java" | sort); do
     echo "### $f"
     grep -nE "@(Get|Post|Put|Patch|Delete)Mapping|@RequestMapping" "$f"
   done
   ```

2. **Choisir où porter la règle.** Deux styles :

   | Style | Avantage |
   |---|---|
   | Tout dans `SecurityConfig` (`requestMatchers`) | Une seule vue d'ensemble, facile à relire face à la matrice |
   | `@PreAuthorize` sur les méthodes | Au plus près du code, survit à un changement d'URL |

   Recommandation : **`SecurityConfig` pour cette story**. La matrice se relit
   d'un bloc, ce qui est ce dont on a besoin pour vérifier qu'aucun endpoint
   n'est oublié. `@PreAuthorize` deviendra nécessaire en phase 2, quand la
   décision dépendra des données (la bibliothèque de la copie) et non plus de la
   seule URL.

3. **Écrire les règles**, du plus spécifique au plus général, en terminant par
   `anyRequest().authenticated()`. Attention à l'ordre : le premier
   `requestMatcher` qui correspond gagne.

4. **Distinguer 401 et 403** : `AuthenticationEntryPoint` pour le premier,
   `AccessDeniedHandler` pour le second, tous deux au format `ApiError`.

5. **Vérifier endpoint par endpoint**, avec un compte de chaque rôle. C'est
   fastidieux et c'est le cœur de la story : un test d'intégration par ligne de
   la matrice est le meilleur investissement de cette phase.

6. **Mettre à jour la collection Bruno** : les requêtes doivent porter une
   session, et l'environnement `Localhost.bru` documenter la marche à suivre.

---

## Points de vigilance

- **Ne pas déployer seule.** Le front n'a pas encore d'écran de connexion : sans
  US-011 à US-013, l'application est inutilisable.
- **Terminer par `anyRequest().authenticated()`**, jamais par `permitAll()`. Le
  défaut doit être « fermé » : un endpoint ajouté plus tard sera alors protégé
  d'office, quitte à devoir être ouvert explicitement.
- **Ordre des matchers.** Une règle générale placée avant une règle spécifique
  masque cette dernière, silencieusement.
- **Les couvertures.** `GET /covers/{isbn}` alimente l'affichage du catalogue :
  la fermer par excès de prudence casse toutes les vignettes.
- **La portée bibliothèque n'existe pas encore.** Un `LIBRARIAN` peut agir sur
  toutes les bibliothèques — le noter pour ne pas croire la phase 2 déjà faite.
- **Prévoir un retour arrière.** Une propriété permettant de revenir
  temporairement à une chaîne ouverte peut sauver une mise en service ; elle doit
  être clairement identifiée pour ne pas rester en place.
