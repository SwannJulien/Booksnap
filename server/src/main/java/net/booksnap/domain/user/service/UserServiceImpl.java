package net.booksnap.domain.user.service;

import lombok.extern.slf4j.Slf4j;
import net.booksnap.domain.auth.AuthIdentity;
import net.booksnap.domain.auth.Provider;
import net.booksnap.domain.auth.repository.AuthIdentityRepository;
import net.booksnap.domain.auth.service.TemporaryPasswordGenerator;
import net.booksnap.domain.common.dto.PagedResponse;
import net.booksnap.domain.user.Role;
import net.booksnap.domain.user.User;
import net.booksnap.domain.user.UserStatusFilter;
import net.booksnap.domain.user.api.dto.CreateUserRequest;
import net.booksnap.domain.user.api.dto.CreatedUserResponse;
import net.booksnap.domain.user.api.dto.UserResponse;
import net.booksnap.domain.user.repository.UserRepository;
import net.booksnap.exception.user.EmailTakenException;
import net.booksnap.exception.user.UserNotFoundException;
import org.hibernate.exception.ConstraintViolationException;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.EnumSet;
import java.util.List;

@Slf4j
@Service
public class UserServiceImpl implements UserService {

    private final UserRepository userRepository;
    private final AuthIdentityRepository authIdentityRepository;
    private final PasswordEncoder passwordEncoder;
    private final TemporaryPasswordGenerator temporaryPasswordGenerator;

    public UserServiceImpl(UserRepository userRepository,
                           AuthIdentityRepository authIdentityRepository,
                           PasswordEncoder passwordEncoder,
                           TemporaryPasswordGenerator temporaryPasswordGenerator) {
        this.userRepository = userRepository;
        this.authIdentityRepository = authIdentityRepository;
        this.passwordEncoder = passwordEncoder;
        this.temporaryPasswordGenerator = temporaryPasswordGenerator;
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

    @Override
    @Transactional(readOnly = true)
    public UserResponse getUser(Long id) {
        return userRepository.findById(id)
                .map(UserResponse::from)
                .orElseThrow(() -> new UserNotFoundException(id));
    }

    @Override
    @Transactional
    public CreatedUserResponse createUser(CreateUserRequest request) {
        if (userRepository.existsByEmail(request.email())) {
            throw new EmailTakenException();
        }

        User user = newUser(request);
        User saved = saveCatchingEmailTaken(user);

        String temporaryPassword = null;
        if (request.role() != Role.user) {
            temporaryPassword = temporaryPasswordGenerator.generate();
            attachLocalIdentity(saved, temporaryPassword);
        }

        log.info("Account {} created with role {}", saved.getId(), saved.getRole());
        return new CreatedUserResponse(UserResponse.from(saved), temporaryPassword);
    }

    @Override
    @Transactional(readOnly = true)
    public List<String> getHouses() {
        return userRepository.findDistinctHouses();
    }

    private static User newUser(CreateUserRequest request) {
        User user = new User();
        user.setRole(request.role());
        user.setFirstName(request.firstName());
        user.setLastName(request.lastName());
        user.setEmail(request.email());
        if (request.role() == Role.user) {
            user.setKeyStage(request.keyStage());
            user.setHouse(request.house());
            user.setParentEmail(request.parentEmail());
            user.setSex(request.sex() == null ? null : request.sex().name());
        }
        return user;
    }

    private User saveCatchingEmailTaken(User user) {
        try {
            return userRepository.saveAndFlush(user);
        } catch (DataIntegrityViolationException ex) {
            if (ex.getCause() instanceof ConstraintViolationException violation
                    && "users_email_key".equals(violation.getConstraintName())) {
                throw new EmailTakenException();
            }
            throw ex;
        }
    }

    private void attachLocalIdentity(User user, String password) {
        AuthIdentity identity = new AuthIdentity();
        identity.setUser(user);
        identity.setProvider(Provider.local);
        identity.setSubject(null);
        identity.setPasswordHash(passwordEncoder.encode(password));
        authIdentityRepository.save(identity);
    }
}
