package net.booksnap.domain.user.api.dto;

import net.booksnap.domain.user.Role;
import net.booksnap.domain.user.User;

public record UserResponse(
        Long id,
        String firstName,
        String lastName,
        String email,
        Role role,
        boolean active
) {
    public static UserResponse from(User user) {
        return new UserResponse(
                user.getId(),
                user.getFirstName(),
                user.getLastName(),
                user.getEmail(),
                user.getRole(),
                Boolean.TRUE.equals(user.getIsActive()));
    }
}
