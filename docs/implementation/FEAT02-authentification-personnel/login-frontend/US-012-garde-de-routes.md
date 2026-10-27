# US-012 — Garde de routes et redirection

[← Fonctionnalité](README.md) · [← Phase 1](../README.md) · [← Plan](../../README.md)

| | |
|---|---|
| **Phase** | 1 — Authentification du personnel |
| **Fonctionnalité** | Connexion côté front |
| **Dépend de** | [US-011](US-011-vue-connexion.md) |
| **Doit être livrée avec** | US-009, US-011, US-013 |
| **Portée** | Front |

---

## Récit

**En tant que** membre du personnel
**je veux** être conduit à l'écran de connexion quand je ne suis pas connecté,
et retrouver la page demandée une fois connecté
**afin de** ne pas perdre le lien sur lequel j'avais cliqué.

## Contexte

`booksnap-app.js` déclare ses routes avec `@vaadin/router` et charge chaque vue
en import dynamique. Aucune route n'est protégée. Une fois US-009 déployée,
ouvrir `/catalog` sans session afficherait une vue vide sans explication.

Le routeur applique aussi un motif répétitif de gestion de la classe `active`,
signalé par un `TODO` dans le fichier. La garde touche exactement à cet endroit.

---

## Scénarios

### Scenario: accès à une route protégée sans session

```gherkin
Given un visiteur sans session
When il ouvre directement l'URL du catalogue
Then il est redirigé vers l'écran de connexion
And le catalogue n'est jamais rendu
```

### Scenario: retour à la page demandée après connexion

```gherkin
Given un visiteur redirigé vers la connexion depuis le catalogue
When il se connecte avec succès
Then il arrive sur le catalogue
And non sur la page d'accueil
```

### Scenario: la session est retrouvée au rechargement

```gherkin
Given un utilisateur connecté
When il recharge la page
Then il reste connecté
And il n'est pas renvoyé vers l'écran de connexion
```

### Scenario: un utilisateur connecté ne revoit pas l'écran de connexion

```gherkin
Given un utilisateur connecté
When il ouvre l'URL de connexion
Then il est redirigé vers l'application
```

### Scenario: pas de clignotement au démarrage

```gherkin
Given un utilisateur connecté rechargeant la page
When l'application vérifie la session
Then l'écran de connexion n'apparaît pas fugitivement avant l'application
```

---

## Critères d'acceptation

- [x] Toutes les routes sauf `/login` exigent une session.
- [x] Une route protégée atteinte sans session redirige vers `/login`, la destination initiale étant mémorisée.
- [x] Après connexion, l'utilisateur arrive sur la destination initiale, ou sur `/` par défaut.
- [x] La session est vérifiée **une seule fois** au démarrage, via `GET /api/v1/auth/me`.
- [x] Un utilisateur connecté ouvrant `/login` est redirigé vers `/`.
- [x] Aucun clignotement de l'écran de connexion pendant la vérification initiale.
- [x] L'utilisateur courant est disponible pour toute l'application sans nouvel appel réseau.
- [x] La route de repli `(.*)` continue de fonctionner et respecte la garde.
- [x] `npm run lint` passe.

---

## Plan d'implémentation

1. **État d'authentification partagé** : un petit module exportant l'utilisateur
   courant, avec chargement unique. Le projet n'utilise aucune bibliothèque
   d'état — un module simple est cohérent avec ses conventions, les vues
   détenant l'état et le passant en propriétés.

2. **Vérifier la session avant de configurer le routeur.** `firstUpdated` de
   `booksnap-app` appelle `GET /auth/me` ; tant que la réponse n'est pas
   revenue, afficher un état de chargement plutôt que la connexion — c'est ce
   qui évite le clignotement.

3. **Garde par route.** `@vaadin/router` accepte une `action` par route, déjà
   utilisée pour l'import dynamique et la classe `active`. La garde s'y insère.

   ⚠️ **Le motif est déjà dupliqué huit fois** et porte un `TODO` explicite.
   Y ajouter un neuvième bloc identique aggraverait la situation : extraire une
   fabrique d'`action` prenant le chemin et renvoyant la fonction, ce qui traite
   la duplication existante en même temps que la garde.

4. **Mémoriser la destination** : conserver le chemin demandé (dans le module
   d'état, ou en paramètre de requête sur `/login`), et l'utiliser après
   connexion.

5. **Redirection inverse** : `/login` avec une session valide redirige vers `/`.

6. **Vérifier** : accès direct par URL à chaque route sans session, rechargement
   connecté, retour à la destination initiale.

---

## Points de vigilance

- **La garde front n'est pas une sécurité.** Elle améliore l'expérience ; la
  seule protection réelle est celle du back (US-009). Ne jamais s'appuyer sur
  elle pour masquer une donnée sensible.
- **Un seul appel à `/auth/me` au démarrage.** Une garde qui interroge le serveur
  à chaque navigation ajoute un aller-retour à chaque clic.
- **Attention à la boucle de redirection** entre `/login` et `/` si les deux
  gardes se déclenchent mutuellement.
- **Ne pas casser la classe `active`.** La logique de navigation existante est
  fragile et dupliquée : vérifier que la surbrillance du menu fonctionne encore
  sur les huit routes après refactorisation.
- **Ne pas lancer `prettier --write`** sans demander (voir US-011).
