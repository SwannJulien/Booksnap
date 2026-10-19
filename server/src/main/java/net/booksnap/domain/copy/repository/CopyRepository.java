package net.booksnap.domain.copy.repository;

import net.booksnap.domain.copy.Copy;
import net.booksnap.domain.copy.Status;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Optional;

public interface CopyRepository extends JpaRepository<Copy, Long> {

    Optional<Copy> findByIdAndDeletedAtIsNull(Long id);

    @Query("SELECT c FROM Copy c " +
           "LEFT JOIN FETCH c.book " +
           "LEFT JOIN FETCH c.library " +
           "WHERE c.book.id = :bookId AND c.deletedAt IS NULL")
    List<Copy> findAllByBookId(@Param("bookId") Long bookId);

    long countByBookIdAndDeletedAtIsNull(Long bookId);

    long countByBookIdAndStatusAndDeletedAtIsNull(Long bookId, Status status);

    @Query("SELECT c.book.id, COUNT(c), SUM(CASE WHEN c.status = :availableStatus THEN 1 ELSE 0 END) " +
           "FROM Copy c WHERE c.book.id IN :bookIds AND c.deletedAt IS NULL GROUP BY c.book.id")
    List<Object[]> countCopiesByBookIds(@Param("bookIds") List<Long> bookIds,
                                        @Param("availableStatus") Status availableStatus);
}
