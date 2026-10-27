-- library.name becomes case-insensitive and mandatory: "Primary" and "primary" are the
-- same site. library_name_key is rebuilt by the ALTER, which is what makes the unique
-- constraint case-insensitive.
--
-- Nothing is merged automatically: merging two libraries means moving their copies.

DO $$
DECLARE
    conflicts text;
BEGIN
    SELECT string_agg(format('%s (ids: %s)', v, ids), ', ')
      INTO conflicts
      FROM (
        SELECT LOWER(name) AS v, array_agg(id ORDER BY id)::text AS ids
          FROM library WHERE name IS NOT NULL GROUP BY LOWER(name) HAVING count(*) > 1
      ) d;
    IF conflicts IS NOT NULL THEN
        RAISE EXCEPTION
            'library.name: names differing only by case, fix them by hand before replaying this migration: %',
            conflicts;
    END IF;
END
$$;

DO $$
DECLARE
    unnamed text;
BEGIN
    SELECT string_agg(id::text, ', ' ORDER BY id) INTO unnamed FROM library WHERE name IS NULL;
    IF unnamed IS NOT NULL THEN
        RAISE EXCEPTION
            'library.name: libraries without a name (ids: %), name or delete them before replaying this migration',
            unnamed;
    END IF;
END
$$;

ALTER TABLE library ALTER COLUMN name TYPE public.citext USING name::public.citext;
ALTER TABLE library ALTER COLUMN name SET NOT NULL;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_class WHERE relname = 'library_name_key' AND relkind = 'i') THEN
        RAISE EXCEPTION 'unique index library_name_key is missing after conversion';
    END IF;

    IF (SELECT format_type(atttypid, atttypmod) FROM pg_attribute
         WHERE attrelid = 'library'::regclass AND attname = 'name') <> 'citext' THEN
        RAISE EXCEPTION 'library.name is not citext after conversion';
    END IF;
END
$$;
