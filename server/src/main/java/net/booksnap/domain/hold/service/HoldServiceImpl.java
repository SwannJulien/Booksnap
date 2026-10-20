package net.booksnap.domain.hold.service;

import jakarta.persistence.EntityManager;
import lombok.extern.slf4j.Slf4j;
import net.booksnap.domain.author.Author;
import net.booksnap.domain.book.Book;
import net.booksnap.domain.book.repository.BookRepository;
import net.booksnap.domain.common.dto.PagedResponse;
import net.booksnap.domain.copy.Copy;
import net.booksnap.domain.copy.repository.CopyRepository;
import net.booksnap.domain.hold.Hold;
import net.booksnap.domain.hold.Status;
import net.booksnap.domain.hold.api.dto.CreateHoldRequest;
import net.booksnap.domain.hold.api.dto.CreateHoldResponse;
import net.booksnap.domain.hold.api.dto.HoldResponse;
import net.booksnap.domain.hold.repository.HoldRepository;
import net.booksnap.domain.library.Library;
import net.booksnap.domain.user.User;
import net.booksnap.domain.user.repository.UserRepository;
import net.booksnap.exception.book.BookNotFoundException;
import net.booksnap.exception.common.BadRequestException;
import net.booksnap.exception.hold.BookHasAvailableCopyException;
import net.booksnap.exception.hold.HoldAlreadyExistsException;
import net.booksnap.exception.user.UserNotFoundException;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.util.List;
import java.util.stream.Collectors;

@Slf4j
@Service
public class HoldServiceImpl implements HoldService {

    private static final int HOLD_PICKUP_WINDOW_WEEKS = 1;

    private final HoldRepository holdRepository;
    private final BookRepository bookRepository;
    private final CopyRepository copyRepository;
    private final UserRepository userRepository;
    private final EntityManager entityManager;

    public HoldServiceImpl(HoldRepository holdRepository,
                           BookRepository bookRepository,
                           CopyRepository copyRepository,
                           UserRepository userRepository,
                           EntityManager entityManager) {
        this.holdRepository = holdRepository;
        this.bookRepository = bookRepository;
        this.copyRepository = copyRepository;
        this.userRepository = userRepository;
        this.entityManager = entityManager;
    }

    /**
     * Queues a student for a book. A hold is only allowed once the book is fully out:
     * if any copy is available it must be borrowed instead. The hold is created 'pending'
     * with no copy attached — a copy is only assigned later, when one is returned and this
     * hold reaches the head of the queue (see #promoteNextPendingHold).
     */
    @Transactional
    public CreateHoldResponse createHold(CreateHoldRequest createHoldRequest) {
        Book book = bookRepository.findByIdAndDeletedAtIsNull(createHoldRequest.bookId())
                .orElseThrow(() -> new BookNotFoundException(createHoldRequest.bookId()));

        User user = userRepository.findById(createHoldRequest.userId())
                .orElseThrow(() -> new UserNotFoundException(createHoldRequest.userId()));

        // A book can only be held once every copy is out: an available copy is meant to be
        // borrowed, not reserved (a pending hold would never get promoted otherwise).
        if (copyRepository.countByBookIdAndStatusAndDeletedAtIsNull(
                book.getId(), net.booksnap.domain.copy.Status.available) > 0) {
            throw new BookHasAvailableCopyException(book.getId());
        }

        // A student may only queue once per book (also guarded by a unique DB index)
        if (holdRepository.existsByUserIdAndBookIdAndStatusIn(
                user.getId(), book.getId(), List.of(Status.pending, Status.active))) {
            throw new HoldAlreadyExistsException(user.getId(), book.getId());
        }

        // A hold needs a library; take it from any copy of the book. A book with no copy
        // cannot be held, but the UI only offers this on books that already have copies.
        Library library = copyRepository.findAllByBookId(book.getId()).stream()
                .findFirst()
                .map(Copy::getLibrary)
                .orElseThrow(() -> new BadRequestException(
                        "Cannot place a hold on a book that has no copies"));

        Hold hold = new Hold();
        hold.setBook(book);
        hold.setLibrary(library);
        hold.setUser(user);
        hold.setStatus(Status.pending);

        Hold savedHold = holdRepository.save(hold);

        long queuePosition = holdRepository.countByBookIdAndStatus(book.getId(), Status.pending);

        log.info("Hold {} created for user {} on book {} (queue position {})",
                savedHold.getId(), user.getId(), book.getId(), queuePosition);

        return new CreateHoldResponse(
                savedHold.getId(),
                book.getId(),
                user.getId(),
                savedHold.getStatus(),
                savedHold.getStartDate(),
                savedHold.getEndDate(),
                queuePosition
        );
    }

    /**
     * Lists the holds that are still going somewhere. Fulfilled holds became loans and
     * expired ones lapsed, so like the loans list, both are left out unless asked for
     * by status.
     */
    @Transactional(readOnly = true)
    public PagedResponse<HoldResponse> getHolds(String q, Status status, Pageable pageable) {
        List<Status> statuses = status != null
                ? List.of(status)
                : List.of(Status.pending, Status.active);
        String query = q == null ? "" : q.trim();

        return PagedResponse.of(holdRepository
                .findByStatusInAndUserMatching(statuses, query, pageable)
                .map(HoldServiceImpl::toHoldResponse));
    }

    /**
     * Assigns a freed copy to the student who has been queued longest for that book.
     * Does nothing if the copy is not available — a damaged copy stays damaged, and a
     * copy already on hold is spoken for. The caller flushes its own write to the copy
     * first, so the hold's trigger fires after it.
     *
     * @return the id of the promoted hold, or null if nobody was queued
     */
    @Transactional(propagation = Propagation.MANDATORY)
    public Long promoteNextPendingHold(Copy copy) {
        if (copy.getStatus() != net.booksnap.domain.copy.Status.available) {
            return null;
        }

        return holdRepository
                .findFirstByBookIdAndStatusOrderByCreatedDateAsc(
                        copy.getBook().getId(), Status.pending)
                .map(hold -> {
                    LocalDate today = LocalDate.now();
                    hold.setCopy(copy);
                    hold.setStatus(Status.active);
                    hold.setStartDate(today);
                    hold.setEndDate(today.plusWeeks(HOLD_PICKUP_WINDOW_WEEKS));
                    holdRepository.saveAndFlush(hold);
                    entityManager.refresh(copy);

                    // TODO: notify the user (hold_ready) once NotificationService exists
                    log.info("Hold {} promoted to active on copy {}, to collect before {}",
                            hold.getId(), copy.getId(), hold.getEndDate());
                    return hold.getId();
                })
                .orElse(null);
    }

    private static HoldResponse toHoldResponse(Hold hold) {
        Book book = hold.getBook();
        User user = hold.getUser();

        return new HoldResponse(
                hold.getId(),
                hold.getStatus(),
                hold.getCreatedDate(),
                hold.getStartDate(),
                hold.getEndDate(),
                hold.getCopy() != null ? hold.getCopy().getId() : null,
                new HoldResponse.BookDetails(
                        book.getId(),
                        book.getTitle(),
                        book.getIsbn10(),
                        book.getIsbn13(),
                        book.getAuthors().stream()
                                .map(Author::getName)
                                .collect(Collectors.toSet())),
                new HoldResponse.UserDetails(
                        user.getId(),
                        user.getFirstName(),
                        user.getLastName(),
                        user.getEmail()));
    }
}
