package net.booksnap.domain.copy.repository;

import net.booksnap.domain.copy.Copy;
import net.booksnap.domain.copy.Status;
import net.booksnap.domain.lifecycle.LifecycleEventType;
import net.booksnap.domain.lifecycle.api.dto.DeletedCopyResponse;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Optional;

public interface CopyRepository extends JpaRepository<Copy, Long> {

    Optional<Copy> findByIdAndDeletedAtIsNull(Long id);

    // Hibernate rewrites every column on update, so a concurrent borrowing's 'borrowed'
    // would be overwritten by a stale status read before the lock
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("SELECT c FROM Copy c WHERE c.id = :id AND c.deletedAt IS NULL")
    Optional<Copy> findByIdAndDeletedAtIsNullForUpdate(@Param("id") Long id);

    @Query("SELECT c FROM Copy c " +
           "LEFT JOIN FETCH c.book " +
           "LEFT JOIN FETCH c.library " +
           "WHERE c.book.id = :bookId AND c.deletedAt IS NULL")
    List<Copy> findAllByBookId(@Param("bookId") Long bookId);

    // Same read as findAllByBookId for the catalog, minus the lost copies a student must not see
    @Query("SELECT c FROM Copy c " +
           "LEFT JOIN FETCH c.book " +
           "LEFT JOIN FETCH c.library " +
           "WHERE c.book.id = :bookId AND c.deletedAt IS NULL " +
           "AND (:includeLost = true OR c.status <> :lostStatus)")
    List<Copy> findVisibleByBookId(@Param("bookId") Long bookId,
                                   @Param("includeLost") boolean includeLost,
                                   @Param("lostStatus") Status lostStatus);

    boolean existsByBookIdAndDeletedAtIsNullAndStatusNot(Long bookId, Status status);

    long countByBookIdAndLibraryIdAndStatusAndDeletedAtIsNull(Long bookId, Long libraryId, Status status);

    @Query("SELECT c.book.id, COUNT(c), SUM(CASE WHEN c.status = :availableStatus THEN 1 ELSE 0 END) " +
           "FROM Copy c WHERE c.book.id IN :bookIds AND c.deletedAt IS NULL " +
           "AND (:includeLost = true OR c.status <> :lostStatus) GROUP BY c.book.id")
    List<Object[]> countCopiesByBookIds(@Param("bookIds") List<Long> bookIds,
                                        @Param("availableStatus") Status availableStatus,
                                        @Param("includeLost") boolean includeLost,
                                        @Param("lostStatus") Status lostStatus);

    // A copy taken away with its book carries the book's exact deleted_at; only the others are listed
    @Query(value = """
            SELECT new net.booksnap.domain.lifecycle.api.dto.DeletedCopyResponse(
                c.id, c.identificationCode, b.id, b.title, c.deletedAt,
                (SELECT e.actor FROM LifecycleEvent e WHERE e.id =
                    (SELECT max(d.id) FROM LifecycleEvent d WHERE d.copyId = c.id AND d.type = :deleted)))
            FROM Copy c JOIN c.book b
            WHERE c.deletedAt IS NOT NULL AND (b.deletedAt IS NULL OR c.deletedAt <> b.deletedAt)
            ORDER BY c.deletedAt DESC, c.id DESC
            """,
           countQuery = """
            SELECT count(c) FROM Copy c JOIN c.book b
            WHERE c.deletedAt IS NOT NULL AND (b.deletedAt IS NULL OR c.deletedAt <> b.deletedAt)
            """)
    Page<DeletedCopyResponse> findDeletedForArchive(@Param("deleted") LifecycleEventType deleted, Pageable pageable);
}
