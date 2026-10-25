package net.booksnap.domain.lifecycle.repository;

import net.booksnap.domain.lifecycle.LifecycleEvent;
import net.booksnap.domain.lifecycle.LifecycleEventType;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.Repository;
import org.springframework.data.repository.query.Param;

import java.util.List;

/**
 * Read-only on purpose: the journal is append-only and written by triggers.
 *
 * <p>A {@code copy_status_changed} that touches {@code borrowed} or {@code on_hold} is the
 * twin of a business event of the same copy at the same instant. It is filtered out in the
 * {@code WHERE}, before pagination, so that pages and totals only count what is returned.
 */
public interface LifecycleEventRepository extends Repository<LifecycleEvent, Long> {

    String NOT_A_TWIN = """
            (e.type <> :statusChanged
             OR (COALESCE(function('jsonb_extract_path_text', e.detail, 'from'), '') NOT IN ('borrowed', 'on_hold')
                 AND COALESCE(function('jsonb_extract_path_text', e.detail, 'to'), '') NOT IN ('borrowed', 'on_hold'))
             OR NOT EXISTS (
                  SELECT 1 FROM LifecycleEvent t
                  WHERE t.copyId = e.copyId AND t.occurredAt = e.occurredAt AND t.type IN :business))
            """;

    String BOOK_TIMELINE = "FROM LifecycleEvent e WHERE e.bookId = :bookId AND " + NOT_A_TWIN;
    String COPY_TIMELINE = "FROM LifecycleEvent e WHERE e.copyId = :copyId AND " + NOT_A_TWIN;

    @Query(value = "SELECT e " + BOOK_TIMELINE + " ORDER BY e.occurredAt, e.id",
           countQuery = "SELECT count(e) " + BOOK_TIMELINE)
    Page<LifecycleEvent> findBookTimeline(@Param("bookId") Long bookId,
                                          @Param("statusChanged") LifecycleEventType statusChanged,
                                          @Param("business") List<LifecycleEventType> business,
                                          Pageable pageable);

    @Query(value = "SELECT e " + COPY_TIMELINE + " ORDER BY e.occurredAt, e.id",
           countQuery = "SELECT count(e) " + COPY_TIMELINE)
    Page<LifecycleEvent> findCopyTimeline(@Param("copyId") Long copyId,
                                          @Param("statusChanged") LifecycleEventType statusChanged,
                                          @Param("business") List<LifecycleEventType> business,
                                          Pageable pageable);
}
