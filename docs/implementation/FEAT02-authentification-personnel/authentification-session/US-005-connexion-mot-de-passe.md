# US-005 — Se connecter par email et mot de passe

[← Fonctionnalité](README.md) · [← Phase 1](../README.md) · [← Plan](../../README.md)

| | |
|---|---|
| **Phase** | 1 — Authentification du personnel |
| **Fonctionnalité** | Authentification et session |
| **Dépend de** | [US-002](../../phase-0-socle-migrations/outillage-migrations/US-002-corriger-derive-email.md), [US-003](../modele-identite/US-003-table-auth-identity.md), [US-004](../modele-identite/US-004-role-utilisateur.md) |
| **Va avec** | [US-006](US-006-csrf-et-cors.md) — à ne pas déployer séparément |
| **Bloque** | US-007 à US-013 |
| **Portée** | Back |
| **Casse l'existant ?** | Non — les endpoints métier restent ouverts jusqu'à US-009 |

---

## Récit

**En tant que** membre du personnel de la bibliothèque
**je veux** me connecter avec mon email et mon mot de passe
**afin que** l'application sache qui je suis et enregistre mes actions à mon nom.

## Contexte

`SecurityConfig` se résume aujourd'hui à `anyRequest().permitAll()`, avec CSRF
désactivée. `spring-boot-starter-security` est déjà dans `pom.xml`, inutilisé.

Cette story met en place **l'authentification** ; elle ne restreint encore
**aucun** endpoint métier — c'est US-009. On peut donc la livrer sans rien
casser.

Voir [règles accès §5](../../../../business-rules/REGLES-METIER-ACCES.md).

---

## Scénarios

### Scenario: connexion réussie

```gherkin
Given un utilisateur actif ayant une identité "local"
When il soumet son email et son mot de passe corrects
Then il reçoit une réponse 200
And un cookie de session httpOnly est posé
And la réponse contient son identité, son rôle, mais aucun élément secret
```

### Scenario: mot de passe incorrect

```gherkin
Given un utilisateur actif ayant une identité "local"
When il soumet son email avec un mot de passe incorrect
Then il reçoit une réponse 401
And le message d'erreur ne précise pas si c'est l'email ou le mot de passe qui est faux
And aucun cookie de session n'est posé
```

### Scenario: la casse de l'email n'empêche pas la connexion

```gherkin
Given un utilisateur enregistré avec l'email "alice.martin@example.com"
When il se connecte avec "Alice.Martin@Example.com" et le bon mot de passe
Then la connexion réussit
```

### Scenario: compte désactivé

```gherkin
Given un utilisateur dont "is_active" est false
When il soumet des identifiants corrects
Then il reçoit une réponse 401
And aucun cookie de session n'est posé
```

### Scenario: compte sans identité "local"

```gherkin
Given un élève dont le compte ne porte aucune identité
When on tente de se connecter avec son email et un mot de passe quelconque
Then la réponse est 401
And le temps de réponse ne permet pas de deviner que le compte existe
```

### Scenario: consulter la session courante

```gherkin
Given un utilisateur connecté
When il interroge l'endpoint de session courante
Then il reçoit son identité et son rôle
```

### Scenario: session courante sans être connecté

```gherkin
Given aucune session
When l'endpoint de session courante est interrogé
Then la réponse est 401
```

### Scenario: déconnexion

```gherkin
Given un utilisateur connecté
When il se déconnecte
Then sa session est invalidée côté serveur
And le cookie de session est effacé
And l'endpoint de session courante répond 401
```

---

## Critères d'acceptation

- [x] `POST /api/v1/auth/login` accepte `{ email, password }` en JSON.
- [x] `POST /api/v1/auth/logout` invalide la session **côté serveur**, pas seulement le cookie.
- [x] `GET /api/v1/auth/me` renvoie l'utilisateur connecté (id, prénom, nom, email, rôle) ou 401.
- [x] Les mots de passe sont vérifiés avec **BCrypt** (`BCryptPasswordEncoder`).
- [x] Le cookie de session est `HttpOnly`, `SameSite` réglé, et `Secure` dès que HTTPS est disponible.
- [x] Un échec renvoie **toujours** le même message, quelle que soit la cause (email inconnu, mot de passe faux, compte désactivé, pas d'identité `local`).
- [x] Aucun mot de passe, hash ou jeton n'apparaît dans les logs.
- [x] Un compte `is_active = false` ne peut pas se connecter.
- [x] Les endpoints métier existants **restent accessibles sans authentification** — cette story ne verrouille rien.
- [x] Les endpoints d'authentification sont ajoutés à la collection Bruno (`server/API/AuthController/*.bru`), comme le veut la convention du projet.

---

## Plan d'implémentation

### État des lieux — ce qui existe déjà

Vérifié dans le dépôt avant d'écrire ce plan :

| Élément | État |
|---|---|
| `spring-boot-starter-security` | Dans `pom.xml`, **inutilisé** |
| `spring-security-test`, `spring-boot-starter-test` | Dans `pom.xml`, et **`server/src/test` n'existe pas** |
| `auth_identity` (V5), `users.role` (V7) | Schéma en place, entités `AuthIdentity` / `Role` écrites |
| `AuthIdentityRepository` | `findByProviderAndSubject`, `findByUserIdAndProvider` |
| `UserRepository` | `searchActiveUsers` seulement — **pas de `findByEmail`** |
| `auth_identity` en base de développement | **0 ligne** ; `seed.sql` n'en crée aucune |
| `SecurityConfig` | 8 lignes, DSL chaînée dépréciée, `permitAll` + CSRF désactivée |
| `AuditorAwareImpl` | Existe, renvoie `auth.getName()` ou `"system"` |

Deux conséquences à intégrer au planning : **aucune migration n'est nécessaire**
(tout le schéma requis est déjà appliqué), et **rien n'est testable tant qu'une
identité `local` n'existe pas en base** — voir l'étape 10.

### 1. Accès aux données

Ajouter à `UserRepository` :

```java
Optional<User> findByEmail(String email);
```

L'identité se récupère ensuite avec le `findByUserIdAndProvider` **existant** :
deux requêtes, mais les quatre cas de rejet se lisent linéairement, ce qui compte
plus ici qu'un aller-retour. `findByEmail` servira de toute façon à US-007 et
US-008.

`users.email` est sur le domaine `email` (`citext`) : la recherche n'est
insensible à la casse **que** grâce à `?stringtype=unspecified` dans l'URL JDBC.
C'est ce qui fait passer le scénario « casse de l'email », et rien dans le code
Java ne le signale — ne pas ajouter de `toLowerCase()` compensatoire.

### 2. `UserDetails` et `UserDetailsService`

Un `UserDetails` **dédié** portant l'identifiant, l'email, le rôle et le hash —
pas `org.springframework.security.core.userdetails.User`. `/me` et US-010 en ont
besoin sans repasser en base, et US-009 s'appuiera sur les autorités.

L'énumération `Role` est en minuscules (`user`, `librarian`, `admin`, calquées sur
le type PostgreSQL). L'autorité doit être `ROLE_` + valeur en **majuscules**,
sinon `hasRole("ADMIN")` en US-009 ne correspondra à rien.

Le service place à cet endroit les **quatre** cas de rejet, tous en
`UsernameNotFoundException` :

| Cas | Pourquoi le même exception |
|---|---|
| Email inconnu | — |
| `is_active` faux | Une `DisabledException` est levée **avant** la vérification du mot de passe : message distinct *et* temps de réponse plus court |
| Aucune identité `local` | Le cas de tous les élèves jusqu'en phase 5 |
| Identité `local` sans hash | Interdit par `ck_auth_identity_shape`, mais ne pas s'y fier |

`is_active` est **nullable** en base (défaut `true`) et `User.isActive` est un
`Boolean` : tester `Boolean.TRUE.equals(...)`, pas `user.getIsActive()`, qui
déballe un `null`.

Tout uniformiser en `UsernameNotFoundException` donne gratuitement les deux
protections attendues, parce que `DaoAuthenticationProvider` :

- convertit en `BadCredentialsException` (`hideUserNotFoundExceptions` vaut
  `true` par défaut) — d'où le message unique ;
- exécute un `matches()` contre un hash factice interne quand l'utilisateur est
  introuvable — d'où l'égalisation des temps demandée en points de vigilance.

**Le vérifier plutôt que le supposer** (chronométrer les deux cas, étape 10) : la
protection n'existe que sur ce chemin, et disparaît si on écrit un
`AuthenticationProvider` maison.

Contrepartie assumée : le serveur ne distingue plus les causes. **Journaliser la
cause côté serveur** au moment du rejet — email inconnu / compte désactivé /
pas d'identité locale — sinon le support n'a plus rien pour diagnostiquer.

### 3. `PasswordEncoder`

`BCryptPasswordEncoder` en `@Bean`, coût lu dans une propriété sur le modèle de
`booksnap.cover.max-size-bytes` déjà en place :

```properties
booksnap.security.bcrypt-strength=10
```

Configurable, mais **pas abaissé** : le coût est la protection.

### 4. `AuthenticationManager`

Le contrôleur en a besoin en injection. Il n'est pas exposé en bean par défaut :

```java
@Bean
AuthenticationManager authenticationManager(AuthenticationConfiguration config) throws Exception {
    return config.getAuthenticationManager();
}
```

Cette forme réutilise le `DaoAuthenticationProvider` auto-configuré à partir des
beans `UserDetailsService` et `PasswordEncoder` — donc les protections de
l'étape 2. Le construire à la main les perd.

### 5. Réécrire `SecurityConfig`

Étape prudente : les endpoints métier restent `permitAll`, le verrouillage arrive
en US-009 — déboguer l'authentification et les autorisations en même temps est
la façon la plus sûre de ne comprendre ni l'une ni l'autre.

```
/api/v1/auth/login    permitAll
/api/v1/auth/logout   permitAll
/api/v1/auth/me       authenticated   ← le seul endpoint verrouillé de cette story
anyRequest()          permitAll
```

`/me` **doit** être `authenticated` : c'est ce qui déclenche
l'`AuthenticationEntryPoint` et produit le 401 du scénario « session courante sans
être connecté ». Laissé en `permitAll`, il renverrait 200 avec un principal nul.

Passer au DSL lambda au passage : `.csrf(csrf -> csrf.disable())`, la forme
chaînée actuelle est dépréciée en Spring Security 6.1 et supprimée en 7. CSRF
reste désactivée jusqu'à US-006, ce qui permet d'appeler `login` depuis Bruno
sans jeton.

Ne pas toucher au CORS ici, `WebConfiguration` porte déjà
`allowCredentials(true)` — c'est le périmètre de US-006.

### 6. Poser la session — l'étape où ça casse

Une authentification faite à la main dans un contrôleur **n'est pas persistée**
depuis Spring Security 6 : renseigner le `SecurityContextHolder` ne suffit plus,
il faut écrire explicitement dans le `SecurityContextRepository`.

```java
SecurityContext context = SecurityContextHolder.createEmptyContext();
context.setAuthentication(authentication);
SecurityContextHolder.setContext(context);
securityContextRepository.saveContext(context, request, response);
```

avec un `HttpSessionSecurityContextRepository` en bean. **Sans le `saveContext`,
aucune session n'est créée, aucun cookie n'est posé, et `/me` répond 401 juste
après un login qui a renvoyé 200** — le symptôme est déroutant parce que le login
lui-même a l'air correct.

Enchaîner sur une **stratégie de session** :

| Stratégie | Rôle |
|---|---|
| `ChangeSessionIdAuthenticationStrategy` | Change l'identifiant de session à la connexion — protection contre la fixation de session |
| `RegisterSessionAuthenticationStrategy` | Alimente un `SessionRegistry` |

Recommandation : composer les deux **maintenant**, via
`CompositeSessionAuthenticationStrategy`, et déclarer le bean
`HttpSessionEventPublisher` (sans lui le registre n'est jamais purgé des sessions
mortes). Le registre est ce dont US-008 a besoin pour invalider les autres
sessions ; l'ajouter pendant qu'on écrit le login, c'est le tester une fois — le
rétrofiter plus tard, c'est retester le login entier.

Configurer le cookie dans `application.properties` plutôt qu'en Java :

```properties
server.servlet.session.cookie.http-only=true
server.servlet.session.cookie.same-site=lax
server.servlet.session.cookie.secure=${SESSION_COOKIE_SECURE:false}
server.servlet.session.timeout=8h
```

`secure` est piloté par l'environnement : codé en dur à `true`, il casse le
développement en HTTP ; à `false`, il part en production. Le délai est un délai
**d'inactivité**, pas une durée absolue : 8 h couvre une journée au comptoir sans
reconnexion en milieu d'après-midi.

Les sessions restent **en mémoire dans Tomcat** : perdues à chaque redémarrage,
et inutilisables si plusieurs instances sont un jour déployées (il faudrait alors
`spring-session-jdbc`). Acceptable pour une instance unique — le documenter, ne
pas l'anticiper.

### 7. `AuthController`

Dans `net.booksnap.domain.auth.api`, avec ses DTO dans
`net.booksnap.domain.auth.api.dto`, suivant le découpage des autres domaines.

| Endpoint | Écrit où |
|---|---|
| `POST /api/v1/auth/login` | Contrôleur |
| `GET /api/v1/auth/me` | Contrôleur, principal via `@AuthenticationPrincipal` |
| `POST /api/v1/auth/logout` | **Filtre Spring, pas le contrôleur** — voir ci-dessous |

Pour la déconnexion, le DSL `logout()` fait déjà tout ce que demandent les
critères — invalidation serveur, suppression du cookie, et en US-006 la
consommation du jeton CSRF :

```java
.logout(logout -> logout
        .logoutUrl("/api/v1/auth/logout")
        .invalidateHttpSession(true)
        .deleteCookies("JSESSIONID")
        .logoutSuccessHandler(new HttpStatusReturningLogoutSuccessHandler(HttpStatus.NO_CONTENT)))
```

**Piège** : le `LogoutFilter` intercepte l'URL avant le `DispatcherServlet`. Une
méthode `logout()` écrite dans `AuthController` sur le même chemin ne sera
**jamais** appelée — code mort que le prochain lecteur croira actif. Écrire l'un
ou l'autre, pas les deux.

Les DTO :

- **Ne jamais sérialiser l'entité `User`**, annotée `@Data` : elle exposerait
  tout champ ajouté par la suite. Un `record` de réponse dédié — id, prénom, nom,
  email, rôle.
- La requête de login **ne doit pas être un `record` nu** : le `toString()`
  généré inclut le mot de passe, et il suffit qu'une exception l'embarque pour
  qu'il finisse dans les logs. Redéfinir `toString()`, ou utiliser une classe avec
  `@ToString.Exclude` comme le fait déjà `AuthIdentity.passwordHash`.

Décider aussi du sort de **`users.last_login`**, colonne existante que rien ne
renseigne aujourd'hui. Recommandation : la mettre à jour à chaque connexion
réussie, c'est la seule chose qui la rende utile. Effet de bord à accepter :
l'audit JPA touchera `last_modified_date` / `last_modified_by` de `users` à
chaque login.

### 8. Uniformiser les échecs

Deux chemins produisent un 401, et **les deux** doivent renvoyer le même corps
`ApiError` (`timestamp`, `status`, `message`, `path`) :

1. **Échec de connexion.** `authenticationManager.authenticate()` lève une
   `AuthenticationException` **dans le contrôleur**. Or `GlobalExceptionHandler`
   a un `@ExceptionHandler(Exception.class)` fourre-tout qui renvoie **500** avec
   `ex.getMessage()`. Sans traitement explicite, **un mot de passe faux répond
   500 « Bad credentials »**. Ajouter un `@ExceptionHandler(AuthenticationException.class)`
   → 401, message fixe, jamais `ex.getMessage()`.

2. **Requête non authentifiée sur `/me`.** Un `AuthenticationEntryPoint` branché
   via `exceptionHandling(...)`, qui n'est pas un `@ControllerAdvice` : il
   sérialise lui-même.

   **Injecter l'`ObjectMapper` de Spring**, ne pas en instancier un : un
   `new ObjectMapper()` n'a pas le module JSR-310 et sérialise le `LocalDateTime`
   d'`ApiError` en tableau — deux formats d'erreur différents selon le chemin,
   exactement ce que la story cherche à éviter.

Le message unique doit rester vrai pour les quatre causes du tableau de l'étape 2.

### 9. Collection Bruno

`server/API/AuthController/` avec `folder.bru` (`seq: 8`, `auth { mode: inherit }`)
puis `login.bru`, `logout.bru`, `me.bru`, sur `{{vipa}}` comme le reste de la
collection. Bruno conserve les cookies entre requêtes : la séquence
login → me → logout → me se joue telle quelle.

### 10. Se donner de quoi tester

`auth_identity` est vide et `seed.sql` n'y insère rien ; l'amorçage propre est
US-007, qui vient **après**. Il faut donc une identité posée à la main pour
vérifier quoi que ce soit :

```bash
htpasswd -bnBC 10 "" 'motdepasse-de-test' | tr -d ':\n'
```

`BCryptPasswordEncoder` accepte le préfixe `$2y$` produit par `htpasswd`. Puis,
sur un compte existant :

```sql
INSERT INTO auth_identity (user_id, provider, password_hash)
VALUES ((SELECT id FROM users WHERE email = '<email>'), 'local', '<hash>');
```

**Ne pas mettre ce hash dans `seed.sql`** : un mot de passe connu versionné dans
le dépôt survit largement à la phase 1. C'est une manipulation de poste, à
défaire une fois US-007 livrée.

### 11. Vérifier

**Le projet n'a pas de répertoire `src/test`** — `spring-boot-starter-test` et
`spring-security-test` sont dans `pom.xml` sans un seul test. Créer le harnais
dépasse cette story ; le dire plutôt que de laisser croire que « vérifier »
signifie « les tests passent ».

La vérification est donc manuelle, via Bruno et `psql` :

- les huit scénarios ci-dessus ;
- **le temps de réponse** : chronométrer un email inconnu et un mot de passe faux
  sur un compte existant. Les deux doivent être du même ordre. Un écart d'un
  facteur dix invalide la protection décrite à l'étape 2 ;
- **la non-régression** : un `GET /api/v1/books` sans session répond toujours 200.
  C'est la promesse « ne casse pas l'existant » de l'en-tête ;
- **les logs** : relire la sortie d'une connexion réussie et d'une connexion
  échouée, mot de passe ni hash nulle part. `spring.jpa.show-sql=true` est actif ;
  il n'affiche pas les paramètres, ne pas activer
  `logging.level.org.hibernate.orm.jdbc.bind=TRACE` pour déboguer sans y penser.

---

## Points de vigilance

- **Ne pas révéler l'existence d'un compte.** Des messages distincts pour
  « email inconnu » et « mot de passe incorrect » transforment l'écran de
  connexion en outil d'énumération des adresses de l'école.
- **Le coût de BCrypt est une protection, pas un défaut.** Ne pas l'abaisser
  pour accélérer les tests ; le rendre configurable si nécessaire.
- **Attention au temps de réponse.** Un compte inexistant qui répond
  instantanément, là où un compte existant prend le temps d'un BCrypt, révèle
  l'existence du compte. `DaoAuthenticationProvider` égalise déjà les temps en
  hachant contre un hash factice — mais **seulement** si le rejet passe par une
  `UsernameNotFoundException` (étape 2). Un `AuthenticationProvider` maison, ou un
  rejet fait avant d'entrer dans le provider, perd la protection sans rien
  signaler. Le chronométrer.
- **Dépendance à US-002.** Si `users.email` est encore sensible à la casse, le
  scénario « casse de l'email » échoue — et le bug ne se verra qu'en production,
  chez l'usager dont le clavier met une majuscule automatique.
- **`spring-boot-devtools` redémarre l'application à chaud** et vide les
  sessions en mémoire : déconnexions intempestives en développement, sans
  rapport avec un bug.
- **L'audit change de valeur sans que personne l'ait demandé.**
  `AuditorAwareImpl` renvoie `auth.getName()` : à partir de cette story, les
  colonnes `created_by` / `last_modified_by` se mettent à enregistrer l'email de
  l'utilisateur connecté au lieu de `"anonymousUser"`. C'est le comportement
  voulu, et c'est le sujet de [US-010](../verrouillage-api/US-010-audit-utilisateur-reel.md) —
  ne rien y changer ici, mais s'attendre à voir les valeurs bouger dès la
  première écriture authentifiée.
- **Rien ne limite le nombre de tentatives.** Cette story ne pose aucun verrou de
  compte ni aucune limitation de débit sur `login`. C'est une omission assumée à
  ce stade, pas un oubli : la noter pour ne pas la redécouvrir en revue de
  sécurité.
