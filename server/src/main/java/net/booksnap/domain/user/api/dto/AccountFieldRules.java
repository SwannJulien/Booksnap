package net.booksnap.domain.user.api.dto;

final class AccountFieldRules {

    static final String REQUIRED = "This field is required.";
    static final String INVALID_EMAIL = "Enter a valid email address.";
    static final String NAME_TOO_LONG = "Names must be at most 255 characters.";

    // The `email` domain of the database refuses what @Email accepts (an accent), and User.email's
    // @Email refuses what the domain accepts (a..b@x.com): only both together never reach a 500.
    static final String EMAIL_DOMAIN_PATTERN =
            "^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?"
                    + "(?:\\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$";

    private AccountFieldRules() {
    }

    static String trim(String value) {
        return value == null ? null : value.trim();
    }

    static String blankToNull(String value) {
        return value == null || value.isBlank() ? null : value.trim();
    }
}
