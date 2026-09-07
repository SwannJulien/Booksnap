package net.booksnap.domain.auth.api.dto;

import jakarta.validation.constraints.NotBlank;

/**
 * No user identifier, and that omission is the security property: the account whose
 * password changes is the one the session names. A {@code userId} accepted here would turn
 * this endpoint into a way of changing somebody else's password — the defect described for
 * {@code POST /holds} in the access rules, §4.3.
 *
 * <p>The length rule is not expressed as a constraint annotation either. It belongs to
 * {@code PasswordPolicy}, which the bootstrap and the phase-4 invitations share; declaring
 * a {@code @Size} here would be a second copy of it, free to drift.
 */
public record ChangePasswordRequest(
        @NotBlank(message = "Current password is required")
        String currentPassword,

        @NotBlank(message = "New password is required")
        String newPassword
) {
    /**
     * The generated toString would print both passwords: one exception carrying the
     * request is enough for them to reach the logs.
     */
    @Override
    public String toString() {
        return "ChangePasswordRequest[]";
    }
}
