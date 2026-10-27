# US-011 — Écran de connexion

[← Fonctionnalité](README.md) · [← Phase 1](../README.md) · [← Plan](../../README.md)

| | |
|---|---|
| **Phase** | 1 — Authentification du personnel |
| **Fonctionnalité** | Connexion côté front |
| **Dépend de** | [US-005](../authentification-session/US-005-connexion-mot-de-passe.md), [US-006](../authentification-session/US-006-csrf-et-cors.md) |
| **Doit être livrée avec** | US-009, US-012, US-013 |
| **Portée** | Front |

---

## Récit

**En tant que** membre du personnel
**je veux** un écran où saisir mon email et mon mot de passe
**afin de** pouvoir entrer dans Booksnap.

## Contexte

Aucune vue de connexion n'existe. Le projet suit une convention stricte :
composant Lit, un dossier par composant avec un fichier `-styles.js` voisin,
appels API dans `web/src/api/`.

---

## Scénarios

### Scenario: connexion réussie

```gherkin
Given un visiteur sur l'écran de connexion
When il saisit un email et un mot de passe corrects et valide
Then il est redirigé vers l'application
And son nom apparaît dans l'interface
```

### Scenario: identifiants incorrects

```gherkin
Given un visiteur sur l'écran de connexion
When il saisit des identifiants incorrects
Then un message d'erreur s'affiche
And il reste sur l'écran de connexion
And le champ mot de passe est vidé
And le champ email conserve sa valeur
```

### Scenario: champs vides

```gherkin
Given un visiteur sur l'écran de connexion
When il valide sans remplir les champs
Then la validation du formulaire l'en empêche
And aucun appel réseau n'est émis
```

### Scenario: retour visuel pendant l'appel

```gherkin
Given un visiteur ayant saisi ses identifiants
When il valide le formulaire
Then le bouton indique un traitement en cours
And le formulaire ne peut pas être soumis une seconde fois
```

### Scenario: serveur injoignable

```gherkin
Given un visiteur sur l'écran de connexion
And le serveur injoignable
When il valide ses identifiants
Then un message distinct d'une erreur d'identifiants s'affiche
```

### Scenario: soumission au clavier

```gherkin
Given un visiteur ayant rempli les deux champs
When il appuie sur Entrée
Then le formulaire est soumis
```

---

## Critères d'acceptation

- [x] Vue `login-view` dans `web/src/views/login-view/`, avec `login-view-styles.js` voisin.
- [x] Route `/login` déclarée dans `booksnap-app.js`, **sans** la barre de navigation.
- [x] Champs email (`type="email"`, `autocomplete="username"`) et mot de passe (`type="password"`, `autocomplete="current-password"`).
- [x] Soumission possible au clavier (formulaire réel, pas un simple bouton).
- [x] État de chargement, avec double soumission empêchée.
- [x] Message d'erreur distinguant identifiants invalides et serveur injoignable.
- [x] Le message d'erreur ne révèle pas si l'email existe.
- [x] Fonction `login` dans `web/src/api/auth.js`, suivant la convention du projet (lève une `Error`, expose `error.status`).
- [x] Responsive — le projet cible 900px comme point de rupture.
- [x] `npm run lint` passe dans `web/`.

---

## Plan d'implémentation

1. **`web/src/api/auth.js`** : `login`, `logout`, `getCurrentUser`. Convention du
   projet — lever une `Error` en cas d'échec, attacher `error.status` pour que
   l'appelant distingue un 401 d'une panne réseau.

2. **`login-view`** : composant Lit avec un `<form>` réel (soumission clavier
   gratuite), état `loading` et `error` en propriétés réactives.

3. **Route `/login`** dans `booksnap-app.js`. La difficulté : le `<nav>` est
   rendu par `booksnap-app` **autour** du `<main>` où le routeur monte les vues.
   L'écran de connexion ne doit pas l'afficher.

   Options : masquer le `<nav>` selon la route courante, ou déclarer `/login`
   hors du routeur principal. La première est la moins invasive.

4. **Distinguer les erreurs** : `error.status === 401` → identifiants invalides ;
   absence de `status` → problème réseau.

5. **Styles** : réutiliser `sharedStyles`. ⚠️ Attention au piège documenté dans
   `.claude/CLAUDE.md` — un composant listant `sharedStyles` **en dernier** dans
   `static styles = [...]` ne peut pas surcharger les règles `input, select` de
   `sharedStyles` avec un sélecteur `input` simple. Ce défaut a déjà touché
   `search-bar-bks` deux fois.

6. **Vérifier** : chaque scénario, plus le lint.

---

## Points de vigilance

- **Ne pas lancer `prettier --write`** ni `npm run format` sans demander : le
  projet est formaté avec Prettier ≤ 3.6.2 alors que `package.json` résout 3.9.5,
  ce qui reformate les templates Lit et noie la modification réelle.
- **Ne pas installer Playwright** pour vérifier visuellement sans demander : ce
  n'est pas une dépendance du projet.
- **`autocomplete` correctement renseigné** — sans quoi les gestionnaires de mots
  de passe ne proposent rien, et le personnel choisira des mots de passe faibles.
- **Ne pas conserver le mot de passe dans l'état du composant** après soumission.
- **Le message d'erreur ne doit pas révéler l'existence d'un compte** : c'est le
  pendant côté front de la règle de US-005.
