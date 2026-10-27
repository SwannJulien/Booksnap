# US-006 — Réactiver CSRF et régler CORS

[← Fonctionnalité](README.md) · [← Phase 1](../README.md) · [← Plan](../../README.md)

| | |
|---|---|
| **Phase** | 1 — Authentification du personnel |
| **Fonctionnalité** | Authentification et session |
| **Dépend de** | [US-005](US-005-connexion-mot-de-passe.md) |
| **Va avec** | US-005 — à ne pas déployer séparément |
| **Portée** | Back + front (couche API) |

---

## Récit

**En tant que** responsable de l'application
**je veux** qu'une action authentifiée ne puisse pas être déclenchée depuis un
autre site
**afin qu'** un lien piégé ouvert par un bibliothécaire connecté ne puisse pas
supprimer un livre en son nom.

## Contexte

`SecurityConfig` fait aujourd'hui `.csrf().disable()`. C'était sans conséquence :
sans authentification, il n'y a pas de privilège à détourner. **L'authentification
par cookie (US-005) rend la protection de nouveau nécessaire** — le navigateur
joint le cookie automatiquement, y compris sur une requête déclenchée par un
autre site.

Voir [décision D8](../../../DECISIONS-MULTI-UTILISATEUR.md).

> **Pour comprendre le mécanisme plutôt que l'appliquer :**
> [Comprendre US-006 — CSRF et CORS, expliqués depuis zéro](US-006-comprendre-csrf-et-cors.md),
> écrit pour quelqu'un qui n'a jamais utilisé Spring Security.

### Situation réelle des origines

| Élément | Valeur |
|---|---|
| Serveur de développement Vite | port **3000** (`vite.config.js`) |
| CORS autorisé côté back | `http://localhost:3000`, `http://localhost:8000`, `allowCredentials(true)` |
| Appels du front | **directement** vers `http://localhost:8080` (`api-routes.js`) |
| Proxy `/api` → `:8080` | **configuré dans `vite.config.js`, mais contourné** |

Le proxy existe et n'est pas utilisé. C'est l'élément le plus important de cette
story : **s'en servir rend tout le trafic de développement same-origin** et fait
disparaître la question des cookies inter-origines.

---

## Scénarios

### Scenario: une écriture sans jeton CSRF est refusée

```gherkin
Given un utilisateur connecté
When une requête d'écriture est envoyée sans jeton CSRF
Then la réponse est 403
And aucune donnée n'est modifiée
```

### Scenario: une écriture avec jeton CSRF valide est acceptée

```gherkin
Given un utilisateur connecté ayant obtenu un jeton CSRF
When il envoie une requête d'écriture avec ce jeton
Then la requête est traitée normalement
```

### Scenario: une lecture ne requiert pas de jeton

```gherkin
Given un utilisateur connecté
When il envoie une requête GET
Then la requête est traitée sans jeton CSRF
```

### Scenario: la connexion elle-même reste possible

```gherkin
Given un visiteur non connecté
When il soumet le formulaire de connexion
Then la requête aboutit
And l'absence de session préalable n'empêche pas l'obtention d'un jeton
```

### Scenario: une origine non autorisée est rejetée

```gherkin
Given le front servi depuis une origine non déclarée
When il appelle l'API avec identifiants
Then le navigateur refuse la réponse pour cause de CORS
```

---

## Critères d'acceptation

- [x] La protection CSRF est **active** sur toutes les méthodes d'écriture (`POST`, `PUT`, `PATCH`, `DELETE`).
- [x] Les lectures (`GET`, `HEAD`, `OPTIONS`) n'exigent pas de jeton.
- [x] Le jeton est transmis par un cookie **lisible par le script** (`CookieCsrfTokenRepository.withHttpOnlyFalse()`), le cookie de **session** restant `HttpOnly`.
- [x] `POST /api/v1/auth/login` fonctionne sans session préalable.
- [x] Toutes les fonctions de `web/src/api/*.js` envoient `credentials: 'include'` et le jeton CSRF sur les écritures.
- [x] Les origines autorisées ne sont plus codées en dur mais viennent de la configuration (variable d'environnement).
- [x] `http://localhost:8000`, qui ne correspond à aucun service du projet, est retiré ou justifié.
- [x] La collection Bruno reste utilisable : documenter comment y obtenir un jeton.

---

## Plan d'implémentation

1. **Décider du transport en développement.** Deux options :

   | Option | Effet |
   |---|---|
   | **Utiliser le proxy Vite** (recommandé) : appeler `/api/...` en relatif | Tout devient same-origin en développement. Plus de CORS, plus de question `SameSite`. Il suffit que `API_BASE_URL` soit vide par défaut. |
   | Conserver l'appel direct à `:8080` | Reste cross-origin ; CORS et `credentials: 'include'` obligatoires partout |

   La première est une modification d'une ligne dans `api-routes.js` et supprime
   une classe entière de problèmes. La retenir sauf raison contraire.

2. **Activer CSRF** dans `SecurityConfig` avec
   `CookieCsrfTokenRepository.withHttpOnlyFalse()`, afin que le front puisse lire
   le jeton et le renvoyer en en-tête.

3. **Adapter la couche API du front.** Toutes les fonctions de
   `web/src/api/*.js` doivent envoyer `credentials: 'include'`, et joindre le
   jeton CSRF (lu dans le cookie `XSRF-TOKEN`) sur les écritures. Centraliser
   dans un utilitaire plutôt que de le répéter dans chaque fichier — la
   convention du projet veut que ces fonctions lèvent une `Error` et exposent
   `error.status`.

4. **Externaliser les origines CORS** dans `WebConfiguration`, via une propriété
   alimentée par variable d'environnement, et retirer `localhost:8000`.

5. **Vérifier** : chaque scénario, plus un parcours complet de bout en bout
   (connexion, création d'une copie, déconnexion).

---

## Points de vigilance

- **`strictPort: false` dans `vite.config.js`** : si le port 3000 est occupé,
  Vite en choisit un autre **silencieusement**, et l'origine n'est alors plus
  dans la liste CORS. Symptôme : tout casse sans modification de code. Passer le
  proxy en relatif rend ce problème sans objet.
- **Ports et `SameSite`.** `localhost:3000` et `localhost:8080` sont des origines
  **différentes** (donc CORS s'applique) mais le même **site** (le port est
  ignoré pour `SameSite`) : un cookie `SameSite=Lax` est donc bien envoyé en
  développement. Ne pas en conclure que la production se comportera pareil si
  front et back sont sur des domaines distincts.
- **`SameSite=None` impose `Secure`**, donc HTTPS. Si un jour front et back sont
  sur des domaines différents en production, c'est obligatoire.
- **Le cookie CSRF doit être lisible par le script, le cookie de session non.**
  Confondre les deux annule soit la protection, soit le fonctionnement.
- **Ne pas désactiver CSRF « juste pour déboguer »** puis oublier de le
  réactiver : c'est exactement ainsi que la ligne `.csrf().disable()` actuelle
  est arrivée là.
