package net.booksnap.exception.common;

import net.booksnap.domain.borrowing.Borrowing;
import net.booksnap.domain.borrowing.Status;

import java.time.LocalDate;

public record BlockingBorrowing(
        Long id,
        Long copyId,
        String copyIdentificationCode,
        String firstName,
        String lastName,
        Status status,
        LocalDate startDate,
        LocalDate endDate
) {
    public static BlockingBorrowing from(Borrowing borrowing) {
        return new BlockingBorrowing(
                borrowing.getId(),
                borrowing.getCopy().getId(),
                borrowing.getCopy().getIdentificationCode(),
                borrowing.getUser().getFirstName(),
                borrowing.getUser().getLastName(),
                borrowing.getStatus(),
                borrowing.getStartDate(),
                borrowing.getEndDate());
    }
}
