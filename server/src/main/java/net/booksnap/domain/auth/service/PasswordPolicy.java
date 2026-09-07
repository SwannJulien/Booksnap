package net.booksnap.domain.auth.service;

import net.booksnap.exception.auth.PasswordRejectedException;
import org.springframework.stereotype.Component;

import java.util.Optional;

/**
 * The single place where a password is judged acceptable.
 *
 * <p>Three callers need this rule and none of them may disagree with the others: the
 * bootstrap runner refusing to create a weak administrator, the password change of
 * US-008, and the invitations of phase 4. A rule duplicated across them drifts — the
 * visible symptom being a password the account creation accepts and the change refuses,
 * or the reverse.
 *
 * <p>{@link #violation} and {@link #validate} exist for the two shapes that call site
 * takes: a startup check that has no request to answer and stops the application, and a
 * request that must come back as a 400. Both read the same rule.
 */
@Component
public class PasswordPolicy {

    /**
     * An account reachable from the school network is not the place for a memorable
     * password. Twelve characters with nothing else imposed is a deliberate trade: length
     * carries more entropy than a character-class rule, which mostly produces
     * {@code Password1!}.
     */
    public static final int MINIMUM_LENGTH = 12;

    /**
     * Describes the rule this password fails, in terms usable as an error message.
     *
     * @return the unmet rule, or empty when the password is acceptable
     */
    public Optional<String> violation(String password) {
        if (password == null || password.length() < MINIMUM_LENGTH) {
            return Optional.of("Password must be at least " + MINIMUM_LENGTH + " characters long");
        }

        return Optional.empty();
    }

    /**
     * Same rule, raised as the 400 an endpoint owes its caller.
     *
     * <p>The message names the rule and nothing else. Listing what was actually submitted,
     * or how close it came, would help whoever is holding a stolen session more than it
     * helps the account's owner.
     */
    public void validate(String password) {
        violation(password).ifPresent(rule -> {
            throw new PasswordRejectedException(rule);
        });
    }
}
