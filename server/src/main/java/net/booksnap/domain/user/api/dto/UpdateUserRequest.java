package net.booksnap.domain.user.api.dto;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import net.booksnap.domain.book.KeyStage;
import net.booksnap.domain.user.Sex;

import static net.booksnap.domain.user.api.dto.AccountFieldRules.EMAIL_DOMAIN_PATTERN;
import static net.booksnap.domain.user.api.dto.AccountFieldRules.INVALID_EMAIL;
import static net.booksnap.domain.user.api.dto.AccountFieldRules.NAME_TOO_LONG;
import static net.booksnap.domain.user.api.dto.AccountFieldRules.REQUIRED;
import static net.booksnap.domain.user.api.dto.AccountFieldRules.blankToNull;
import static net.booksnap.domain.user.api.dto.AccountFieldRules.trim;

// No role component: a `role` in the body is ignored, and the account keeps the one it has.
public record UpdateUserRequest(
        @NotBlank(message = REQUIRED) @Size(max = 255, message = NAME_TOO_LONG) String firstName,
        @NotBlank(message = REQUIRED) @Size(max = 255, message = NAME_TOO_LONG) String lastName,
        @NotBlank(message = REQUIRED)
        @Email(message = INVALID_EMAIL)
        @Pattern(regexp = EMAIL_DOMAIN_PATTERN, message = INVALID_EMAIL) String email,
        KeyStage keyStage,
        String house,
        @Email(message = INVALID_EMAIL)
        @Pattern(regexp = EMAIL_DOMAIN_PATTERN, message = INVALID_EMAIL) String parentEmail,
        Sex sex
) {

    public UpdateUserRequest {
        firstName = trim(firstName);
        lastName = trim(lastName);
        email = trim(email);
        house = blankToNull(house);
        parentEmail = blankToNull(parentEmail);
    }
}
