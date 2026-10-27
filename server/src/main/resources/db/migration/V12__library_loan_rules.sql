-- Loan rules, in days, per library. The DEFAULTs are the only source of the starting values
-- (14-day loan, 7-day pickup): the entity re-reads them after insert, and plain SQL inserts
-- that give only a name (seed.sql) rely on them.

ALTER TABLE library
    ADD COLUMN borrowing_duration_days integer NOT NULL DEFAULT 14
        CONSTRAINT library_borrowing_duration_days_check CHECK (borrowing_duration_days BETWEEN 1 AND 365),
    ADD COLUMN pickup_window_days integer NOT NULL DEFAULT 7
        CONSTRAINT library_pickup_window_days_check CHECK (pickup_window_days BETWEEN 1 AND 365);
