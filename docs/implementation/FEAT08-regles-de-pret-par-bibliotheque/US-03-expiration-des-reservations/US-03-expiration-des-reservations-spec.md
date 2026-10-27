# US-03 — Une copie non retirée à temps est libérée

[← Feature](../README.md)

| | |
|---|---|
| **Feature** | Règles de prêt par bibliothèque |
| **Statut** | approved |
| **Nature** | feature |
| **Dépend de** | [US-02](../US-02-reservation-par-bibliotheque/US-02-reservation-par-bibliotheque-spec.md) (file d'attente par bibliothèque) |
| **Bloque** | — |
| **Portée** | back + front |
| **Casse l'existant ?** | Oui — au premier démarrage après livraison, toute réservation `active` dont la date limite est passée expire, et sa copie part à la suivante de la file ou revient au rayon |

---

## Story

**En tant que** bibliothécaire
**je veux** qu'une copie mise de côté et pas retirée dans la fenêtre de retrait
soit rendue à l'élève suivant de la file, ou au rayon
**afin qu'**une copie ne reste pas bloquée `on_hold` indéfiniment pour un élève
qui ne vient pas, et que la fenêtre de retrait réglée par l'administrateur ait un
effet.

---

## Contexte

### Rien ne fait expirer une réservation

Le seul traitement planifié est celui des retards :

```java
// server/src/main/java/net/booksnap/domain/borrowing/service/OverdueBorrowingScheduler.java
@Scheduled(cron = "0 5 0 * * *")
@EventListener(ApplicationReadyEvent.class)
@Transactional
public void markOverdueBorrowings() {
    int updated = borrowingRepository.markOverdue(
            Status.borrowed, Status.overdue, LocalDate.now(),
            Auditable.SYSTEM_AUDITOR, LocalDateTime.now());
```

`markOverdue` passe en retard les emprunts dont `b.endDate < :today`
(`BorrowingRepository.java:57`) : le jour de l'échéance est encore dans les
temps. `HoldRepository.findByStatusAndCreatedDateBefore` (`:40`) existe et n'est
appelée par personne. [Règles emprunts §4](../../../business-rules/REGLES-METIER-EMPRUNTS-RESERVATIONS.md) :
« Expiration `→ expired` … ⚠️ *Voir §8 : non encore branché.* »

Une réservation `active` porte sa date limite dans `hold.end_date`, fixée à la
mise de côté (`HoldServiceImpl.promoteNextPendingHold`). Le front l'annonce
quand on scanne ou prête une copie `on_hold` :

```js
// web/src/features/borrowing/loan-modal-bks/loan-modal-bks.js:142-145
this.hold?.endDate
  ? html`<p class="pickup-detail">
      To be collected before ${formatDate(this.hold.endDate)}.
    </p>`
```

### Les triggers réagissent déjà à l'expiration

```sql
-- V1__baseline_schema.sql:270-282, fn_sync_copy_on_hold_update
ELSIF NEW.status IN ('expired', 'fulfilled') AND OLD.status = 'active' THEN
    IF NOT EXISTS (
        SELECT 1 FROM borrowing
        WHERE copy_id = NEW.copy_id AND status IN ('borrowed', 'overdue')
    ) THEN
        UPDATE copy SET status = 'available' WHERE id = NEW.copy_id;
    END IF;
```

`fn_log_hold_event` (`V10__lifecycle_event.sql:324-366`) écrit un événement
`hold_expired` dans `lifecycle_event`, avec pour acteur
`fn_lifecycle_actor()` — `'system'` quand aucun acteur n'est posé.

Une copie `on_hold` ne peut pas changer de statut à la main
(`copy.Status.allowsManualChangeTo` : seulement `available ↔ lost`).

### La promotion

`HoldServiceImpl.promoteNextPendingHold(copy)` (propagation `MANDATORY`) met la
copie de côté pour la réservation suivante si la copie est `available`, et ne
fait rien sinon. Après US-02, la suivante est la plus ancienne `pending` pour ce
livre dans la bibliothèque de la copie. `.claude/CLAUDE.md` : la promotion vit
dans le service, pas dans un trigger ; l'ordre des flushs décide du statut final.

---

## Décisions et non-objectifs

- **`end_date` est le dernier jour de retrait ; la réservation expire le
  lendemain** — comme le jour de l'échéance d'un emprunt n'est pas un retard.
  Décidé avec l'utilisateur. Le texte de la modale de prêt, « To be collected
  before {date}. », disait le contraire ; il devient « To be collected by
  {date}. ».   Même correction dans la modale de statut de copie, qui annonce la mise de côté
  d'une copie retrouvée : « Set aside for X, to collect before {date}. » devient
  « …, to collect by {date}. » (sans scénario dédié).
  Rejeté : expirer le jour même de `end_date` en gardant « before ».
- **Même rythme que les retards** : chaque nuit, et une fois au démarrage pour
  rattraper les jours où le serveur était arrêté.
- **La copie libérée sert la file de sa bibliothèque**, comme une copie rendue
  (US-02) : la réservation suivante passe `active` avec la fenêtre de retrait en
  vigueur pour cette bibliothèque **le jour de l'expiration** (celle de US-01 si
  elle est livrée, sinon les 7 jours actuels). Sans file, la copie redevient
  `available`.
- **L'expiration n'appartient à personne** : l'événement est journalisé avec
  l'acteur `system`, comme les retards.
- **Aucune notification** : il n'existe pas de service de notification (le
  `TODO` de `promoteNextPendingHold` reste).
- **Les réservations `pending` n'expirent pas** : la durée de vie maximale de 5
  semaines est hors périmètre de la feature.

**Hors périmètre de cette story** : la durée de vie des réservations `pending`
et `hold.expires_at` ; la notification à l'élève ; tout affichage nouveau des
réservations expirées.

---

## Scénarios

Le traitement d'expiration est appelé « le traitement » ; il tourne chaque nuit
et au démarrage du backend.

### Scenario: une réservation dont la date limite est passée expire

```gherkin
Given une réservation "active" d'Alice sur la copie P1 de Preschool, date limite hier
And aucune autre réservation "pending" pour ce livre à Preschool
When le traitement s'exécute
Then la réservation d'Alice est "expired"
And P1 est "available"
```

### Scenario: le dernier jour de retrait n'expire pas

```gherkin
Given une réservation "active" d'Alice sur P1, date limite aujourd'hui
When le traitement s'exécute
Then la réservation d'Alice est toujours "active"
And P1 est toujours "on_hold"
```

### Scenario: la modale de prêt annonce le dernier jour de retrait

```gherkin
Given une réservation "active" d'Alice sur P1, date limite le 12 mars 2027
When un bibliothécaire ouvre le prêt de P1 depuis le catalogue
Then la modale affiche "To be collected by Mar 12, 2027."
```

(La date suit le format de `formatDate`, inchangé — `en-US`, mois abrégé ;
c'est le mot « by » qui change.)

### Scenario: la copie libérée part à la suivante de la file

```gherkin
Given une fenêtre de retrait de N jours en vigueur à Preschool
And une réservation "active" d'Alice sur P1, date limite hier
And une réservation "pending" de Chloé pour le même livre à Preschool
When le traitement s'exécute
Then la réservation d'Alice est "expired"
And la réservation de Chloé est "active" sur P1, du jour à aujourd'hui + N jours
And P1 est "on_hold"
```

### Scenario: la copie libérée ne sert pas une autre bibliothèque

```gherkin
Given une réservation "active" d'Alice sur P1 (Preschool), date limite hier
And une seule réservation "pending" pour ce livre, celle de Bob, à Primary
When le traitement s'exécute
Then P1 est "available"
And la réservation de Bob reste "pending"
```

### Scenario: plusieurs réservations expirent le même jour

```gherkin
Given une réservation "active" sur P1 et une sur R1, toutes deux à date limite hier
When le traitement s'exécute
Then les deux réservations sont "expired"
```

### Scenario: le démarrage rattrape les jours manqués

```gherkin
Given une réservation "active" d'Alice sur P1, date limite il y a trois jours
When le backend démarre
Then la réservation d'Alice est "expired"
```

### Scenario: l'expiration est journalisée au nom du système

```gherkin
Given une réservation "active" d'Alice sur P1, date limite hier
When le traitement s'exécute
Then l'historique de P1 contient un événement "hold_expired" pour Alice, d'acteur "system"
```

### Scenario: une réservation en attente n'expire pas

```gherkin
Given une réservation "pending" d'Alice créée il y a dix semaines
When le traitement s'exécute
Then la réservation d'Alice est toujours "pending"
```

### Scenario: les réservations terminées ne sont pas touchées

```gherkin
Given une réservation "fulfilled" et une réservation "expired", toutes deux à date limite passée
When le traitement s'exécute
Then elles gardent leur statut
And aucun événement n'est journalisé pour elles
```

### Scenario: un élève dont la réservation a expiré peut réserver à nouveau

```gherkin
Given une réservation d'Alice expirée par le traitement, et toutes les copies du livre à Preschool sorties
When une réservation est posée pour Alice depuis une copie de Preschool
Then la réponse est 201
```

---

## Critères d'acceptation

- [x] Le traitement est planifié chaque nuit et exécuté au démarrage
      (`ApplicationReadyEvent`), sur le modèle de `OverdueBorrowingScheduler`.
- [x] Les écritures du traitement portent `Auditable.SYSTEM_AUDITOR` dans
      `last_modified_by`.
- [x] Une expiration qui échoue (par exemple une erreur de base sur une
      réservation) n'empêche pas le backend de démarrer, et est journalisée en
      `ERROR` avec l'identifiant de la réservation.
- [x] Le traitement journalise en `INFO` le nombre de réservations expirées,
      seulement s'il est non nul (comme `markOverdueBorrowings`).
- [x] [Règles emprunts §4 et §8](../../../business-rules/REGLES-METIER-EMPRUNTS-RESERVATIONS.md)
      décrivent l'expiration `active → expired` comme branchée ; l'expiration
      `pending` reste marquée « non branchée ».
- [x] Critères permanents :
  - [x] Chaque scénario a un test automatisé nommé `US-03: <titre du scénario>`
  - [x] Toute la suite passe (`./mvnw -q test` depuis `server/`), et
        `npm run test:e2e` dans `web/`
  - [x] `npm run lint` dans `web/` ne signale aucune nouvelle erreur
  - [x] Le backend démarre avec `ddl-auto=validate`
  - [x] Commentaires de code en anglais, réduits à ce que le code ne peut pas dire

---

## Vérification de bout en bout

**Préparation** : voir la [feature](../README.md#préparation-commune-aux-vérifications).
Base `booksnap_e2e` après un `npm run test:e2e` ; backend arrêté. Un livre dont
toutes les copies de Preschool sont empruntées (catalogue), deux réservations
posées depuis Preschool (Alice puis Chloé) et une depuis une copie de Primary
(Bob) ; rendre une copie de Preschool → Alice est `active` dessus.

1. Catalogue, menu de la copie mise de côté → « Hand over hold » : la modale
   affiche « To be collected by <date>. ».
   `psql` : `UPDATE hold SET end_date = current_date - 1 WHERE id = <Alice>;`
2. Démarrer le backend → log « … hold(s) expired » ; `psql` : Alice `expired`,
   Chloé `active` sur la même copie avec `end_date` = aujourd'hui + fenêtre de
   Preschool, copie `on_hold` ; Bob `pending`.
3. Catalogue : historique de la copie → « hold_expired » pour Alice, par
   `system`, puis la mise de côté pour Chloé.
4. `psql` : `UPDATE hold SET end_date = current_date WHERE id = <Chloé>;`,
   redémarrer → Chloé toujours `active`.
5. `UPDATE hold SET end_date = current_date - 1 WHERE id = <Chloé>;`,
   redémarrer → Chloé `expired`, la copie `available` ; Bob toujours `pending`.
6. Catalogue : « Hold a book » sur une copie de Preschool pour Alice (après avoir
   ré-emprunté la copie libérée) → réservation acceptée.

**Nettoyage** : base `booksnap_e2e`, reconstruite au prochain
`npm run test:e2e`.

---

## Points de vigilance

- **Ne pas faire d'expiration en masse par une requête `UPDATE`** comme
  `markOverdue` : les triggers libéreraient bien les copies, mais personne ne
  promouvrait la réservation suivante — la promotion vit dans le service. Chaque
  réservation expirée doit passer par la même suite que le retour d'une copie.
- **L'ordre des flushs** : l'expiration doit atteindre la base (le trigger remet
  la copie `available`) **avant** l'appel à `promoteNextPendingHold`, qui ne
  promeut qu'une copie `available` lue fraîchement (`entityManager.refresh`).
  Sans cela, la copie en mémoire est encore `on_hold` et rien n'est promu.
- **`promoteNextPendingHold` exige une transaction** (`Propagation.MANDATORY`).
  Une transaction unique pour toutes les réservations ferait échouer tout le lot
  pour une seule erreur ; le critère sur l'échec isolé en découle.
- **Ne pas comparer à `created_date`** : c'est la logique de la durée de vie
  `pending`, hors périmètre, et `findByStatusAndCreatedDateBefore` n'est pas la
  bonne requête ici.
- **Les réservations `active` héritées d'avant US-02** peuvent être sur une copie
  d'une autre bibliothèque que leur `library_id` : la file servie après
  expiration est celle de la **bibliothèque de la copie**, comme pour un retour.
- **Pas d'acteur de requête dans un traitement planifié** : le
  `SecurityContextHolder` est lié au thread ; l'acteur `system` vient de
  l'absence de `booksnap.actor`, et `last_modified_by` doit être posé
  explicitement si l'écriture contourne l'audit JPA.
