package net.booksnap.domain.user.api;

import jakarta.validation.Valid;
import net.booksnap.domain.common.dto.PagedResponse;
import net.booksnap.domain.user.Role;
import net.booksnap.domain.user.UserStatusFilter;
import net.booksnap.domain.user.api.dto.CreateUserRequest;
import net.booksnap.domain.user.api.dto.CreatedUserResponse;
import net.booksnap.domain.user.api.dto.UserResponse;
import net.booksnap.domain.user.api.dto.UserSearchResponse;
import net.booksnap.domain.user.repository.UserRepository;
import net.booksnap.domain.user.service.UserService;
import org.springframework.data.domain.Pageable;
import org.springframework.data.web.PageableDefault;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

@RestController
@RequestMapping("api/v1/users")
public class UserController {

    private final UserRepository userRepository;
    private final UserService userService;

    public UserController(UserRepository userRepository, UserService userService) {
        this.userRepository = userRepository;
        this.userService = userService;
    }

    @GetMapping
    public PagedResponse<UserResponse> getUsers(
            @RequestParam(required = false) String q,
            @RequestParam(required = false) Role role,
            @RequestParam(defaultValue = "active") UserStatusFilter status,
            @PageableDefault(size = 10) Pageable pageable) {
        return userService.getUsers(q, role, status, pageable);
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public CreatedUserResponse createUser(@RequestBody @Valid CreateUserRequest request) {
        return userService.createUser(request);
    }

    @GetMapping("/houses")
    public List<String> getHouses() {
        return userService.getHouses();
    }

    @GetMapping("/{id}")
    public UserResponse getUser(@PathVariable Long id) {
        return userService.getUser(id);
    }

    @GetMapping("/search")
    public List<UserSearchResponse> searchUsers(
            @RequestParam String q,
            @RequestParam(defaultValue = "10") int limit) {
        return userRepository.searchActiveUsers(q).stream()
                .map(user -> new UserSearchResponse(
                        user.getId(),
                        user.getFirstName(),
                        user.getLastName(),
                        user.getEmail()))
                .limit(limit)
                .toList();
    }
}
