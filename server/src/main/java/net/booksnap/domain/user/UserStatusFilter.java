package net.booksnap.domain.user;

public enum UserStatusFilter {
    active,
    deactivated,
    all;

    public boolean includesActive() {
        return this == active || this == all;
    }

    public boolean includesDeactivated() {
        return this == deactivated || this == all;
    }
}
