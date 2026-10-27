package net.booksnap.domain.lifecycle.service;

import net.booksnap.domain.common.dto.PagedResponse;
import net.booksnap.domain.lifecycle.api.dto.DeletedBookResponse;
import net.booksnap.domain.lifecycle.api.dto.DeletedCopyResponse;
import net.booksnap.domain.lifecycle.api.dto.LifecycleEventResponse;
import org.springframework.data.domain.Pageable;

public interface LifecycleHistoryService {
    PagedResponse<LifecycleEventResponse> findBookHistory(Long bookId, Pageable pageable);

    PagedResponse<LifecycleEventResponse> findCopyHistory(Long copyId, Pageable pageable);

    PagedResponse<DeletedBookResponse> findDeletedBooks(Pageable pageable);

    PagedResponse<DeletedCopyResponse> findDeletedCopies(Pageable pageable);
}
