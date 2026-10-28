package net.booksnap.domain.user.service;

import net.booksnap.domain.common.dto.PagedResponse;
import net.booksnap.domain.user.Role;
import net.booksnap.domain.user.UserStatusFilter;
import net.booksnap.domain.user.api.dto.UserResponse;
import org.springframework.data.domain.Pageable;

public interface UserService {

    PagedResponse<UserResponse> getUsers(String q, Role role, UserStatusFilter status, Pageable pageable);
}
