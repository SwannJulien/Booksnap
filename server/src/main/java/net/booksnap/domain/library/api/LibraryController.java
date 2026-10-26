package net.booksnap.domain.library.api;

import net.booksnap.domain.library.api.dto.LibraryResponse;
import net.booksnap.domain.library.service.LibraryService;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

@RestController
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
}
