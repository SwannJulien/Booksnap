package net.booksnap.exception.hold;

public class BookHasAvailableCopyException extends RuntimeException {
    public BookHasAvailableCopyException(String libraryName) {
        super("A copy of this book is available at " + libraryName + ": borrow it instead.");
    }
}
