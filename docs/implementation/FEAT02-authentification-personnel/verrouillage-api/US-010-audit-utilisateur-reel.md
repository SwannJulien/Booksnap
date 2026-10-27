# US-010 — Enregistrer le vrai auteur dans l'audit

[← Fonctionnalité](README.md) · [← Phase 1](../README.md) · [← Plan](../../README.md)

| | |
|---|---|
| **Phase** | 1 — Authentification du personnel |
| **Fonctionnalité** | Verrouillage de l'API |
| **Dépend de** | [US-009](US-009-verrouillage-endpoints.md) |
| **Portée** | Back (vérification, peu ou pas de code) |

---

## Récit

**En tant que** responsable de la bibliothèque
**je veux** savoir **qui** a créé ou modifié une notice, une copie ou un emprunt
**afin de** pouvoir remonter la trace d'une erreur de saisie ou d'une suppression.

## Contexte

Toutes les tables métier portent déjà `created_by`, `created_date`,
`last_modified_by`, `last_modified_date`, via la classe `Auditable`. Et
`AuditorAwareImpl` lit **déjà** `SecurityContextHolder` :

```java
Authentication auth = SecurityContextHolder.getContext().getAuthentication();
if (auth != null && auth.isAuthenticated()) {
    return Optional.of(auth.getName());
}
return Optional.of("system"); // fallback
```

Toutes ces colonnes valent donc `"system"` aujourd'hui, faute d'authentification.
**Elles se remplissent correctement dès qu'une session existe, sans modifier
cette classe.**

Cette story est avant tout une **vérification** : confirmer que le mécanisme
fonctionne réellement, et traiter les deux cas où il se comporte mal.

---

## Scénarios

### Scenario: une création est attribuée à son auteur

```gherkin
Given un bibliothécaire connecté
When il crée une copie
Then "created_by" de la copie contient son identifiant
And "created_by" ne vaut pas "system"
```

### Scenario: une modification est attribuée à son auteur

```gherkin
Given une copie créée par un premier bibliothécaire
When un second bibliothécaire connecté la modifie
Then "created_by" reste le premier
And "last_modified_by" devient le second
```

### Scenario: une écriture par le scheduler est attribuée au système

```gherkin
Given aucune session utilisateur
When le scheduler de passage en retard modifie un emprunt
Then "last_modified_by" vaut "system"
```

### Scenario: l'identifiant enregistré est stable

```gherkin
Given un utilisateur dont l'adresse email est modifiée
When il modifie une notice après ce changement
Then l'identifiant enregistré permet toujours de le retrouver de façon fiable
```

---

## Critères d'acceptation

- [x] Une écriture par un utilisateur connecté renseigne `created_by` / `last_modified_by` avec son identifiant, et non `"system"`.
- [x] Une écriture par le scheduler (`OverdueBorrowingScheduler`) reste attribuée à `"system"`.
- [x] **Le choix de l'identifiant enregistré est explicite et documenté** : email, ou identifiant numérique — voir points de vigilance.
- [x] Un utilisateur anonyme ne peut plus écrire (garanti par US-009) : la valeur `"system"` ne provient donc plus jamais d'un appel externe.
- [x] Le format est cohérent sur toutes les tables auditées.

---

## Plan d'implémentation

1. **Vérifier avant de coder.** Après US-009, se connecter, créer une copie, et
   regarder :

   ```bash
   docker exec booksnap-postgres sh -c \
     'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "SELECT id, created_by, last_modified_by FROM copy ORDER BY id DESC LIMIT 5"'
   ```

   Si la valeur est correcte, l'essentiel de la story est déjà acquis.

2. **Trancher l'identifiant enregistré.** `auth.getName()` renvoie le
   `username` du `UserDetails`, soit l'email. C'est lisible, mais **ce n'est pas
   stable** : une adresse peut changer.

   | Option | Pour | Contre |
   |---|---|---|
   | Email (`auth.getName()`) | Lisible directement en base, aucun code | Change si l'adresse change ; les anciennes lignes deviennent orphelines |
   | Identifiant numérique | Stable définitivement | Illisible sans jointure |

   Recommandation : **conserver l'email**. La colonne est un `TEXT` de traçabilité,
   pas une clé étrangère, et la lisibilité directe est ce qui la rend utile en
   exploitation. Documenter que ce n'est pas une référence.

3. **Vérifier le scheduler.** `OverdueBorrowingScheduler` s'exécute sans session :
   le repli `"system"` doit s'appliquer. Confirmer qu'il ne récupère pas par
   accident le contexte d'un utilisateur — le `SecurityContextHolder` est lié au
   thread, et un scheduler s'exécute sur un autre thread, ce qui est bien le
   comportement voulu.

4. **Vérifier la valeur `anonymousUser`.** Spring Security fournit une
   `Authentication` anonyme dont `isAuthenticated()` renvoie **`true`** :
   `AuditorAwareImpl` enregistrerait alors la chaîne `"anonymousUser"` au lieu de
   `"system"`. Après US-009 aucun appel anonyme n'écrit plus, mais la garde est
   d'un coût nul :

   ```java
   if (auth != null && auth.isAuthenticated()
       && !(auth instanceof AnonymousAuthenticationToken)) { ... }
   ```

5. **Documenter** la signification de ces colonnes dans les
   [règles structurelles](../../../../business-rules/REGLES-METIER-STRUCTURE.md).

---

## Points de vigilance

- **`isAuthenticated()` vaut `true` pour l'utilisateur anonyme.** C'est le piège
  classique de `AuditorAware`, et la seule vraie correction de code de cette
  story.
- **Les lignes existantes gardent `"system"`.** Aucune reprise n'est possible :
  l'information n'a jamais été enregistrée. Ne pas tenter de la deviner.
- **Ne pas transformer ces colonnes en clé étrangère vers `users`.** Ce sont des
  colonnes de traçabilité ; une contrainte les rendrait sensibles à la
  désactivation d'un compte, et le projet interdit déjà la suppression d'un
  utilisateur ([règles structurelles §3](../../../../business-rules/REGLES-METIER-STRUCTURE.md)).
