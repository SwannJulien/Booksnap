package net.booksnap.domain.borrowing;

import java.util.List;

public enum Status {
    borrowed,
    returned,
    overdue;

    public static final List<Status> ACTIVE = List.of(borrowed, overdue);
}
