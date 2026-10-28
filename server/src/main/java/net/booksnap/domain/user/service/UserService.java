package net.booksnap.domain.user.service;

import net.booksnap.domain.common.dto.PagedResponse;
import net.booksnap.domain.user.Role;
import net.booksnap.domain.user.UserStatusFilter;
import net.booksnap.domain.user.api.dto.CreateUserRequest;
import net.booksnap.domain.user.api.dto.CreatedUserResponse;
import net.booksnap.domain.user.api.dto.UserResponse;
import org.springframework.data.domain.Pageable;

import java.util.List;

public interface UserService {

    PagedResponse<UserResponse> getUsers(String q, Role role, UserStatusFilter status, Pageable pageable);

    UserResponse getUser(Long id);

    CreatedUserResponse createUser(CreateUserRequest request);

    List<String> getHouses();
}
