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
    private static final String REQUIRED = "This field is required.";
    private static final String INVALID_EMAIL = "Enter a valid email address.";
    private static final String NAME_TOO_LONG = "Names must be at most 255 characters.";

    // The `email` domain of the database refuses what @Email accepts (an accent), and User.email's
    // @Email refuses what the domain accepts (a..b@x.com): only both together never reach a 500.
    private static final String EMAIL_DOMAIN_PATTERN =
            "^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?"
                    + "(?:\\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$";

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

    private static String trim(String value) {
        return value == null ? null : value.trim();
    }

    private static String blankToNull(String value) {
        return value == null || value.isBlank() ? null : value.trim();
    }
}
