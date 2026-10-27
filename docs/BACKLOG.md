# Backlog des features

Les features à spécifier ensuite, dans l'ordre où elles se débloquent. Chacune
passera par `spec` dans sa propre session ; ce document dit seulement ce
qu'elles couvrent, ce dont elles dépendent, et ce qui a déjà été décidé à leur
sujet. Les notes libres restent dans [todo.md](todo.md).

---

## Phase 4 — Gestion des utilisateurs

Suite de [FEAT09 — Administration des comptes](implementation/FEAT09-administration-des-comptes/README.md).
Voir la [phase 4](implementation/authentication-system/phase-4-gestion-utilisateurs/README.md).

### B. Activation par email

- **Contenu** : couche d'envoi d'emails (configuration SMTP, gabarits, envoi,
  traitement des échecs) ; jeton à usage unique, haché, avec expiration ; lien
  « activer mon compte » sur la page de connexion ; page de choix du mot de
  passe ; réinitialisation d'un mot de passe oublié.
- **Dépend de** : FEAT09 (des comptes à activer).
- **Déjà décidé** (session FEAT09, 2026-10-27) :
  - L'élève n'**ouvre** pas de compte depuis la page de connexion : il
    **active** le compte que l'école a créé ou importé. Il saisit son adresse,
    et reçoit un lien pour choisir son mot de passe. Une adresse inconnue reçoit
    la même réponse neutre, sans email. Rejetées : l'inscription libre, et
    l'inscription limitée au domaine de l'école (création à la volée,
    [règles accès §5.2](business-rules/REGLES-METIER-ACCES.md)).
  - L'administrateur ne régénère pas de mot de passe dans FEAT09 : un mot de
    passe oublié attend cette feature.
  - Dans FEAT09, un membre du personnel créé reçoit un **mot de passe
    temporaire**, vu par l'administrateur, et **rien ne l'oblige à le
    changer**. C'est un risque accepté provisoirement : beaucoup le garderont.
- **Proposé pour cette feature** (à confirmer lors de sa spec) :
  - **L'invitation par email devient la voie normale de création d'un compte du
    personnel** qui a une adresse exploitable : l'administrateur crée le
    compte, BookSnap envoie un lien à usage unique, la personne choisit son mot
    de passe elle-même. L'administrateur ne voit jamais de mot de passe.
  - **Le mot de passe temporaire de FEAT09 devient le secours** : panne SMTP,
    ou adresse sans boîte de réception
    ([règles accès §5.3](business-rules/REGLES-METIER-ACCES.md), troisième
    voie).
  - **Les comptes du personnel créés avec un mot de passe temporaire avant
    cette feature** : leur proposer, ou leur imposer, de passer par le lien de
    réinitialisation, pour qu'aucun mot de passe connu de l'administrateur ne
    reste en service. À trancher : simple invitation, ou changement obligatoire
    à la prochaine connexion. C'est dans cette feature que l'état « mot de
    passe à changer », écarté de FEAT09, se rediscutera.
  - **Un élève promu membre du personnel sans mot de passe** (FEAT09 US-04)
    reçoit une invitation, ce qui comble le trou laissé par FEAT09, où il ne
    peut pas se connecter.
- **À trancher** : le moment où un élève peut activer son compte, puisque
  l'espace élève (phase 5) n'existe pas encore ; le destinataire des messages
  pour la maternelle (`email` ou `parent_email`) ; les jetons ne doivent jamais
  apparaître dans une URL consignée dans les logs d'accès.
- **Sert aussi** au lot de notifications (`hold_ready`, `overdue_reminder`…).

### C. Import iSAMS

- **Contenu** : import des élèves d'une classe à partir d'une extraction du
  logiciel de l'école (type iSAMS) ; prévisualisation avant écriture ;
  traitement explicite des adresses déjà connues (`users.email` est unique sans
  tenir compte de la casse) ; compte rendu.
- **Dépend de** : FEAT09 (règles des champs d'un élève). Probablement de
  « Rattachements et portée », si l'import doit placer l'élève dans sa
  bibliothèque.
- **À trancher** : le format exact de l'extraction, et ce que devient un élève
  déjà présent (mise à jour, ignoré, signalé). Vérifier que les valeurs de sexe
  de l'export correspondent à la liste de FEAT09 (`female`, `male`, `other`, ou
  vide).

### Rattachements et portée

- **Contenu** : `users.library_id` (la bibliothèque d'un élève) et
  `librarian_library` (les bibliothèques d'un bibliothécaire) ; le sort des
  élèves existants, qui n'ont pas de bibliothèque ; la portée réellement
  appliquée aux copies, prêts et réservations
  ([règles accès §2](business-rules/REGLES-METIER-ACCES.md)) ; le droit du
  bibliothécaire de créer, inviter et désactiver les élèves de ses
  bibliothèques.
- **Dépend de** : FEAT09.
- **Déjà décidé** (session FEAT09) : FEAT09 crée des comptes sans bibliothèque,
  et réserve leur gestion à l'`ADMIN`, parce que rien ne lirait la bibliothèque
  d'un compte avant cette feature.
- **Débloque** : le nombre maximal d'emprunts par élève, et la question du prêt
  entre bibliothèques (voir FEAT08, hors périmètre).

---

## Configuration initiale de l'application

- **Contenu** : le parcours de première installation, joué au premier démarrage
  (déjà évoqué par FEAT03 et FEAT08) : nommer la ou les bibliothèques, régler
  leurs règles de prêt, et **créer les maisons de l'école**. L'administrateur
  gère lui-même la liste des maisons (créer, renommer).
- **Déjà décidé** (session FEAT09, 2026-10-27) : en attendant, le champ
  « House » d'un compte élève (FEAT09 US-02) propose les maisons déjà utilisées
  dans `users.house` et accepte une valeur nouvelle. La liste gérée par
  l'administrateur remplacera ces suggestions.
- **À trancher** : ce que deviennent les maisons déjà saisies qui ne figurent
  pas dans la liste gérée, et si une maison peut être retirée alors que des
  élèves y sont.
