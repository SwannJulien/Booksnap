package net.booksnap.domain.copy;

public enum Status {
    available,
    borrowed,
    on_hold,
    lost,
    damaged,
    removed;

    public boolean isBorrowable() {
        return this == available || this == damaged;
    }

    public boolean allowsManualChangeTo(Status target) {
        return (this == available && target == lost) || (this == lost && target == available);
    }
}
