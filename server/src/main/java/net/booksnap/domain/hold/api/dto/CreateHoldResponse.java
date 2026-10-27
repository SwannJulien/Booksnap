package net.booksnap.domain.hold.api.dto;

import net.booksnap.domain.hold.Status;

import java.time.LocalDate;

public record CreateHoldResponse(
        Long id,
        Long bookId,
        Long userId,
        Status status,
        LocalDate startDate,
        LocalDate endDate,
        // Position in the pending queue for this book at this library, 1 being the next to be served
        long queuePosition
) {}
