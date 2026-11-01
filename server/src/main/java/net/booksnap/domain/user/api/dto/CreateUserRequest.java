package net.booksnap.domain.user.api.dto;

import jakarta.validation.constraints.AssertTrue;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import net.booksnap.domain.book.KeyStage;
import net.booksnap.domain.user.Role;
import net.booksnap.domain.user.Sex;

import static net.booksnap.domain.user.api.dto.AccountFieldRules.EMAIL_DOMAIN_PATTERN;
import static net.booksnap.domain.user.api.dto.AccountFieldRules.INVALID_EMAIL;
import static net.booksnap.domain.user.api.dto.AccountFieldRules.NAME_TOO_LONG;
import static net.booksnap.domain.user.api.dto.AccountFieldRules.REQUIRED;
import static net.booksnap.domain.user.api.dto.AccountFieldRules.blankToNull;
import static net.booksnap.domain.user.api.dto.AccountFieldRules.trim;

public record CreateUserRequest(
        @NotNull(message = REQUIRED) Role role,
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

    // Trimmed here so that @NotBlank judges the value that will be stored. A blank parent email
    // becomes null: the `email` domain would refuse an empty string.
    public CreateUserRequest {
        firstName = trim(firstName);
        lastName = trim(lastName);
        email = trim(email);
        house = blankToNull(house);
        parentEmail = blankToNull(parentEmail);
    }

    @AssertTrue(message = "Key stage is required for a student.")
    boolean isKeyStageGivenForStudent() {
        return role != Role.user || keyStage != null;
    }
}
