package net.booksnap.domain.book.service;

import net.booksnap.domain.book.CatalogVisibility;
import net.booksnap.domain.book.api.dto.BookResponse;
import net.booksnap.domain.book.api.dto.BookSearchFilter;
import net.booksnap.domain.book.api.dto.CreateBookRequest;
import net.booksnap.domain.book.api.dto.CreateBookResponse;
import net.booksnap.domain.common.dto.ListResponse;
import net.booksnap.domain.common.dto.PagedResponse;
import net.booksnap.domain.copy.api.dto.CopyResponse;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;

public interface BookService {
    CreateBookResponse addBook(CreateBookRequest createBookRequest);

    BookResponse findBookById(Long bookId, CatalogVisibility visibility);

    Object findByIdWithFields(Long bookId, String fields, CatalogVisibility visibility);

    void deleteBookById(Long bookId);

    void updateBook(Long bookId, CreateBookRequest request);

    Page<BookResponse> findAllBooks(Pageable pageable, CatalogVisibility visibility);

    ListResponse<CopyResponse> findAllBookCopies(Long bookId, CatalogVisibility visibility);

    PagedResponse<BookResponse> searchBooks(BookSearchFilter filter, Pageable pageable, CatalogVisibility visibility);
}
