-- =============================================================================
-- V9 — book.deleted_at / copy.deleted_at: deletion becomes logical
-- =============================================================================
-- US-01 of the book-and-copy lifecycle. Removing a title from the catalogue used
-- to mean deleting the row, and the foreign keys would not allow it: borrowing
-- and hold both point at copy with NO ACTION, so a loan returned three years ago
-- still refused the delete, and `copy.book_id ON DELETE CASCADE` made a book
-- delete fail as a whole. The choice was between keeping dead records forever and
-- erasing the students' loan history.
--
-- A deletion is now a timestamp. Nothing is destroyed, the NO ACTION keys are no
-- longer in anyone's way, and the loan history stays readable (US-05, US-06).
--
-- NULL means live. The column is deliberately nullable with no default: a row
-- that was never deleted carries no deletion date.
--
-- The two partial indexes serve the reads that now carry `deleted_at IS NULL`.
-- idx_copy_book_status_live covers the copy counts of a book (total, available)
-- and the copy list of a book — it doubles idx_copy_book_status, which stays
-- because it still serves reads that do not filter (the archive of US-05).
--
-- Application code is what enforces the filter, not the schema: no @SQLRestriction
-- on the entities, because US-05/US-06 have to read deleted rows for the archive.
-- A query that forgets `deleted_at IS NULL` fails nowhere and simply shows a
-- deleted book.
--
-- NEVER MODIFY THIS FILE — Flyway checksum. Any correction is a new V<n>.
-- =============================================================================

ALTER TABLE public.book ADD COLUMN deleted_at timestamp with time zone;
ALTER TABLE public.copy ADD COLUMN deleted_at timestamp with time zone;

CREATE INDEX idx_book_live ON public.book USING btree (id) WHERE (deleted_at IS NULL);
CREATE INDEX idx_copy_book_status_live
    ON public.copy USING btree (book_id, status) WHERE (deleted_at IS NULL);
