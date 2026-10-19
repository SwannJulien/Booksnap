package net.booksnap.domain.hold.repository;

import net.booksnap.domain.hold.Hold;
import net.booksnap.domain.hold.Status;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.EntityGraph;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.LocalDateTime;
import java.util.Collection;
import java.util.List;
import java.util.Optional;

public interface HoldRepository extends JpaRepository<Hold, Long> {

    // Mirrors BorrowingRepository#findByStatusInAndUserMatching, so the holds list can
    // be searched by the same student fields as the loans list
    @Query("""
            SELECT h FROM Hold h
            WHERE h.status IN :statuses
              AND (LOWER(h.user.firstName) LIKE LOWER(CONCAT('%', :q, '%'))
                OR LOWER(h.user.lastName) LIKE LOWER(CONCAT('%', :q, '%'))
                OR LOWER(h.user.email) LIKE LOWER(CONCAT('%', :q, '%'))
                OR CAST(h.user.id AS string) LIKE CONCAT('%', :q, '%'))
            """)
    Page<Hold> findByStatusInAndUserMatching(@Param("statuses") Collection<Status> statuses,
                                             @Param("q") String q,
                                             Pageable pageable);

    // Queue head: the student who has been waiting longest for this book
    Optional<Hold> findFirstByBookIdAndStatusOrderByCreatedDateAsc(Long bookId, Status status);

    // The hold a copy is currently being kept for, so its owner can still borrow it
    Optional<Hold> findFirstByCopyIdAndStatus(Long copyId, Status status);

    // Pending holds that waited too long without ever getting a copy
    List<Hold> findByStatusAndCreatedDateBefore(Status status, LocalDateTime cutoff);

    // A user may only queue once per book (mirrors the uq_hold_one_active_per_user_book index)
    boolean existsByUserIdAndBookIdAndStatusIn(Long userId, Long bookId, List<Status> statuses);

    // Size of the pending queue for a book, used to report a new hold's position
    long countByBookIdAndStatus(Long bookId, Status status);

    @EntityGraph(attributePaths = {"user", "copy"})
    List<Hold> findByCopyIdAndStatusInOrderByCreatedDateAsc(Long copyId, Collection<Status> statuses);

    @EntityGraph(attributePaths = {"user", "copy"})
    List<Hold> findByBookIdAndStatusInOrderByCreatedDateAsc(Long bookId, Collection<Status> statuses);
}
