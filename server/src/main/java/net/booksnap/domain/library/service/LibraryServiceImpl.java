package net.booksnap.domain.library.service;

import net.booksnap.domain.library.Library;
import net.booksnap.domain.library.api.dto.LibraryNameRequest;
import net.booksnap.domain.library.api.dto.LibraryResponse;
import net.booksnap.domain.library.repository.LibraryRepository;
import net.booksnap.exception.library.LibraryNameTakenException;
import net.booksnap.exception.library.LibraryNotFoundException;
import org.hibernate.exception.ConstraintViolationException;
import org.springframework.dao.DataIntegrityViolationException;
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

    @Override
    @Transactional
    public LibraryResponse create(LibraryNameRequest request) {
        libraryRepository.findByName(request.name()).ifPresent(existing -> {
            throw new LibraryNameTakenException(existing.getName());
        });

        Library library = new Library();
        library.setName(request.name());
        return saveCatchingNameTaken(library);
    }

    @Override
    @Transactional
    public LibraryResponse rename(Long id, LibraryNameRequest request) {
        Library library = libraryRepository.findById(id).orElseThrow(() -> new LibraryNotFoundException(id));
        libraryRepository.findByNameAndIdNot(request.name(), id).ifPresent(existing -> {
            throw new LibraryNameTakenException(existing.getName());
        });

        // After the duplicate check: a dirty entity is flushed before the query runs, outside the try below.
        library.setName(request.name());
        return saveCatchingNameTaken(library);
    }

    private LibraryResponse saveCatchingNameTaken(Library library) {
        try {
            return LibraryResponse.of(libraryRepository.saveAndFlush(library));
        } catch (DataIntegrityViolationException ex) {
            // The violation aborts the transaction: the existing row can no longer be read here.
            if (ex.getCause() instanceof ConstraintViolationException violation
                    && "library_name_key".equals(violation.getConstraintName())) {
                throw new LibraryNameTakenException(library.getName());
            }
            throw ex;
        }
    }
}
