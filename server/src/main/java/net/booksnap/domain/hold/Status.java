package net.booksnap.domain.hold;

import java.util.List;

public enum Status {
    // Queued: every copy of the book is out, no copy assigned yet
    pending,
    // A copy has been set aside, waiting to be collected before end_date
    active,
    expired,
    fulfilled;

    public static final List<Status> ACTIVE = List.of(pending, active);
}
