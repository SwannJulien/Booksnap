# US-008 — Changer son mot de passe

[← Fonctionnalité](README.md) · [← Phase 1](../README.md) · [← Plan](../../README.md)

| | |
|---|---|
| **Phase** | 1 — Authentification du personnel |
| **Fonctionnalité** | Authentification et session |
| **Dépend de** | [US-005](US-005-connexion-mot-de-passe.md), [US-007](US-007-bootstrap-premier-admin.md) |
| **Portée** | Back + front (`account-view`) |

---

## Récit

**En tant que** membre du personnel
**je veux** changer mon mot de passe depuis mon compte
**afin de** remplacer celui qui m'a été communiqué par un mot de passe que je
suis seul à connaître.

## Contexte

Sans cette story, le mot de passe d'amorçage (US-007) ou celui communiqué par un
administrateur reste en usage indéfiniment — connu d'au moins deux personnes, et
possiblement écrit dans un fichier `.env`.

`account-view.js` ne contient aujourd'hui qu'un `<h1>`. C'est son premier
contenu réel.

**Hors périmètre :** la réinitialisation par email (« mot de passe oublié »),
qui exige SMTP et arrive en phase 4. Ici l'usager connaît son mot de passe
actuel.

---

## Scénarios

### Scenario: changement réussi

```gherkin
Given un utilisateur connecté possédant une identité "local"
When il fournit son mot de passe actuel et un nouveau mot de passe valide
Then le mot de passe est remplacé
And il peut se reconnecter avec le nouveau
And il ne peut plus se connecter avec l'ancien
```

### Scenario: mot de passe actuel incorrect

```gherkin
Given un utilisateur connecté
When il fournit un mot de passe actuel incorrect
Then la réponse est 400
And le mot de passe n'est pas modifié
```

### Scenario: nouveau mot de passe trop faible

```gherkin
Given un utilisateur connecté
When il propose un nouveau mot de passe de moins de 12 caractères
Then la réponse est 400
And le message indique la règle non respectée
And le mot de passe n'est pas modifié
```

### Scenario: un utilisateur sans identité locale ne peut pas changer de mot de passe

```gherkin
Given un utilisateur connecté ne possédant aucune identité "local"
When il tente de changer son mot de passe
Then la réponse est 409
And le message indique que son compte n'utilise pas de mot de passe
```

### Scenario: les autres sessions sont invalidées

```gherkin
Given un utilisateur connecté depuis deux navigateurs
When il change son mot de passe depuis le premier
Then la session du second navigateur n'est plus valide
And sa propre session courante reste valide
```

---

## Critères d'acceptation

- [x] `POST /api/v1/auth/password` accepte `{ currentPassword, newPassword }`.
- [x] L'utilisateur ne peut changer **que son propre** mot de passe — la cible vient de la session, jamais du corps de requête.
- [x] Le mot de passe actuel est vérifié avant tout changement.
- [x] Règle minimale : 12 caractères. Le nouveau doit différer de l'actuel.
- [x] Le nouveau hash est BCrypt.
- [x] Les **autres** sessions de l'utilisateur sont invalidées ; la session courante est conservée.
- [x] Un compte sans identité `local` reçoit un 409 explicite.
- [x] `account-view.js` propose le formulaire, avec retour d'erreur lisible.
- [x] Aucun mot de passe n'apparaît dans les logs ni dans une URL.
- [x] Endpoint ajouté à la collection Bruno.

---

## Plan d'implémentation

1. **Endpoint** `POST /api/v1/auth/password` dans `AuthController`. L'utilisateur
   cible est **toujours** celui de la session — ne jamais accepter d'identifiant
   d'utilisateur en entrée, ce serait un moyen de changer le mot de passe
   d'autrui.

2. **Service** : charger l'identité `local` de l'utilisateur, vérifier le mot de
   passe actuel avec le `PasswordEncoder`, valider le nouveau, encoder,
   enregistrer.

3. **Règle de mot de passe** dans un composant unique, réutilisé par US-007 et
   par les invitations de la phase 4. Éviter trois validations divergentes.

4. **Invalider les autres sessions** : `SessionRegistry` de Spring Security, ou
   l'équivalent selon la stratégie retenue en US-005. **Vérifier que la session
   courante survit** — sinon l'usager est déconnecté juste après avoir changé son
   mot de passe, ce qui ressemble à un échec.

5. **Front** : formulaire dans `account-view.js` — mot de passe actuel, nouveau,
   confirmation. Suivre les conventions du projet : composant Lit avec
   `account-view-styles.js` en fichier voisin, appel API dans
   `web/src/api/`, erreurs portant `error.status`.

6. **Vérifier** : chaque scénario, dont la reconnexion avec l'ancien mot de passe
   (doit échouer).

---

## Points de vigilance

- **La cible vient de la session.** Un `userId` accepté dans le corps
  transformerait cet endpoint en changement de mot de passe d'autrui —
  exactement le défaut décrit pour `POST /holds` dans les
  [règles accès §4.3](../../../REGLES-METIER-ACCES.md).
- **Confirmer le mot de passe actuel** même si l'usager est déjà authentifié :
  c'est ce qui protège un poste laissé déverrouillé au comptoir.
- **Ne pas exposer de règle de mot de passe trop bavarde** dans les messages
  d'erreur au point de guider une attaque ; rester factuel sur la règle non
  respectée.
- **Le changement de mot de passe n'a de sens que pour le provider `local`.**
  Un usager Microsoft (phase 7) change son mot de passe chez Microsoft — le 409
  doit le dire clairement plutôt que d'échouer obscurément.
