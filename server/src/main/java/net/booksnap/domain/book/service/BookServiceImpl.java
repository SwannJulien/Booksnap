package net.booksnap.domain.book.service;

import lombok.extern.slf4j.Slf4j;
import net.booksnap.domain.book.Book;
import net.booksnap.domain.book.CatalogVisibility;
import net.booksnap.domain.book.api.dto.BookResponse;
import net.booksnap.domain.book.api.dto.BookSearchFilter;
import net.booksnap.domain.book.api.dto.CreateBookRequest;
import net.booksnap.domain.book.api.dto.CreateBookResponse;
import net.booksnap.domain.book.mapper.BookApiMapper;
import net.booksnap.domain.book.repository.BookRepository;
import net.booksnap.domain.book.repository.BookSpecifications;
import net.booksnap.domain.borrowing.Borrowing;
import net.booksnap.domain.borrowing.repository.BorrowingRepository;
import net.booksnap.domain.hold.Hold;
import net.booksnap.domain.hold.repository.HoldRepository;
import net.booksnap.exception.book.BookAlreadyExistsException;
import net.booksnap.exception.book.BookHasActiveLoanOrHoldException;
import net.booksnap.domain.common.dto.ListResponse;
import net.booksnap.domain.common.dto.PagedResponse;
import net.booksnap.domain.copy.Copy;
import net.booksnap.domain.copy.api.dto.CopyResponse;
import net.booksnap.domain.copy.api.dto.CountCopiesDTO;
import net.booksnap.domain.copy.mapper.CopyApiMapper;
import net.booksnap.domain.copy.repository.CopyRepository;
import net.booksnap.domain.copy.Status;
import net.booksnap.domain.cover.service.CoverService;
import net.booksnap.exception.book.BookNotFoundException;
import net.booksnap.exception.common.BadRequestException;
import net.booksnap.exception.dewey.DeweyCodeNotFoundException;
import net.booksnap.exception.dewey.FictionBookHasDeweyCodeException;
import net.booksnap.domain.library.Library;
import net.booksnap.utils.qr.QRCodeService;
import net.booksnap.utils.Utils;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.domain.Specification;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.Collections;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

@Slf4j
@Service
public class BookServiceImpl implements BookService {

    private final BookRepository bookRepository;
    private final BookApiMapper bookApiMapper;
    private final CopyRepository copyRepository;
    private final CopyApiMapper copyApiMapper;
    private final BorrowingRepository borrowingRepository;
    private final HoldRepository holdRepository;
    private final QRCodeService qrCodeService;
    private final Utils utils;
    private final CoverService coverService;

    public BookServiceImpl(BookRepository bookRepository,
                           BookApiMapper bookApiMapper,
                           CopyRepository copyRepository,
                           CopyApiMapper copyApiMapper,
                           BorrowingRepository borrowingRepository,
                           HoldRepository holdRepository,
                           QRCodeService qrCodeService,
                           Utils utils,
                           CoverService coverService) {
        this.bookRepository = bookRepository;
        this.bookApiMapper = bookApiMapper;
        this.copyRepository = copyRepository;
        this.copyApiMapper = copyApiMapper;
        this.borrowingRepository = borrowingRepository;
        this.holdRepository = holdRepository;
        this.qrCodeService = qrCodeService;
        this.utils = utils;
        this.coverService = coverService;
    }
    public CreateBookResponse addBook(CreateBookRequest createBookRequest) {
        try {
            checkIfBookAlreadyExists(createBookRequest);

            Book savedBook = createNewBook(createBookRequest);
            Copy savedCopy = createNewCopy(createBookRequest, savedBook);

            // Generate QR code image
            byte[] qrCode = qrCodeService.generateCopyQRCode(savedCopy);

            return new CreateBookResponse(
                qrCode,
                savedCopy.getIdentificationCode(),
                savedCopy.getId(),
                savedBook.getId()
            );

        } catch (BookAlreadyExistsException ex) {
            throw ex; // Re-throw to be handled by GlobalExceptionHandler
        } catch (Exception ex) {
            if (ex.getMessage().contains("non_fiction_requires_dewey")) {
                throw new FictionBookHasDeweyCodeException();
            } else if (ex.getMessage().contains("persistent instance references an unsaved transient instance of 'net.booksnap.entity.dewey.Dewey'")) {
                throw new DeweyCodeNotFoundException(createBookRequest.codeDewey());
            } else throw new BadRequestException(ex.getMessage());
        }
    }

    private Book createNewBook(CreateBookRequest createBookRequest) {
        Book book = bookApiMapper.createRequestToBookEntity(createBookRequest);
        Book savedBook = bookRepository.save(book);
        return savedBook;
    }

    private Copy createNewCopy(CreateBookRequest createBookRequest, Book savedBook) {
        Copy copy = new Copy();
        copy.setBook(savedBook);
        copy.setLibrary(new Library(createBookRequest.libraryId(), null));
        copy.setStatus(Status.available);
        copy.setSectionName(createBookRequest.sectionName());

        // Generate identification code from section name and first author's surname
        String identificationCode = qrCodeService.generateIdentificationCode(
            createBookRequest.sectionName(),
            createBookRequest.authors()
        );
        copy.setIdentificationCode(identificationCode);

        copy.setCreatedBy(savedBook.getCreatedBy());
        copy.setLastModifiedBy(savedBook.getLastModifiedBy());

        Copy savedCopy = copyRepository.save(copy);
        return savedCopy;
    }

    private void checkIfBookAlreadyExists(CreateBookRequest createBookRequest) {
        // Check if book already exists by ISBN10, ISBN13, or title
        if (createBookRequest.isbn10() != null && !createBookRequest.isbn10().isEmpty()) {
            bookRepository.findByIsbn10AndDeletedAtIsNull(createBookRequest.isbn10())
                .ifPresent(book -> {
                    throw new BookAlreadyExistsException("ISBN-10: " + createBookRequest.isbn10(), book.getId());
                });
        }

        if (createBookRequest.isbn13() != null && !createBookRequest.isbn13().isEmpty()) {
            bookRepository.findByIsbn13AndDeletedAtIsNull(createBookRequest.isbn13())
                .ifPresent(book -> {
                    throw new BookAlreadyExistsException("ISBN-13: " + createBookRequest.isbn13(), book.getId());
                });
        }

        bookRepository.findByTitleIgnoreCaseAndDeletedAtIsNull(createBookRequest.title())
            .ifPresent(book -> {
                throw new BookAlreadyExistsException("Title: " + createBookRequest.title(), book.getId());
            });
    }

    public BookResponse findBookById(Long bookId, CatalogVisibility visibility) {
        Book book = findVisibleBook(bookId, visibility);
        BookResponse response = bookApiMapper.bookEntityToBookResponse(book);
        return withCounts(response, batchLoadCopyCounts(List.of(bookId), visibility).get(bookId));
    }

    // A student gets a 404 for a book none of whose copies is on the shelf or could come back
    private Book findVisibleBook(Long bookId, CatalogVisibility visibility) {
        Book book = bookRepository.findByIdAndDeletedAtIsNull(bookId)
            .orElseThrow(() -> new BookNotFoundException(bookId));
        if (!visibility.includesLost()
                && !copyRepository.existsByBookIdAndDeletedAtIsNullAndStatusNot(bookId, Status.lost)) {
            throw new BookNotFoundException(bookId);
        }
        return book;
    }

    public Object findByIdWithFields(Long bookId, String fields, CatalogVisibility visibility) {
        BookResponse bookResponse = findBookById(bookId, visibility);
        try {
            return utils.filterFields(bookResponse, fields);
        } catch (Exception e) {
            throw new RuntimeException("Error filtering fields: " + e.getMessage(), e);
        }
    }

    public Page<BookResponse> findAllBooks(Pageable pageable, CatalogVisibility visibility) {
        Specification<Book> spec = Specification.where(BookSpecifications.notDeleted());
        if (!visibility.includesLost()) {
            spec = spec.and(BookSpecifications.hasLiveCopy());
        }

        Page<Book> bookPage = bookRepository.findAll(spec, pageable);
        return withCounts(bookPage, visibility);
    }

    public ListResponse<CopyResponse> findAllBookCopies(Long bookId, CatalogVisibility visibility) {
        // Validate book exists - will throw BookNotFoundException if not found
        Book book = findVisibleBook(bookId, visibility);
        log.debug("Finding copies for book: {} - {}", book.getId(), book.getTitle());
        
        List<Copy> copies = copyRepository.findVisibleByBookId(bookId, visibility.includesLost(), Status.lost);
        log.debug("Found {} copies for book ID: {}", copies.size(), bookId);
        
        List<CopyResponse> copyResponses = copies.stream()
                .map(copyApiMapper::copyToResponse)
                .toList();
        
        return new ListResponse<>(copyResponses);
    }

    // The cover is kept on purpose: the archive still shows the record
    @Transactional
    public void deleteBookById(Long bookId) {
        Book book = bookRepository.findByIdAndDeletedAtIsNull(bookId)
                .orElseThrow(() -> new BookNotFoundException(bookId));

        List<Borrowing> activeLoans = borrowingRepository.findByCopyBookIdAndStatusInOrderByEndDateAsc(
                bookId, net.booksnap.domain.borrowing.Status.ACTIVE);
        List<Hold> activeHolds = holdRepository.findByBookIdAndStatusInOrderByCreatedDateAsc(
                bookId, net.booksnap.domain.hold.Status.ACTIVE);

        if (!activeLoans.isEmpty() || !activeHolds.isEmpty()) {
            throw new BookHasActiveLoanOrHoldException(book, activeLoans, activeHolds);
        }

        LocalDateTime deletedAt = LocalDateTime.now();
        book.setDeletedAt(deletedAt);
        bookRepository.save(book);

        // findAllByBookId filters on the copy's own deletedAt, so it still works after
        // the book has been marked
        List<Copy> copies = copyRepository.findAllByBookId(bookId);
        copies.forEach(copy -> copy.setDeletedAt(deletedAt));
        copyRepository.saveAll(copies);
    }

    @Transactional
    public void updateBook(Long bookId, CreateBookRequest request) {
        Book book = bookRepository.findByIdAndDeletedAtIsNull(bookId)
                .orElseThrow(() -> new BookNotFoundException(bookId));

        String previousIsbn = primaryIsbn(book);

        // Update existing book properties instead of creating a new entity
        book.setTitle(request.title());
        book.setIsbn10(request.isbn10());
        book.setIsbn13(request.isbn13());
        book.setPublisher(request.publisher());
        book.setPublishingYear(request.publishingYear() != null ? Short.valueOf(request.publishingYear()) : null);
        book.setNumberOfPages(request.numberOfPages() != null ? request.numberOfPages().shortValue() :  null);
        book.setYearRecommendation(request.yearRecommendation());
        book.setIsFiction(request.isFiction());

        // Handle relationships through the mapper's after-mapping methods
        bookApiMapper.mapGenresToEntity(book, request);
        bookApiMapper.mapAuthorsToEntity(book, request);
        bookApiMapper.mapDeweyCategory(book, request);

        bookRepository.save(book);

        followCover(bookId, previousIsbn, primaryIsbn(book));
    }

    private void followCover(Long bookId, String previousIsbn, String currentIsbn) {
        if (previousIsbn == null || currentIsbn == null || previousIsbn.equals(currentIsbn)) {
            return;
        }

        if (bookRepository.countOtherBooksSharingIsbn(bookId, previousIsbn) > 0) {
            // Another book is still keyed to the old ISBN, so leave its cover in place
            coverService.copyCoverImage(previousIsbn, currentIsbn);
        } else {
            coverService.moveCoverImage(previousIsbn, currentIsbn);
        }
    }

    private static String primaryIsbn(Book book) {
        if (book.getIsbn13() != null && !book.getIsbn13().isBlank()) {
            return book.getIsbn13();
        }
        if (book.getIsbn10() != null && !book.getIsbn10().isBlank()) {
            return book.getIsbn10();
        }
        return null;
    }

    public PagedResponse<BookResponse> searchBooks(BookSearchFilter filter, Pageable pageable, CatalogVisibility visibility) {
        Specification<Book> spec = Specification.where(BookSpecifications.notDeleted());

        if (!visibility.includesLost()) {
            spec = spec.and(BookSpecifications.hasLiveCopy());
        }

        if (filter.q() != null && filter.q().trim().length() >= 2) {
            spec = spec.and(BookSpecifications.textSearch(filter.q().trim()));
        }

        if (filter.genres() != null && !filter.genres().isEmpty()) {
            spec = spec.and(BookSpecifications.hasGenres(filter.genres()));
        }

        if (filter.copyStatuses() != null && !filter.copyStatuses().isEmpty()) {
            List<Status> statuses = visibility.includesLost()
                    ? filter.copyStatuses()
                    : filter.copyStatuses().stream().filter(status -> status != Status.lost).toList();
            // An emptied list means "no result", not "no filter"
            spec = statuses.isEmpty()
                    ? spec.and((root, cq, cb) -> cb.disjunction())
                    : spec.and(BookSpecifications.hasCopyWithStatus(statuses));
        }

        if (filter.keyStage() != null) {
            spec = spec.and(BookSpecifications.hasKeyStage(filter.keyStage()));
        }

        // Use distinct to avoid duplicates from joins
        Specification<Book> distinctSpec = spec;
        spec = (root, cq, cb) -> {
            cq.distinct(true);
            return distinctSpec.toPredicate(root, cq, cb);
        };

        Page<Book> bookPage = bookRepository.findAll(spec, pageable);

        return PagedResponse.of(withCounts(bookPage, visibility));
    }

    // Batch-loaded to avoid N+1
    private Page<BookResponse> withCounts(Page<Book> bookPage, CatalogVisibility visibility) {
        List<Long> bookIds = bookPage.getContent().stream().map(Book::getId).toList();
        Map<Long, CountCopiesDTO> copyCounts = batchLoadCopyCounts(bookIds, visibility);

        return bookPage.map(book -> withCounts(
                bookApiMapper.bookEntityToBookResponse(book), copyCounts.get(book.getId())));
    }

    private BookResponse withCounts(BookResponse response, CountCopiesDTO counts) {
        CountCopiesDTO safeCounts = counts != null ? counts : new CountCopiesDTO(0, 0);
        return new BookResponse(
                response.id(), response.title(), response.isbn10(), response.isbn13(),
                response.publishingYear(), response.publisher(), response.numberOfPages(),
                response.yearRecommendation(), response.isFiction(), response.codeDewey(),
                response.genres(), response.authors(), safeCounts, response.audit()
        );
    }

    private Map<Long, CountCopiesDTO> batchLoadCopyCounts(List<Long> bookIds, CatalogVisibility visibility) {
        if (bookIds.isEmpty()) {
            return Collections.emptyMap();
        }
        return copyRepository.countCopiesByBookIds(bookIds, Status.available, visibility.includesLost(), Status.lost).stream()
                .collect(Collectors.toMap(
                        row -> (Long) row[0],
                        row -> new CountCopiesDTO((Long) row[1], (Long) row[2])
                ));
    }
}
