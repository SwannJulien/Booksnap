package net.booksnap.domain.user.api;

import net.booksnap.domain.auth.service.AuthenticatedUser;
import net.booksnap.domain.auth.service.SessionInvalidator;
import net.booksnap.domain.book.KeyStage;
import net.booksnap.domain.user.Role;
import net.booksnap.domain.user.User;
import net.booksnap.domain.user.api.dto.ChangeRoleRequest;
import net.booksnap.domain.user.api.dto.UserResponse;
import net.booksnap.domain.user.repository.UserRepository;
import net.booksnap.domain.user.service.RoleChange;
import net.booksnap.domain.user.service.UserService;
import net.booksnap.exception.GlobalExceptionHandler;
import net.booksnap.exception.user.UserNotFoundException;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.mockito.InOrder;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.web.method.annotation.AuthenticationPrincipalArgumentResolver;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

import java.util.List;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.inOrder;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Standalone MockMvc, like {@code UserControllerUpdateTest}: authorization lives in the
 * filter chain and is covered by {@code ApiAuthorizationMatrixTest}.
 */
class UserControllerRoleTest {

    private static final Long ID = 42L;
    private static final Long CALLER_ID = 7L;
    private static final String URL = "/api/v1/users/" + ID + "/role";
    private static final String BODY = "{\"role\": \"librarian\"}";

    private UserService userService;
    private SessionInvalidator sessionInvalidator;
    private MockMvc mockMvc;

    @BeforeEach
    void setUp() {
        userService = mock(UserService.class);
        sessionInvalidator = mock(SessionInvalidator.class);
        UserController controller = new UserController(mock(UserRepository.class), userService, sessionInvalidator);
        mockMvc = MockMvcBuilders.standaloneSetup(controller)
                .setControllerAdvice(new GlobalExceptionHandler())
                .setCustomArgumentResolvers(new AuthenticationPrincipalArgumentResolver())
                .build();

        SecurityContextHolder.getContext().setAuthentication(
                new UsernamePasswordAuthenticationToken(caller(), null, List.of()));
    }

    @AfterEach
    void clearContext() {
        SecurityContextHolder.clearContext();
    }

    @Test
    @DisplayName("US-04: the sessions of the account are closed after the service when the role changed")
    void closesTheSessionsAfterTheServiceWhenTheRoleChanged() throws Exception {
        when(userService.changeRole(eq(ID), any(ChangeRoleRequest.class)))
                .thenReturn(new RoleChange(account(), true));

        mockMvc.perform(put(URL).contentType("application/json").content(BODY))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.id").value(ID));

        InOrder order = inOrder(userService, sessionInvalidator);
        order.verify(userService).changeRole(eq(ID), any(ChangeRoleRequest.class));
        order.verify(sessionInvalidator).invalidateAllOf(ID);
    }

    @Test
    @DisplayName("US-04: the sessions stay open when the role did not change")
    void keepsTheSessionsWhenTheRoleDidNotChange() throws Exception {
        when(userService.changeRole(eq(ID), any(ChangeRoleRequest.class)))
                .thenReturn(new RoleChange(account(), false));

        mockMvc.perform(put(URL).contentType("application/json").content(BODY))
                .andExpect(status().isOk());

        verify(sessionInvalidator, never()).invalidateAllOf(any());
    }

    @Test
    @DisplayName("US-04: the sessions stay open when the change is refused")
    void keepsTheSessionsWhenTheChangeIsRefused() throws Exception {
        when(userService.changeRole(eq(ID), any(ChangeRoleRequest.class)))
                .thenThrow(new UserNotFoundException(ID));

        mockMvc.perform(put(URL).contentType("application/json").content(BODY))
                .andExpect(status().isNotFound());

        verify(sessionInvalidator, never()).invalidateAllOf(any());
    }

    private static UserResponse account() {
        return new UserResponse(ID, "Clara", "Dupont", "clara.dupont@example.com", Role.librarian, true,
                KeyStage.ks_1, null, null, null, true);
    }

    private static AuthenticatedUser caller() {
        User user = new User();
        user.setId(CALLER_ID);
        user.setEmail("alice.martin@example.com");
        user.setRole(Role.admin);
        return new AuthenticatedUser(user, "$2a$10$irrelevant");
    }
}
