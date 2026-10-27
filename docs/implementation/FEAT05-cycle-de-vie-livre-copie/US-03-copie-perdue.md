# US-03 — Déclarer une copie perdue ou retrouvée, et la retirer du catalogue élève

[← Fonctionnalité](README.md)

| | |
|---|---|
| **Fonctionnalité** | Cycle de vie d'un livre et d'une copie |
| **Nature** | feature |
| **Dépend de** | [US-02](US-02-detail-du-refus.md) — le refus d'une déclaration de perte réutilise ses DTO et son composant d'affichage. À livrer aussi après [US-01](US-01-suppression-logique.md) : les deux touchent le même filtrage de catalogue |
| **Bloque** | US-04 |
| **Portée** | back · front |
| **Casse l'existant ?** | **Oui.** `PUT /copies/{copyId}` n'accepte plus n'importe quel statut : seules deux transitions passent. Aucun appelant connu n'envoie `status` aujourd'hui — l'action côté front est morte — mais le contrat se resserre. |

---

## Récit

**En tant que** bibliothécaire
**je veux** déclarer perdu un exemplaire qui n'est plus sur l'étagère, et le
déclarer retrouvé quand il réapparaît
**afin qu'**un élève cesse de le chercher dans le catalogue et de croire qu'il
peut l'emprunter — et le retrouve dès qu'il est de nouveau sur l'étagère.

## Contexte

**L'action existe dans l'interface et ne fait rien.** `copy-table-bks` l'offre
dans le menu de chaque copie :

```js
// web/src/features/copy/copy-table-bks/copy-table-bks.js:259
{
  action: 'update-status',
  data,
  path: 'M204-318q-22-38-33-78…',
  label: 'Update status',
  class: '',
},
```

`catalog-view.js` traite `update-book`, `delete-book`, `print-qr-code`,
`update-section`, `delete-copy`, `borrow-book`, `hand-over-hold`,
`return-book` et `hold-book` — pas `update-status`, qui tombe donc dans le
`default: break;`. Cliquer l'entrée ferme le menu et rien d'autre.

**Côté serveur, le contrat est ouvert en grand.** `UpdateCopyRequest` accepte
les six valeurs de l'enum, et le service les écrit sans rien vérifier :

```java
// server/src/main/java/net/booksnap/domain/copy/service/CopyServiceImpl.java
if (request.status() != null) {
    existingCopy.setStatus(request.status());
}
```

Or `borrowed` et `on_hold` appartiennent aux triggers de `V1`
([règles structurelles §5](../../business-rules/REGLES-METIER-STRUCTURE.md)) :
les écrire depuis l'application produit un statut que le prochain
retour d'emprunt écrasera, ou pire, une copie annoncée libre alors qu'un
emprunt est ouvert.

**`lost` n'a aucun effet nulle part.** La valeur existe dans
`copy_status` et dans l'enum Java depuis l'origine :

```java
// server/src/main/java/net/booksnap/domain/copy/Status.java
public enum Status {
    available, borrowed, on_hold, lost, damaged, removed;

    public boolean isBorrowable() {
        return this == available || this == damaged;
    }
}
```

| Couche | Ce qui se passe aujourd'hui |
|---|---|
| Back | `PUT /copies/{id}` accepte les six statuts, de la part d'un `LIBRARIAN` comme d'un `ADMIN` (`config/SecurityConfig.java`) |
| Back | Aucune lecture ne filtre `lost` : ni `findAllBookCopies`, ni `searchBooks`, ni `countCopiesByBookIds` |
| Back | Une copie `lost` n'est pas empruntable — `isBorrowable()` est faux — mais rien ne l'empêche d'être proposée |
| Front | L'entrée « Update status » est morte ; `_getStatusClass` ne connaît que `available` et « le reste » |
| Front | Scanner le QR code d'une copie `lost` ne mène nulle part : `scan-qrcode-view` ne traite que les copies empruntées, `available` et `on_hold`, et journalise les autres dans la console |
| Front | Le filtre « Availability » de la recherche est alimenté par `GET /copies/statuses`, qui renvoie tout l'enum : « Lost » y figure déjà |

Contraintes du projet :
[règles structurelles §5](../../business-rules/REGLES-METIER-STRUCTURE.md),
[règles accès §1 et §3](../../business-rules/REGLES-METIER-ACCES.md).

---

## Décisions et non-objectifs

- **Deux transitions, et pas une de plus**
  ([D3](README.md#décisions-qui-valent-pour-toute-la-fonctionnalité)) :

  | Rôle | Transition autorisée |
  |---|---|
  | `LIBRARIAN` et `ADMIN`, sans distinction | `available` → `lost`, `lost` → `available` (« retrouvée ») |
  | personne | tout le reste : ce qui mène à `borrowed`, `on_hold`, `removed` ou `damaged`, ce qui part de `damaged`, et le maintien dans le statut actuel (`lost` → `lost`) |

  La table ne dépend pas du rôle : l'endpoint est déjà fermé au rôle `user`, et
  parmi le personnel c'est l'état de la copie seul qui décide. `damaged`
  n'y figure dans aucun sens : c'est un état de conservation, pas une étape du
  cycle de la copie, et il sort de cette story
  ([D10](README.md#décisions-qui-valent-pour-toute-la-fonctionnalité)). Une
  copie `damaged` ne peut donc pas être déclarée perdue : écrire `lost` dans la
  même colonne effacerait la trace de l'abîmement, et rien ne la rétablirait
  quand la copie serait retrouvée.

- **Une copie retrouvée est proposée d'abord à la file d'attente.** Si le livre
  a une réservation `pending`, la copie ne reste pas libre pendant qu'un élève
  attend : la plus ancienne est promue en `active` sur cette copie (une semaine
  pour la retirer), comme au retour d'un emprunt. La promotion existante est
  réutilisée, pas réécrite. Le statut final de la copie est donc `on_hold`
  quand quelqu'un attendait, `available` sinon. Rejeté : laisser la copie
  `available` et le prêt au comptoir — la réservation ne serait servie qu'au
  prochain retour d'une *autre* copie, jamais si le livre n'en a pas d'autre.

- **La modale dit à qui la copie est destinée.** `PUT` reste en 204 — pas de
  corps, pas de contrat de plus qui change. Après un succès, la modale relit la
  copie par `GET /borrowings/{copyId}` (qui renvoie déjà `copyStatus` et la
  réservation active avec le nom de l'élève) et, si la copie est `on_hold`,
  affiche « Mettre de côté pour {élève}, à retirer avant le {date} ». Sans
  quoi le bibliothécaire remettrait sur l'étagère un livre promis à quelqu'un.

- **Retrouver une copie se fait là où on la tient en main, pas seulement là où
  on la cherche.** Trois portes d'entrée, toutes vers la même modale de
  changement de statut :
  1. le menu « Update status » de la ligne de la copie, dans le catalogue ;
  2. le scan de son QR code, parce que le cas réel est un exemplaire retrouvé
     dans un rayon ou rendu en vrac, étiquette en vue ;
  3. le filtre « Availability = Lost » de la recherche, qui liste les livres
     ayant au moins une copie perdue — c'est la porte de qui part de la
     question « qu'est-ce qui manque ? ».

  Rejeté, pour cette story : un écran dédié aux copies perdues, qui demande un
  endpoint de liste de plus et une route ; les trois portes ci-dessus suffisent
  tant que les pertes restent rares.

- **Une copie `borrowed` ou `on_hold` ne peut pas être déclarée perdue.** C'est
  une limite assumée, et elle sera gênante : le cas réel le plus fréquent est
  précisément l'élève qui perd un livre qu'il a emprunté. Elle est posée ici
  parce que `copy.status` appartient aux triggers — écrire `lost` sur une copie
  dont l'emprunt est ouvert donne un statut que le retour écrasera, et un
  emprunt qui ne se refermera jamais. Traiter ce cas correctement veut dire
  décider ce que devient l'emprunt (clos ? facturé ?), ce qui est une autre
  story. En attendant, le parcours est : enregistrer le retour, puis déclarer
  la copie perdue.

- **Un livre sort du catalogue de l'élève quand il ne lui reste aucune copie
  ni vivante ni retrouvable** — c'est-à-dire aucune copie qui ne soit ni
  supprimée (US-01) ni `lost`. La règle couvre d'un coup le livre dont toutes
  les copies sont perdues et le livre dont toutes les copies ont été
  supprimées une à une.

- **Le personnel continue de tout voir**, avec le statut affiché. Rejeté : une
  case « afficher les copies perdues », décochée par défaut — personne ne
  pourrait alors constater qu'une étagère s'est vidée sans savoir d'abord qu'il
  faut cocher.

- **`damaged` reste hors de l'interface**
  ([D10](README.md#décisions-qui-valent-pour-toute-la-fonctionnalité)). Il
  garde exactement son comportement actuel : posé en psql seulement,
  empruntable (`isBorrowable()` ne change pas), préservé à travers un emprunt
  par `borrowing.pre_borrow_copy_status`. Le rendre atteignable ici obligerait
  à trancher ce que devient une copie abîmée mise de côté pour une
  réservation — `fn_sync_copy_on_hold_update` la remet en `available` à
  l'expiration ou au retrait — et la question dépasse la story : `damaged` dit
  dans quel état est l'exemplaire, pas où il se trouve. Rejeté : l'ajouter aux
  transitions manuelles en rafistolant les triggers de `hold` comme ceux de
  `borrowing`. Voir la
  [pré-spec sur l'état de conservation](../etat-de-conservation-copie/pre-spec.md).

- **Assumé, non confirmé** : pour un élève, une copie `lost` est retirée du
  nombre total de copies autant que du nombre de copies disponibles — il ne
  doit pas lire « 3 exemplaires, 0 disponible » pour un livre dont il ne reste
  rien.

- **Assumé, non confirmé** : la transition est refusée avec un 409, comme les
  autres conflits métier du projet, et non un 403 — c'est l'état de la copie
  qui décide, pas le rôle.

- **Une copie perdue n'offre pas « Borrow book » dans son menu.** Le front ne
  propose pas ce qu'il sait que le serveur refusera. C'est déjà le cas :
  `copy-table-bks._getDropdownOptions` n'ajoute `borrow-book` que si le statut
  est `available`, et `lost` n'y répond pas. La story ne l'ajoute pas, elle le
  fixe — c'est une condition à ne pas desserrer, vérifiée par un scénario. Le
  refus du serveur (`isBorrowable()`) reste en place pour tout appelant qui ne
  passe pas par ce menu. Cela ne contredit pas la décision suivante : ici le
  statut qui décide est celui de la ligne affichée, et une copie `lost` qui
  aurait été retrouvée entre-temps n'est qu'une entrée de moins dans le menu,
  pas un geste manqué.

- **Un refus se lit dans la modale, avec sa raison.** La modale propose
  « Lost » pour toute copie qui n'est pas déjà `lost`, `damaged`, `borrowed` et
  `on_hold` compris, et c'est le serveur qui dit non. Rejeté : griser ou masquer l'option
  côté front selon le statut affiché — cela recopie la table de transitions
  dans le navigateur, et le statut affiché peut être périmé (la copie vient
  d'être empruntée au comptoir d'à côté). Le 409 porte un message qui nomme
  l'état de la copie **et** ce qu'il faut faire d'abord, par exemple :
  « This copy is currently borrowed. Record its return first, then declare it
  lost. » Ce message s'affiche dans la modale, qui reste ouverte, sans changer
  le statut. C'est la raison que le bibliothécaire n'aurait autrement pas :
  la limite sur les copies empruntées est assumée plus haut, et elle ne doit pas
  ressembler à une panne.

- **Le refus nomme l'élève, exactement comme le refus de suppression
  ([US-02](US-02-detail-du-refus.md)).** Le corps du 409 étend `ApiError` de
  deux tableaux, `activeBorrowings` et `activeHolds`, toujours présents (vides
  plutôt qu'absents), dont les entrées sont les mêmes `BlockingBorrowing` et
  `BlockingHold` — prénom et nom de l'élève, code d'identification de la
  copie, statut, dates. Une copie `borrowed` renvoie son emprunt (avec la date
  d'échéance, `overdue` compris) ; une copie `on_hold` renvoie la réservation
  `active` qui la retient et sa date limite de retrait. Les autres 409 de la
  table de transitions (par exemple `lost` → `damaged`) renvoient deux tableaux
  vides. Les listes sont construites dans la transaction qui a constaté le
  refus et portées par l'exception, jamais relues après coup — pour la même
  raison qu'en US-02 : ce qui s'affiche doit être ce qui a bloqué. Les noms des
  élèves sont déjà visibles du personnel (liste des emprunts, recherche
  d'usagers) : rien de nouveau n'est exposé, et l'endpoint est fermé au rôle
  `user`.

- **Le composant est réutilisé, pas recopié.** La modale de changement de
  statut rend le message du serveur puis, dessous, le composant qui affiche les
  deux listes pour le refus de suppression (`deletion-blockers-bks`, dans
  `features/book/`). Un composant nommé « deletion » qui sert à autre chose
  est un défaut de nom connu ; le renommer est possible mais hors de cette
  story, qui ne touche pas au parcours de suppression.

- **Assumé, non confirmé** : contrairement au refus de suppression, où la
  liste remplace le message, ici le message **reste affiché** au-dessus de la
  liste — c'est lui qui dit quoi faire d'abord (« enregistrer le retour »), ce
  que la liste seule ne dit pas.

- **Scanner une copie `lost` pose la question, il ne la tranche pas.** Le
  bibliothécaire qui retrouve un livre et le scanne voit que l'exemplaire est
  marqué perdu et se voit demander s'il le remet en rayon : la modale de
  changement de statut s'ouvre avec ce constat (« This copy is marked as lost »)
  et deux boutons, confirmer ou annuler. Rien n'est écrit tant qu'il n'a pas
  confirmé — un scan accidentel ne change aucun statut. Scanner une copie dans
  un autre état se comporte comme aujourd'hui.

**Hors périmètre de cette story** : déclarer perdue une copie empruntée (voir
ci-dessus) ; un écran dédié listant les copies perdues ; la notification à
l'élève dont la réservation est promue (le `TODO` de
`promoteNextPendingHold` reste tel quel) ; le statut `removed` ; l'état de
conservation (`damaged`), voir la décision ci-dessus ; `GET /copies/{id}`, ouvert
au rôle `user` et qui renvoie une copie `lost` avec son statut — aucun écran ne
l'appelle, le catalogue passe par `/books/search` et `/books/{id}/copies` ;
l'interface élève, qui
n'existe pas — la règle de visibilité se vérifie côté serveur avec une session
`user` ; la journalisation du passage en `lost`, qui est US-04.

---

## Scénarios

### Scenario: un bibliothécaire déclare une copie perdue

```gherkin
Given une copie en statut "available"
When un bibliothécaire la déclare perdue
Then la réponse est 204
And le statut de la copie en base est "lost"
```

### Scenario: une copie abîmée ne peut pas être déclarée perdue

```gherkin
Given une copie en statut "damaged"
When un bibliothécaire tente de la déclarer perdue
Then la réponse est 409
And "activeBorrowings" et "activeHolds" sont présents et vides
And le statut de la copie en base est toujours "damaged"
```

### Scenario: un bibliothécaire déclare une copie retrouvée

```gherkin
Given une copie en statut "lost"
When un bibliothécaire la repasse en "available"
Then la réponse est 204
And le statut de la copie en base est "available"
```

### Scenario: un administrateur déclare aussi une copie retrouvée

```gherkin
Given une copie en statut "lost"
When un administrateur la repasse en "available"
Then la réponse est 204
And le statut de la copie en base est "available"
```

### Scenario: une copie perdue ne devient pas « abîmée »

```gherkin
Given une copie en statut "lost"
When un bibliothécaire tente de la passer en "damaged"
Then la réponse est 409
And le statut de la copie en base est toujours "lost"
```

### Scenario: redéclarer perdue une copie déjà perdue est refusé

```gherkin
Given une copie en statut "lost"
When un bibliothécaire tente de la passer en "lost"
Then la réponse est 409
And le statut de la copie en base est toujours "lost"
```

### Scenario: une copie retrouvée est de nouveau empruntable

```gherkin
Given une copie en statut "lost" qu'un bibliothécaire vient de repasser en "available"
When un bibliothécaire enregistre un emprunt sur cette copie
Then l'emprunt est créé
```

### Scenario: une copie retrouvée est attribuée à la plus ancienne réservation en attente

```gherkin
Given un livre dont l'unique copie est "lost"
And deux réservations "pending" sur ce livre, celle d'Emma Wilson posée avant celle de Daniel Smith
When un bibliothécaire déclare la copie retrouvée
Then la réponse est 204
And la réservation d'Emma Wilson est "active" et porte cette copie, avec une semaine pour la retirer
And la réservation de Daniel Smith est toujours "pending"
And le statut de la copie en base est "on_hold"
```

### Scenario: sans file d'attente, la copie retrouvée est simplement disponible

```gherkin
Given un livre dont l'unique copie est "lost", sans aucune réservation
When un bibliothécaire déclare la copie retrouvée
Then le statut de la copie en base est "available"
```

### Scenario: une copie retrouvée ne prend pas la place d'un emprunt en cours

```gherkin
Given un livre à deux copies, l'une "lost" et l'autre empruntée
And une réservation "pending" sur ce livre
When un bibliothécaire déclare la copie perdue retrouvée
Then la réservation est "active" sur la copie retrouvée
And la copie empruntée n'est pas touchée
```

### Scenario: les statuts des triggers sont refusés à tout le monde

```gherkin
Given une copie en statut "available"
When un administrateur tente de la passer en "borrowed"
Then la réponse est 409
And le statut de la copie en base est toujours "available"
```

### Scenario: une copie empruntée ne peut pas être déclarée perdue

```gherkin
Given une copie en statut "borrowed", empruntée par Clara Dupont, à rendre le 22 avril 2026
When un bibliothécaire tente de la déclarer perdue
Then la réponse est 409
And son message dit que la copie est empruntée et qu'il faut d'abord enregistrer son retour
And elle contient un emprunt, et un seul, au nom de Clara Dupont, avec le statut "borrowed" et la date du 22 avril 2026
And la liste des réservations est vide
And le statut de la copie en base est toujours "borrowed"
```

### Scenario: un emprunt en retard est signalé comme tel dans le refus

```gherkin
Given une copie dont l'emprunt est en statut "overdue"
When un bibliothécaire tente de la déclarer perdue
Then l'emprunt renvoyé porte le statut "overdue"
```

### Scenario: une copie mise de côté ne peut pas être déclarée perdue

```gherkin
Given une copie en statut "on_hold", mise de côté pour Emma Wilson jusqu'au 29 avril 2026
When un bibliothécaire tente de la déclarer perdue
Then la réponse est 409
And son message dit que la copie est mise de côté pour une réservation
And elle contient une réservation "active" au nom d'Emma Wilson, avec la date du 29 avril 2026
And la liste des emprunts est vide
And le statut de la copie en base est toujours "on_hold"
```

### Scenario: un refus sans élève concerné renvoie deux listes vides

```gherkin
Given une copie en statut "lost"
When un bibliothécaire tente de la passer en "damaged"
Then la réponse est 409
And "activeBorrowings" et "activeHolds" sont présents et vides
```

### Scenario: changer la section ne touche pas au statut

```gherkin
Given une copie en statut "lost"
When un bibliothécaire change sa section sans envoyer de statut
Then la réponse est 204
And la section et le code d'identification sont à jour
And le statut de la copie en base est toujours "lost"
```

### Scenario: le menu d'une copie perdue n'offre pas d'emprunt

```gherkin
Given un bibliothécaire sur la fiche d'un livre, devant une copie "lost"
When il ouvre le menu de la copie
Then l'entrée "Borrow book" n'y figure pas
And l'entrée "Update status" y figure
```

### Scenario: une copie perdue n'est pas empruntable, même par l'API

```gherkin
Given une copie en statut "lost"
When un bibliothécaire tente d'enregistrer un emprunt sur cette copie
Then l'emprunt est refusé
And aucune ligne "borrowing" n'est créée
```

### Scenario: une copie perdue n'est pas attribuée à une réservation en attente

```gherkin
Given un livre à deux copies, l'une "lost" et l'autre empruntée
And une réservation "pending" sur ce livre
When la copie empruntée est rendue
Then c'est elle qui est attribuée à la réservation, qui passe en "active"
And la copie "lost" reste en statut "lost"
```

### Scenario: un élève ne voit pas la copie perdue

```gherkin
Given un livre à trois copies, dont une "lost"
When un élève demande les copies de ce livre
Then deux copies sont renvoyées
And aucune ne porte le statut "lost"
```

### Scenario: le personnel voit la copie perdue

```gherkin
Given le même livre à trois copies, dont une "lost"
When un bibliothécaire demande les copies de ce livre
Then trois copies sont renvoyées
And l'une porte le statut "lost"
```

### Scenario: un livre dont tout est perdu disparaît du catalogue de l'élève

```gherkin
Given un livre dont l'unique copie est en statut "lost"
When un élève liste le catalogue et cherche ce livre par son titre
Then le livre n'apparaît ni dans la liste ni dans les résultats
```

### Scenario: le même livre reste visible pour le personnel

```gherkin
Given le même livre dont l'unique copie est en statut "lost"
When un bibliothécaire liste le catalogue
Then le livre apparaît
And sa copie est affichée avec la mention "Lost"
```

### Scenario: une seule copie perdue ne fait pas disparaître le livre

```gherkin
Given un livre à deux copies, l'une "lost" et l'autre "available"
When un élève cherche ce livre
Then le livre apparaît
And il annonce une copie au total, et une disponible
```

### Scenario: l'action « Update status » du menu ouvre quelque chose

```gherkin
Given un bibliothécaire sur la fiche d'un livre, devant une copie "available"
When il choisit "Update status" dans le menu de la copie
Then une modale de changement de statut s'ouvre
And le seul statut qu'elle propose est "Lost"
```

### Scenario: le bibliothécaire se voit proposer le retour en rayon

```gherkin
Given un bibliothécaire sur la fiche d'un livre, devant une copie "lost"
When il choisit "Update status" dans le menu de la copie
Then la modale propose de repasser la copie en "Available"
And elle ne propose rien d'autre
```

### Scenario: l'administrateur se voit proposer la même chose

```gherkin
Given un administrateur sur la fiche d'un livre, devant une copie "lost"
When il choisit "Update status" dans le menu de la copie
Then la modale propose de repasser la copie en "Available"
```

### Scenario: la modale explique pourquoi une copie empruntée ne peut pas être perdue

```gherkin
Given un bibliothécaire devant une copie "borrowed" par Clara Dupont, à rendre le 22 avril 2026
When il choisit "Update status" dans le menu de la copie, choisit "Lost" et confirme
Then la modale reste ouverte
And elle affiche, dans un bloc d'alerte, que la copie est empruntée et qu'il faut d'abord enregistrer son retour
And elle nomme Clara Dupont, avec la date d'échéance du 22 avril 2026
And elle ne contient aucune section consacrée aux réservations
And la ligne de la copie affiche toujours "Borrowed"
```

### Scenario: la modale nomme l'élève pour qui la copie est mise de côté

```gherkin
Given un bibliothécaire devant une copie "on_hold" pour Emma Wilson
When il choisit "Update status" dans le menu de la copie, choisit "Lost" et confirme
Then la modale reste ouverte
And elle nomme Emma Wilson, avec la date limite de retrait
And elle ne contient aucune section consacrée aux emprunts
```

### Scenario: la raison du refus s'efface quand on change de choix

```gherkin
Given la modale affichant le refus d'une copie "borrowed"
When le bibliothécaire ferme la modale puis la rouvre sur la même copie
Then aucun message d'erreur n'est affiché
```

### Scenario: un statut périmé est rattrapé par le serveur

```gherkin
Given un catalogue affichant une copie "available" qui vient d'être empruntée depuis un autre poste
When le bibliothécaire déclare cette copie perdue depuis la modale
Then la modale affiche que la copie est empruntée et qu'il faut d'abord enregistrer son retour
And elle nomme l'élève qui l'a empruntée
And la copie n'est pas passée en "lost"
```

### Scenario: scanner une copie perdue demande si on la remet en rayon

```gherkin
Given un bibliothécaire sur la vue Scan
When il scanne le QR code d'une copie "lost"
Then une modale indique que cette copie est marquée comme perdue
And elle demande s'il faut la remettre en rayon, avec un bouton pour confirmer et un pour annuler
And aucune modale d'emprunt ne s'ouvre
And le statut de la copie en base est toujours "lost"
```

### Scenario: confirmer le scan remet la copie en rayon

```gherkin
Given la modale ouverte par le scan d'une copie "lost", sans réservation en attente sur le livre
When le bibliothécaire confirme
Then la modale se ferme
And le statut de la copie en base est "available"
```

### Scenario: annuler le scan ne change rien

```gherkin
Given la modale ouverte par le scan d'une copie "lost"
When le bibliothécaire annule
Then la modale se ferme
And le statut de la copie en base est toujours "lost"
```

### Scenario: la copie retrouvée est annoncée comme réservée

```gherkin
Given la modale ouverte par le scan d'une copie "lost", sur un livre ayant une réservation "pending" d'Emma Wilson
When le bibliothécaire confirme
Then la modale affiche que la copie est à mettre de côté pour Emma Wilson
And elle indique la date limite de retrait
And elle n'offre qu'un bouton de fermeture
```

### Scenario: scanner une copie disponible se comporte comme avant

```gherkin
Given un bibliothécaire sur la vue Scan
When il scanne le QR code d'une copie "available"
Then la modale d'emprunt s'ouvre
And la modale de changement de statut ne s'ouvre pas
```

### Scenario: le filtre « Lost » liste les livres qui ont une copie perdue

```gherkin
Given un livre à trois copies dont une "lost", et un livre dont aucune copie n'est perdue
When un bibliothécaire choisit "Lost" dans le filtre Availability du catalogue
Then le premier livre apparaît
And le second n'apparaît pas
```

### Scenario: le même filtre ne révèle rien à un élève

```gherkin
Given un livre à trois copies dont une "lost"
When un élève recherche les livres ayant une copie "lost"
Then la réponse ne contient pas ce livre
```

### Scenario: le changement se voit sans recharger

```gherkin
Given un bibliothécaire devant une copie "available"
When il la déclare perdue depuis la modale
Then la modale se ferme
And la ligne de la copie affiche "Lost" sans rechargement de la page
```

---

## Critères d'acceptation

- [x] `PUT /copies/{copyId}` applique la table de transitions ci-dessus : 204
  pour une transition autorisée, 409 pour toute autre — y compris vers le statut
  que la copie a déjà —, 404 si la copie est absente ou supprimée. La table est
  la même pour `LIBRARIAN` et `ADMIN` ; aucun rôle n'est lu pour la décider.
- [x] Une exception dédiée dans `exception/copy/`, rendue au format `ApiError`
  par `GlobalExceptionHandler`, dont le message nomme la transition refusée.
  Pour une copie `borrowed` ou `on_hold`, il nomme en plus l'état de la copie et
  ce qu'il faut faire d'abord (enregistrer le retour pour `borrowed` ; pour
  `on_hold`, que la réservation soit retirée ou ait expiré) — un message lisible tel quel par un bibliothécaire.
- [x] Le corps du 409 de `PUT /copies/{copyId}` étend `ApiError` de
  `activeBorrowings` et `activeHolds`, toujours présents, avec les entrées de
  `BlockingBorrowing` et `BlockingHold` de US-02 (aucun DTO dupliqué). Un record
  de réponse d'erreur propre à cette story, de même forme que
  `DeletionBlockedError`, porte un nom qui ne parle pas de suppression ; le
  handler de `GlobalExceptionHandler` recopie les listes de l'exception sans
  requête supplémentaire.
- [x] Les listes sont lues dans la transaction du refus, élève et copie chargés
  en une requête par liste (les méthodes de repository de US-02 conviennent) ;
  les autres 404 et 409 gardent leur corps.
- [x] Un `status` absent du corps laisse le statut inchangé ; les champs
  `libraryId` et `sectionName` de `UpdateCopyRequest` gardent leur
  comportement actuel.
- [x] Les lectures de catalogue excluent les copies `lost` **et** les livres
  sans copie ni vivante ni retrouvable **pour le rôle `user` uniquement** :
  `GET /books`, `GET /books/search`, `GET /books/{id}`, `GET /books/{id}/copies`,
  et les comptes de copies renvoyés avec chaque livre.
- [x] La création d'un emprunt refuse une copie `lost` en passant par
  `Status.isBorrowable()`, et non par une comparaison réécrite sur place. La
  promotion d'une réservation garde sa garde `copy.getStatus() == available` et
  ne passe **pas** par `isBorrowable()` : celle-ci est vraie pour `damaged`, et
  une copie abîmée mise de côté perdrait sa mention à la fin de la réservation
  (`fn_sync_copy_on_hold_update` la remet en `available`).
- [x] Le menu d'une copie `lost` dans `copy-table-bks` n'offre pas
  `borrow-book`, et garde `update-status` et `print-qr-code`.
- [x] Le refus opposé à un emprunt sur une copie `lost` est porté par une
  exception du package `exception/copy/`, rendue au format `ApiError`.
- [x] Une modale de changement de statut vit dans
  `web/src/features/copy/<composant>/` avec son `-styles.js` sibling, suivant
  le motif de `copy-section-modal-bks` ; `catalog-view.js` traite l'action
  `update-status` et la câble. La modale propose `available` pour une copie
  `lost`, et `lost` pour toute autre copie — `damaged`, `borrowed` et `on_hold`
  compris, puisque c'est le serveur qui refuse ; elle ne masque aucune option
  selon le statut affiché.
- [x] Quand le serveur répond 409, la modale reste ouverte et affiche le
  `message` de la réponse dans un bloc `role="alert"`, puis les deux listes via le
  composant `deletion-blockers-bks` (aucune section vide) ; le tout est effacé
  à la réouverture. `updateCopy` dans `api/copy.js` expose `error.status`,
  `error.activeBorrowings` et `error.activeHolds` (vides par défaut) en plus de
  `error.message`, comme `deleteCopy`.
- [x] `scan-qrcode-view` ouvre cette même modale quand la copie scannée est
  `lost`, avant la branche qui se contente de journaliser ; les branches
  existantes (retour, prêt, retrait d'une réservation) ne changent pas. La
  modale annonce que la copie est marquée perdue et demande confirmation ;
  aucune écriture n'a lieu avant la confirmation.
- [x] Après un succès, la modale relit la copie (`GET /borrowings/{copyId}`) et,
  si elle est `on_hold`, affiche l'élève et la date limite de retrait, avec un
  seul bouton de fermeture.
- [x] Passer une copie de `lost` à `available` promeut la plus ancienne
  réservation `pending` du livre, dans la même transaction, en réutilisant la
  logique de `BorrowingServiceImpl#promoteNextPendingHold` — extraite pour être
  appelée des deux endroits, pas copiée. Sans file d'attente, la copie reste
  `available`.
- [x] L'écriture du statut est flushée avant la promotion, et la copie est
  rafraîchie après chacune (`saveAndFlush` puis `entityManager.refresh`).
- [x] Le filtre « Availability » du catalogue permet de choisir `lost` pour le
  personnel sans nouvelle option codée en dur : la valeur vient de
  `GET /copies/statuses`. Pour le rôle `user`, `GET /books/search?copyStatus=lost`
  ne renvoie aucun livre.
- [x] `copy-table-bks._getStatusClass` distingue `lost` des autres statuts, avec
  un style propre.
- [x] `server/API/CopyController/updateCopy.bru` est à jour et montre le corps
  d'une déclaration de perte.
- [x] `docs/business-rules/REGLES-METIER-STRUCTURE.md` §5 mentionne la nouvelle
  règle : hors création d'une copie, l'application n'écrit `copy.status` que
  pour la déclarer `lost` ou retrouvée (`available`) ; tout le reste appartient
  aux triggers, et `damaged` ne s'écrit qu'en psql.
- [x] `npm run lint` passe dans `web/` sur les fichiers touchés.

---

## Vérification de bout en bout

**Préparation** : backend lancé depuis l'IDE, `npm run dev` dans `web/`,
comptes du [socle commun](README.md#socle-commun-de-vérification). Repérer un
livre à trois copies et un livre à une seule copie. Garder un psql ouvert.

1. Connecté en bibliothécaire, **Catalogue** → ouvrir le livre à trois copies →
   menu d'une copie `available` → **Update status** → la modale s'ouvre et ne
   propose que *Lost*. Confirmer → la ligne affiche *Lost* immédiatement.
2. psql : `SELECT id, status FROM copy WHERE book_id = <id>;` → une seule copie
   en `lost`.
3. Sur cette même copie `lost`, rouvrir **Update status** → la modale propose
   *Available* et rien d'autre. Confirmer → la ligne affiche *Available*
   immédiatement. Redéclarer la copie `lost` comme à l'étape 1 pour la suite.
4. **Bruno**, session bibliothécaire : `CopyController/updateCopy.bru` avec
   `{"status": "borrowed"}` sur cette copie → 409. Avec `{"status": "damaged"}`
   → 409. Puis, depuis le front, sur une copie **empruntée** : *Update status* →
   *Lost* → confirmer → la modale reste ouverte et dit que la copie est
   empruntée et qu'il faut d'abord enregistrer son retour, avec le nom de
   l'élève et la date d'échéance ; psql : elle est toujours `borrowed`. En
   Bruno, le corps du 409 de la copie empruntée contient un emprunt dans
   `activeBorrowings` et `activeHolds` vide ; sur le refus `damaged` de la copie
   `lost`, les deux tableaux sont vides.
5. **Catalogue**, filtre *Availability* → *Lost* : le livre à trois copies
   apparaît, et lui seul. Effacer le filtre.
6. **Scan** : imprimer le QR code de la copie `lost` (menu *Print QR code*) et le
   scanner → une modale dit que la copie est marquée perdue et demande si on la
   remet en rayon ; l'annuler → psql : la copie est toujours `lost`. Scanner le QR code d'une copie `available` → la
   modale d'emprunt s'ouvre, comme avant.
7. Se reconnecter en administrateur. Depuis le front, **Update status** sur la
   copie `lost` → *Available* est proposé. Le laisser en `lost` pour la suite,
   et vérifier seulement que l'option existe.
8. Ouvrir le menu de la copie `lost` → pas d'entrée *Borrow book*. Puis tenter
   quand même un emprunt — **Bruno**, `POST /borrowings` : la vue Scan n'ouvre
   pas la modale d'emprunt pour une copie `lost` → refusé.
9. Déclarer `lost` l'unique copie du livre à une seule copie.
10. **Bruno**, se reconnecter avec le compte élève (`clara.dupont@example.com`) :
   - `BookController/getAllBooks.bru` → le livre à une copie n'apparaît pas ;
     celui à trois copies apparaît et annonce **deux** copies.
   - `BookController/searchBook.bru` avec le titre du livre à une copie →
     aucun résultat.
   - `BookController/getAllBookCopies.bru` sur le livre à trois copies → deux
     copies, aucune en `lost`.
11. Se reconnecter en bibliothécaire et rejouer les trois mêmes requêtes → le
   livre à une copie réapparaît, et le livre à trois copies renvoie ses trois
   copies dont une `lost`.
12. Prendre un livre à deux copies, en déclarer une `lost`, emprunter l'autre,
    poser une réservation dessus (elle reste `pending`), puis rendre l'emprunt →
    psql : la réservation est `active` et porte le `copy_id` de la copie rendue,
    pas celui de la copie perdue, qui est toujours `lost`.
13. Prendre un livre à une seule copie, la déclarer `lost`, puis poser une
    réservation au nom d'Emma Wilson (elle reste `pending`). Scanner la copie,
    confirmer → la modale annonce « à mettre de côté pour Emma Wilson » avec la
    date limite. psql : la réservation est `active` avec `copy_id` renseigné et
    `end_date` à J+7, la copie est `on_hold`, et non `available`.

**Nettoyage** : `UPDATE copy SET status = 'available' WHERE status = 'lost';`
et `UPDATE hold SET status = 'expired' WHERE status IN ('pending', 'active');`
(laisser le trigger remettre les copies `on_hold` en rayon), ou
`server/scripts/reset-dev-db.sh`.

---

## Points de vigilance

- **Ne pas écrire `lost` par un chemin que les triggers peuvent écraser.** Les
  cinq fonctions de `V1__baseline_schema.sql` écrivent `copy.status` depuis
  `borrowing` et `hold`. C'est précisément pour cela que les transitions depuis
  `borrowed` et `on_hold` sont refusées : la copie serait remise en
  `available` au premier retour. Après une écriture qui déclenche un trigger,
  l'entité `Copy` en mémoire est périmée — `saveAndFlush(...)` puis
  `entityManager.refresh(copy)`
  ([règles structurelles §5](../../business-rules/REGLES-METIER-STRUCTURE.md)).

- **La visibilité dépend du rôle, donc du contexte de sécurité, dans une
  requête de lecture.** C'est nouveau dans ce projet : jusqu'ici les lectures
  renvoyaient la même chose à tout le monde et seul l'accès à l'endpoint
  variait. Le rôle doit être lu une fois et passé au filtre, pas redemandé dans
  chaque mapper.

- **Deux règles de visibilité se superposent désormais.** US-01 exclut
  `deleted_at IS NOT NULL` pour tout le monde ; cette story exclut `lost` pour
  le seul rôle `user`. Un filtre qui remplace l'autre au lieu de s'y ajouter
  fera réapparaître des livres supprimés au personnel. Les endroits concernés
  sont ceux recensés dans les points de vigilance de US-01.

- **Le compte du total de copies passe par `countCopiesByBookIds`**, qui agrège
  en SQL :

  ```java
  "SELECT c.book.id, COUNT(c), SUM(CASE WHEN c.status = :availableStatus THEN 1 ELSE 0 END) "
  ```

  Le `COUNT(c)` est le total ; l'exclure pour un élève veut dire changer la
  requête, pas filtrer le résultat après coup — sinon un livre dont toutes les
  copies sont perdues ressortira avec un total faux avant même d'être masqué.

- **`isBorrowable()` ne suffit pas.** Elle est vraie pour `available` et
  `damaged`, donc fausse pour `lost` — mais encore faut-il que le chemin de
  création d'emprunt l'appelle. Vérifier que c'est le cas plutôt que de le
  supposer : l'enum peut être correcte sans que personne la consulte.

- **La promotion est privée à `BorrowingServiceImpl`.**
  `promoteNextPendingHold` est une méthode `private` du service d'emprunts, que
  `CopyServiceImpl` ne peut pas appeler. L'extraire (vers `HoldService`, ou une
  méthode partagée) plutôt que la dupliquer — deux copies de la règle « une
  semaine, la plus ancienne d'abord » finiraient par diverger. La garde
  existante (`copy.getStatus() != available` → rien) est ce qui empêche de
  promouvoir sur une copie `damaged` : ne pas la perdre en route.

- **L'ordre des flush décide du statut final**, ici aussi. L'écriture
  `lost` → `available` doit atteindre la base avant la mise à jour de la
  réservation, sans quoi le trigger de la réservation (`on_hold`) est écrasé
  par l'écriture applicative qui suit. Même piège que
  `BorrowingServiceImpl#returnBorrowing`, même remède : `saveAndFlush`,
  `refresh`, puis promotion.

- **Le 204 ne dit pas ce qui s'est passé.** Une copie retrouvée peut sortir
  `available` ou `on_hold`. Le front ne peut pas le déduire de la réponse : il
  relit la copie. Ne pas changer le code de retour de `PUT` pour si peu — le
  contrat se resserre déjà dans cette story.

- **`scan-qrcode-view` s'arrête sur son dernier `else`.** Une copie `lost` y
  tombe aujourd'hui dans le `console.log` final. La branche `lost` doit
  précéder cet `else` — rien dans le code n'empêche de l'ajouter après, où elle
  ne serait jamais atteinte. Le lookup côté serveur
  (`getActiveBorrowingByCopyId`) ne filtre que `deleted_at` : il renvoie déjà
  `copyStatus = lost` et le titre, aucune modification n'est nécessaire.

- **Le filtre « Availability » est déjà alimenté par l'enum entier**
  (`GET /copies/statuses` renvoie les six valeurs, `removed` compris). Ne pas
  le restreindre à la main pour cette story : « Lost » y est déjà, et masquer
  `removed` relève d'une autre décision (D7).

- **Ne pas réutiliser le statut `removed`**
  ([D7](README.md#décisions-qui-valent-pour-toute-la-fonctionnalité)). Il est
  là, il a l'air fait pour, et il ne doit plus rien écrire : `deleted_at`
  couvre le cas depuis US-01.

- **`catalog-view.js` tombe en silence sur une action inconnue.** Le
  `default: break;` du `switch` est ce qui a laissé `update-status` mort sans
  que personne le remarque. Vérifier le câblage en cliquant, pas en lisant.

- **Hibernate réécrit `copy.status` à chaque update d'une copie.** `Copy` n'a
  pas de `@DynamicUpdate` : changer la section ou la bibliothèque réécrit aussi
  le statut lu en mémoire. Un emprunt enregistré entre la lecture et le flush
  voit son `borrowed` écrasé — par `lost` dans le pire des cas. La lecture de la
  copie dans `updateCopy` doit la verrouiller (`PESSIMISTIC_WRITE`).

- **`CopyRepository.findAllByBookId` doit rester non filtré sur `lost`.**
  `BookServiceImpl.deleteBookById` s'en sert pour marquer supprimées *toutes*
  les copies d'un livre, `lost` comprises, et `HoldServiceImpl.createHold` pour
  trouver une bibliothèque. Le filtrage par rôle passe par une méthode à part.

- **Lire le rôle par les autorités de `Authentication`, pas par
  `@AuthenticationPrincipal AuthenticatedUser`.** `ApiAuthorizationMatrixTest`
  s'authentifie avec un `User` Spring : le principal `AuthenticatedUser`
  injecté y serait `null`, les lectures de catalogue partiraient en 500, et le
  test resterait vert puisqu'il ne regarde que 401 et 403. Lire les autorités
  permet aussi de refuser par défaut : tout ce qui n'est ni `LIBRARIAN` ni
  `ADMIN` est traité comme un élève.

- **Retirer `lost` d'un filtre de statuts peut le vider.** Pour un élève,
  `GET /books/search?copyStatus=lost` donne une liste de statuts vide une fois
  `lost` retiré — et une liste vide ne veut pas dire « pas de filtre », elle
  veut dire « aucun résultat ». Sauter le filtre renverrait tout le catalogue.
