package net.booksnap.domain.hold.service;

import lombok.extern.slf4j.Slf4j;
import net.booksnap.domain.hold.Status;
import net.booksnap.domain.hold.repository.HoldRepository;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.time.LocalDate;

@Slf4j
@Component
public class HoldExpirationScheduler {

    private final HoldRepository holdRepository;
    private final HoldService holdService;

    public HoldExpirationScheduler(HoldRepository holdRepository, HoldService holdService) {
        this.holdRepository = holdRepository;
        this.holdService = holdService;
    }

    /**
     * Runs daily after midnight, and once at startup to catch up on days the server was
     * down.
     *
     * <p>Deliberately not {@code @Transactional}: each {@link HoldService#expireHold} call
     * commits on its own, so one failing hold cannot roll back the others — nor, from the
     * startup listener, prevent the application from starting. It is not a bulk UPDATE
     * either: promoting the next student in line lives in the service, not in a trigger.
     * Writes are stamped as the system because the thread has no authenticated user.
     */
    @Scheduled(cron = "0 5 0 * * *")
    @EventListener(ApplicationReadyEvent.class)
    public void expireUncollectedHolds() {
        int expired = 0;
        for (Long holdId : holdRepository.findIdsByStatusAndEndDateBefore(Status.active, LocalDate.now())) {
            try {
                if (holdService.expireHold(holdId)) {
                    expired++;
                }
            } catch (RuntimeException e) {
                log.error("Could not expire hold {}", holdId, e);
            }
        }
        if (expired > 0) {
            log.info("{} hold(s) expired", expired);
        }
    }
}
