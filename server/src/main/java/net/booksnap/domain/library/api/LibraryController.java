package net.booksnap.domain.library.api;

import jakarta.validation.Valid;
import net.booksnap.domain.library.api.dto.LibraryNameRequest;
import net.booksnap.domain.library.api.dto.LibraryResponse;
import net.booksnap.domain.library.service.LibraryService;
import org.springframework.http.HttpStatus;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

@RestController
@Validated
@RequestMapping("api/v1/libraries")
public class LibraryController {

    private final LibraryService libraryService;

    public LibraryController(LibraryService libraryService) {
        this.libraryService = libraryService;
    }

    @GetMapping
    public List<LibraryResponse> getLibraries() {
        return libraryService.findAll();
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public LibraryResponse createLibrary(@RequestBody @Valid LibraryNameRequest request) {
        return libraryService.create(request);
    }
}
