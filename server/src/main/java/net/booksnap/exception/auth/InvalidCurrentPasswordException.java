package net.booksnap.exception.auth;

/**
 * The current password submitted alongside the new one does not match the stored hash.
 *
 * <p>Distinct from a failed login, and answered 400 rather than 401: the session is valid,
 * the caller is who they claim to be. What failed is the confirmation step that stands
 * between a workstation left unlocked at the counter and someone taking over the account.
 */
public class InvalidCurrentPasswordException extends RuntimeException {
    public InvalidCurrentPasswordException() {
        super("Current password is incorrect");
    }
}
