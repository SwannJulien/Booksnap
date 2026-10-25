package net.booksnap.domain.book.api;

import net.booksnap.domain.book.CatalogVisibility;
import net.booksnap.domain.book.KeyStage;
import net.booksnap.domain.book.api.dto.BookResponse;
import net.booksnap.domain.book.api.dto.BookSearchFilter;
import net.booksnap.domain.book.api.dto.CreateBookRequest;
import net.booksnap.domain.book.api.dto.CreateBookResponse;
import net.booksnap.domain.book.api.dto.UpdateBookRequest;
import net.booksnap.domain.book.service.BookService;
import net.booksnap.domain.common.dto.ListResponse;
import net.booksnap.domain.common.dto.PagedResponse;
import net.booksnap.domain.copy.Status;
import net.booksnap.domain.copy.api.dto.CopyResponse;
import net.booksnap.domain.lifecycle.api.dto.LifecycleEventResponse;
import net.booksnap.domain.lifecycle.service.LifecycleHistoryService;
import org.springframework.data.domain.Pageable;
import org.springframework.data.web.PageableDefault;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.Authentication;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.*;
import jakarta.validation.Valid;

import java.util.Arrays;
import java.util.List;

@RestController
@Validated
@RequestMapping("api/v1/books")
public class BookController {

    private final BookService bookService;
    private final LifecycleHistoryService lifecycleHistoryService;

    public BookController(BookService bookService, LifecycleHistoryService lifecycleHistoryService) {
        this.bookService = bookService;
        this.lifecycleHistoryService = lifecycleHistoryService;
    }

    @PostMapping
    @ResponseStatus(code = HttpStatus.CREATED)
    public CreateBookResponse addNewBook(@RequestBody @Valid CreateBookRequest request) {
        return bookService.addBook(request);
    }

    @GetMapping("/search")
    public PagedResponse<BookResponse> searchBooks(
            @RequestParam(required = false) String q,
            @RequestParam(required = false) List<String> genres,
            @RequestParam(required = false) List<Status> copyStatus,
            @RequestParam(required = false) KeyStage keyStage,
            @PageableDefault(size = 10) Pageable pageable,
            Authentication authentication) {
        BookSearchFilter filter = new BookSearchFilter(q, genres, copyStatus, keyStage);
        return bookService.searchBooks(filter, pageable, CatalogVisibility.of(authentication));
    }

    @GetMapping("/{bookId}")
    public Object getBook(@PathVariable Long bookId,
                          @RequestParam(required = false) String fields,
                          Authentication authentication) {
        CatalogVisibility visibility = CatalogVisibility.of(authentication);
        if (fields == null || fields.trim().isEmpty()) {
            return bookService.findBookById(bookId, visibility);
        }
        // Keep existing field filtering for backward compatibility
        return bookService.findByIdWithFields(bookId, fields, visibility);
    }

    @GetMapping
    public PagedResponse<BookResponse> getBooks(
            @PageableDefault(page = 0, size = 10)
            Pageable pageable,
            Authentication authentication) {

        return PagedResponse.of(bookService.findAllBooks(pageable, CatalogVisibility.of(authentication)));
    }

    @GetMapping("/{bookId}/history")
    public PagedResponse<LifecycleEventResponse> getBookHistory(@PathVariable Long bookId,
                                                                @PageableDefault(size = 50) Pageable pageable) {
        return lifecycleHistoryService.findBookHistory(bookId, pageable);
    }

    @GetMapping("/{bookId}/copies")
    public ListResponse<CopyResponse> getAllBookCopies(@PathVariable Long bookId, Authentication authentication){
        return bookService.findAllBookCopies(bookId, CatalogVisibility.of(authentication));
    }

    @DeleteMapping("/{bookId}")
    @ResponseStatus(code = HttpStatus.NO_CONTENT)
    public void deleteBook(@PathVariable Long bookId){
        bookService.deleteBookById(bookId);
    }

    @PutMapping("/{bookId}")
    @ResponseStatus(code = HttpStatus.NO_CONTENT)
    public void updateBook(@PathVariable Long bookId,
                           @RequestBody @Valid UpdateBookRequest request) {
        bookService.updateBook(bookId, request);
    }

    @GetMapping("/key-stages")
    public List<String> getKeyStages() {
        return Arrays.stream(KeyStage.values())
                .map(KeyStage::name)
                .toList();
    }
}
