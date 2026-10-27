package net.booksnap.domain.hold.api.dto;

import jakarta.validation.constraints.NotNull;

public record CreateHoldRequest(
        @NotNull(message = "User ID is required")
        Long userId,

        @NotNull(message = "Copy ID is required")
        Long copyId
) {}
