# Pré-spec — L'état de conservation d'une copie

> **Statut : pré-spec.** Ce document pose un problème et une direction ; il n'est
> pas une spécification. Il sert d'entrée au skill `spec`, qui le transformera en
> fonctionnalité découpée en stories après entretien. Né pendant la planification
> de [US-03](../cycle-de-vie-livre-copie/US-03-copie-perdue.md), qui a sorti
> `damaged` de son périmètre
> ([D10](../cycle-de-vie-livre-copie/README.md#décisions-qui-valent-pour-toute-la-fonctionnalité)).

## Le problème

`copy.status` répond à deux questions différentes dans une seule colonne :

| Question | Valeurs | Qui l'écrit |
|---|---|---|
| **Où est l'exemplaire ?** | `available`, `borrowed`, `on_hold`, `lost` | les triggers de `V1` (et `lost` à la main depuis US-03) |
| **Dans quel état est-il ?** | `damaged` (et, implicitement, « bon état ») | un bibliothécaire, à la main |

Les deux sont indépendantes — un livre peut être emprunté **et** abîmé — mais une
colonne ne garde qu'une valeur. Chaque fois qu'un trigger déplace la copie, il
écrase son état de conservation. `damaged` n'est pas une étape du cycle
`available → borrowed → on_hold → …` : c'est un attribut de l'objet qui
traverse ce cycle.

## Ce que cela coûte aujourd'hui

1. **Un contournement, à un seul endroit.** `borrowing.pre_borrow_copy_status`
   existe uniquement pour remettre `damaged` au retour d'un emprunt
   (`fn_capture_copy_status_on_borrowing_insert`,
   `fn_sync_copy_on_borrowing_update`). Les triggers de `hold` n'ont pas
   l'équivalent : `fn_sync_copy_on_hold_update` (`V1:273-279`) remet la copie en
   `available` à l'expiration ou au retrait de la réservation. Chaque futur
   trigger (renouvellement, suspension) devra refaire la même chose.

2. **Une copie abîmée ne sert jamais la file d'attente.** Pour ne pas perdre la
   mention, la promotion ne s'applique qu'à une copie revenue `available`
   ([règles emprunts](../../business-rules/REGLES-METIER-EMPRUNTS-RESERVATIONS.md),
   *File d'attente et promotion*). Si les copies d'un livre reviennent toutes
   abîmées, les réservations `pending` attendent indéfiniment — alors qu'une copie
   `damaged` est empruntable.

3. **Des règles qui ne s'accordent pas.** `Status.isBorrowable()` accepte
   `damaged` ; le menu de `copy-table-bks` n'offre « Borrow book » qu'à une copie
   `available` ; `HoldServiceImpl.createHold` ne refuse une réservation que s'il
   existe une copie `available` — un livre dont la seule copie en rayon est
   abîmée peut donc être réservé alors qu'il pourrait être emprunté. Tant que
   `damaged` ne s'écrit qu'en psql, personne ne le voit.

4. **Une copie abîmée ne peut pas être déclarée perdue** (US-03) : écrire `lost`
   dans la même colonne effacerait l'abîmement, et rien ne le rétablirait quand la
   copie serait retrouvée.

5. **Le journal de US-04 mélangera les deux axes.** Il consignera
   « `available` → `damaged` » comme un changement de statut, au même rang qu'un
   emprunt ou un retour.

## La direction proposée : une colonne à part

Donner à l'état de conservation sa propre colonne, et rendre à `copy.status` un
seul sens — où est l'exemplaire.

- **Schéma.** Un type `copy_condition` (`good`, `damaged`) et une colonne
  `copy.condition NOT NULL DEFAULT 'good'`. La valeur `damaged` de `copy_status`
  reste dans l'enum — la retirer imposerait de reconstruire le type — mais plus
  rien ne l'écrit, comme `removed` depuis D7.
- **Reprise de l'existant**, dans la migration :
  - `status = 'damaged'` → `condition = 'damaged'`, `status = 'available'` ;
  - copie actuellement empruntée dont l'emprunt ouvert porte
    `pre_borrow_copy_status = 'damaged'` → `condition = 'damaged'`, sans quoi le
    retour la remettrait dans l'ancien statut ;
  - `fn_sync_copy_on_borrowing_update` perd sa branche `damaged` : le retour ne
    connaît plus que `on_hold` ou `available`. `pre_borrow_copy_status` reste en
    base comme historique, mais plus rien ne le lit.
- **Ce qui se simplifie.** Les triggers n'ont plus rien à préserver. La promotion
  n'a plus de cas particulier : une copie rendue sert la file, quel que soit son
  état. `isBorrowable()` redevient « `status == available` » (avec le cas
  `on_hold` existant). Une copie perdue puis retrouvée garde son état. Le
  changement manuel de statut reste `available` ↔ `lost` (D3).
- **Ce qui s'ajoute.** Une action « Mark as damaged / Mark as repaired », ouverte
  au personnel, possible à tout moment — y compris sur une copie empruntée,
  puisque c'est au retour qu'on constate l'abîmement. Un badge d'état distinct du
  badge de statut dans `copy-table-bks`.

## Questions ouvertes, pour l'entretien de spec

- **Une copie abîmée est-elle prêtable ?** Aujourd'hui oui. Avec une colonne à
  part, la règle devient un choix explicite au lieu d'un effet de bord — et elle
  décide aussi si elle peut être mise de côté pour une réservation.
- **Deux valeurs suffisent-elles ?** « Abîmé mais prêtable » et « à réparer, hors
  circuit » ne sont pas la même chose. Un exemplaire hors d'usage relève peut-être
  de la suppression (US-01) plutôt que d'un état.
- **Où se fait le geste ?** Depuis le menu de la copie seulement, ou aussi dans la
  modale de retour (« rendu abîmé »), qui est le moment où on le constate ?
- **Une note libre** pour décrire le dommage ?
- **Visible de l'élève ?** L'élève voit-il qu'un exemplaire est abîmé avant de le
  réserver ?
- **Journal.** US-04 doit-il consigner les changements d'état comme un type
  d'événement à part ?

## Dépendances et ordre

- **Après US-03**, qui pose le contrat de `PUT /copies/{id}` et la modale de
  changement de statut, que cette fonctionnalité étendra ou imitera.
- **Avant ou après US-04, à trancher.** US-04 réserve `V10` pour le journal et
  contient un scénario « `UPDATE copy SET status = 'damaged'` en psql » qui
  deviendrait faux. Si cette fonctionnalité passe d'abord, ce scénario est à
  réécrire ; si elle passe après, le journal aura déjà enregistré des
  « changements de statut » `damaged` qu'il faudra interpréter. Le numéro de
  migration est celui qui sera libre au moment de l'écrire.
- À mettre à jour en même temps :
  [règles emprunts](../../business-rules/REGLES-METIER-EMPRUNTS-RESERVATIONS.md)
  (§2, §3, la promotion, le tableau des triggers et le diagramme d'états) et
  [règles structurelles §5](../../business-rules/REGLES-METIER-STRUCTURE.md).

## Écarté

- **Rafistoler les triggers de `hold`** avec un `hold.pre_hold_copy_status`, comme
  pour `borrowing`. Corrige le défaut 1, aggrave la cause : chaque nouveau trigger
  devra le refaire, et les défauts 3 à 5 restent.
- **Le statu quo** (choix de US-03, D10). Tenable tant que `damaged` ne s'écrit
  qu'en psql. Dès qu'un bibliothécaire peut le poser depuis l'interface, les
  défauts 1 à 3 deviennent visibles.
