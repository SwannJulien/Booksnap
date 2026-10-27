# Tests de bout en bout

Le projet n'a aujourd'hui aucun test qui passe par un navigateur : le niveau
« end-to-end » est marqué `missing` dans `.claude/spec/conventions.md`, et la
vérification d'une story qui touche l'interface repose entièrement sur un
parcours manuel. Une fois cette fonctionnalité livrée, une seule commande du
projet lance des tests Playwright contre un backend et un frontend réels,
branchés sur une base de données jetable, avec un compte par rôle — et chaque
story suivante peut écrire ses scénarios d'interface comme des tests
automatisés.

## Pourquoi maintenant

[US-06 du cycle de vie](../cycle-de-vie-livre-copie/US-06-ecran-archive.md) est
une story essentiellement front, et la règle des conventions — chaque scénario
devient un test automatisé — ne peut pas y être tenue sans ce harnais. Il est
payé une fois pour le projet, pas par fonctionnalité.

---

## Décisions qui valent pour toute la fonctionnalité

- **Playwright devient une dépendance du projet.** Rejeté : le lancer hors de
  `web/package.json` depuis un répertoire de travail, comme le prévoyait
  jusqu'ici `.claude/CLAUDE.md` — un harnais que personne ne peut relancer de la
  même manière n'en est pas un.
- **Les tests tournent sur une base jetable, jamais sur la base de
  développement.** `lifecycle_event` est en ajout seul : un test qui supprime un
  livre sur la base de développement y laisserait pour toujours un livre
  archivé et ses lignes de journal. Rejeté : la base de développement, comme le
  disaient les conventions ; une API entièrement simulée, qui ne prouverait rien
  du contrat réel.
- **L'interception réseau de Playwright n'est permise que pour les états que des
  données réelles ne garantissent pas** : une liste vide après des exécutions
  précédentes, une panne du serveur. Tout le reste passe par le vrai backend.

**Hors périmètre de la fonctionnalité** : l'intégration continue (le dépôt n'en
a pas) ; le niveau « front component », qui reste `missing` ; d'autres
navigateurs que Chromium.

---

## User stories

L'ordre est l'ordre de livraison recommandé. Chaque story est vérifiable de bout
en bout seule ; sa section **Vérification de bout en bout** décrit le parcours
exact.

| # | Titre | Nature | Portée | Dépend de |
|---|---|---|---|---|
| [US-01](US-01-harnais-playwright/US-01-harnais-playwright-spec.md) | Un harnais Playwright sur une base jetable | enabler | front (outillage) · scripts de base · docs | — |

---

## Socle commun de vérification

La base de données du conteneur (`docker compose up -d db`) doit tourner. Le
harnais construit lui-même sa base jetable et ses comptes ; rien n'est à
préparer à la main dans la base de développement, et rien ne doit y changer.

---

## Pièges connus

- **Un backend tourne peut-être déjà sur `:8080`**, lancé depuis l'IDE et
  branché sur la base de développement (`.claude/CLAUDE.md`). Le harnais ne
  doit ni l'arrêter, ni s'en servir.
- **Ne jamais lancer `prettier --write` ni `npm run format`** : ajouter des
  fichiers de test et une dépendance n'autorise pas à reformater le dépôt.
