package net.booksnap.domain.user.api.dto;

import net.booksnap.domain.book.KeyStage;
import net.booksnap.domain.user.Role;
import net.booksnap.domain.user.User;

public record UserResponse(
        Long id,
        String firstName,
        String lastName,
        String email,
        Role role,
        boolean active,
        KeyStage keyStage,
        String house,
        String parentEmail,
        String sex
) {
    public static UserResponse from(User user) {
        return new UserResponse(
                user.getId(),
                user.getFirstName(),
                user.getLastName(),
                user.getEmail(),
                user.getRole(),
                Boolean.TRUE.equals(user.getIsActive()),
                user.getKeyStage(),
                user.getHouse(),
                user.getParentEmail(),
                user.getSex());
    }
}
