package net.booksnap.exception.library;

public class LibraryNameTakenException extends RuntimeException {
    public LibraryNameTakenException(String existingName) {
        super(String.format("A library named \"%s\" already exists.", existingName));
    }
}
