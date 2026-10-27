package net.booksnap.domain.lifecycle.service;

import net.booksnap.domain.book.repository.BookRepository;
import net.booksnap.domain.common.dto.PagedResponse;
import net.booksnap.domain.copy.repository.CopyRepository;
import net.booksnap.domain.lifecycle.LifecycleEventType;
import net.booksnap.domain.lifecycle.api.dto.DeletedBookResponse;
import net.booksnap.domain.lifecycle.api.dto.DeletedCopyResponse;
import net.booksnap.domain.lifecycle.api.dto.LifecycleEventResponse;
import net.booksnap.domain.lifecycle.repository.LifecycleEventRepository;
import net.booksnap.exception.book.BookNotFoundException;
import net.booksnap.exception.copy.CopyNotFoundException;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@Transactional(readOnly = true)
public class LifecycleHistoryServiceImpl implements LifecycleHistoryService {

    private final LifecycleEventRepository lifecycleEventRepository;
    private final BookRepository bookRepository;
    private final CopyRepository copyRepository;

    public LifecycleHistoryServiceImpl(LifecycleEventRepository lifecycleEventRepository,
                                       BookRepository bookRepository,
                                       CopyRepository copyRepository) {
        this.lifecycleEventRepository = lifecycleEventRepository;
        this.bookRepository = bookRepository;
        this.copyRepository = copyRepository;
    }

    @Override
    public PagedResponse<LifecycleEventResponse> findBookHistory(Long bookId, Pageable pageable) {
        // Unfiltered on purpose: the history of a deleted book is what this endpoint is for
        if (!bookRepository.existsById(bookId)) {
            throw new BookNotFoundException(bookId);
        }
        return PagedResponse.of(lifecycleEventRepository
                .findBookTimeline(bookId, LifecycleEventType.copy_status_changed, LifecycleEventType.BUSINESS, unsorted(pageable))
                .map(LifecycleEventResponse::of));
    }

    @Override
    public PagedResponse<LifecycleEventResponse> findCopyHistory(Long copyId, Pageable pageable) {
        if (!copyRepository.existsById(copyId)) {
            throw new CopyNotFoundException(copyId);
        }
        return PagedResponse.of(lifecycleEventRepository
                .findCopyTimeline(copyId, LifecycleEventType.copy_status_changed, LifecycleEventType.BUSINESS, unsorted(pageable))
                .map(LifecycleEventResponse::of));
    }

    @Override
    public PagedResponse<DeletedBookResponse> findDeletedBooks(Pageable pageable) {
        return PagedResponse.of(bookRepository.findDeletedForArchive(LifecycleEventType.book_deleted, unsorted(pageable)));
    }

    @Override
    public PagedResponse<DeletedCopyResponse> findDeletedCopies(Pageable pageable) {
        return PagedResponse.of(copyRepository.findDeletedForArchive(LifecycleEventType.copy_deleted, unsorted(pageable)));
    }

    // The order is part of the contract and lives in the queries; a client ?sort= would be appended to it
    private Pageable unsorted(Pageable pageable) {
        return PageRequest.of(pageable.getPageNumber(), pageable.getPageSize());
    }
}
