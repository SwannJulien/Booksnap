package net.booksnap.domain.user.api.dto;

import jakarta.validation.constraints.NotNull;
import net.booksnap.domain.book.KeyStage;
import net.booksnap.domain.user.Role;

import static net.booksnap.domain.user.api.dto.AccountFieldRules.REQUIRED;

public record ChangeRoleRequest(@NotNull(message = REQUIRED) Role role, KeyStage keyStage) {
}
