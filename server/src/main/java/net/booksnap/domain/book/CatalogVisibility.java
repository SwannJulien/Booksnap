package net.booksnap.domain.book;

import org.springframework.security.core.Authentication;
import org.springframework.security.core.GrantedAuthority;

public enum CatalogVisibility {
    STAFF,
    STUDENT;

    // Read from the authorities, anything that is not staff counts as a student
    public static CatalogVisibility of(Authentication authentication) {
        if (authentication == null) {
            return STUDENT;
        }
        boolean staff = authentication.getAuthorities().stream()
                .map(GrantedAuthority::getAuthority)
                .anyMatch(role -> role.equals("ROLE_LIBRARIAN") || role.equals("ROLE_ADMIN"));
        return staff ? STAFF : STUDENT;
    }

    public boolean includesLost() {
        return this == STAFF;
    }
}
