package net.booksnap.exception.library;

public class LibraryNotFoundException extends RuntimeException {
    public LibraryNotFoundException(Long libraryId) {
        super("Library not found: " + libraryId);
    }
}
