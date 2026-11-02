package net.booksnap.domain.user.api;

import net.booksnap.domain.auth.service.SessionInvalidator;
import net.booksnap.domain.book.KeyStage;
import net.booksnap.domain.user.Role;
import net.booksnap.domain.user.api.dto.UpdateUserRequest;
import net.booksnap.domain.user.api.dto.UserResponse;
import net.booksnap.domain.user.repository.UserRepository;
import net.booksnap.domain.user.service.AccountUpdate;
import net.booksnap.domain.user.service.UserService;
import net.booksnap.exception.GlobalExceptionHandler;
import net.booksnap.exception.user.EmailTakenException;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.mockito.InOrder;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

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
 * Standalone MockMvc, like {@code AuthControllerChangePasswordTest}: authorization lives in the
 * filter chain and is covered by {@code ApiAuthorizationMatrixTest}.
 */
class UserControllerUpdateTest {

    private static final Long ID = 42L;
    private static final String URL = "/api/v1/users/" + ID;
    private static final String BODY = """
            {"firstName": "Clara", "lastName": "Dupond", "email": "clara.dupond@example.com", "keyStage": "ks_2"}
            """;

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
                .build();
    }

    @Test
    @DisplayName("US-03: the sessions of the account are closed after the service when the email changed")
    void closesTheSessionsAfterTheServiceWhenTheEmailChanged() throws Exception {
        when(userService.updateUser(eq(ID), any(UpdateUserRequest.class)))
                .thenReturn(new AccountUpdate(account(), true));

        mockMvc.perform(put(URL).contentType("application/json").content(BODY))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.id").value(ID));

        InOrder order = inOrder(userService, sessionInvalidator);
        order.verify(userService).updateUser(eq(ID), any(UpdateUserRequest.class));
        order.verify(sessionInvalidator).invalidateAllOf(ID);
    }

    @Test
    @DisplayName("US-03: the sessions stay open when the email did not change")
    void keepsTheSessionsWhenTheEmailDidNotChange() throws Exception {
        when(userService.updateUser(eq(ID), any(UpdateUserRequest.class)))
                .thenReturn(new AccountUpdate(account(), false));

        mockMvc.perform(put(URL).contentType("application/json").content(BODY))
                .andExpect(status().isOk());

        verify(sessionInvalidator, never()).invalidateAllOf(any());
    }

    @Test
    @DisplayName("US-03: the sessions stay open when the update is refused")
    void keepsTheSessionsWhenTheUpdateIsRefused() throws Exception {
        when(userService.updateUser(eq(ID), any(UpdateUserRequest.class)))
                .thenThrow(new EmailTakenException());

        mockMvc.perform(put(URL).contentType("application/json").content(BODY))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.message").value("An account already uses this email."));

        verify(sessionInvalidator, never()).invalidateAllOf(any());
    }

    private static UserResponse account() {
        return new UserResponse(ID, "Clara", "Dupond", "clara.dupond@example.com", Role.user, true,
                KeyStage.ks_2, null, null, null, false);
    }
}
