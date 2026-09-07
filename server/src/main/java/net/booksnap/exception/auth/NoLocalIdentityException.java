package net.booksnap.exception.auth;

/**
 * The account has no {@code local} identity, so there is no password of ours to change.
 *
 * <p>A conflict rather than a 404: the account exists and the caller is signed in, but its
 * credentials live somewhere else. From phase 7 that somewhere is Microsoft, and the
 * message has to say so — an unexplained failure on this screen reads as a bug, and the
 * user retries instead of going where their password actually lives.
 */
public class NoLocalIdentityException extends RuntimeException {
    public NoLocalIdentityException() {
        super("This account does not sign in with a password managed by BookSnap");
    }
}
