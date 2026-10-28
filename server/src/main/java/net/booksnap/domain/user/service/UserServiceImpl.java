package net.booksnap.domain.user.service;

import net.booksnap.domain.common.dto.PagedResponse;
import net.booksnap.domain.user.Role;
import net.booksnap.domain.user.UserStatusFilter;
import net.booksnap.domain.user.api.dto.UserResponse;
import net.booksnap.domain.user.repository.UserRepository;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.EnumSet;

@Service
public class UserServiceImpl implements UserService {

    private final UserRepository userRepository;

    public UserServiceImpl(UserRepository userRepository) {
        this.userRepository = userRepository;
    }

    @Override
    @Transactional(readOnly = true)
    public PagedResponse<UserResponse> getUsers(String q, Role role, UserStatusFilter status, Pageable pageable) {
        // The order is fixed in the query: a client-supplied sort would be appended to it
        Pageable unsorted = PageRequest.of(pageable.getPageNumber(), pageable.getPageSize());
        return PagedResponse.of(userRepository.findMatching(
                        role == null ? EnumSet.allOf(Role.class) : EnumSet.of(role),
                        status.includesActive(),
                        status.includesDeactivated(),
                        q == null ? "" : q.trim(),
                        unsorted)
                .map(UserResponse::from));
    }
}
