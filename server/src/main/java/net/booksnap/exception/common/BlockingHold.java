package net.booksnap.exception.common;

import net.booksnap.domain.copy.Copy;
import net.booksnap.domain.hold.Hold;
import net.booksnap.domain.hold.Status;

import java.time.LocalDate;
import java.time.LocalDateTime;

public record BlockingHold(
        Long id,
        Long copyId,
        String copyIdentificationCode,
        String firstName,
        String lastName,
        Status status,
        LocalDateTime createdDate,
        LocalDate endDate
) {
    public static BlockingHold from(Hold hold) {
        Copy copy = hold.getCopy();
        return new BlockingHold(
                hold.getId(),
                copy == null ? null : copy.getId(),
                copy == null ? null : copy.getIdentificationCode(),
                hold.getUser().getFirstName(),
                hold.getUser().getLastName(),
                hold.getStatus(),
                hold.getCreatedDate(),
                hold.getEndDate());
    }
}
