package net.booksnap.domain.library.service;

import net.booksnap.domain.library.api.dto.LibraryNameRequest;
import net.booksnap.domain.library.api.dto.LibraryResponse;

import java.util.List;

public interface LibraryService {
    List<LibraryResponse> findAll();

    LibraryResponse create(LibraryNameRequest request);

    LibraryResponse rename(Long id, LibraryNameRequest request);
}
