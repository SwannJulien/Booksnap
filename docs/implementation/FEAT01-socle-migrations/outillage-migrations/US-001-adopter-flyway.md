# US-001 — Adopter Flyway avec baseline sur la base existante

[← Fonctionnalité](README.md) · [← Phase 0](../README.md) · [← Plan](../../README.md)

| | |
|---|---|
| **Phase** | 0 — Socle de migrations |
| **Fonctionnalité** | Outillage de migrations |
| **Dépend de** | — |
| **Bloque** | US-002 et **toute** story créant une table ou une colonne |
| **Portée** | Back uniquement |

---

## Récit

**En tant que** développeur de Booksnap
**je veux** que toute modification de schéma soit versionnée et rejouée
automatiquement
**afin de** ne plus dépendre d'un `ALTER` tapé à la main sur la base en service,
au moment précis où la fonctionnalité multi-utilisateur va en produire une
vingtaine.

## Contexte

`schema.sql` n'est joué qu'à la création du volume `booksnap-db-data`. La base en
service a déjà dérivé. `ddl-auto=update` ajoute silencieusement tables et
colonnes des entités JPA, mais jamais les énumérations, index partiels,
triggers, domaines — ni les changements de type.

Voir [règles structurelles §7](../../../REGLES-METIER-STRUCTURE.md).

---

## Scénarios

### Scenario: la base existante est adoptée sans perte de données

```gherkin
Given une base Booksnap en service, contenant des livres, copies et emprunts
And aucune table "flyway_schema_history"
When l'application démarre avec Flyway activé et "baseline-on-migrate" à true
Then une table "flyway_schema_history" est créée
And une ligne de baseline y est enregistrée
And aucune donnée métier existante n'est modifiée ni supprimée
And l'application démarre normalement
```

### Scenario: une nouvelle migration est appliquée une seule fois

```gherkin
Given une base déjà baselinée
And un fichier "V2__<description>.sql" ajouté dans db/migration
When l'application démarre
Then la migration V2 est appliquée
And une ligne correspondante apparaît dans "flyway_schema_history"
When l'application redémarre
Then la migration V2 n'est pas rejouée
```

### Scenario: une migration déjà appliquée ne peut plus être modifiée

```gherkin
Given une migration "V2__<description>.sql" déjà appliquée
When son contenu est modifié puis l'application redémarrée
Then Flyway échoue au démarrage sur une erreur de checksum
And le message indique quelle migration a été altérée
```

### Scenario: un volume vierge reconstruit le schéma complet

```gherkin
Given un volume "booksnap-db-data" supprimé puis recréé
When l'application démarre
Then Flyway joue toutes les migrations depuis V1
And le schéma obtenu est équivalent à celui de la base en service
```

---

## Critères d'acceptation

- [x] `flyway-core` **et** `flyway-database-postgresql` sont dans `pom.xml` (Flyway 10+ exige le module PostgreSQL séparé).
- [x] Les migrations vivent dans `server/src/main/resources/db/migration`, nommées `V<n>__<description>.sql`.
- [x] `spring.flyway.baseline-on-migrate=true` permet l'adoption de la base existante.
- [x] **Une seule source d'autorité sur le schéma** : `ddl-auto` ne crée plus rien (voir plan, étape 4).
- [x] `V1` reproduit le schéma courant : tables, énumérations, domaines, triggers, index partiels.
- [x] Les données de référence Dewey sont dans une migration distincte de `V1`.
- [x] `seed.sql` **reste hors** des migrations : ce sont des données de développement.
- [x] Démarrer deux fois de suite ne produit aucun changement au second démarrage.
- [x] La procédure d'ajout d'une migration est documentée dans `.claude/CLAUDE.md`, qui affirme aujourd'hui qu'il n'y a pas d'outil de migration.

---

## Plan d'implémentation

1. **Ajouter les dépendances** `flyway-core` et `flyway-database-postgresql` dans
   `server/pom.xml` (versions gérées par le parent Spring Boot 3.4.4).

2. **Extraire le schéma réel** de la base en service — c'est lui qui fait foi,
   pas `schema.sql` :

   ```bash
   docker exec booksnap-postgres sh -c \
     'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" --schema-only --no-owner --no-privileges'
   ```

   En faire `V1__baseline_schema.sql`, et `V2__dewey_reference_data.sql` pour les
   données Dewey.

3. **Configurer Flyway** dans `application.properties` :

   ```properties
   spring.flyway.enabled=true
   spring.flyway.baseline-on-migrate=true
   spring.flyway.baseline-version=2
   ```

   > `baseline-version` doit valoir **le numéro de la dernière migration déjà
   > présente dans la base en service**, ici `2` (V1 le schéma, V2 les données
   > Dewey). Flyway ignore les migrations dont la version est **inférieure ou
   > égale** à `baseline-version`. Avec `0`, V1 et V2 seraient rejouées sur la
   > base existante et le démarrage échouerait sur « type already exists ».

4. **Trancher l'autorité sur le schéma.** `ddl-auto=update` et Flyway se
   marchent dessus : le premier modifie le schéma hors de tout versionnement.

   Cible : `spring.jpa.hibernate.ddl-auto=validate`, qui vérifie que les entités
   correspondent au schéma sans y toucher.

   > ⚠️ **Le démarrage échouera probablement du premier coup** — la dérive
   > existante remontera. C'est l'effet recherché : **la liste des erreurs est
   > l'inventaire de la dérive**. La consigner, la résoudre par migrations
   > (US-002 traite la plus urgente). Si elle bloque trop longtemps, passer
   > temporairement à `none` — jamais revenir à `update`.

5. **Aligner `docker-compose.yml`** : le montage de `sql/` dans
   `/docker-entrypoint-initdb.d/` fait doublon avec Flyway sur un volume vierge.
   Ne conserver que `seed.sql` pour le développement, ou retirer le montage.

6. **Mettre à jour `.claude/CLAUDE.md`** : la section « Database changes: no
   migration tool » devient fausse.

7. **Vérifier** : démarrage sur la base existante (baseline, aucune perte),
   redémarrage (aucun changement), puis `docker compose down -v` suivi d'un
   démarrage complet.

---

## Points de vigilance

- **`pg_dump` produit du SQL non idempotent.** `V1` ne doit jamais être joué sur
  la base existante — la baseline l'en empêche, à condition que
  `baseline-version` soit **supérieure ou égale** à la version de `V1`.
- **`pg_dump` 16 encadre sa sortie de méta-commandes psql** `\restrict` /
  `\unrestrict`, et remet `search_path` à vide. Flyway n'est pas psql : ces
  lignes doivent être retirées de `V1`.
- **Ne jamais modifier une migration appliquée.** Toute correction est une
  nouvelle migration.
- **`flyway_schema_history` doit être sauvegardée** avec les données : sans
  elle, Flyway ne sait plus où il en est.
- Le backend est démarré **depuis l'IDE**, pas depuis le conteneur `backend`
  (voir `.claude/CLAUDE.md`) : c'est ce démarrage-là qui joue les migrations.
