# Fonctionnalité — Modèle d'identité

[← Phase 1](../README.md) · [← Plan](../../README.md)

---

## De quoi il s'agit

Poser les deux structures dont dépend tout le reste : **le rôle** porté par
l'utilisateur, et **la séparation entre le compte et le moyen de prouver son
identité**.

## L'idée centrale

La ligne `users` **est** l'identité. Les façons de s'authentifier y sont
rattachées par une table séparée, `auth_identity` :

```
users (1) ──< auth_identity (n)
                provider: local | microsoft | google
```

Un utilisateur peut cumuler un mot de passe **et** Microsoft. Il peut aussi
n'avoir **aucune** identité : le compte existe, il est géré au comptoir,
personne ne s'y connecte — c'est le cas de tous les élèves jusqu'à la phase 5.

**C'est ce qui rend le SSO additif en phase 7** plutôt qu'une réécriture : une
valeur de plus dans `provider`, rien à défaire.

C'est aussi ce qui absorbe la population mixte de l'école — adresses gérées par
Microsoft d'un côté, adresses personnelles de l'autre — sans second chemin de
code : les deux cas ne diffèrent que par la ligne `auth_identity` présente.

## Périmètre

**Inclus :** table `auth_identity` et son entité, énumération `user_role`,
colonne `users.role`, retrait de `is_super`.

**Exclu :** la connexion elle-même (US-005), les rattachements aux bibliothèques
(phase 2), le fournisseur Microsoft (phase 7).

## Points de vigilance

- Ces deux stories **ne cassent rien** : elles ajoutent des structures que
  personne ne lit encore. Elles sont déployables seules.
- `is_super` n'est lu nulle part dans le code — vérifié — mais il est peuplé
  dans `seed.sql`.

## User stories

| # | Titre |
|---|---|
| [US-003](US-003-table-auth-identity.md) | Créer la table `auth_identity` |
| [US-004](US-004-role-utilisateur.md) | Ajouter le rôle sur `users` |
