package net.booksnap.domain.borrowing.service;

import lombok.extern.slf4j.Slf4j;
import net.booksnap.domain.Auditable;
import net.booksnap.domain.borrowing.Status;
import net.booksnap.domain.borrowing.repository.BorrowingRepository;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.time.LocalDateTime;

@Slf4j
@Component
public class OverdueBorrowingScheduler {

    private final BorrowingRepository borrowingRepository;

    public OverdueBorrowingScheduler(BorrowingRepository borrowingRepository) {
        this.borrowingRepository = borrowingRepository;
    }

    /**
     * Runs daily after midnight, and once at startup to catch up on days the server was
     * down.
     *
     * <p>These writes belong to nobody: a scheduled task has no request and no session,
     * and {@code SecurityContextHolder} is bound to the thread, so the context of whoever
     * happened to be signed in cannot leak in here. The rows are stamped
     * {@link Auditable#SYSTEM_AUDITOR} explicitly because the bulk update bypasses JPA
     * auditing altogether — see {@code BorrowingRepository.markOverdue}.
     */
    @Scheduled(cron = "0 5 0 * * *")
    @EventListener(ApplicationReadyEvent.class)
    @Transactional
    public void markOverdueBorrowings() {
        int updated = borrowingRepository.markOverdue(
                Status.borrowed, Status.overdue, LocalDate.now(),
                Auditable.SYSTEM_AUDITOR, LocalDateTime.now());
        if (updated > 0) {
            log.info("Marked {} borrowing(s) as overdue", updated);
        }
    }
}
