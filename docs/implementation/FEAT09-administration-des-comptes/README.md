# Administration des comptes

Aujourd'hui, un compte ne naît que de `server/sql/seed.sql`, d'un `INSERT` dans
`psql` ou de l'amorçage du premier administrateur (`AdminBootstrapRunner`), et
rien ne permet de le corriger, de le faire changer de rôle ni de le retirer sans
passer par la base. Une fois la feature livrée, l'administrateur trouve une vue
**Users** dans la navigation. Il y cherche un compte, crée un élève (sans mot de
passe, pour les prêts au comptoir) ou un membre du personnel (qui reçoit un
**mot de passe temporaire** affiché une seule fois), modifie ses informations,
change son rôle, le désactive ou le réactive, et supprime un compte créé par
erreur.

Voir le glossaire : [Account, Student, Staff member, Role, Deactivated account,
Unused account, Temporary password](../../GLOSSARY.md).

Première des features de la
[phase 4](../authentication-system/phase-4-gestion-utilisateurs/README.md). Les
suivantes sont listées dans le [backlog](../../BACKLOG.md).

## Pourquoi maintenant

Un bibliothécaire qui arrive, un élève inscrit en cours d'année, un key stage à
changer à la rentrée, un départ : tout passe aujourd'hui par `psql`. C'est aussi
le socle des features suivantes. L'activation par email a besoin de comptes à
activer, et l'import iSAMS crée des comptes élèves selon les mêmes règles.

---

## Décisions valables pour toute la feature

- **Seul l'`ADMIN` gère les comptes.** La matrice des
  [règles accès §3](../../business-rules/REGLES-METIER-ACCES.md) donne au
  `LIBRARIAN` la création et la désactivation des élèves « de ses
  bibliothèques ». Or le rattachement d'un bibliothécaire à ses bibliothèques
  n'existe pas encore (pas de `librarian_library`). Ouvrir ces gestes maintenant
  lui donnerait la main sur les élèves de toute l'école. Ce droit est reporté à
  la feature « Rattachements et portée » du backlog.
- **Le compte est créé par l'école, jamais par la personne elle-même.** Rejeté :
  l'inscription libre depuis la page de connexion, même limitée au domaine de
  l'école. N'importe quel adulte du domaine deviendrait élève, sans bibliothèque
  ni classe connues, ce que les
  [règles accès §5.2](../../business-rules/REGLES-METIER-ACCES.md) (pas de
  création à la volée) interdisent. Le geste côté élève sera une **activation**
  d'un compte existant, par un lien reçu à l'adresse que l'école a fournie
  (feature B du backlog).
- **Un élève créé ici n'a aucun mot de passe.** Il existe pour les prêts au
  comptoir. Les élèves ne se connectent pas avant l'espace élève (fil directeur
  du [plan](../authentication-system/README.md)), et un compte sans aucun moyen
  de connexion est un état prévu
  ([règles accès §5.1](../../business-rules/REGLES-METIER-ACCES.md)).
- **Un membre du personnel créé ici reçoit un mot de passe temporaire**, affiché
  une seule fois à l'administrateur, qui le transmet de vive voix. Il le change
  ensuite dans « My account ». C'est la troisième voie des
  [règles accès §5.3](../../business-rules/REGLES-METIER-ACCES.md). Rejeté : un
  mot de passe choisi par l'administrateur, qu'il connaîtrait durablement.
- **L'administrateur ne régénère aucun mot de passe.** Un mot de passe oublié
  attend la feature B (réinitialisation par email). D'ici là, c'est `psql`.
  Décidé avec l'utilisateur, contre la recommandation de proposer une
  régénération.
- **Un changement de rôle ou une désactivation prend effet immédiatement** :
  toutes les sessions ouvertes du compte sont fermées. Rejeté : attendre la
  prochaine connexion. Un admin rétrogradé resterait admin, et un bibliothécaire
  désactivé continuerait à prêter, tant que sa session vit.
- **Un administrateur n'agit jamais sur son propre rôle, son propre statut ni la
  suppression de son propre compte.** Les gestes sont absents de sa propre ligne,
  et l'API les refuse. C'est aussi ce qui protège le dernier administrateur
  actif : personne d'autre que lui ne peut agir sur lui, et lui-même ne le peut
  pas. Rejeté : l'autoriser tant qu'un autre admin actif existe. Un
  administrateur **peut** modifier ses propres informations (US-03).
- **Un compte n'est jamais supprimé, sauf un compte qui n'a jamais servi**
  (_Unused account_). Sur le modèle de D6 pour les bibliothèques : la
  désactivation est le geste normal, la suppression ne sert qu'au compte créé
  par erreur. Voir US-06 et
  [règles accès §6](../../business-rules/REGLES-METIER-ACCES.md).
- **Aucune bibliothèque n'est choisie à la création.** Ni `users.library_id` ni
  `librarian_library` n'existent, et aucun code ne lirait ces valeurs : un prêt
  et une réservation tiennent leur bibliothèque de la copie. Le rattachement, le
  sort des élèves existants et la portée sont reportés ensemble (backlog).
- **Champs d'un compte** : prénom, nom et email pour tous, obligatoires. Pour un
  élève, le key stage est obligatoire, la maison, l'email parent et le sexe sont
  facultatifs. Ce sont des colonnes existantes de `users` ; aucune migration
  n'est attendue.

**Hors périmètre de la feature** : l'activation par email et la couche SMTP,
l'import iSAMS, les rattachements aux bibliothèques et la portée, la
régénération d'un mot de passe. Tous sont listés dans le
[backlog](../../BACKLOG.md).

---

## User stories

L'ordre est l'ordre d'implémentation recommandé. Chaque story est vérifiable de
bout en bout seule et livrable sans la suivante ; sa section **Vérification de
bout en bout** décrit le parcours exact. US-04, US-05 et US-06 sont
indépendantes entre elles.

| # | Titre | Nature | Portée | Dépend de |
|---|---|---|---|---|
| [US-01](US-01-voir-les-comptes/US-01-voir-les-comptes-spec.md) | L'administrateur voit les comptes de l'école | feature | back + front | — |
| [US-02](US-02-creer-un-compte/US-02-creer-un-compte-spec.md) | Créer un compte élève ou du personnel | feature | back + front | US-01 |
| [US-03](US-03-modifier-un-compte/US-03-modifier-un-compte-spec.md) | Modifier les informations d'un compte | feature | back + front | US-02 |
| [US-04](US-04-changer-le-role/US-04-changer-le-role-spec.md) | Changer le rôle d'un compte | feature | back + front | US-01 |
| [US-05](US-05-desactiver-un-compte/US-05-desactiver-un-compte-spec.md) | Désactiver et réactiver un compte | feature | back + front | US-01 |
| [US-06](US-06-supprimer-un-compte/US-06-supprimer-un-compte-spec.md) | Supprimer un compte qui n'a jamais servi | feature | back + front | US-02 |

---

## Préparation commune aux vérifications

- **Base** : `docker compose up -d db`.
- **Comptes** : le harnais de bout en bout (`npm run test:e2e` dans `web/`)
  fournit un compte par rôle sur la base jetable `booksnap_e2e`
  (`web/test/e2e/support/accounts.js`) : admin `alice.martin@example.com`,
  bibliothécaire `bob.johnson@example.com`, élève `clara.dupont@example.com`,
  mot de passe `E2E_PASSWORD`. Les six autres élèves des fixtures (Daniel Smith,
  Emma Wilson…) n'ont pas de mot de passe. Une vérification qui a besoin d'un
  second administrateur le prépare dans `psql`
  (`UPDATE users SET role = 'admin' WHERE email = '…'`, plus une identité
  `local`, comme le fait le harnais).
- **Parcours manuel** : sur la base `booksnap_e2e` après un `npm run test:e2e`,
  avec un backend et un `npm run dev` pointés dessus, ou sur la base de
  développement avec ses comptes admin et bibliothécaire. La base jetable est
  préférable : les prêts et les réservations laissent des lignes définitives
  dans `lifecycle_event`.
- **Nettoyage** : sur `booksnap_e2e`, rien (la base est reconstruite à chaque
  exécution). Sur la base de développement, un compte créé et jamais utilisé se
  supprime avec US-06, ou dans `psql` (`DELETE FROM auth_identity WHERE user_id = …`
  puis `DELETE FROM users WHERE id = …`).

---

## Points de vigilance connus

- **`users.email` est `citext`, et l'insensibilité à la casse des recherches
  dépend de `?stringtype=unspecified`** dans l'URL JDBC (`.claude/CLAUDE.md`).
  L'unicité est garantie par l'index `users_email_key` quoi qu'il arrive.
- **Le rôle est figé dans la session.** `AuthController.login` place un
  `AuthenticatedUser` dans la session, avec le rôle et l'email lus à la
  connexion. Changer `users` ne change rien à une session ouverte ; seule la
  fermeture des sessions (`SessionInvalidator`) fait prendre effet un changement.
- **Supprimer un compte ne doit jamais passer par `borrowing`** :
  `borrowing_user_id_fkey` est `ON DELETE CASCADE`. Les autres références
  (`hold`, `notification`, `auth_identity`) ne cascadent pas.
- **`lifecycle_event` est en ajout seul** et fige le prénom, le nom, le key
  stage et la maison de l'élève au moment des faits (`V10__lifecycle_event.sql`).
  Ses colonnes `student_id` et `actor` ne sont pas des clés étrangères.
- **Le travail sur les réservations de la branche `book-lifecycle` n'est pas
  commité** au moment de l'écriture (`HoldServiceImpl`, `HoldExpirationScheduler`,
  `Status`). US-05 s'appuie sur `HoldServiceImpl.expireHold`.
- **`AdminBootstrapRunner` compte aussi les administrateurs désactivés**
  (`UserRepository.existsByRole`). Il ne rouvrira jamais la porte si le dernier
  administrateur actif disparaît : c'est la raison de la règle « jamais sur son
  propre compte ».
