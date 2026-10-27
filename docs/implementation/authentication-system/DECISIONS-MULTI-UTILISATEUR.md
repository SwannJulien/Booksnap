# Décisions — Multi-utilisateur et paramètres

> Les arbitrages retenus pour la fonctionnalité « accès multi-utilisateur +
> page de paramètres », et **pourquoi**. Ce document explique les choix ; les
> règles qui en découlent sont dans les documents de règles métier.

Documents liés :
[règles accès](REGLES-METIER-ACCES.md) ·
[règles paramètres](REGLES-METIER-PARAMETRES.md) ·
[règles structurelles](REGLES-METIER-STRUCTURE.md) ·
[plan d'implémentation](implementation/README.md)

---

## 1. Point de départ

| Constat | Détail |
|---|---|
| **Aucune authentification** | `SecurityConfig` : `anyRequest().permitAll()`. `spring-boot-starter-security` est présent mais inutilisé. `users` n'a ni mot de passe ni rôle — seulement un `is_super` jamais lu. |
| **Bibliothèques à moitié construites** | La table `library` existe (Preschool, Primary), `copy.library_id` et `hold.library_id` y pointent, mais il n'y a **ni contrôleur, ni service, ni repository**. Le front code en dur `libraryId: 1` à quatre endroits. |
| **Règles de prêt codées en dur** | `BORROWING_DURATION_WEEKS = 2`, `HOLD_PICKUP_WINDOW_WEEKS = 1`. L'expiration à 5 semaines est documentée mais **jamais implémentée**. |
| **Vues vides** | `settings-view.js` et `account-view.js` ne contiennent qu'un `<h1>`. |
| **Pas d'outil de migration** | `schema.sql` n'est joué qu'à la création du volume, et la base réelle a déjà dérivé. |

Bonne nouvelle isolée : `AuditorAwareImpl` lit déjà `SecurityContextHolder` avec
un repli sur `"system"`. `created_by` / `last_modified_by` enregistreront de
vrais noms **sans modification de cette classe** dès que l'authentification
existera.

---

## 2. Les neuf décisions

### D1 — Les élèves se connectent, en libre-service

Un élève consulte le catalogue, voit ses emprunts et réservations, et pose une
réservation lui-même.

**Conséquence :** l'API actuelle n'y survit pas telle quelle. Trois failles
deviennent exploitables le jour où un élève a un compte — répertoire des usagers
exposé, réservation au nom d'autrui, absence d'endpoints « les miens ». Voir
[règles accès §7](REGLES-METIER-ACCES.md).

### D2 — Mot de passe local **et** SSO, dans cet ordre

Les élèves et le personnel ont une adresse de l'école gérée par Microsoft, mais
certains usagers n'auront qu'une adresse personnelle. Les deux moyens doivent
coexister.

**Le compte et le moyen de preuve sont donc séparés** : la ligne `users` est
l'identité, la table `auth_identity` porte les moyens de s'authentifier (voir
[règles accès §5](REGLES-METIER-ACCES.md)). Le cas « email de l'école » et le cas
« email personnel » ne diffèrent alors que par la ligne `auth_identity`
présente — pas par un second chemin de code.

**Le mot de passe local est construit en premier**, le SSO Microsoft ensuite :

- La table `auth_identity` rend le SSO **additif**, pas une réécriture. Rien de
  ce qui est construit d'abord n'est jeté.
- Le SSO dépend du service informatique de l'école (enregistrement d'
  application, client ID, tenant ID) : c'est un blocage sur l'agenda d'un tiers,
  pas le mot de passe local.
- L'email d'invitation impose une couche SMTP, qui est **aussi** le prérequis de
  tout le backlog de notifications. Elle est construite une fois et sert deux fois.
- Le développement local ne demande aucun aller-retour OAuth.

### D3 — Rôle global + portée par bibliothèque pour les bibliothécaires

Un `role` sur `users` (`USER`, `LIBRARIAN`, `ADMIN`), et un rattachement du
bibliothécaire à une ou plusieurs bibliothèques via une table de liaison.
L'`ADMIN` est global par définition.

**Écarté :** le rôle par bibliothèque intégral (`user_library_role`). Il oblige
chaque contrôle à disposer d'une bibliothèque de contexte, y compris pour des
actions qui n'en ont pas naturellement — modifier une notice, par exemple.

### D4 — Paramètres : défaut global + surcharge par bibliothèque

Preschool et Primary n'ont pas les mêmes besoins. La résolution est
« valeur de la bibliothèque sinon valeur globale ». Voir
[règles paramètres](REGLES-METIER-PARAMETRES.md).

### D5 — Un élève appartient à une bibliothèque, et cela le contraint

`users.library_id`. L'élève voit le catalogue de sa bibliothèque, y emprunte et
y réserve, et se voit appliquer ses paramètres.

**Motivation :** sans ce rattachement, un élève de maternelle pourrait réserver
un ouvrage de KS5 au Primary.

### D6 — Archivage, plus suppression quand la bibliothèque est vide

**Décision révisée en cours d'analyse.** L'option « refuser tant que ce n'est pas
vide » paraissait la plus sûre, jusqu'à vérification des clés étrangères sur la
base réelle : une copie ayant un historique d'emprunt **ne peut pas** être
supprimée. Vider une bibliothèque qui ferme est donc souvent **impossible**, et
« supprimer quand c'est vide » décrit un état inatteignable.

L'archivage est l'opération réellement voulue quand un site ferme ; la
suppression physique ne sert qu'à la bibliothèque créée par erreur. Voir
[règles structurelles §4](REGLES-METIER-STRUCTURE.md).

### D7 — Élèves de maternelle : aucun rôle parent, aucune délégation

Les élèves de Preschool ont une adresse de l'école, administrée en pratique par
les parents. Le compte reste celui de l'élève ; le parent est la personne devant
le clavier.

**C'est la réponse la moins chère :** pas de quatrième rôle, pas de modèle de
délégation, pas de fonctionnalité « agir au nom de ». `users.parent_email` reste
un champ de contact.

### D8 — Session par cookie httpOnly, CSRF réactivée

Plutôt qu'un JWT en `localStorage`, qu'une faille XSS peut lire. L'
authentification par cookie rend la protection CSRF de nouveau nécessaire : elle
est actuellement désactivée dans `SecurityConfig`.

### D9 — La bascule vers le SSO migre l'identité, pas le compte

Un usager qui se connectait par mot de passe et qui obtient ensuite une adresse
de l'école **ne se crée pas un second compte**. Sa ligne `users` reste la même,
à vie. Seules les lignes `auth_identity` changent : on rattache l'identité
`microsoft`, on retire l'identité `local`, on met à jour `users.email`.

```
avant :  users(42) ← auth_identity(provider=local,     password_hash=…)
après :  users(42) ← auth_identity(provider=microsoft, subject=…)
```

**Écarté :** créer un compte sur la nouvelle adresse et désactiver l'ancien.
`borrowing.user_id`, `hold.user_id` et `notification.user_id` pointent vers
l'ancienne ligne, et désactiver un compte n'annule pas ses emprunts en cours
([règles accès §6](../business-rules/REGLES-METIER-ACCES.md)). On obtiendrait un
compte désactivé détenant des livres dus et un compte neuf d'apparence vierge :
historique de lecture coupé en deux, et livre introuvable au comptoir.

C'est la raison d'être de `auth_identity` poussée à sa conclusion — si le moyen
de preuve est une donnée rattachée au compte, le changer ne doit jamais toucher
au compte.

**Le rattachement se fait par un geste explicite, jamais par correspondance
d'email** : l'ancienne adresse est personnelle, la nouvelle est celle de
l'école, elles ne se ressemblent pas. Deux mécanismes acceptables :

- l'usager, **déjà connecté** avec son mot de passe, lie son compte Microsoft :
  l'identité est rattachée au compte de sa session, pas à une devinette ;
- le personnel change l'adresse du compte et renvoie une invitation Microsoft —
  c'est le secours, et il est auditable.

Dans les deux cas, les contrôles `email_verified` et `tid` de
[règles accès §5.2](../business-rules/REGLES-METIER-ACCES.md) restent
obligatoires. Ce n'est pas de la création à la volée : le compte préexiste, on
ne fait qu'y attacher une preuve.

---

## 3. Ordre de construction et sa logique

Le découpage en sept phases répond à une contrainte : **les élèves n'obtiennent
un compte qu'en phase 5.** Les phases 1 à 4 concernent le seul personnel.

Ainsi l'application continue de se comporter exactement comme aujourd'hui pour
les personnes qui s'en servent, et on n'est jamais dans l'état bancal où des
élèves peuvent se connecter sans avoir rien à consulter.

Voir le [plan d'implémentation](implementation/README.md).

---

## 4. Ce qui n'est volontairement pas construit

| Écarté | Raison |
|---|---|
| Rôle « parent », délégation, usurpation d'identité | D7 — le compte de l'élève suffit |
| Création de compte à la volée (JIT) au premier SSO | Toute personne du tenant deviendrait usager au premier clic |
| Rôle par bibliothèque intégral | D3 — coût de contexte disproportionné |
| Suppression d'un utilisateur | Détruit l'historique ou échoue, selon ses données ([règles structurelles §3](REGLES-METIER-STRUCTURE.md)) |
| JWT en `localStorage` | D8 — lisible par XSS |
| Second compte à l'obtention d'une adresse de l'école | D9 — scinderait l'historique d'emprunts de la personne |

---

## 5. Questions encore ouvertes

| Question | Quand la trancher |
|---|---|
| Destinataire des notifications : `email`, `parent_email`, ou les deux selon le `key_stage` ? | Au moment du lot notifications |
| Adopter Flyway, ou conserver des scripts numérotés joués à la main ? | Phase 0 — premier arbitrage à rendre |
| Qui a le droit d'ajouter une seconde identité à un compte, et l'arrivée d'une identité `microsoft` doit-elle supprimer l'identité `local` ou la laisser en secours ? | Avant US-007 — D9 décrit la bascule, pas qui la déclenche |
| Pour Microsoft, stocker le claim `sub` ou le couple `oid` + `tid` ? Le `sub` d'Entra est propre au couple (usager, application) : si le service informatique recrée l'enregistrement d'application, **toutes** les identités deviennent inconnues. Google n'a pas ce problème. | US-007, au moment d'écrire le rattachement |
