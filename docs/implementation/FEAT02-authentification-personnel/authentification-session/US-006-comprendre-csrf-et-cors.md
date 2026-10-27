# Comprendre US-006 — CSRF et CORS, expliqués depuis zéro

[← US-006](US-006-csrf-et-cors.md) · [← Fonctionnalité](README.md) · [← Phase 1](../README.md)

Ce document accompagne [US-006](US-006-csrf-et-cors.md). La story dit **quoi**
faire ; celui-ci explique **ce qui se passe réellement** et **pourquoi chaque
ligne est là**. Il ne suppose aucune connaissance de Spring Security.

---

## 1. Le problème que cette phase résout

### Ce qui vient de changer

Jusqu'à US-005, l'API BookSnap était ouverte : n'importe quelle requête pouvait
créer un livre ou supprimer une copie. Il n'y avait rien à voler, parce qu'il n'y
avait aucun privilège.

US-005 a introduit la connexion. Depuis, le serveur pose un cookie `JSESSIONID`
dans le navigateur du bibliothécaire, et **c'est ce cookie qui prouve son
identité** à chaque requête suivante.

### Pourquoi un cookie est commode et dangereux à la fois

Un cookie a une propriété que personne ne choisit : **le navigateur l'envoie tout
seul**, à chaque requête vers le domaine qui l'a posé. C'est ce qui rend la
session confortable — on ne se reconnecte pas à chaque clic.

Mais « tout seul » veut dire *sans regarder qui a déclenché la requête*.

Scénario concret. Une bibliothécaire est connectée à BookSnap dans un onglet.
Dans un autre onglet, elle ouvre un lien reçu par email. La page en question
contient :

```html
<form action="http://booksnap.ecole.fr/api/v1/books/42" method="POST">
  <input type="hidden" name="_method" value="DELETE">
</form>
<script>document.forms[0].submit()</script>
```

Le navigateur envoie la requête **avec le cookie de session de BookSnap**, parce
que c'est ce qu'un navigateur fait avec les cookies du domaine visé. Côté
serveur, la requête est parfaitement authentifiée. Le livre 42 disparaît.

C'est ça, une **CSRF** : *Cross-Site Request Forgery*, une requête falsifiée
depuis un autre site. Le site attaquant n'a rien volé, n'a lu aucune donnée, n'a
même pas vu la réponse. Il a simplement **fait cliquer le navigateur de la
victime à sa place**.

> **Le point à retenir** : le serveur ne peut pas distinguer une requête émise
> par ses propres pages d'une requête émise par un site tiers. Les deux arrivent
> avec le même cookie, la même adresse IP, la même session. C'est un problème
> d'**intention**, pas d'identité.

### Ce n'est pas la même chose que le XSS

Deux sigles voisins, deux problèmes opposés :

| | XSS | CSRF |
|---|---|---|
| Ce que fait l'attaquant | fait exécuter **son script dans notre page** | fait envoyer **une requête depuis sa page** |
| Il lit la réponse | oui | **non** |
| Le cookie `HttpOnly` protège | oui, contre le vol du cookie | non, il ne change rien |

La distinction compte pour la suite : la protection CSRF repose entièrement sur
le fait que **le site attaquant ne peut pas lire nos réponses**. S'il le pouvait,
il lirait aussi le jeton, et rien ne fonctionnerait. C'est pour cela qu'un XSS
casse aussi la protection CSRF, et que les deux ne se remplacent pas.

---

## 2. La parade : un secret que l'attaquant ne peut pas deviner

Puisque le cookie part tout seul, il faut demander à la requête **quelque chose
qui ne part pas tout seul**.

C'est le principe du **jeton CSRF** : une valeur aléatoire que le serveur donne à
notre front, que notre front rejoint à chaque écriture, et que le serveur
vérifie.

Le site attaquant peut faire partir une requête. Il ne peut pas y mettre le
jeton, **parce qu'il ne peut pas le lire** : lire une réponse venue d'un autre
domaine lui est interdit par le navigateur (c'est la *same-origin policy*, voir
§6).

Deux façons de transporter ce jeton existent. BookSnap utilise la seconde.

### a. Le jeton en session (*synchronizer token*)

Le serveur garde le jeton dans la session côté serveur et l'écrit dans le HTML
de la page. C'est le mode par défaut de Spring Security, conçu pour des pages
rendues côté serveur (Thymeleaf, JSP).

Il ne convient pas ici : BookSnap est une application JavaScript qui reçoit du
JSON, pas des pages HTML. Il n'y a aucun formulaire rendu par le serveur dans
lequel glisser un champ caché.

### b. Le jeton en cookie lisible (*cookie-to-header*)

Le serveur pose le jeton dans un cookie **volontairement lisible par le script**,
nommé `XSRF-TOKEN`. Le front le lit et le recopie dans un en-tête
`X-XSRF-TOKEN`. Le serveur compare l'en-tête au cookie : s'ils correspondent, la
requête vient bien de nos pages.

Cela paraît circulaire — le cookie part tout seul, alors à quoi bon ? — mais
c'est exactement là que ça marche :

- le cookie part tout seul, **y compris depuis le site attaquant** ;
- **l'en-tête, non** : pour le remplir il faut lire le cookie, et le site
  attaquant ne peut pas lire les cookies d'un autre domaine.

L'attaquant peut donc fournir le cookie sans pouvoir fournir l'en-tête. La
comparaison échoue, la requête est refusée.

### Le piège des deux cookies

C'est le point où l'on se trompe une fois, et une seule :

| Cookie | Lisible par le script ? | Pourquoi |
|---|---|---|
| `JSESSIONID` (session) | **non** — `HttpOnly` | s'il était lisible, un script injecté volerait la session |
| `XSRF-TOKEN` (jeton) | **oui** — pas `HttpOnly` | s'il ne l'était pas, le front ne pourrait rien envoyer |

Inverser les deux annule soit la protection, soit le fonctionnement. Dans le code
c'est la différence entre `server.servlet.session.cookie.http-only=true`
(`application.properties`) et `CookieCsrfTokenRepository.withHttpOnlyFalse()`
(`SecurityConfig`).

Rendre le jeton lisible n'affaiblit rien : il ne donne accès à rien par lui-même,
et quiconque peut le lire (un script injecté dans notre page) pouvait déjà faire
la requête directement.

### Pourquoi les lectures sont dispensées

`GET`, `HEAD`, `OPTIONS` et `TRACE` n'exigent pas de jeton. Ce n'est pas un
relâchement : ces méthodes sont censées ne rien modifier, et si elles ne modifient
rien, les déclencher depuis ailleurs ne cause aucun dégât — l'attaquant ne verra
de toute façon pas la réponse.

Le corollaire est une règle de conception : **un endpoint qui écrit sur un `GET`
est hors de cette protection**. C'est une raison de ne pas en écrire.

---

## 3. Spring Security, pour qui n'en a jamais fait

Avant de lire la configuration, il faut le modèle mental. Il tient en une idée.

### Une chaîne de filtres devant l'application

Spring Security n'est pas branché dans les contrôleurs. C'est une **pile de
filtres servlet** que chaque requête HTTP traverse **avant** d'atteindre le
`@RestController`.

```
requête HTTP
    │
    ▼
┌─────────────────────────────────────────────┐
│  CorsFilter          en-têtes CORS          │
│  CsrfFilter          vérifie le jeton       │  ← ce que US-006 rallume
│  LogoutFilter        intercepte /logout     │
│  SecurityContext…    recharge la session    │
│  AuthorizationFilter qui a le droit d'aller │
│                      où                     │
└─────────────────────────────────────────────┘
    │
    ▼
DispatcherServlet → AuthController, BookController…
```

Conséquences pratiques, et elles expliquent la moitié du code écrit dans cette
phase :

1. **Un refus dans la chaîne n'atteint jamais le contrôleur.** Une écriture sans
   jeton est arrêtée par `CsrfFilter`. Aucun code métier ne s'exécute, aucune
   donnée ne bouge — le scénario « et aucune donnée n'est modifiée » de la story
   est garanti par la position du filtre, pas par une transaction.

2. **`@ControllerAdvice` ne voit pas ces erreurs.** `GlobalExceptionHandler`
   traite les exceptions levées *dans* les contrôleurs. Une 403 CSRF est levée
   *avant*. C'est pourquoi il existe `RestAuthenticationEntryPoint` (pour la 401,
   écrit en US-005) et maintenant `RestAccessDeniedHandler` (pour la 403) : ces
   deux classes écrivent le corps JSON à la main, parce que personne d'autre ne
   le fera à cet endroit.

3. **`SecurityConfig` décrit la chaîne**, il ne l'exécute pas. Le `@Bean
   SecurityFilterChain` est une déclaration : « mets un `CsrfFilter` configuré
   comme ceci, un `CorsFilter` comme cela ». Lire cette méthode, c'est lire la
   liste des filtres, pas un déroulé.

---

## 4. Ce qui a été configuré côté serveur, et pourquoi

### 4.1 Rallumer la protection

Avant :

```java
.csrf(csrf -> csrf.disable())
```

Après :

```java
.csrf(csrf -> csrf
        .csrfTokenRepository(csrfTokenRepository)
        .csrfTokenRequestHandler(csrfTokenRequestHandler)
)
```

Deux objets à distinguer, et les confondre est la source de la plupart des
403 inexplicables :

- le **repository** dit **où le jeton est rangé** — ici un cookie
  (`CookieCsrfTokenRepository.withHttpOnlyFalse()`), pas la session ;
- le **request handler** dit **comment il est écrit dans la réponse et relu dans
  la requête**.

Ranger le jeton dans un cookie plutôt que dans la session a une conséquence qui
n'est pas un détail : **un jeton peut être délivré à quelqu'un qui n'est pas
connecté**. C'est ce qui permet de protéger le formulaire de connexion lui-même
(critère « la connexion elle-même reste possible » de la story).

### 4.2 `SpaCsrfTokenRequestHandler` : pourquoi cette classe existe

C'est la partie la plus surprenante de la phase. Sans elle, tout est configuré
correctement et **chaque écriture répond quand même 403**. Deux causes
indépendantes se cumulent.

#### Cause 1 — Le masquage BREACH

Spring Security masque le jeton avant de l'exposer là où un corps de réponse
pourrait le porter : la valeur publiée est le jeton brut XOR un sel aléatoire,
**différente à chaque requête**. C'est une protection contre l'attaque BREACH,
qui récupère un secret constant en observant la taille des réponses compressées.

Mais `CookieCsrfTokenRepository` stocke le jeton **brut** dans le cookie.

Le front lit donc une valeur brute, l'envoie en en-tête, et le gestionnaire par
défaut essaie de la démasquer comme si elle était masquée. Elle ne l'est pas. La
comparaison échoue.

La classe tranche selon la provenance :

```java
if (StringUtils.hasText(request.getHeader(csrfToken.getHeaderName()))) {
    return super.resolveCsrfTokenValue(request, csrfToken);   // en-tête → brut
}
return this.delegate.resolveCsrfTokenValue(request, csrfToken); // formulaire → masqué
```

Un en-tête vient forcément du cookie, donc brut. Un paramètre `_csrf` vient d'un
formulaire, donc masqué. L'écriture, elle, reste toujours masquée : c'est le côté
qui touche au corps de la réponse.

#### Cause 2 — Le jeton paresseux

Depuis Spring Security 6, le jeton est **différé** : le filtre pose un
fournisseur dans les attributs de requête, et le repository n'écrit le cookie
**que si quelqu'un lit la valeur**.

Une page rendue par le serveur la lit en construisant son formulaire. Une API qui
renvoie du JSON **ne la lit jamais**. Résultat : aucun cookie n'est jamais envoyé,
et le front n'a rien à recopier.

D'où cette ligne, qui a l'air inutile et qui est la raison pour laquelle tout
fonctionne :

```java
csrfToken.get();   // force l'écriture du cookie XSRF-TOKEN
```

Elle ne régénère rien : si la requête arrivait déjà avec un cookie, le jeton
existant est relu et réutilisé tel quel. Le cookie n'est écrit que lorsqu'il
manque.

> **Écart assumé avec la documentation Spring.** La référence résout ce second
> point avec un filtre séparé (`CsrfCookieFilter`) placé après
> `BasicAuthenticationFilter`. Ce filtre ne peut pas couvrir la rotation du jeton
> à la connexion (§4.3), qui a lieu plus tard dans la requête, dans le
> contrôleur : l'ancien cookie serait supprimé et le nouveau jamais écrit. Le
> faire dans le handler couvre les deux chemins, puisque les deux y passent.

### 4.3 La rotation du jeton à la connexion

`SecurityConfig` compose trois stratégies déclenchées au moment de la connexion :

```java
new ChangeSessionIdAuthenticationStrategy(),      // change l'identifiant de session
new RegisterSessionAuthenticationStrategy(...),   // enregistre la session
csrfAuthenticationStrategy                        // remplace le jeton CSRF
```

La troisième est ajoutée par US-006. Elle jette le jeton que le visiteur portait
avant de se connecter et en émet un neuf. Quiconque aurait réussi à faire poser
un jeton connu dans le navigateur avant la connexion détient donc une valeur
morte après.

Détail qui explique pourquoi la ligne est là explicitement : Spring branche cette
stratégie tout seul quand la connexion passe par un de ses filtres.
`AuthController` s'authentifie à la main (voir US-005), donc rien ne la branche —
il faut l'écrire.

### 4.4 `GET /api/v1/auth/csrf`

Le cookie voyage sur **toutes** les réponses. Mais un navigateur qui arrive pour
la première fois sur la page de connexion n'a encore rien reçu, et un `POST
/login` sans jeton est refusé comme n'importe quelle écriture.

Il faut donc une requête qu'un client puisse faire **avant de savoir quoi que ce
soit**. C'est tout ce qu'est cet endpoint : un `GET`, `permitAll`, qui répond 204
et dont le seul effet utile est le cookie posé au passage. Le corps est vide
exprès — le jeton voyage en cookie, le renvoyer aussi dans le corps inviterait à
le lire au mauvais endroit.

### 4.5 `RestAccessDeniedHandler`

Le refus par défaut est une **403 au corps vide**. Sur une écriture, c'est
l'échec le plus pénible à diagnostiquer de toute cette phase. Le handler écrit un
`ApiError` cohérent avec le reste de l'API, et nomme la cause quand c'est le
CSRF :

```json
{ "timestamp": "…", "status": 403, "message": "CSRF token missing or invalid", "path": "…" }
```

Le dire ne donne rien à l'attaquant — le jeton défend contre un site qui ne peut
de toute façon pas lire cette réponse — et c'est la différence entre cinq minutes
et un après-midi.

---

## 5. Ce qui a changé côté front

### Un seul endroit qui sait

Toutes les fonctions de `web/src/api/*.js` passent désormais par `apiFetch`
(`web/src/api/http.js`) au lieu de `fetch`. Même signature, même retour : les
appelants continuent de lire `response.ok`, de lever une `Error` et d'y attacher
`error.status`. Rien d'autre ne bouge dans le code des vues.

`apiFetch` ajoute deux choses :

```js
// 1. envoyer les cookies, même en cross-origin
const init = { ...options, method, credentials: 'include' };

// 2. sur une écriture, recopier le cookie dans l'en-tête
if (!SAFE_METHODS.has(method)) {
  let token = readCsrfToken();
  if (!token) {
    await requestCsrfToken();   // premier appel du navigateur
    token = readCsrfToken();
  }
  if (token) init.headers = { ...options.headers, [CSRF_HEADER]: token };
}
```

Trois décisions valent d'être explicitées :

- **`credentials: 'include'` est mis systématiquement.** Sans lui, le navigateur
  n'attache aucun cookie sur un appel cross-origin et la requête arrive
  anonyme. C'est sans effet en same-origin, donc inutile de le conditionner.
- **Le jeton est relu à chaque écriture**, jamais mis en cache. C'est ce qui rend
  la rotation à la connexion (§4.3) transparente : personne n'a à s'en occuper.
- **Un jeton absent ne lève pas d'erreur locale.** La requête part et le serveur
  répond 403. Échouer plus tôt masquerait la vraie cause, qui est que le cookie
  n'a pas pu être lu — mauvais domaine, ou `HttpOnly` posé par erreur.

### Ce qui ne passe pas par `apiFetch`

`openLibrary.js` et le téléchargement d'image dans `cover.js` appellent des
services tiers. Ils restent en `fetch` nu : **on n'envoie pas nos identifiants à
un tiers**, et un jeton CSRF de BookSnap n'a aucun sens ailleurs.

---

## 6. CORS : le sujet voisin, qu'il ne faut pas confondre

### La règle de base du navigateur

Une page servie par `http://a.fr` ne peut pas **lire** la réponse d'une requête
vers `http://b.fr`. C'est la *same-origin policy*, et c'est ce qui empêche un
site quelconque de lire votre boîte mail dans l'onglet d'à côté.

Une **origine** est le triplet `schéma + hôte + port`. `http://localhost:3000` et
`http://localhost:8080` sont donc **deux origines différentes** : le port suffit.

### Ce que CORS fait

**CORS** (*Cross-Origin Resource Sharing*) est le mécanisme par lequel le serveur
`b.fr` **autorise explicitement** `a.fr` à lire ses réponses. Il le fait en
ajoutant des en-têtes (`Access-Control-Allow-Origin`…), que le navigateur lit et
applique.

### Ce que CORS ne fait pas

> **CORS n'est pas une protection contre le CSRF.**

C'est la confusion la plus fréquente, et elle mérite d'être dite franchement.
CORS régit qui a le droit de **lire une réponse**. Il n'empêche pas la requête
d'être **envoyée**, et il n'empêche pas ses effets. L'attaque du §1 supprime le
livre 42 même si le navigateur refuse ensuite d'en montrer la réponse à
l'attaquant — qui s'en moque, il voulait l'effet, pas la réponse.

Les deux mécanismes répondent à deux questions distinctes :

| | Question | Protège contre |
|---|---|---|
| CORS | qui peut **lire** notre réponse | la fuite de données vers un autre site |
| CSRF | qui a **émis** cette écriture | l'action déclenchée depuis un autre site |

### Ce qui a changé

Les origines étaient codées en dur :

```java
.allowedOrigins("http://localhost:3000", "http://localhost:8000")
```

Elles viennent maintenant de la configuration
(`booksnap.cors.allowed-origins`, alimentée par `CORS_ALLOWED_ORIGINS`).
`localhost:8000` a disparu : aucun service du projet n'écoute sur ce port, et une
origine autorisée sans raison est une autorisation qu'on ne relira jamais.

Une liste vide est une réponse valable, pas un oubli : elle désactive CORS, ce
qui est correct quand le front et l'API sont servis derrière le même domaine.
`allowedOrigins` ne peut jamais valoir `"*"` ici — la spécification interdit
d'associer le joker à `allowCredentials(true)`, et Spring refuse de démarrer.

---

## 7. La décision qui simplifie tout : le proxy Vite

`vite.config.js` déclarait depuis toujours un proxy `/api` → `:8080`… que
`api-routes.js` contournait en appelant `http://localhost:8080` en direct.

Un changement d'une ligne :

```js
export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '';
```

Le préfixe vide fait partir les appels vers **l'origine qui sert la page** — le
serveur Vite — qui relaie vers `:8080`. Pour le navigateur, tout devient
**same-origin**.

Ce que cela supprime :

- **CORS en développement** : il n'y a plus deux origines ;
- **la question `SameSite`** : plus de requête inter-sites ;
- **une panne particulièrement désagréable** : `strictPort: false` fait que Vite,
  si le port 3000 est pris, en choisit **silencieusement** un autre. L'origine
  n'est alors plus celle déclarée côté serveur et tout casse sans qu'une seule
  ligne de code ait changé. En relatif, le port n'a plus d'importance.

`VITE_API_BASE_URL` reste disponible pour un déploiement où l'API est ailleurs —
le stack Docker s'en sert, puisqu'il sert le front sur `:3000` et l'API sur
`:8080`.

---

## 8. `SameSite` : utile, insuffisant, et trompeur en local

Les navigateurs modernes posent les cookies en `SameSite=Lax` par défaut, ce que
BookSnap déclare explicitement
(`server.servlet.session.cookie.same-site=lax`). Un cookie `Lax` n'est pas envoyé
sur une écriture déclenchée par un autre **site** — ce qui bloque déjà l'attaque
du §1 dans un navigateur récent.

Pourquoi maintenir CSRF malgré ça :

- c'est une défense du **navigateur**, pas du serveur : elle dépend du client, de
  sa version, de sa configuration ;
- `Lax` raisonne en **site**, pas en origine, et un site couvre tous ses
  sous-domaines : `Lax` ne protège de rien entre deux sous-domaines ;
- une défense qui repose sur un tiers n'est pas une défense qu'on contrôle.

**Le piège local**, celui qui fait tirer les mauvaises conclusions :
`localhost:3000` et `localhost:8080` sont deux **origines** différentes (donc
CORS s'applique) mais le **même site** — le port est ignoré pour `SameSite`. Un
cookie `Lax` part donc normalement en développement. Il ne faut surtout pas en
conclure que la production se comportera pareil si le front et l'API vivent sur
deux domaines distincts : là, `SameSite=None` devient nécessaire, et `None`
impose `Secure`, donc HTTPS.

Même remarque pour la lecture du cookie `XSRF-TOKEN` par le script : les cookies
**ignorent le port**. `localhost:3000` lit donc sans problème un cookie posé par
`localhost:8080`, alors que deux domaines réellement différents ne le pourraient
pas. Le proxy du §7 supprime cette zone grise.

---

## 9. Récapitulatif des fichiers

### Serveur

| Fichier | Ce qui y est fait |
|---|---|
| `config/SecurityConfig.java` | CSRF rallumé, repository et handler branchés, `RestAccessDeniedHandler` posé, rotation du jeton ajoutée à la stratégie de connexion |
| `config/SpaCsrfTokenRequestHandler.java` | **nouveau** — masquage sélectif + écriture forcée du cookie (§4.2) |
| `config/WebConfiguration.java` | origines CORS externalisées, `localhost:8000` retiré, journalisation au démarrage |
| `exception/RestAccessDeniedHandler.java` | **nouveau** — corps JSON sur la 403 |
| `domain/auth/api/AuthController.java` | `GET /api/v1/auth/csrf` |
| `resources/application.properties` | `booksnap.cors.allowed-origins` |

### Front

| Fichier | Ce qui y est fait |
|---|---|
| `api/http.js` | **nouveau** — `apiFetch` : cookies + jeton CSRF |
| `api/api-routes.js` | `API_BASE_URL` vide par défaut (proxy Vite), route `CSRF` |
| `api/*.js` (8 fichiers) | `fetch` → `apiFetch`, sauf les appels tiers |

### Autour

| Fichier | Ce qui y est fait |
|---|---|
| `.env.example` | `CORS_ALLOWED_ORIGINS`, `VITE_API_BASE_URL` vide en dev |
| `docker-compose.yml` | `CORS_ALLOWED_ORIGINS` transmis au backend |
| `server/API/collection.bru` | **nouveau** — capture `{{csrfToken}}` sur chaque réponse |
| `server/API/AuthController/csrf.bru` | **nouveau** — la requête à lancer en premier |
| 13 requêtes d'écriture Bruno | en-tête `X-XSRF-TOKEN: {{csrfToken}}` |

---

## 10. Vérifier que ça marche

Backend démarré depuis l'IDE, `npm run dev` dans `web/`.

**Une écriture sans jeton est refusée** — dans la console du navigateur, sur
n'importe quelle page :

```js
await fetch('/api/v1/books/1', { method: 'DELETE', credentials: 'include' });
// → 403, { "message": "CSRF token missing or invalid" }
```

**Une lecture passe sans jeton** :

```js
await fetch('/api/v1/books?page=1&size=1', { credentials: 'include' });
// → 200
```

**Le cookie est bien lisible** :

```js
await fetch('/api/v1/auth/csrf', { credentials: 'include' });
document.cookie;   // doit contenir XSRF-TOKEN=…
                   // et ne PAS contenir JSESSIONID (HttpOnly)
```

**Une écriture avec jeton passe** : n'importe quelle action de l'interface qui
crée ou modifie quelque chose. Dans l'onglet Réseau, la requête doit porter
`X-XSRF-TOKEN` et son URL doit être relative (`/api/v1/…`, servie par `:3000`),
pas `http://localhost:8080/…`.

**Bruno** : lancer `csrf`, puis `login`, puis une écriture, puis `logout`.

**Parcours complet** : connexion → création d'une copie → déconnexion.

---

## 11. Les pièges, rassemblés

- **Ne jamais désactiver CSRF « juste pour déboguer ».** C'est exactement
  l'histoire du `.csrf().disable()` que cette story supprime : posé sans
  conséquence à une époque où il n'y avait pas d'authentification, jamais relu
  ensuite.
- **Une 403 sur une écriture est presque toujours un jeton absent ou mal lu**,
  pas un problème de droits. Vérifier dans cet ordre : le cookie `XSRF-TOKEN`
  existe-t-il, l'en-tête `X-XSRF-TOKEN` est-il présent, les deux valeurs
  correspondent-elles.
- **Ne pas rendre `JSESSIONID` lisible** pour « debugger plus vite ».
- **Ne pas conclure de `localhost` sur la production** : les ports comptent pour
  CORS et pour rien d'autre. Deux vrais domaines se comportent autrement, pour
  `SameSite` comme pour la lecture du cookie.
- **Une nouvelle fonction d'API doit passer par `apiFetch`.** Un `fetch` nu vers
  `/api/...` marchera en lecture et échouera en écriture — un décalage
  particulièrement agaçant à diagnostiquer.
- **Un endpoint qui écrit sur un `GET`** contourne toute cette protection.

---

## 12. Ce que cette phase ne fait pas

- **Elle ne verrouille pas les endpoints métier.** `anyRequest().permitAll()`
  tient toujours : n'importe qui peut encore créer un livre sans être connecté.
  C'est US-009. CSRF empêche qu'une écriture soit déclenchée depuis un autre
  site ; il ne dit rien de qui a le droit de l'écrire.
- **Elle ne fournit pas d'écran de connexion.** US-011 à US-013.
- **Elle ne règle pas HTTPS.** `SESSION_COOKIE_SECURE` existe et vaut `false` en
  développement ; une mise en production sans HTTPS rendrait tout le reste
  décoratif.
