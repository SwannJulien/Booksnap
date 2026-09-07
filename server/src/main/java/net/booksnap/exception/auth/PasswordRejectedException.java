package net.booksnap.exception.auth;

/**
 * The proposed new password does not satisfy the rules — too short, or identical to the
 * one in use. The message names the unmet rule so the form can show it as is.
 */
public class PasswordRejectedException extends RuntimeException {
    public PasswordRejectedException(String message) {
        super(message);
    }
}
