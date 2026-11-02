package net.booksnap.exception.user;

public class OwnAccountActionRefusedException extends RuntimeException {
    public OwnAccountActionRefusedException(String message) {
        super(message);
    }
}
