package net.booksnap.domain.lifecycle.api;

import net.booksnap.domain.common.dto.PagedResponse;
import net.booksnap.domain.lifecycle.api.dto.DeletedBookResponse;
import net.booksnap.domain.lifecycle.api.dto.DeletedCopyResponse;
import net.booksnap.domain.lifecycle.service.LifecycleHistoryService;
import org.springframework.data.domain.Pageable;
import org.springframework.data.web.PageableDefault;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@Validated
@RequestMapping("api/v1/archive")
public class ArchiveController {

    private final LifecycleHistoryService lifecycleHistoryService;

    public ArchiveController(LifecycleHistoryService lifecycleHistoryService) {
        this.lifecycleHistoryService = lifecycleHistoryService;
    }

    @GetMapping("/books")
    public PagedResponse<DeletedBookResponse> getDeletedBooks(@PageableDefault(size = 10) Pageable pageable) {
        return lifecycleHistoryService.findDeletedBooks(pageable);
    }

    @GetMapping("/copies")
    public PagedResponse<DeletedCopyResponse> getDeletedCopies(@PageableDefault(size = 10) Pageable pageable) {
        return lifecycleHistoryService.findDeletedCopies(pageable);
    }
}
