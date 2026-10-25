-- Reset database by deleting all data from all tables
-- WARNING: This will permanently delete all data!

-- Disable triggers temporarily to avoid any issues
SET session_replication_role = 'replica';

-- Truncate all tables with CASCADE to handle foreign keys
TRUNCATE TABLE
    lifecycle_event,
    notification,
    hold,
    borrowing,
    copy,
    book_author,
    book_genre,
    book,
    author,
    genre,
    users,
    dewey_category,
    dewey_division,
    dewey_class
RESTART IDENTITY CASCADE;

-- Re-enable triggers
SET session_replication_role = 'origin';