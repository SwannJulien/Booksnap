# US-01 — Finition de la page Settings

[← Feature](../README.md)

| | |
|---|---|
| **Feature** | Finition de la page Settings |
| **Statut** | approved — 2026-10-26 |
| **Nature** | feature |
| **Dépend de** | FEAT03 ([US-01](../../FEAT03-bibliotheques/US-01-voir-bibliotheques/US-01-voir-bibliotheques-spec.md), [US-02](../../FEAT03-bibliotheques/US-02-creer-bibliotheque/US-02-creer-bibliotheque-spec.md), [US-03](../../FEAT03-bibliotheques/US-03-renommer-bibliotheque/US-03-renommer-bibliotheque-spec.md)) |
| **Bloque** | — |
| **Portée** | front |
| **Casse l'existant ?** | Non pour l'utilisateur — le comportement est inchangé. Oui pour deux fichiers de tests de bout en bout de FEAT03, qui affirment l'ancien titre et l'ancien texte de ligne (voir Critères d'acceptation) |

---

## Story

**En tant qu'** administrateur
**je veux** une page Settings sobre, où chaque section dit à quoi elle sert
**afin de** trouver et utiliser la gestion des bibliothèques sans que des boutons
démesurés et un titre provisoire me donnent l'impression d'un écran inachevé.

---

## Contexte

### Ce que la page montre aujourd'hui

Titre provisoire, une section sans explication :

```js
// web/src/views/settings-view/settings-view.js
render() {
  return html`
    <h1>Settings View</h1>
    ${isAdmin() ? html`<library-section-bks></library-section-bks>` : nothing}
  `;
}
```

```js
// web/src/features/library/library-section-bks/library-section-bks.js
<section aria-labelledby="libraries-title">
  <h2 id="libraries-title">Libraries</h2>
  ${this.librariesTask.render({ ... })}
  ${this._adding ? this._renderForm() : this._renderAddButton()}
</section>
```

### Pourquoi les boutons sont trop gros

Les lignes, le formulaire de renommage et le formulaire d'ajout utilisent le
`button-bks` des formulaires et des modales :

```js
// web/src/components/button-bks/button-bks-styles.js
:host {
  display: inline-block;
  margin-top: 1.5rem;
}
button {
  min-width: 8rem;
  padding: 1em 1.5em;
  ...
}
```

Dans une ligne de texte, le bouton fait `8rem` de large au moins, `1em 1.5em` de
marge intérieure, et son hôte décale tout de `1.5rem` vers le bas : le nom et le
bouton ne sont ni à la même hauteur ni à la même échelle (capture d'écran de la
demande : « Preschool » et « Rename » ; « Add a library » plus bas).

```js
// web/src/features/library/library-section-bks/library-section-bks.js
<li>
  ${library.name}
  <button-bks label="Rename" @click=${() => this._openRename(library)}></button-bks>
</li>
```

Les deux formulaires empilent de la même façon `<input>`, `Save`/`Create` et
`Cancel`.

### Où le texte de la page est affirmé aujourd'hui

- `web/test/e2e/US-01-see-library.spec.js` cherche le titre
  `getByRole('heading', { name: 'Settings View' })` ;
- `web/test/e2e/library-rename.spec.js` retrouve une ligne au repos par le texte
  `^\s*<nom>\s+Rename\s*$`, et plusieurs tests lisent le nom d'une bibliothèque
  dans le texte de son `listitem`.

Règles du projet : [`.claude/CLAUDE.md`](../../../../.claude/CLAUDE.md),
« Frontend conventions » (une feuille de style par composant, ordre de
`sharedStyles`) et « Tooling: ask before running » (pas de `prettier --write`).
Vocabulaire : [glossaire](../../../GLOSSARY.md), _Settings section_, _Library_.

---

## Décisions et non-objectifs

Les décisions valables pour toute la feature sont dans le
[README](../README.md#décisions-valables-pour-toute-la-feature) : « sous-menu » =
section, sous-titre obligatoire pour toute section, pas de navigation nouvelle,
page du non-admin inchangée.

- **Le titre de la page devient « Settings »** (au lieu de « Settings View »).
  C'est le « titre provisoire » que FEAT03 US-01 avait laissé hors périmètre. Les
  autres écrans gardent leur titre. Rejeté : le laisser tel quel — il jure avec
  « Libraries » et les sous-titres.
- **Sous-titre de « Libraries »** : « Add the school's libraries and rename
  them. » (apostrophe droite). Il nomme exactement ce qui est possible
  aujourd'hui : ajouter et renommer. Rejeté : « Manage the libraries of the
  school. », car « manage » laisse croire à l'archivage et à la suppression, que
  FEAT03 exclut.
- **Le sous-titre est toujours visible dans la section**, qu'elle charge, soit
  vide ou en erreur : il décrit ce qu'on peut faire, pas l'état de la liste.
- **Renommer : un crayon seul, sans texte visible.** Le bouton garde le nom
  accessible « Rename » et une infobulle « Rename » — sans infobulle, un
  pictogramme seul se découvre mal à la souris. Rejeté : un bouton rempli compact
  (choisi contre) et un bouton secondaire.
- **Le crayon est au bout droit de la ligne**, le nom à gauche.
- **Renommage et ajout tiennent sur une ligne** : champ, puis « Save » (ou
  « Create »), puis « Cancel ». Ces boutons restent des boutons à texte, de
  l'application, mais compacts ; « Save » et « Create » gardent la couleur
  principale, « Cancel » est secondaire. Rejeté : ne corriger que les lignes
  au repos.
- **Le bouton « Add a library » au repos garde sa taille actuelle.** C'est
  l'appel à l'action de la page ; le problème est dans les lignes et les
  formulaires.
- **Le nom accessible reste « Rename » sur chaque ligne**, sans le nom de la
  bibliothèque. « Rename Primary » serait meilleur pour un lecteur d'écran mais
  casserait les sélecteurs de FEAT03. Hors périmètre.
- **Seuils de « compact »** : la mise en page ne peut être testée que par des
  mesures (pas de niveau « composant » dans ce projet). Un contrôle compact fait
  **au plus 40 px** de haut (2,5 rem à la taille de police par défaut), et deux
  éléments « sur une ligne » ont leurs centres verticaux à **2 px** près. Ces
  seuils prouvent l'absence du défaut actuel ; le **jugement** « c'est sobre »
  reste celui du parcours de bout en bout.
- **Assumed, not confirmed** : l'infobulle est l'attribut `title` « Rename » (pas
  un texte ajouté à la ligne), pour que le texte d'une ligne reste le nom de la
  bibliothèque.

**Hors périmètre de cette story** : le comportement des bibliothèques (création,
renommage, erreurs, tri — inchangés, voir FEAT03), la page d'un non-admin,
le titre des autres écrans, `button-bks` hors de Settings, l'archivage et la
suppression d'une bibliothèque, la navigation de Settings, le thème et le mobile.

---

## Scénarios

### Scenario: le titre de la page est « Settings »

```gherkin
Given un administrateur connecté
When il ouvre Settings
Then la page a un titre de niveau 1 "Settings"
And elle n'a aucun titre "Settings View"
```

### Scenario: la section Libraries a un sous-titre

```gherkin
Given les bibliothèques "Preschool" et "Primary"
And un administrateur connecté
When il ouvre Settings
Then la section "Libraries" contient le texte "Add the school's libraries and rename them."
And ce texte est placé après le titre "Libraries" et avant la liste
```

### Scenario: le sous-titre reste affiché quand la liste est vide

```gherkin
Given aucune bibliothèque
And un administrateur connecté
When il ouvre Settings
Then la section "Libraries" affiche "No library yet."
And elle contient le texte "Add the school's libraries and rename them."
```

### Scenario: le sous-titre reste affiché quand la liste ne se charge pas

```gherkin
Given le chargement des bibliothèques échoue
And un administrateur connecté
When il ouvre Settings
Then la section "Libraries" affiche "The libraries could not be loaded."
And elle contient le texte "Add the school's libraries and rename them."
```

### Scenario: un non-admin ne voit ni la section ni son sous-titre

```gherkin
Given un bibliothécaire connecté
When il ouvre Settings
Then la page a un titre de niveau 1 "Settings"
And elle ne contient pas de section "Libraries"
And elle ne contient pas le texte "Add the school's libraries and rename them."
```

### Scenario: une ligne de bibliothèque montre le nom et un crayon

```gherkin
Given la bibliothèque "Primary"
And un administrateur sur Settings
Then la ligne "Primary" contient un bouton de nom accessible "Rename"
And le texte visible de la ligne est exactement "Primary"
And le bouton porte l'infobulle "Rename"
```

### Scenario: le crayon est sobre, aligné avec le nom, au bout droit de la ligne

```gherkin
Given la bibliothèque "Primary"
And un administrateur sur Settings
Then le bouton "Rename" de la ligne "Primary" fait au plus 40 px de haut
And son centre vertical est à 2 px près celui du nom "Primary"
And il est à droite du nom
And son bord droit est le bord droit de la ligne, à 2 px près
```

### Scenario: le crayon s'active au clavier

```gherkin
Given la bibliothèque "Primary"
And un administrateur sur Settings
When il place le focus sur le bouton "Rename" de la ligne "Primary" avec la touche Tab
And appuie sur Entrée
Then la ligne montre un champ de nom contenant "Primary", un bouton "Save" et un bouton "Cancel"
```

### Scenario: le renommage tient sur une ligne

```gherkin
Given la bibliothèque "Primary"
And un administrateur sur Settings, ligne "Primary" en édition
Then le champ de nom, "Save" et "Cancel" sont sur une même ligne, leurs centres verticaux à 2 px près
And "Save" et "Cancel" font chacun au plus 40 px de haut
```

### Scenario: le formulaire d'ajout tient sur une ligne

```gherkin
Given un administrateur sur Settings
When il clique sur "Add a library"
Then le libellé "Name", le champ, "Create" et "Cancel" sont sur une même ligne, leurs centres verticaux à 2 px près
And "Create" et "Cancel" font chacun au plus 40 px de haut
```

### Scenario: le renommage fonctionne comme avant

```gherkin
Given les bibliothèques "Preschool" et "Primary"
And un administrateur sur Settings
When il clique sur le bouton "Rename" de la ligne "Primary"
And remplace le nom par "Primary School" et clique sur "Save"
Then la section "Libraries" liste "Preschool", "Primary School"
And la ligne "Primary School" a de nouveau son bouton "Rename"
```

---

## Critères d'acceptation

- [x] Les textes lus par l'utilisateur sont exactement ceux des scénarios (« Settings »,
      « Add the school's libraries and rename them. » avec une apostrophe droite,
      « Rename », « Save », « Cancel », « Create », « Add a library », « Name »).
- [x] Le sous-titre est rendu comme un paragraphe de la section, pas comme du texte
      collé au titre, et la section reste étiquetée par son titre
      (`region` « Libraries »).
- [x] Le bouton « Rename » est un vrai `button` : atteignable à la tabulation,
      activable à Entrée et Espace, avec un focus visible.
- [x] Le pictogramme du crayon est décoratif pour les technologies d'assistance ;
      seul le nom « Rename » du bouton est lu.
- [ ] `button-bks` rendu hors de Settings (modales, pagination, formulaire du compte)
      est inchangé.
- [x] Les scénarios de FEAT03 US-01, US-02 et US-03 restent verts ; les deux
      fichiers de tests qui affirment l'ancien titre et l'ancien texte de ligne
      sont adaptés, leurs scénarios intacts.
- [x] Les tests de bout en bout de cette story ont un titre distinct de ceux de
      FEAT03 (les préfixes `US-01` se répètent d'une feature à l'autre).
- [x] Aucun changement de back, de base ou d'API.
- [x] Chaque scénario a un test automatisé nommé `US-01: <titre du scénario>`
- [x] La suite de tests complète passe (`./mvnw -q test` depuis `server/`)
- [x] `npm run lint` dans `web/` ne signale aucune nouvelle erreur
- [x] `npm run test:e2e` dans `web/` passe en entier
- [x] Les commentaires du code sont en anglais et réduits à ce que le code ne dit
      pas (`.claude/CLAUDE.md`, « Comments are the exception »)

---

## Vérification de bout en bout

**Setup** : `docker compose up -d db`, backend et frontend de développement en
marche (`:8080`, `:5000`). Un compte administrateur et un compte bibliothécaire.

1. Connecté en administrateur, ouvrir **Settings** → titre « Settings », section
   « Libraries », et sous la section le texte « Add the school's libraries and
   rename them. ».
2. Regarder les lignes « Preschool » et « Primary » → le nom à gauche, un crayon
   discret à droite, à la hauteur du nom ; aucun bouton plus grand que la ligne.
   **Jugement humain** : la page paraît sobre, pas « bizarre ».
3. Survoler un crayon → infobulle « Rename ». Au clavier : Tab jusqu'au crayon,
   Entrée → la ligne passe en édition.
4. Dans la ligne en édition → champ pré-rempli, « Save » et « Cancel » sur la
   même ligne, boutons compacts. « Cancel » referme.
5. Renommer « Primary » en « Primary School » puis enregistrer → la liste montre le
   nouveau nom, le crayon est revenu. Renommer de nouveau en « Primary ».
6. Cliquer sur « Add a library » → « Name », champ, « Create » et « Cancel » sur une
   ligne. Cliquer sur « Cancel » (ne rien créer sur la base de développement).
7. Se connecter en bibliothécaire, ouvrir **Settings** → le titre « Settings » et
   rien d'autre.
8. Parcourir une modale d'emprunt, la pagination du catalogue et **Account** → leurs
   boutons ont la taille d'avant.
9. Coté automatisé : `npm run test:e2e` dans `web/` → tout passe.

**Cleanup** : rétablir le nom « Primary » (étape 5). Rien d'autre n'est créé.

---

## Points de vigilance

- **Ne pas changer le gabarit par défaut de `button-bks`.** Réduire son
  `min-width`, son `padding` ou la `margin-top` de son hôte règle Settings mais
  déplace chaque modale, la pagination et le formulaire du compte. Le compact doit
  être une demande explicite, limitée à Settings.
- **Le texte d'une ligne doit rester le nom de la bibliothèque.** Les tests de
  FEAT03 lisent le nom dans le texte du `listitem` ; une infobulle rendue comme du
  texte, ou un libellé caché ajouté à la ligne, fausserait ces lectures.
- **L'icône seule ne doit pas perdre le nom « Rename ».** Les sélecteurs de FEAT03
  trouvent le bouton par ce nom ; un pictogramme sans nom accessible casserait les
  tests et l'accessibilité à la fois.
- **L'ordre de `sharedStyles`** (`.claude/CLAUDE.md`, « Frontend conventions ») :
  un composant qui liste `sharedStyles` en dernier ne peut pas surcharger son
  `input { padding, font-size }` avec un sélecteur `input` simple. Le champ de nom
  des deux formulaires est concerné.
- **Ne pas lancer `prettier --write`** (`.claude/CLAUDE.md`, « Tooling ») ;
  `prettier --check` et `npm run lint` suffisent. Plusieurs fichiers portent déjà
  des erreurs `class-methods-use-this` : vérifier que celle qu'on voit n'est pas
  la sienne.
- **Les seuils de mesure supposent la taille de police par défaut** (16 px).
  Les tests les mesurent dans Chromium avec les polices chargées ; un test qui
  mesure avant le chargement du texte est instable.
