package net.booksnap.domain.hold.service;

import net.booksnap.domain.common.dto.PagedResponse;
import net.booksnap.domain.copy.Copy;
import net.booksnap.domain.hold.Status;
import net.booksnap.domain.hold.api.dto.CreateHoldRequest;
import net.booksnap.domain.hold.api.dto.CreateHoldResponse;
import net.booksnap.domain.hold.api.dto.HoldResponse;
import org.springframework.data.domain.Pageable;

public interface HoldService {

    CreateHoldResponse createHold(CreateHoldRequest createHoldRequest);

    PagedResponse<HoldResponse> getHolds(String q, Status status, Pageable pageable);

    Long promoteNextPendingHold(Copy copy);

    boolean expireHold(Long holdId);
}
