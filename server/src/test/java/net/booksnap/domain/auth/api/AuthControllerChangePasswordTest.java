package net.booksnap.domain.auth.api;

import net.booksnap.domain.auth.service.AuthenticatedUser;
import net.booksnap.domain.auth.service.PasswordService;
import net.booksnap.domain.auth.service.SessionInvalidator;
import net.booksnap.domain.user.Role;
import net.booksnap.domain.user.User;
import net.booksnap.domain.user.repository.UserRepository;
import net.booksnap.exception.GlobalExceptionHandler;
import net.booksnap.exception.auth.InvalidCurrentPasswordException;
import net.booksnap.exception.auth.NoLocalIdentityException;
import net.booksnap.exception.auth.PasswordRejectedException;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.mock.web.MockHttpSession;
import org.springframework.security.authentication.AuthenticationManager;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.web.authentication.session.SessionAuthenticationStrategy;
import org.springframework.security.web.context.SecurityContextRepository;
import org.springframework.security.web.method.annotation.AuthenticationPrincipalArgumentResolver;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Standalone MockMvc rather than a Spring slice: the controller's collaborators are all
 * mocked here, and booting a context to reach three status codes buys nothing.
 *
 * <p>{@link GlobalExceptionHandler} is registered explicitly because the mapping from
 * exception to status is exactly what is under test — the service throws, and this asserts
 * the caller sees 400 or 409 rather than a 500.
 *
 * <p>Out of scope, deliberately: CSRF and authentication, which live in the filter chain
 * and not in the controller. A standalone setup has no filters, so a test here claiming
 * "answers 403 without a token" would be testing nothing. Those are covered by the Bruno
 * collection.
 */
class AuthControllerChangePasswordTest {

    private static final Long SESSION_USER_ID = 42L;
    private static final String URL = "/api/v1/auth/password";

    private PasswordService passwordService;
    private SessionInvalidator sessionInvalidator;
    private MockMvc mockMvc;

    @BeforeEach
    void setUp() {
        passwordService = mock(PasswordService.class);
        sessionInvalidator = mock(SessionInvalidator.class);

        AuthController controller = new AuthController(
                mock(AuthenticationManager.class),
                mock(SecurityContextRepository.class),
                mock(SessionAuthenticationStrategy.class),
                mock(UserRepository.class),
                passwordService,
                sessionInvalidator);

        mockMvc = MockMvcBuilders.standaloneSetup(controller)
                .setControllerAdvice(new GlobalExceptionHandler())
                .setCustomArgumentResolvers(new AuthenticationPrincipalArgumentResolver())
                .build();

        // What the filter chain would have left behind; @AuthenticationPrincipal reads the
        // principal from here.
        SecurityContextHolder.getContext().setAuthentication(
                new UsernamePasswordAuthenticationToken(principal(SESSION_USER_ID), null, java.util.List.of()));
    }

    @org.junit.jupiter.api.AfterEach
    void clearContext() {
        SecurityContextHolder.clearContext();
    }

    @Test
    @DisplayName("answers 204 and hands the service the two passwords")
    void changesThePassword() throws Exception {
        mockMvc.perform(post(URL)
                        .session(new MockHttpSession())
                        .contentType("application/json")
                        .content("{\"currentPassword\":\"current-one\",\"newPassword\":\"a-brand-new-password\"}"))
                .andExpect(status().isNoContent());

        verify(passwordService).changePassword(SESSION_USER_ID, "current-one", "a-brand-new-password");
    }

    /**
     * The §4.3 property, and the reason this test class exists at all. A {@code userId} in
     * the body must change nothing: the account acted upon comes from the session. If
     * somebody later adds that field to the DTO and passes it down, this goes red.
     */
    @Test
    @DisplayName("ignores a user id smuggled into the body and acts on the session's account")
    void ignoresAUserIdInTheBody() throws Exception {
        mockMvc.perform(post(URL)
                        .session(new MockHttpSession())
                        .contentType("application/json")
                        .content("{\"userId\":999,\"currentPassword\":\"current-one\","
                                + "\"newPassword\":\"a-brand-new-password\"}"))
                .andExpect(status().isNoContent());

        verify(passwordService).changePassword(eq(SESSION_USER_ID), anyString(), anyString());
        verify(passwordService, never()).changePassword(eq(999L), anyString(), anyString());
    }

    @Test
    @DisplayName("spares the calling session and ends the others")
    void sparesTheCallingSession() throws Exception {
        MockHttpSession session = new MockHttpSession();

        mockMvc.perform(post(URL)
                        .session(session)
                        .contentType("application/json")
                        .content("{\"currentPassword\":\"current-one\",\"newPassword\":\"a-brand-new-password\"}"))
                .andExpect(status().isNoContent());

        ArgumentCaptor<String> sparedSessionId = ArgumentCaptor.forClass(String.class);
        verify(sessionInvalidator).invalidateAllExcept(eq(principal(SESSION_USER_ID)), sparedSessionId.capture());
        assertThat(sparedSessionId.getValue()).isEqualTo(session.getId());
    }

    @Test
    @DisplayName("answers 400 when the current password is wrong")
    void answersBadRequestOnAWrongCurrentPassword() throws Exception {
        doThrow(new InvalidCurrentPasswordException())
                .when(passwordService).changePassword(anyLong(), anyString(), anyString());

        mockMvc.perform(post(URL)
                        .session(new MockHttpSession())
                        .contentType("application/json")
                        .content("{\"currentPassword\":\"wrong\",\"newPassword\":\"a-brand-new-password\"}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message").value("Current password is incorrect"));

        verify(sessionInvalidator, never()).invalidateAllExcept(any(), anyString());
    }

    @Test
    @DisplayName("answers 400 naming the rule when the new password is refused")
    void answersBadRequestOnARejectedPassword() throws Exception {
        doThrow(new PasswordRejectedException("Password must be at least 12 characters long"))
                .when(passwordService).changePassword(anyLong(), anyString(), anyString());

        mockMvc.perform(post(URL)
                        .session(new MockHttpSession())
                        .contentType("application/json")
                        .content("{\"currentPassword\":\"current-one\",\"newPassword\":\"short\"}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message").value("Password must be at least 12 characters long"));
    }

    @Test
    @DisplayName("answers 409 when the account has no local identity")
    void answersConflictWithoutALocalIdentity() throws Exception {
        doThrow(new NoLocalIdentityException())
                .when(passwordService).changePassword(anyLong(), anyString(), anyString());

        mockMvc.perform(post(URL)
                        .session(new MockHttpSession())
                        .contentType("application/json")
                        .content("{\"currentPassword\":\"current-one\",\"newPassword\":\"a-brand-new-password\"}"))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.message").value(
                        "This account does not sign in with a password managed by BookSnap"));
    }

    /**
     * A missing pair of quotes around the password used to come back as
     * "Unrecognized token 'MyCurrentSecret99'" in a 500 body — Jackson names what it choked
     * on, and the catch-all handler forwarded the message verbatim. The endpoint whose
     * entire body is passwords is the worst place for that, so it is pinned here.
     */
    @Test
    @DisplayName("never echoes an unparseable body, which would be the password itself")
    void neverEchoesAnUnparseableBody() throws Exception {
        MockHttpServletResponse response = mockMvc.perform(post(URL)
                        .session(new MockHttpSession())
                        .contentType("application/json")
                        .content("{\"currentPassword\":MyCurrentSecret99,\"newPassword\":\"a-brand-new-password\"}"))
                .andReturn().getResponse();

        // Asserted before the status, so a regression reports the leak rather than a
        // number: the status being wrong matters much less than the body carrying this.
        assertThat(response.getContentAsString())
                .as("a response must never quote the body it failed to parse")
                .doesNotContain("MyCurrentSecret99");
        assertThat(response.getStatus()).isEqualTo(400);
        verify(passwordService, never()).changePassword(anyLong(), anyString(), anyString());
    }

    @Test
    @DisplayName("answers 400 on a blank password without reaching the service")
    void rejectsABlankPassword() throws Exception {
        mockMvc.perform(post(URL)
                        .session(new MockHttpSession())
                        .contentType("application/json")
                        .content("{\"currentPassword\":\"\",\"newPassword\":\"a-brand-new-password\"}"))
                .andExpect(status().isBadRequest());

        verify(passwordService, never()).changePassword(anyLong(), anyString(), anyString());
    }

    private AuthenticatedUser principal(Long userId) {
        User user = new User();
        user.setId(userId);
        user.setEmail("staff@example.com");
        user.setRole(Role.librarian);
        return new AuthenticatedUser(user, "$2a$10$irrelevant");
    }
}
