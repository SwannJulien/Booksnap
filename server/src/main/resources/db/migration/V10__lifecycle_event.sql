-- =============================================================================
-- V10 — lifecycle_event: an append-only journal of what happens to books and copies
-- =============================================================================
-- US-04 of the book-and-copy lifecycle. The audit columns say who touched a row
-- last; they cannot say what happened to it. This table does, and it is meant to
-- be the single source of the future analytics view (most borrowed books, busiest
-- readers, loans per month): those are aggregations over this table, nothing else.
--
-- Every event is written by a trigger, in the transaction of the operation it
-- describes. That is the only way to see the copy.status writes made by the V1
-- triggers, which never pass through Java, and it covers the bulk UPDATE of
-- OverdueBorrowingScheduler for free. A statement rolled back leaves no event.
--
-- NO FOREIGN KEY, deliberately: the ids below are dead references. A key to book
-- would either destroy the journal on a physical delete (CASCADE) or forbid the
-- delete (NO ACTION). student_id is no exception (structural rules §8 is about
-- the actor, which stays an email address).
--
-- Business events (borrowed, returned, overdue, hold_*) are what analytics counts.
-- copy_status_changed serves a copy's timeline: counting both doubles every loan.
--
-- The actor comes from the transaction-local setting `booksnap.actor`, set by
-- ActorAwareJpaTransactionManager. Absent or empty — psql, a script — it is
-- 'system', the value of Auditable.SYSTEM_AUDITOR.
--
-- Triggers of the same moment fire in alphabetical order of their name. The
-- trg_*_write_event names sort after the V1 triggers (trg_borrowing_insert, ...),
-- so the copy's status change is journaled before the borrowing or hold event.
--
-- NEVER MODIFY THIS FILE — Flyway checksum. Any correction is a new V<n>.
-- =============================================================================

CREATE TYPE lifecycle_event_type AS ENUM (
    'book_created', 'book_updated', 'book_deleted',
    'copy_created', 'copy_updated', 'copy_status_changed', 'copy_deleted',
    'borrowed', 'overdue', 'returned',
    'hold_placed', 'hold_promoted', 'hold_expired', 'hold_fulfilled'
);

CREATE TABLE lifecycle_event (
    id                 bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    occurred_at        timestamp with time zone NOT NULL DEFAULT now(),
    type               lifecycle_event_type NOT NULL,
    actor              text NOT NULL,
    book_id            bigint NOT NULL,
    copy_id            bigint,
    library_id         bigint,
    borrowing_id       bigint,
    hold_id            bigint,
    student_id         bigint,
    student_first_name text,
    student_last_name  text,
    -- Text rather than key_stage: a frozen fact must not follow later changes of the enum
    student_key_stage  text,
    student_house      text,
    detail             jsonb NOT NULL DEFAULT '{}'::jsonb,
    backfilled         boolean NOT NULL DEFAULT false,
    approximate_date   boolean NOT NULL DEFAULT false,
    CONSTRAINT approximate_only_when_backfilled CHECK (backfilled OR NOT approximate_date)
);

CREATE INDEX idx_lifecycle_event_book ON lifecycle_event (book_id, occurred_at, id);
CREATE INDEX idx_lifecycle_event_copy ON lifecycle_event (copy_id, occurred_at, id) WHERE copy_id IS NOT NULL;
CREATE INDEX idx_lifecycle_event_type ON lifecycle_event (type, occurred_at);
CREATE INDEX idx_lifecycle_event_student ON lifecycle_event (student_id, occurred_at) WHERE student_id IS NOT NULL;

CREATE FUNCTION fn_lifecycle_event_immutable() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    RAISE EXCEPTION 'lifecycle_event is append-only';
END;
$$;

CREATE TRIGGER trg_lifecycle_event_immutable
    BEFORE UPDATE OR DELETE ON lifecycle_event
    FOR EACH ROW EXECUTE FUNCTION fn_lifecycle_event_immutable();

-- nullif: once a transaction has set the parameter, the session keeps it as ''
CREATE FUNCTION fn_lifecycle_actor() RETURNS text
    LANGUAGE sql STABLE
    AS $$
    SELECT coalesce(nullif(current_setting('booksnap.actor', true), ''), 'system')
$$;

-- -----------------------------------------------------------------------------
-- Backfill: what the existing rows can still tell. It runs once, here, and never
-- again. Dates read from last_modified_* are approximate: any later write moved them.
-- Labels are those of today's rows; the values of the time are lost.
-- Not backfilled: status changes, book/copy edits and overdue transitions.
-- -----------------------------------------------------------------------------

INSERT INTO lifecycle_event (
    occurred_at, type, actor, book_id, copy_id, library_id, borrowing_id, hold_id,
    student_id, student_first_name, student_last_name, student_key_stage, student_house,
    detail, backfilled, approximate_date)
SELECT
    e.occurred_at, e.type, e.actor, e.book_id, e.copy_id, e.library_id, e.borrowing_id, e.hold_id,
    e.student_id, e.student_first_name, e.student_last_name, e.student_key_stage, e.student_house,
    e.detail, true, e.approximate_date
FROM (
    SELECT coalesce(b.created_date, b.last_modified_date) AS occurred_at,
           'book_created'::lifecycle_event_type AS type,
           coalesce(b.created_by, 'system') AS actor,
           b.id AS book_id, NULL::bigint AS copy_id, NULL::bigint AS library_id,
           NULL::bigint AS borrowing_id, NULL::bigint AS hold_id,
           NULL::bigint AS student_id, NULL::text AS student_first_name,
           NULL::text AS student_last_name, NULL::text AS student_key_stage, NULL::text AS student_house,
           jsonb_build_object('title', b.title) AS detail,
           b.created_date IS NULL AS approximate_date,
           1 AS ord
    FROM book b

    UNION ALL
    SELECT coalesce(c.created_date, c.last_modified_date), 'copy_created', coalesce(c.created_by, 'system'),
           c.book_id, c.id, c.library_id, NULL, NULL,
           NULL, NULL, NULL, NULL, NULL,
           jsonb_build_object('title', b.title, 'identification_code', c.identification_code,
                              'section_name', c.section_name),
           c.created_date IS NULL, 2
    FROM copy c JOIN book b ON b.id = c.book_id

    UNION ALL
    SELECT coalesce(w.created_date, w.start_date::timestamptz), 'borrowed', coalesce(w.created_by, 'system'),
           c.book_id, c.id, c.library_id, w.id, NULL,
           u.id, u.first_name, u.last_name, u.key_stage::text, u.house,
           jsonb_build_object('title', b.title, 'identification_code', c.identification_code,
                              'start_date', w.start_date, 'due_date', w.end_date),
           w.created_date IS NULL, 3
    FROM borrowing w
    JOIN copy c ON c.id = w.copy_id
    JOIN book b ON b.id = c.book_id
    JOIN users u ON u.id = w.user_id

    UNION ALL
    SELECT w.last_modified_date, 'returned', coalesce(w.last_modified_by, 'system'),
           c.book_id, c.id, c.library_id, w.id, NULL,
           u.id, u.first_name, u.last_name, u.key_stage::text, u.house,
           jsonb_build_object('title', b.title, 'identification_code', c.identification_code,
                              'start_date', w.start_date, 'due_date', w.end_date,
                              'returned_at', w.last_modified_date),
           true, 4
    FROM borrowing w
    JOIN copy c ON c.id = w.copy_id
    JOIN book b ON b.id = c.book_id
    JOIN users u ON u.id = w.user_id
    WHERE w.status = 'returned'

    UNION ALL
    SELECT coalesce(h.created_date, h.last_modified_date), 'hold_placed', coalesce(h.created_by, 'system'),
           h.book_id, NULL, h.library_id, NULL, h.id,
           u.id, u.first_name, u.last_name, u.key_stage::text, u.house,
           jsonb_build_object('title', b.title),
           h.created_date IS NULL, 5
    FROM hold h
    JOIN book b ON b.id = h.book_id
    JOIN users u ON u.id = h.user_id

    UNION ALL
    SELECT h.last_modified_date,
           CASE h.status
               WHEN 'active' THEN 'hold_promoted'::lifecycle_event_type
               WHEN 'expired' THEN 'hold_expired'::lifecycle_event_type
               ELSE 'hold_fulfilled'::lifecycle_event_type
           END,
           coalesce(h.last_modified_by, 'system'),
           h.book_id, h.copy_id, h.library_id, NULL, h.id,
           u.id, u.first_name, u.last_name, u.key_stage::text, u.house,
           jsonb_strip_nulls(jsonb_build_object('title', b.title, 'identification_code', c.identification_code,
                                                'start_date', h.start_date, 'end_date', h.end_date)),
           true, 6
    FROM hold h
    JOIN book b ON b.id = h.book_id
    JOIN users u ON u.id = h.user_id
    LEFT JOIN copy c ON c.id = h.copy_id
    WHERE h.status <> 'pending'

    UNION ALL
    SELECT b.deleted_at, 'book_deleted', coalesce(b.last_modified_by, 'system'),
           b.id, NULL, NULL, NULL, NULL,
           NULL, NULL, NULL, NULL, NULL,
           jsonb_build_object('title', b.title),
           false, 7
    FROM book b
    WHERE b.deleted_at IS NOT NULL

    UNION ALL
    SELECT c.deleted_at, 'copy_deleted', coalesce(c.last_modified_by, 'system'),
           c.book_id, c.id, c.library_id, NULL, NULL,
           NULL, NULL, NULL, NULL, NULL,
           jsonb_build_object('title', b.title, 'identification_code', c.identification_code,
                              'section_name', c.section_name),
           false, 8
    FROM copy c JOIN book b ON b.id = c.book_id
    WHERE c.deleted_at IS NOT NULL
) e
ORDER BY e.occurred_at, e.ord;

-- -----------------------------------------------------------------------------
-- Live journaling
-- -----------------------------------------------------------------------------

CREATE FUNCTION fn_log_book_event() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
    changes jsonb;
BEGIN
    IF TG_OP = 'INSERT' THEN
        INSERT INTO lifecycle_event (type, actor, book_id, detail)
        VALUES ('book_created', fn_lifecycle_actor(), NEW.id, jsonb_build_object('title', NEW.title));
        RETURN NULL;
    END IF;

    -- Hibernate rewrites every column on each save: only a real difference is an event
    SELECT jsonb_object_agg(n.key, jsonb_build_object('old', o.value, 'new', n.value)) INTO changes
    FROM jsonb_each(to_jsonb(NEW) - ARRAY['id', 'created_by', 'created_date', 'last_modified_by',
                                          'last_modified_date', 'deleted_at']::text[]) n
    JOIN jsonb_each(to_jsonb(OLD) - ARRAY['id', 'created_by', 'created_date', 'last_modified_by',
                                          'last_modified_date', 'deleted_at']::text[]) o ON o.key = n.key
    WHERE n.value IS DISTINCT FROM o.value;

    IF changes IS NOT NULL THEN
        INSERT INTO lifecycle_event (type, actor, book_id, detail)
        VALUES ('book_updated', fn_lifecycle_actor(), NEW.id,
                jsonb_build_object('title', NEW.title, 'changes', changes));
    END IF;

    IF OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL THEN
        INSERT INTO lifecycle_event (type, actor, book_id, detail)
        VALUES ('book_deleted', fn_lifecycle_actor(), NEW.id, jsonb_build_object('title', NEW.title));
    END IF;
    RETURN NULL;
END;
$$;

CREATE FUNCTION fn_log_copy_event() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
    changes jsonb;
    base jsonb;
BEGIN
    SELECT jsonb_build_object('title', b.title, 'identification_code', NEW.identification_code,
                              'section_name', NEW.section_name)
    INTO base
    FROM book b WHERE b.id = NEW.book_id;

    IF TG_OP = 'INSERT' THEN
        INSERT INTO lifecycle_event (type, actor, book_id, copy_id, library_id, detail)
        VALUES ('copy_created', fn_lifecycle_actor(), NEW.book_id, NEW.id, NEW.library_id,
                base || jsonb_build_object('status', NEW.status));
        RETURN NULL;
    END IF;

    SELECT jsonb_object_agg(n.key, jsonb_build_object('old', o.value, 'new', n.value)) INTO changes
    FROM jsonb_each(to_jsonb(NEW) - ARRAY['id', 'created_by', 'created_date', 'last_modified_by',
                                          'last_modified_date', 'deleted_at', 'status']::text[]) n
    JOIN jsonb_each(to_jsonb(OLD) - ARRAY['id', 'created_by', 'created_date', 'last_modified_by',
                                          'last_modified_date', 'deleted_at', 'status']::text[]) o ON o.key = n.key
    WHERE n.value IS DISTINCT FROM o.value;

    IF changes IS NOT NULL THEN
        INSERT INTO lifecycle_event (type, actor, book_id, copy_id, library_id, detail)
        VALUES ('copy_updated', fn_lifecycle_actor(), NEW.book_id, NEW.id, NEW.library_id,
                base || jsonb_build_object('changes', changes));
    END IF;

    IF NEW.status IS DISTINCT FROM OLD.status THEN
        INSERT INTO lifecycle_event (type, actor, book_id, copy_id, library_id, detail)
        VALUES ('copy_status_changed', fn_lifecycle_actor(), NEW.book_id, NEW.id, NEW.library_id,
                base || jsonb_build_object('from', OLD.status, 'to', NEW.status));
    END IF;

    IF OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL THEN
        INSERT INTO lifecycle_event (type, actor, book_id, copy_id, library_id, detail)
        VALUES ('copy_deleted', fn_lifecycle_actor(), NEW.book_id, NEW.id, NEW.library_id, base);
    END IF;
    RETURN NULL;
END;
$$;

CREATE FUNCTION fn_log_borrowing_event() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
    event lifecycle_event_type;
    c copy%ROWTYPE;
    u users%ROWTYPE;
    detail jsonb;
BEGIN
    IF TG_OP = 'INSERT' THEN
        event := 'borrowed';
    ELSIF NEW.status = 'overdue' AND OLD.status IS DISTINCT FROM 'overdue' THEN
        event := 'overdue';
    ELSIF NEW.status = 'returned' AND OLD.status IS DISTINCT FROM 'returned' THEN
        event := 'returned';
    ELSE
        RETURN NULL;
    END IF;

    SELECT * INTO c FROM copy WHERE id = NEW.copy_id;
    SELECT * INTO u FROM users WHERE id = NEW.user_id;

    SELECT jsonb_build_object('title', b.title, 'identification_code', c.identification_code,
                              'start_date', NEW.start_date, 'due_date', NEW.end_date)
    INTO detail
    FROM book b WHERE b.id = c.book_id;

    IF event = 'returned' THEN
        detail := detail || jsonb_build_object('returned_at', now());
    END IF;

    INSERT INTO lifecycle_event (
        type, actor, book_id, copy_id, library_id, borrowing_id,
        student_id, student_first_name, student_last_name, student_key_stage, student_house, detail)
    VALUES (
        event, fn_lifecycle_actor(), c.book_id, c.id, c.library_id, NEW.id,
        u.id, u.first_name, u.last_name, u.key_stage::text, u.house, detail);
    RETURN NULL;
END;
$$;

CREATE FUNCTION fn_log_hold_event() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
    event lifecycle_event_type;
    c copy%ROWTYPE;
    u users%ROWTYPE;
    detail jsonb;
BEGIN
    IF TG_OP = 'INSERT' THEN
        event := 'hold_placed';
    ELSIF NEW.status IS DISTINCT FROM OLD.status THEN
        event := CASE NEW.status
            WHEN 'active' THEN 'hold_promoted'::lifecycle_event_type
            WHEN 'expired' THEN 'hold_expired'::lifecycle_event_type
            WHEN 'fulfilled' THEN 'hold_fulfilled'::lifecycle_event_type
        END;
    END IF;

    IF event IS NULL THEN
        RETURN NULL;
    END IF;

    IF NEW.copy_id IS NOT NULL THEN
        SELECT * INTO c FROM copy WHERE id = NEW.copy_id;
    END IF;
    SELECT * INTO u FROM users WHERE id = NEW.user_id;

    SELECT jsonb_strip_nulls(jsonb_build_object(
        'title', b.title, 'identification_code', c.identification_code,
        'start_date', NEW.start_date, 'end_date', NEW.end_date))
    INTO detail
    FROM book b WHERE b.id = NEW.book_id;

    INSERT INTO lifecycle_event (
        type, actor, book_id, copy_id, library_id, hold_id,
        student_id, student_first_name, student_last_name, student_key_stage, student_house, detail)
    VALUES (
        event, fn_lifecycle_actor(), NEW.book_id, NEW.copy_id, NEW.library_id, NEW.id,
        u.id, u.first_name, u.last_name, u.key_stage::text, u.house, detail);
    RETURN NULL;
END;
$$;

CREATE TRIGGER trg_book_write_event AFTER INSERT OR UPDATE ON book
    FOR EACH ROW EXECUTE FUNCTION fn_log_book_event();
CREATE TRIGGER trg_copy_write_event AFTER INSERT OR UPDATE ON copy
    FOR EACH ROW EXECUTE FUNCTION fn_log_copy_event();
CREATE TRIGGER trg_borrowing_write_event AFTER INSERT OR UPDATE ON borrowing
    FOR EACH ROW EXECUTE FUNCTION fn_log_borrowing_event();
CREATE TRIGGER trg_hold_write_event AFTER INSERT OR UPDATE ON hold
    FOR EACH ROW EXECUTE FUNCTION fn_log_hold_event();
