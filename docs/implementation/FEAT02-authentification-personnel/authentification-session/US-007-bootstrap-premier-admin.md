# US-007 — Amorcer le premier compte `ADMIN`

[← Fonctionnalité](README.md) · [← Phase 1](../README.md) · [← Plan](../../README.md)

| | |
|---|---|
| **Phase** | 1 — Authentification du personnel |
| **Fonctionnalité** | Authentification et session |
| **Dépend de** | [US-003](../modele-identite/US-003-table-auth-identity.md), [US-004](../modele-identite/US-004-role-utilisateur.md), [US-005](US-005-connexion-mot-de-passe.md) |
| **Bloque** | US-009 — verrouiller l'API sans pouvoir s'y connecter enfermerait tout le monde dehors |
| **Portée** | Back |

---

## Récit

**En tant que** responsable installant Booksnap
**je veux** qu'un premier compte administrateur puisse exister sans qu'aucun
compte n'existe encore
**afin de** pouvoir entrer dans l'application et créer les autres comptes.

## Contexte

Problème de l'œuf et de la poule : la création de comptes exige d'être
administrateur. Le SSO n'arrive qu'en phase 7, l'invitation par email qu'en
phase 4. Sans cette story, **verrouiller l'API en US-009 rend l'application
inaccessible à tous, définitivement**.

C'est aussi la troisième voie d'obtention d'identifiants décrite dans les
[règles accès §5.3](../../../REGLES-METIER-ACCES.md) : le secours quand ni SMTP
ni SSO ne fonctionnent.

---

## Scénarios

### Scenario: création du premier administrateur au démarrage

```gherkin
Given une base sans aucun utilisateur de rôle "admin"
And les variables d'environnement d'amorçage renseignées
When l'application démarre
Then un utilisateur de rôle "admin" est créé avec l'email fourni
And une identité "local" lui est rattachée avec le mot de passe fourni, haché
And le démarrage est tracé dans les logs, sans le mot de passe
```

### Scenario: l'amorçage ne se rejoue pas

```gherkin
Given une base contenant déjà au moins un utilisateur de rôle "admin"
When l'application redémarre avec les variables d'amorçage encore présentes
Then aucun compte n'est créé
And aucun mot de passe existant n'est modifié
```

### Scenario: amorçage non configuré

```gherkin
Given une base sans aucun administrateur
And aucune variable d'environnement d'amorçage
When l'application démarre
Then aucun compte n'est créé
And un avertissement explicite signale qu'aucun administrateur n'existe
```

### Scenario: promotion d'un compte existant

```gherkin
Given un utilisateur existant de rôle "user" avec l'email d'amorçage
And aucun administrateur en base
When l'application démarre avec les variables d'amorçage
Then ce compte est promu "admin"
And une identité "local" lui est rattachée s'il n'en avait pas
And aucun compte en doublon n'est créé
```

### Scenario: mot de passe d'amorçage trop faible

```gherkin
Given un mot de passe d'amorçage de moins de 12 caractères
When l'application démarre
Then l'amorçage est refusé
And le démarrage échoue avec un message explicite
```

---

## Critères d'acceptation

- [x] L'amorçage est piloté par variables d'environnement (`spring-dotenv` est déjà une dépendance du projet) : email, mot de passe, prénom, nom.
- [x] Il ne s'exécute **que** s'il n'existe aucun utilisateur de rôle `admin`.
- [x] Il est **idempotent** : redémarrer ne crée ni ne modifie rien.
- [x] Un compte existant portant cet email est **promu**, jamais dupliqué (`users.email` est unique).
- [x] Le mot de passe est haché en BCrypt, jamais stocké ni journalisé en clair.
- [x] Un mot de passe de moins de 12 caractères fait **échouer le démarrage**.
- [x] En l'absence de configuration et d'administrateur, un avertissement clair est émis.
- [x] La procédure est documentée dans `server/README.md` et `.env.example`.
- [x] `.env.example` ne contient **aucun** mot de passe réel — seulement un espace réservé.

---

## Plan d'implémentation

1. **Composant d'amorçage** exécuté au démarrage (`ApplicationRunner` ou
   `@EventListener(ApplicationReadyEvent.class)`), dans
   `net.booksnap.config` aux côtés de `AuditorAwareImpl`.

2. **Logique** :
   - Si `userRepository.existsByRole(ADMIN)` → ne rien faire, sortir.
   - Si les variables ne sont pas renseignées → journaliser un avertissement,
     sortir.
   - Valider le mot de passe (longueur minimale) → sinon lever une exception qui
     interrompt le démarrage.
   - Chercher l'utilisateur par email : promouvoir s'il existe, créer sinon.
   - Créer l'identité `local` si absente, avec le hash BCrypt.

3. **Variables** dans `.env.example` :

   ```
   BOOKSNAP_BOOTSTRAP_ADMIN_EMAIL=
   BOOKSNAP_BOOTSTRAP_ADMIN_PASSWORD=
   BOOKSNAP_BOOTSTRAP_ADMIN_FIRST_NAME=
   BOOKSNAP_BOOTSTRAP_ADMIN_LAST_NAME=
   ```

4. **Journaliser l'événement** : email du compte créé ou promu, **jamais** le
   mot de passe.

5. **Documenter** dans `server/README.md` : renseigner les variables, démarrer,
   se connecter, **changer le mot de passe** (US-008), puis retirer les
   variables.

6. **Vérifier** : premier démarrage sur base vierge, redémarrage (aucun effet),
   démarrage sans configuration, promotion d'un compte existant.

---

## Points de vigilance

- **C'est une porte d'entrée : elle doit se refermer.** La condition
  « aucun `admin` en base » est ce qui l'empêche de rester ouverte. Ne jamais
  la remplacer par une condition sur l'existence du compte lui-même : le mot de
  passe serait alors réinitialisé à chaque redémarrage, y compris après que
  l'administrateur en a choisi un autre.
- **Le mot de passe transite par l'environnement**, donc potentiellement par un
  fichier `.env` versionné par erreur. `.gitignore` couvre déjà `.env` —
  le vérifier avant d'écrire quoi que ce soit dedans. Le retirer une fois le
  compte créé.
- **Ne pas confondre avec `seed.sql`.** Les données de seed sont du
  développement ; cet amorçage doit fonctionner en production, sur une base
  contenant de vraies personnes.
- **Échouer bruyamment sur un mot de passe faible.** Un compte administrateur
  avec `admin123` sur une application accessible depuis l'école est pire que pas
  d'application du tout.
