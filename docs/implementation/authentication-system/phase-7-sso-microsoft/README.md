# Phase 7 — SSO Microsoft

> Le chemin de connexion principal en conditions réelles : les comptes de
> l'école. Additif, sans rien réécrire.

[← Plan d'implémentation](../README.md)

> **Stories à détailler.**

---

## Pourquoi en dernier alors que c'est le chemin principal

Ce n'est pas une question d'importance mais de dépendances :

- Le SSO exige que le service informatique de l'école enregistre une application
  et fournisse client ID, secret et tenant ID. C'est un blocage sur l'agenda d'un
  tiers.
- Le développement local demanderait un tenant de test ou un simulateur.
- Les usagers n'ayant qu'une adresse personnelle ne pourraient pas se connecter
  tant que le mot de passe local n'existe pas.

**Et surtout : la table `auth_identity` rend cette phase additive.** Une valeur
de plus dans `provider`, rien à défaire de la phase 1. C'était l'intérêt de
séparer le compte du moyen de preuve
([décision D2](../../DECISIONS-MULTI-UTILISATEUR.md)).

---

## Ce que la phase produit

- Connexion par compte Microsoft de l'école.
- Rattachement d'une identité `microsoft` à un compte existant.
- Un bouton « Se connecter avec Microsoft » à côté du formulaire existant.

---

## Découpage en fonctionnalités

| Fonctionnalité | Contenu |
|---|---|
| **Intégration OIDC** | Client OAuth2/OIDC, configuration par environnement, cycle de connexion. |
| **Rattachement d'identité** | Correspondance par email vérifié, création de la ligne `auth_identity`, gestion des conflits. |
| **Bouton côté front** | Ajout à l'écran de connexion, retour d'erreur explicite. |
| **Paramètres SSO** | Tenant, domaines de l'école, activation — administrables. |

---

## Les trois règles de sécurité non négociables

Elles ne sont pas des préférences : chacune, omise, ouvre une prise de contrôle
de compte.

1. **Ne rattacher une identité OIDC que si le fournisseur déclare l'email
   vérifié** (`email_verified`). Sinon, faire enregistrer une adresse
   ressemblant à celle d'un membre du personnel suffit à prendre son compte.
2. **Restreindre au tenant de l'école** (validation du claim `tid`). Sinon,
   n'importe quel compte Microsoft au monde est un identifiant valide dès lors
   que l'email correspond.
3. **Pas de création de compte à la volée.** Une connexion valide sans ligne
   `users` correspondante doit **échouer** avec un message clair, et non créer un
   compte. Sinon toute personne du tenant — élèves, enseignants, personnel
   administratif — devient usager de Booksnap au premier clic.

Voir [règles accès §5.2](../../REGLES-METIER-ACCES.md).

---

## Points d'attention connus

- **Le rattachement se fait sur l'email**, ce qui suppose que `users.email` soit
  fiable et insensible à la casse — d'où US-002 dès la phase 0.
- **Un usager peut cumuler mot de passe et Microsoft.** La contrainte
  `UNIQUE (user_id, provider)` l'autorise ; la déconnexion et le changement de
  mot de passe doivent rester cohérents (US-008 renvoie 409 pour un compte sans
  identité `local`).
- **Le secret client est une donnée sensible** : par variable d'environnement,
  jamais dans le dépôt. `.gitignore` couvre déjà `.env`.
- **Prévoir l'échec.** Tenant mal configuré ou panne du fournisseur : la
  connexion par mot de passe reste la voie de secours, et ne doit jamais être
  retirée.
- **Ne pas traiter `google`** tant que ce n'est pas demandé, même si la valeur
  existe dans l'énumération.
