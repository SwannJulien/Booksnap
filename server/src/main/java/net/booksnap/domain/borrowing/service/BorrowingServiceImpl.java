package net.booksnap.domain.borrowing.service;

import jakarta.persistence.EntityManager;
import lombok.extern.slf4j.Slf4j;
import net.booksnap.domain.author.Author;
import net.booksnap.domain.book.Book;
import net.booksnap.domain.borrowing.Borrowing;
import net.booksnap.domain.borrowing.Status;
import net.booksnap.domain.borrowing.api.dto.BorrowingResponse;
import net.booksnap.domain.borrowing.api.dto.CreateBorrowingRequest;
import net.booksnap.domain.borrowing.api.dto.CreateBorrowingResponse;
import net.booksnap.domain.borrowing.api.dto.GetBorrowingResponse;
import net.booksnap.domain.borrowing.api.dto.ReturnBorrowingResponse;
import net.booksnap.domain.borrowing.repository.BorrowingRepository;
import net.booksnap.domain.common.dto.PagedResponse;
import net.booksnap.domain.copy.Copy;
import net.booksnap.domain.copy.repository.CopyRepository;
import net.booksnap.domain.hold.Hold;
import net.booksnap.domain.hold.repository.HoldRepository;
import net.booksnap.domain.hold.service.HoldService;
import net.booksnap.domain.user.User;
import net.booksnap.domain.user.repository.UserRepository;
import net.booksnap.exception.borrowing.BorrowingAlreadyReturnedException;
import net.booksnap.exception.borrowing.BorrowingNotFoundException;
import net.booksnap.exception.copy.CopyNotAvailableException;
import net.booksnap.exception.copy.CopyNotFoundException;
import net.booksnap.exception.user.UserNotFoundException;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.util.List;
import java.util.stream.Collectors;

@Slf4j
@Service
public class BorrowingServiceImpl implements BorrowingService {

    private static final int BORROWING_DURATION_WEEKS = 2;

    private final BorrowingRepository borrowingRepository;
    private final CopyRepository copyRepository;
    private final UserRepository userRepository;
    private final HoldRepository holdRepository;
    private final HoldService holdService;
    private final EntityManager entityManager;

    public BorrowingServiceImpl(BorrowingRepository borrowingRepository,
                                CopyRepository copyRepository,
                                UserRepository userRepository,
                                HoldRepository holdRepository,
                                HoldService holdService,
                                EntityManager entityManager) {
        this.borrowingRepository = borrowingRepository;
        this.copyRepository = copyRepository;
        this.userRepository = userRepository;
        this.holdRepository = holdRepository;
        this.holdService = holdService;
        this.entityManager = entityManager;
    }

    @Transactional
    public CreateBorrowingResponse createBorrowing(CreateBorrowingRequest createBorrowingRequest) {
        // The filtered read is the only thing refusing a deleted copy: its status stays
        // 'available'
        Copy copy = copyRepository.findByIdAndDeletedAtIsNull(createBorrowingRequest.copyId())
                .orElseThrow(() -> new CopyNotFoundException(createBorrowingRequest.copyId()));

        User user = userRepository.findById(createBorrowingRequest.userId())
                .orElseThrow(() -> new UserNotFoundException(createBorrowingRequest.userId()));

        // A copy kept on hold is off-limits to everyone except the student it is held
        // for; them borrowing it is what fulfills the hold.
        if (copy.getStatus() == net.booksnap.domain.copy.Status.on_hold) {
            fulfillHoldOrReject(copy, user);
        } else if (!copy.getStatus().isBorrowable()) {
            throw new CopyNotAvailableException(copy.getId(), copy.getStatus());
        }

        LocalDate startDate = LocalDate.now();

        Borrowing borrowing = new Borrowing();
        borrowing.setCopy(copy);
        borrowing.setUser(user);
        borrowing.setStatus(Status.borrowed);
        borrowing.setStartDate(startDate);
        borrowing.setEndDate(startDate.plusWeeks(BORROWING_DURATION_WEEKS));

        Borrowing savedBorrowing = borrowingRepository.save(borrowing);

        return new CreateBorrowingResponse(
                savedBorrowing.getId(),
                copy.getId(),
                user.getId(),
                savedBorrowing.getStatus(),
                savedBorrowing.getStartDate(),
                savedBorrowing.getEndDate()
        );
    }

    /**
     * Marks the active hold on this copy as fulfilled, so the borrowing can go ahead.
     * Rejects the borrowing if the copy is being held for somebody else.
     * <p>
     * The flush matters: marking the hold fulfilled makes a trigger release the copy
     * back to 'available', which has to happen before the borrowing is inserted and
     * marks it 'borrowed'.
     */
    private void fulfillHoldOrReject(Copy copy, User user) {
        Hold hold = holdRepository
                .findFirstByCopyIdAndStatus(copy.getId(), net.booksnap.domain.hold.Status.active)
                .orElseThrow(() -> new CopyNotAvailableException(copy.getId(), copy.getStatus()));

        if (!hold.getUser().getId().equals(user.getId())) {
            throw new CopyNotAvailableException(copy.getId(), copy.getStatus());
        }

        hold.setStatus(net.booksnap.domain.hold.Status.fulfilled);
        holdRepository.saveAndFlush(hold);
        entityManager.refresh(copy);
    }

    /**
     * Returns a copy and hands it straight to the next student in the queue, if any.
     * <p>
     * Ordering matters here: the borrowing update must reach the database before the
     * hold update, so the copy-status triggers fire in the right order (return restores
     * the copy, promotion then puts it back on hold). Hence the explicit flushes, and
     * the refreshes to read back what the triggers wrote.
     */
    @Transactional
    public ReturnBorrowingResponse returnBorrowing(Long borrowingId) {
        Borrowing borrowing = borrowingRepository.findById(borrowingId)
                .orElseThrow(() -> new BorrowingNotFoundException(borrowingId));

        if (borrowing.getStatus() == Status.returned) {
            throw new BorrowingAlreadyReturnedException(borrowingId);
        }

        borrowing.setStatus(Status.returned);
        borrowingRepository.saveAndFlush(borrowing);

        Copy copy = borrowing.getCopy();
        entityManager.refresh(copy);

        Long promotedHoldId = holdService.promoteNextPendingHold(copy);

        return new ReturnBorrowingResponse(
                borrowing.getId(),
                copy.getId(),
                borrowing.getUser().getId(),
                borrowing.getStatus(),
                LocalDate.now(),
                copy.getStatus(),
                promotedHoldId
        );
    }

    // Read-only transaction: the copy status and the hold read against it have to agree
    @Transactional(readOnly = true)
    public GetBorrowingResponse getActiveBorrowingByCopyId(Long copyId) {
        Copy copy = copyRepository.findByIdAndDeletedAtIsNull(copyId)
                .orElseThrow(() -> new CopyNotFoundException(copyId));

        GetBorrowingResponse.BorrowingDetails borrowingDetails = borrowingRepository
                .findFirstByCopyIdAndStatusIn(copy.getId(), List.of(Status.borrowed, Status.overdue))
                .map(borrowing -> new GetBorrowingResponse.BorrowingDetails(
                        borrowing.getId(),
                        borrowing.getCopy().getId(),
                        borrowing.getUser().getId(),
                        // Named, so a scan can ask "return this from {student}?" without
                        // a second round trip
                        borrowing.getUser().getFirstName(),
                        borrowing.getUser().getLastName(),
                        borrowing.getStatus(),
                        borrowing.getStartDate(),
                        borrowing.getEndDate()
                ))
                .orElse(null);

        return new GetBorrowingResponse(
                copy.getStatus(),
                copy.getBook().getTitle(),
                borrowingDetails,
                activeHoldDetails(copy));
    }

    /**
     * The hold this copy is being kept for, so the desk knows who may collect it.
     * Null unless the copy is actually on hold.
     */
    private GetBorrowingResponse.HoldDetails activeHoldDetails(Copy copy) {
        if (copy.getStatus() != net.booksnap.domain.copy.Status.on_hold) {
            return null;
        }

        return holdRepository
                .findFirstByCopyIdAndStatus(copy.getId(), net.booksnap.domain.hold.Status.active)
                .map(hold -> new GetBorrowingResponse.HoldDetails(
                        hold.getId(),
                        hold.getUser().getId(),
                        hold.getUser().getFirstName(),
                        hold.getUser().getLastName(),
                        hold.getStartDate(),
                        hold.getEndDate()
                ))
                .orElse(null);
    }

    @Transactional(readOnly = true)
    public PagedResponse<BorrowingResponse> getActiveBorrowings(String q, Status status, Pageable pageable) {
        List<Status> statuses = status != null
                ? List.of(status)
                : List.of(Status.borrowed, Status.overdue);
        String query = q == null ? "" : q.trim();

        return PagedResponse.of(borrowingRepository
                .findByStatusInAndUserMatching(statuses, query, pageable)
                .map(BorrowingServiceImpl::toBorrowingResponse));
    }

    private static BorrowingResponse toBorrowingResponse(Borrowing borrowing) {
        Book book = borrowing.getCopy().getBook();
        User user = borrowing.getUser();

        return new BorrowingResponse(
                borrowing.getId(),
                borrowing.getStatus(),
                borrowing.getStartDate(),
                borrowing.getEndDate(),
                new BorrowingResponse.BookDetails(
                        book.getId(),
                        book.getTitle(),
                        book.getIsbn10(),
                        book.getIsbn13(),
                        book.getAuthors().stream()
                                .map(Author::getName)
                                .collect(Collectors.toSet())),
                new BorrowingResponse.UserDetails(
                        user.getId(),
                        user.getFirstName(),
                        user.getLastName(),
                        user.getEmail()));
    }
}
