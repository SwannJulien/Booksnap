# Finition de la page Settings

La page Settings livrée par [FEAT03](../FEAT03-bibliotheques/README.md) fonctionne
mais paraît inachevée : son titre est celui d'un écran provisoire
(« Settings View »), les boutons « Rename » reprennent le gros bouton des
formulaires et des modales, et rien n'explique à quoi sert la section
« Libraries ». Une fois la feature livrée, l'administrateur ouvre Settings et
voit une page « Settings » dont chaque **section** porte un sous-titre d'une
ligne, avec des lignes de bibliothèques sobres (nom à gauche, crayon à droite)
et des formulaires d'ajout et de renommage tenant sur une ligne.

Rien ne change dans ce que fait la page : la feature est purement visuelle.

## Pourquoi maintenant

FEAT03 a posé la première section de Settings, et d'autres suivront (archivage,
rattachement des bibliothécaires — voir le README de FEAT03). Le gabarit d'une
section — titre, sous-titre, contenu compact — se fixe mieux avec une seule
section à corriger qu'avec cinq.

---

## Décisions valables pour toute la feature

- **« Sous-menu » veut dire « section ».** Settings n'a pas de sous-menus : une
  seule section, « Libraries », réservée à l'`ADMIN`. La demande d'un sous-titre
  « derrière chaque sous-menu » s'entend de chaque section de la page. Terme
  ajouté au [glossaire](../../GLOSSARY.md) : _Settings section_ (à ne pas
  appeler sous-menu, onglet ni panneau).
- **Toute section de Settings porte un sous-titre.** Règle valable pour les
  sections à venir ; seule « Libraries » existe aujourd'hui.
- **Pas de navigation nouvelle** (onglets, liste latérale) : rejeté, rien dans la
  demande ne le justifie avec une seule section.
- **La page d'un non-admin reste celle de FEAT03** : le titre, rien d'autre
  (décision de FEAT03 US-01).

**Hors périmètre de la feature** : le titre des autres écrans (« Analytics View »,
etc.), l'apparence de `button-bks` ailleurs que dans Settings, le thème et la
mise en page mobile, tout changement de comportement des bibliothèques.

---

## User stories

L'ordre est l'ordre d'implémentation recommandé. Chaque story est vérifiable de
bout en bout seule et livrable sans la suivante ; sa section **Vérification de
bout en bout** décrit le parcours exact.

| # | Titre | Nature | Portée | Dépend de |
|---|---|---|---|---|
| [US-01](US-01-finition-page-settings/US-01-finition-page-settings-spec.md) | Finition de la page Settings | feature | front | FEAT03 |

---

## Préparation commune aux vérifications

- **Base** : `docker compose up -d db`. Les fixtures de développement donnent
  Preschool (id 1) et Primary (id 2).
- **Comptes** : le harnais de bout en bout (`npm run test:e2e` dans `web/`)
  fournit un compte par rôle (`web/test/e2e/support/accounts.js`) sur la base
  jetable `booksnap_e2e`. Pour le parcours manuel, un compte administrateur de
  la base de développement (`server/README.md`) et un compte bibliothécaire.
- **Nettoyage** : voir la story.

---

## Points de vigilance connus

- **`button-bks` sert partout.** Modales, pagination, formulaire du compte :
  modifier son gabarit par défaut déplace chacun de ces écrans.
- **Des tests de FEAT03 affirment l'ancienne interface** (titre « Settings View »,
  texte « Rename » de la ligne) ; la story les adapte, elle ne les contourne pas.
