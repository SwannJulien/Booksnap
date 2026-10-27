# US-013 — Vérification en conditions réelles

[← US-013](US-013-gestion-401-deconnexion.md) · [← Fonctionnalité](README.md) · [← Phase 1](../README.md)

Liste de contrôle correspondant à l'étape 6 du plan d'implémentation de US-013.
Document de passage : il peut être supprimé une fois la story validée.

---

## Préalables

| | |
|---|---|
| **Base** | `docker compose up -d db` |
| **Back** | démarré **depuis l'IDE** (pas de Maven sur le PATH) |
| **Front** | `npm run dev` dans `web/` → http://localhost:3000 |

### Comptes

Les deux partagent le mot de passe déjà présent dans `server/.env`
(`BOOKSNAP_BOOTSTRAP_ADMIN_PASSWORD`) : le compte de test a été créé en
recopiant l'empreinte du compte d'amorçage.

| Compte | Rôle | Sert à |
|---|---|---|
| `admin@admin.com` | `admin` | le parcours normal du personnel |
| `student@test.local` | `user` | obtenir un vrai 403 de rôle |

`student@test.local` est **temporaire**. Suppression une fois la vérification
faite :

```bash
docker exec -i booksnap-postgres sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB"' <<'SQL'
DELETE FROM auth_identity WHERE created_by = 'us-013-runtime-check';
DELETE FROM users WHERE email = 'student@test.local';
SQL
```

---

## 1. Session expirée : une redirection, un message

Couvre : *tout 401 redirige vers `/login` avec un message d'expiration* et
*plusieurs 401 concurrents ne produisent qu'une redirection*.

1. Se connecter en **admin**, puis ouvrir **Catalog** — la vue déclenche l'appel
   des livres **plus un appel de couverture par livre**, donc une dizaine de
   requêtes parallèles.
2. Outils de développement → Application → Cookies → supprimer **`JSESSIONID`**.
   Le cookie est `HttpOnly` : cela passe par les outils de développement, pas par
   la console.
3. Naviguer **dans l'application** (clic sur *Borrowings*) — sans recharger la
   page.

**Attendu :** une seule redirection vers `/login`, le message vert « Your session
has expired… » affiché **une seule fois**, et dans l'onglet Réseau une rafale de
401 derrière cette unique redirection.

## 2. Retour à la page après reconnexion

Couvre : *la destination courante est mémorisée*.

Depuis l'écran de connexion de l'étape précédente, se reconnecter en **admin**.

**Attendu :** arrivée sur **`/borrowings`**, la page demandée avant l'expiration —
et non sur `/`.

## 3. Un rechargement n'est pas une expiration

Couvre le point de vigilance « ne pas boucler ».

Se déconnecter, puis saisir directement `localhost:3000/catalog` dans la barre
d'adresse.

**Attendu :** l'écran de connexion **sans** message d'expiration. Au chargement,
un 401 sur `/auth/me` signifie « personne n'est connecté », ce qui est le cas
normal : c'est l'exemption qui empêche la boucle.

## 4. Un 403 ne déconnecte pas

Couvre : *un 403 affiche un message d'accès refusé sans déconnecter*.

1. Se connecter en **`student@test.local`**.
2. Cliquer sur **Borrowings** (lecture réservée au personnel).

**Attendu :** bandeau rouge « You do not have permission to do that… » en haut,
la page **ne change pas**, la navigation continue d'afficher le nom, et le
bandeau disparaît après ~8 s ou au clic sur ×. Cliquer ensuite sur *Catalog*
pour confirmer que la session est toujours ouverte.

## 5. Déconnexion volontaire et retour arrière

Couvre : *bouton de déconnexion appelant `POST /api/v1/auth/logout`* et *le
retour arrière ne redonne pas accès*.

1. En **admin**, depuis `/catalog`, cliquer sur l'icône de déconnexion au pied de
   la navigation, à côté du nom.
2. Vérifier dans l'onglet Réseau que `POST /api/v1/auth/logout` répond **204**.
3. Appuyer sur le bouton **Précédent** du navigateur.

**Attendu :** arrivée sur `/login`, navigation masquée, et le retour arrière ne
réaffiche **pas** le catalogue.

## 6. Nom de l'utilisateur connecté

Couvre : *le nom de l'utilisateur connecté est affiché*.

**Attendu :** au pied de la navigation, `admin@admin.com` pour l'administrateur —
ce compte n'a ni prénom ni nom en base, et c'est le repli sur l'adresse qui
s'affiche — et `Test Student` pour le compte de test.

---

## Déjà vérifié côté serveur

Fait au curl contre le back en cours d'exécution, le 2026-09-04. Ces réponses
sont les prémisses sur lesquelles repose le code du front ; il reste à vérifier
la réaction de l'interface, ce que fait la liste ci-dessus.

| Vérification | Résultat |
|---|---|
| Endpoint protégé sans session | `401 Authentication required` |
| `JSESSIONID` périmé | `401` — et non 500 |
| `/auth/me` sans session | `401` — le cas normal, exempté côté front |
| Connexion → `/auth/me` | `200` |
| `POST /auth/logout` | `204` |
| Même cookie après déconnexion | `401` — session bien fermée **côté serveur** |
| `student@test.local` → `GET /borrowings` | `403 Access denied` |
| `/auth/me` juste après ce 403 | `200` — la session survit au refus |
| Écriture sans jeton CSRF | `403 CSRF token missing or invalid` |

**Trouvé à cette occasion :** la réponse de connexion de `admin@admin.com` porte
`firstName` et `lastName` à `null` — la navigation affichait « null null ». Le
repli sur l'adresse e-mail a été ajouté dans `booksnap-app.js`.
