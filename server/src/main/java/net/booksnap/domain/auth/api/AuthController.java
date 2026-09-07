package net.booksnap.domain.auth.api;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.servlet.http.HttpSession;
import jakarta.validation.Valid;
import lombok.extern.slf4j.Slf4j;
import net.booksnap.domain.auth.api.dto.AuthenticatedUserResponse;
import net.booksnap.domain.auth.api.dto.ChangePasswordRequest;
import net.booksnap.domain.auth.api.dto.LoginRequest;
import net.booksnap.domain.auth.service.AuthenticatedUser;
import net.booksnap.domain.auth.service.PasswordService;
import net.booksnap.domain.auth.service.SessionInvalidator;
import net.booksnap.domain.user.repository.UserRepository;
import org.springframework.http.HttpStatus;
import org.springframework.security.authentication.AuthenticationManager;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.core.context.SecurityContext;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.web.authentication.session.SessionAuthenticationStrategy;
import org.springframework.security.web.context.SecurityContextRepository;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import java.time.LocalDateTime;

@Slf4j
@RestController
@Validated
@RequestMapping("api/v1/auth")
public class AuthController {

    private final AuthenticationManager authenticationManager;
    private final SecurityContextRepository securityContextRepository;
    private final SessionAuthenticationStrategy sessionAuthenticationStrategy;
    private final UserRepository userRepository;
    private final PasswordService passwordService;
    private final SessionInvalidator sessionInvalidator;

    public AuthController(AuthenticationManager authenticationManager,
                          SecurityContextRepository securityContextRepository,
                          SessionAuthenticationStrategy sessionAuthenticationStrategy,
                          UserRepository userRepository,
                          PasswordService passwordService,
                          SessionInvalidator sessionInvalidator) {
        this.authenticationManager = authenticationManager;
        this.securityContextRepository = securityContextRepository;
        this.sessionAuthenticationStrategy = sessionAuthenticationStrategy;
        this.userRepository = userRepository;
        this.passwordService = passwordService;
        this.sessionInvalidator = sessionInvalidator;
    }

    @PostMapping("/login")
    public AuthenticatedUserResponse login(@RequestBody @Valid LoginRequest loginRequest,
                                           HttpServletRequest request,
                                           HttpServletResponse response) {
        Authentication authentication = authenticationManager.authenticate(
                new UsernamePasswordAuthenticationToken(loginRequest.email(), loginRequest.password()));

        // Rotates the session id, then registers the rotated one. Must run before the
        // context is saved, otherwise the context lands in the session left behind.
        sessionAuthenticationStrategy.onAuthentication(authentication, request, response);

        SecurityContext context = SecurityContextHolder.createEmptyContext();
        context.setAuthentication(authentication);
        SecurityContextHolder.setContext(context);
        // Authenticating by hand no longer persists anything on its own since Spring
        // Security 6. Without this the session is never written, no cookie is set, and
        // /me answers 401 right after a login that returned 200.
        securityContextRepository.saveContext(context, request, response);

        AuthenticatedUser authenticatedUser = (AuthenticatedUser) authentication.getPrincipal();
        recordLastLogin(authenticatedUser.getId());
        log.info("User {} signed in", authenticatedUser.getId());

        return toResponse(authenticatedUser);
    }

    /**
     * Hands out a CSRF token, as the {@code XSRF-TOKEN} cookie set on this response.
     *
     * <p>Any read would do — the cookie rides on every response — but a client needs one
     * request it can make before knowing anything, and having it named makes the
     * dependency explicit instead of accidental. The front end calls it before its first
     * write, the login included: a browser arriving on a page for the first time holds no
     * token, and a login {@code POST} without one is refused like any other write.
     *
     * <p>No session is required, which is the point: the token lives in a cookie, not in
     * the session, so it can be issued to a visitor who has not signed in.
     */
    @GetMapping("/csrf")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void csrf() {
        // The body is empty on purpose: the token travels as a cookie, and returning it
        // here as well would only invite someone to read it from the wrong place.
    }

    @GetMapping("/me")
    public AuthenticatedUserResponse me(@AuthenticationPrincipal AuthenticatedUser authenticatedUser) {
        return toResponse(authenticatedUser);
    }

    /**
     * Replaces the caller's own password, and only ever their own.
     *
     * <p>The account acted upon is {@code authenticatedUser}, taken from the session.
     * {@link ChangePasswordRequest} deliberately has nowhere to put a user id: accepting
     * one, even "for administrators", would make this the endpoint for changing anybody's
     * password, and the check separating the two cases is the kind that gets removed by a
     * later refactor that does not know why it was there.
     *
     * <p>A POST, never a GET, and the passwords travel in the body: a query string is
     * written to the access log, kept in the browser's history and sent in the
     * {@code Referer} of the next request.
     *
     * <p>The other sessions are ended after the write has been committed, not during it.
     * Doing it inside the transaction would leave a user signed out of their other
     * browsers by a change that then rolled back.
     */
    @PostMapping("/password")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void changePassword(@RequestBody @Valid ChangePasswordRequest changePasswordRequest,
                               @AuthenticationPrincipal AuthenticatedUser authenticatedUser,
                               HttpServletRequest request) {
        passwordService.changePassword(
                authenticatedUser.getId(),
                changePasswordRequest.currentPassword(),
                changePasswordRequest.newPassword());

        // getSession(false): this request has one — it was authenticated by it — and asking
        // for a new one here would spare an id the registry never heard of, expiring the
        // caller's own session along with the rest.
        HttpSession session = request.getSession(false);
        sessionInvalidator.invalidateAllExcept(authenticatedUser, session == null ? null : session.getId());
    }

    /**
     * Side effect to expect: this write also moves the auditing columns of {@code users},
     * now stamped with the email of whoever just signed in.
     */
    private void recordLastLogin(Long userId) {
        userRepository.findById(userId).ifPresent(user -> {
            user.setLastLogin(LocalDateTime.now());
            userRepository.save(user);
        });
    }

    private AuthenticatedUserResponse toResponse(AuthenticatedUser authenticatedUser) {
        return new AuthenticatedUserResponse(
                authenticatedUser.getId(),
                authenticatedUser.getFirstName(),
                authenticatedUser.getLastName(),
                authenticatedUser.getEmail(),
                authenticatedUser.getRole());
    }
}
