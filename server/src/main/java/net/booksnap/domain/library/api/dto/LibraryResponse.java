package net.booksnap.domain.library.api.dto;

import net.booksnap.domain.library.Library;

public record LibraryResponse(Long id, String name) {
    public static LibraryResponse of(Library library) {
        return new LibraryResponse(library.getId(), library.getName());
    }
}
