package net.booksnap.domain.lifecycle;

import java.util.List;

public enum LifecycleEventType {
    book_created,
    book_updated,
    book_deleted,
    copy_created,
    copy_updated,
    copy_status_changed,
    copy_deleted,
    borrowed,
    overdue,
    returned,
    hold_placed,
    hold_promoted,
    hold_expired,
    hold_fulfilled;

    public static final List<LifecycleEventType> BUSINESS =
            List.of(borrowed, overdue, returned, hold_placed, hold_promoted, hold_expired, hold_fulfilled);
}
