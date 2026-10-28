# Administration des comptes — notes

- **La base e2e n'a aucun compte sans nom, et ses 9 comptes de fixture sont tous actifs.**
  Le backend e2e démarre sans administrateur d'amorçage, donc pas de `admin@admin.com` ;
  seuls Alice Martin (`admin`), Bob Johnson (`librarian`) et Clara Dupont ont un mot de passe.
  `server/scripts/run-e2e-backend.sh` (`--booksnap.bootstrap.admin.email=`), `server/sql/seed.sql`,
  `server/sql/e2e-accounts.sql`.
  Found: plan US-01, 2026-10-27. Affects: tout test e2e qui a besoin d'un compte sans nom,
  désactivé ou sans mot de passe doit le préparer lui-même avec `queryE2eDb`.

- **Les comptes créés par un test e2e restent dans `booksnap_e2e` jusqu'à la fin de l'exécution.**
  La base n'est reconstruite qu'au démarrage du harnais, et les tests tournent en série sur la
  même base. `web/playwright.config.js` (`workers: 1`), `server/scripts/run-e2e-backend.sh`
  (`recreate-e2e-db.sh`).
  Found: plan US-01, 2026-10-27. Affects: un test qui compte les lignes de « Users » ou suppose
  une position absolue casse dès que US-02 crée des comptes ; compter au moment du test, et
  nettoyer en `afterEach` ce qu'on insère ou modifie.

- **Dans la base de développement, Alice Martin est `user`, pas `admin`.**
  Les rôles des comptes de fixture ne sont posés que dans `booksnap_e2e`. Le compte admin de
  dev est `admin@admin.com`, sans prénom ni nom. `server/sql/e2e-accounts.sql`.
  Found: plan US-01, 2026-10-27. Affects: les tests d'intégration back, qui tournent sur la
  base de dev, ne doivent pas supposer les rôles des comptes de fixture.

- **`pagination-bks` affiche « Showing 1 to 0 of 0 results » sur une liste vide.**
  `web/src/components/pagination-bks/pagination-bks.js` (`render`, `start` calculé sans test
  de `totalElements`).
  Found: plan US-01, 2026-10-27. Affects: toute liste qui l'utilise doit le masquer quand elle
  est vide.

- **Un paramètre de requête enum inconnu répondait `500`.**
  `MethodArgumentTypeMismatchException` n'avait pas de handler et tombait dans
  `GlobalExceptionHandler.handleGeneralException`. Le plan US-01 ajoute ce handler (`400`).
  Found: plan US-01, 2026-10-27. Affects: si le handler n'est pas là, `?role=` ou `?status=`
  inconnu sur `/users`, `/holds`, `/borrowings` répond `500`.

- **`holds.spec.js` laisse cinq comptes actifs « Holder » dans `booksnap_e2e` après son exécution.**
  `web/test/e2e/holds.spec.js` (`INSERT INTO users … 'Holder'`, ligne 34), jamais supprimés ; les specs
  jouent dans l'ordre alphabétique, donc `users-view.spec.js` voit 15 comptes actifs et non 9.
  Found: build US-01, 2026-10-28. Affects: sur 10 lignes par page, Alice Martin et Daniel Smith passent en
  page 2 ; un test de la vue « Users » ne peut pas supposer qu'un compte est en page 1 (chercher par
  email, ou parcourir les pages).

- **La colonne du sexe s'appelle `genre`, et c'est du `text` libre.**
  `\d users` ; `server/sql/seed.sql` (`genre` : `female`, `male`). L'API et le Java l'appellent
  `sex` depuis US-02 (`@Column(name = "genre")`), et l'entité le garde en `String`.
  Found: plan US-02, 2026-10-28. Affects: US-03 et l'import iSAMS — une enum dans l'entité ferait
  répondre `500` à toute la liste « Users » dès qu'une valeur hors liste est en base.

- **`User.email` porte `@Email` (Hibernate Validator) en plus du domaine `email`, et les deux règles
  diffèrent.** Le domaine accepte `a..b@x.com` que `@Email` refuse ; `@Email` accepte des caractères
  non ASCII que le domaine refuse. `server/src/main/java/net/booksnap/domain/user/User.java` (`email`),
  `\dD email`.
  Found: plan US-02, 2026-10-28. Affects: toute écriture d'email (US-03) doit valider l'intersection
  des deux sur la requête, sinon une adresse refusée à la persistance répond `500`.

- **`signIn` des tests e2e tape toujours `E2E_PASSWORD`.**
  `web/test/e2e/support/sign-in.js`.
  Found: plan US-02, 2026-10-28. Affects: un test qui se connecte avec un mot de passe temporaire ou
  changé (US-02, US-04, US-06) remplit lui-même `#email`, `#password` et clique « Sign in ».

- **`npm run lint` échoue déjà sur l'étape Prettier pour 11 fichiers, dont `web/src/booksnap-app.js`.**
  Le fichier de `HEAD` échoue lui aussi (`prettier --check`), et les 9 erreurs ESLint sont dans
  d'autres fichiers (`class-methods-use-this`, `lit/attribute-value-entities`,
  `import/no-extraneous-dependencies`). `web/package.json` (script `lint`).
  Found: review US-01, 2026-10-28. Affects: un `prettier --write` sur `booksnap-app.js` mêle une
  réécriture de mise en forme au diff de la story ; juger le lint sur les fichiers de la story, pas sur
  le code de sortie.
