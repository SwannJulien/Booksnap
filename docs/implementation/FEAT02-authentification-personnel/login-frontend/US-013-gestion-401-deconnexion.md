# US-013 — Gérer le 401 et se déconnecter

[← Fonctionnalité](README.md) · [← Phase 1](../README.md) · [← Plan](../../README.md)

| | |
|---|---|
| **Phase** | 1 — Authentification du personnel |
| **Fonctionnalité** | Connexion côté front |
| **Dépend de** | [US-011](US-011-vue-connexion.md), [US-012](US-012-garde-de-routes.md) |
| **Doit être livrée avec** | US-009, US-011, US-012 |
| **Portée** | Front |

---

## Récit

**En tant que** membre du personnel
**je veux** être ramené proprement à l'écran de connexion quand ma session
expire, et pouvoir me déconnecter volontairement
**afin de** ne pas rester devant une interface qui échoue silencieusement, et de
pouvoir laisser le poste du comptoir à un collègue.

## Contexte

Une session peut disparaître en cours d'usage : expiration, redémarrage du
serveur (fréquent en développement avec `spring-boot-devtools`, dont les
sessions en mémoire sont perdues à chaque rechargement à chaud), ou déconnexion
depuis un autre onglet.

La couche API (`web/src/api/*.js`) lève une `Error` et expose `error.status`.
Sans traitement centralisé, chaque vue afficherait sa propre erreur incompréhensible.

Le poste du comptoir est **partagé** : la déconnexion n'est pas un confort, c'est
ce qui garantit que `created_by` désigne la bonne personne.

---

## Scénarios

### Scenario: session expirée pendant l'usage

```gherkin
Given un utilisateur connecté consultant le catalogue
And sa session a expiré côté serveur
When il déclenche une action appelant l'API
Then il est redirigé vers l'écran de connexion
And un message indique que la session a expiré
```

### Scenario: retour à la page après reconnexion

```gherkin
Given un utilisateur redirigé après expiration depuis la vue des emprunts
When il se reconnecte
Then il retrouve la vue des emprunts
```

### Scenario: déconnexion volontaire

```gherkin
Given un utilisateur connecté
When il clique sur se déconnecter
Then sa session est fermée côté serveur
And il arrive sur l'écran de connexion
And revenir en arrière dans l'historique ne redonne pas accès à l'application
```

### Scenario: un 403 ne déconnecte pas

```gherkin
Given un utilisateur connecté
When une action lui est refusée pour rôle insuffisant
Then un message d'accès refusé s'affiche
And il reste connecté
And il reste sur la page courante
```

### Scenario: plusieurs 401 simultanés

```gherkin
Given une vue déclenchant trois appels API en parallèle
And la session expirée
When les trois répondent 401
Then une seule redirection a lieu
And un seul message est affiché
```

### Scenario: l'utilisateur courant est visible

```gherkin
Given un utilisateur connecté
When il consulte l'interface
Then son nom est affiché
And l'action de déconnexion est accessible
```

---

## Critères d'acceptation

- [x] Tout 401 sur un appel API redirige vers `/login` avec un message d'expiration.
- [x] Un **403** affiche un message d'accès refusé **sans** déconnecter.
- [x] Plusieurs 401 concurrents ne produisent **qu'une** redirection.
- [x] La destination courante est mémorisée pour être retrouvée après reconnexion (mécanisme de US-012).
- [x] Bouton de déconnexion accessible depuis la navigation, appelant `POST /api/v1/auth/logout`.
- [x] Après déconnexion, l'état utilisateur local est vidé et le retour arrière ne redonne pas accès.
- [x] Le nom de l'utilisateur connecté est affiché dans l'interface.
- [x] Le traitement du 401 est **centralisé**, non répété dans chaque fichier de `web/src/api/`.
- [x] `npm run lint` passe.

---

## Plan d'implémentation

1. **Centraliser les appels.** Les fichiers de `web/src/api/` répètent
   aujourd'hui leur propre `fetch`. Introduire un utilitaire unique
   (`web/src/api/http.js`) qui pose `credentials: 'include'`, joint le jeton CSRF
   (US-006), et traite 401 et 403 de façon uniforme.

   C'est aussi ce qui évite de dupliquer la logique CSRF dans dix fichiers.

2. **Traiter le 401** dans cet utilitaire : vider l'état utilisateur, mémoriser
   la destination, rediriger vers `/login` avec un motif d'expiration.

   **Protéger contre les redirections multiples** par un indicateur : trois
   appels parallèles en 401 ne doivent produire qu'une redirection et un message.

3. **Ne pas traiter le 403 comme un 401.** Un rôle insuffisant n'est pas une
   session expirée : déconnecter l'usager dans ce cas serait déroutant, et
   masquerait une erreur d'autorisation réelle.

4. **Déconnexion** : appeler `POST /auth/logout`, vider l'état local, rediriger.
   Vider l'état local **même si l'appel échoue** — une session déjà morte côté
   serveur ne doit pas empêcher de se déconnecter côté client.

5. **Afficher l'utilisateur courant** dans le `<nav>` de `booksnap-app.js`, avec
   l'action de déconnexion. Suivre les conventions : événements `CustomEvent`
   bouillonnants et composés, la vue détenant l'état.

6. **Vérifier** : expiration simulée (redémarrer le back), 403 sur un endpoint
   interdit, déconnexion puis retour arrière, appels parallèles.

---

## Points de vigilance

- **Le retour arrière du navigateur** peut réafficher une vue depuis le cache
  après déconnexion. La garde de US-012 doit s'appliquer à la navigation par
  historique, pas seulement aux clics.
- **Ne pas boucler.** Un 401 sur `/auth/me` pendant la vérification initiale ne
  doit pas déclencher la redirection « session expirée » : à ce moment-là, ne pas
  être connecté est le cas **normal**.
- **`spring-boot-devtools` invalide les sessions à chaque rechargement à chaud** :
  en développement, des déconnexions fréquentes sont attendues et ne signalent
  aucun bug.
- **La déconnexion doit fermer la session côté serveur**, pas seulement effacer
  le cookie côté client — sinon la session reste valide pour qui la possède.
- **Ne pas lancer `prettier --write`** sans demander (voir US-011).
