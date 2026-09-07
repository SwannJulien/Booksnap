package net.booksnap.domain.auth.api.dto;

import net.booksnap.domain.user.Role;

public record AuthenticatedUserResponse(
        Long id,
        String firstName,
        String lastName,
        String email,
        Role role
) {}
