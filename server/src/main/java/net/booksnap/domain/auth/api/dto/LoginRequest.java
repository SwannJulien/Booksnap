package net.booksnap.domain.auth.api.dto;

import jakarta.validation.constraints.NotBlank;

public record LoginRequest(
        @NotBlank(message = "Email is required")
        String email,

        @NotBlank(message = "Password is required")
        String password
) {
    /**
     * The generated toString would print the password: one exception carrying the
     * request is enough for it to reach the logs.
     */
    @Override
    public String toString() {
        return "LoginRequest[email=" + email + "]";
    }
}
