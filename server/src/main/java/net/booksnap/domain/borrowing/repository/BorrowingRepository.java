package net.booksnap.domain.borrowing.repository;

import net.booksnap.domain.borrowing.Borrowing;
import net.booksnap.domain.borrowing.Status;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.Collection;
import java.util.Optional;

public interface BorrowingRepository extends JpaRepository<Borrowing, Long> {
    Optional<Borrowing> findFirstByCopyIdAndStatusIn(Long copyId, Collection<Status> statuses);

    @Query("""
            SELECT b FROM Borrowing b
            WHERE b.status IN :statuses
              AND (LOWER(b.user.firstName) LIKE LOWER(CONCAT('%', :q, '%'))
                OR LOWER(b.user.lastName) LIKE LOWER(CONCAT('%', :q, '%'))
                OR LOWER(b.user.email) LIKE LOWER(CONCAT('%', :q, '%'))
                OR CAST(b.user.id AS string) LIKE CONCAT('%', :q, '%'))
            """)
    Page<Borrowing> findByStatusInAndUserMatching(@Param("statuses") Collection<Status> statuses,
                                                  @Param("q") String q,
                                                  Pageable pageable);

    /**
     * Flips every borrowing whose return date has passed, in one statement.
     *
     * <p>The audit columns are set by hand because a bulk {@code @Modifying} query is
     * translated straight to SQL: no entity is loaded, {@code AuditingEntityListener}
     * never runs, and {@code AuditorAwareImpl} is never consulted. Left alone, the rows
     * would keep naming the librarian who registered the loan and the date they did so —
     * a change attributed to somebody who did not make it, which is worse than no
     * attribution at all. The caller passes {@code Auditable.SYSTEM_AUDITOR}, the same
     * value the auditor would have supplied off a request thread.
     */
    @Modifying
    @Query("""
            UPDATE Borrowing b
            SET b.status = :overdue,
                b.lastModifiedBy = :auditor,
                b.lastModifiedDate = :now
            WHERE b.status = :borrowed AND b.endDate < :today
            """)
    int markOverdue(@Param("borrowed") Status borrowed,
                    @Param("overdue") Status overdue,
                    @Param("today") LocalDate today,
                    @Param("auditor") String auditor,
                    @Param("now") LocalDateTime now);
}
