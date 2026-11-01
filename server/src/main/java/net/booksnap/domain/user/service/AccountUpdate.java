package net.booksnap.domain.user.service;

import net.booksnap.domain.user.api.dto.UserResponse;

public record AccountUpdate(UserResponse account, boolean emailChanged) {
}
