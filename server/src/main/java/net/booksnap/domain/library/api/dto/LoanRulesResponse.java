package net.booksnap.domain.library.api.dto;

import net.booksnap.domain.library.Library;

public record LoanRulesResponse(Long id, String name, Integer borrowingDurationDays, Integer pickupWindowDays) {
    public static LoanRulesResponse of(Library library) {
        return new LoanRulesResponse(
                library.getId(), library.getName(), library.getBorrowingDurationDays(), library.getPickupWindowDays());
    }
}
