package net.booksnap.domain.library.service;

import net.booksnap.domain.library.api.dto.LibraryResponse;
import net.booksnap.domain.library.repository.LibraryRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

@Service
@Transactional(readOnly = true)
public class LibraryServiceImpl implements LibraryService {

    private final LibraryRepository libraryRepository;

    public LibraryServiceImpl(LibraryRepository libraryRepository) {
        this.libraryRepository = libraryRepository;
    }

    @Override
    public List<LibraryResponse> findAll() {
        return libraryRepository.findAllOrderByNameIgnoreCase().stream()
                .map(LibraryResponse::of)
                .toList();
    }
}
