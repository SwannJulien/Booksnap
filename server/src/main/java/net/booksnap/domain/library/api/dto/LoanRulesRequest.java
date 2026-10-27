package net.booksnap.domain.library.api.dto;

import jakarta.validation.constraints.AssertTrue;

// Fields are Object because Jackson silently truncates 1.5 to 1 when binding an Integer.
public record LoanRulesRequest(Object borrowingDurationDays, Object pickupWindowDays) {

    private static final int MIN_DAYS = 1;
    private static final int MAX_DAYS = 365;

    @AssertTrue(message = "Borrowing duration and pickup window must be whole numbers of days between 1 and 365.")
    public boolean isWholeDaysInRange() {
        return isWholeDaysInRange(borrowingDurationDays) && isWholeDaysInRange(pickupWindowDays);
    }

    public int borrowingDays() {
        return (Integer) borrowingDurationDays;
    }

    public int pickupDays() {
        return (Integer) pickupWindowDays;
    }

    private static boolean isWholeDaysInRange(Object value) {
        return value instanceof Integer days && days >= MIN_DAYS && days <= MAX_DAYS;
    }
}
