package net.booksnap.domain.book.repository;

import net.booksnap.domain.book.Book;
import net.booksnap.domain.lifecycle.LifecycleEventType;
import net.booksnap.domain.lifecycle.api.dto.DeletedBookResponse;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.JpaSpecificationExecutor;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.Optional;

/**
 * Every read here excludes logically deleted books, explicitly rather than through an
 * {@code @SQLRestriction}, because the archive has to read them. {@code findById} and
 * {@code existsById} are unfiltered and must not be used on an API path, except by the
 * lifecycle history, which answers for deleted books too. So does {@link #findDeletedForArchive}.
 *
 * <p>There is no unique index on isbn or title, so the uniqueness lookups must be filtered
 * too: a recreated title would otherwise raise {@code NonUniqueResultException}.
 */
public interface BookRepository extends JpaRepository<Book, Long>, JpaSpecificationExecutor<Book> {
    Optional<Book> findByIdAndDeletedAtIsNull(Long id);
    Optional<Book> findByIsbn10AndDeletedAtIsNull(String isbn10);
    Optional<Book> findByIsbn13AndDeletedAtIsNull(String isbn13);
    Optional<Book> findByTitleIgnoreCaseAndDeletedAtIsNull(String title);

    /**
     * How many *other* live books a cover key is shared with. Covers are keyed by the same
     * ISBN precedence the application uses (ISBN-13 first, ISBN-10 as fallback), so a
     * cover may only be moved or deleted when this returns 0.
     */
    @Query("""
            SELECT COUNT(b) FROM Book b
            WHERE b.id <> :bookId
              AND b.deletedAt IS NULL
              AND COALESCE(NULLIF(b.isbn13, ''), NULLIF(b.isbn10, '')) = :isbn
            """)
    long countOtherBooksSharingIsbn(@Param("bookId") Long bookId, @Param("isbn") String isbn);

    @Query(value = """
            SELECT new net.booksnap.domain.lifecycle.api.dto.DeletedBookResponse(
                b.id, b.title, b.deletedAt,
                (SELECT e.actor FROM LifecycleEvent e WHERE e.id =
                    (SELECT max(d.id) FROM LifecycleEvent d WHERE d.bookId = b.id AND d.type = :deleted)),
                (SELECT count(c) FROM Copy c WHERE c.book = b AND c.deletedAt = b.deletedAt))
            FROM Book b WHERE b.deletedAt IS NOT NULL
            ORDER BY b.deletedAt DESC, b.id DESC
            """,
           countQuery = "SELECT count(b) FROM Book b WHERE b.deletedAt IS NOT NULL")
    Page<DeletedBookResponse> findDeletedForArchive(@Param("deleted") LifecycleEventType deleted, Pageable pageable);
}
