package net.booksnap.exception.user;

public class EmailTakenException extends RuntimeException {
    public EmailTakenException() {
        super("An account already uses this email.");
    }
}
