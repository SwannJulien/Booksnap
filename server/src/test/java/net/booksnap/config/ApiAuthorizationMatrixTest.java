package net.booksnap.config;

import net.booksnap.domain.user.Role;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.Arguments;
import org.junit.jupiter.params.provider.MethodSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.HttpMethod;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;

import java.util.EnumSet;
import java.util.Set;
import java.util.stream.Stream;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.request;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * One row per line of the permission matrix (access rules §3), checked against the real
 * filter chain: US-009 is a configuration change, and configuration is only ever verified
 * by running it.
 *
 * <p><strong>Needs the development database up</strong> ({@code docker compose up -d db}):
 * the whole context boots, Flyway included. Run from the IDE like the application itself.
 *
 * <p>What is asserted is the authorization outcome and nothing else — refused is 401 or
 * 403, allowed is "neither of those". Deliberately not the 2xx: an allowed request would
 * have to carry a valid body and would then write to the database, turning a test about
 * the filter chain into a test that creates books. Ids far out of range and empty bodies
 * mean every allowed call ends in a harmless 400 or 404, which still proves the only
 * thing at stake here: the request got past security.
 *
 * <p>Writes carry {@link org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors#csrf()}
 * even when unauthenticated. Without it {@code CsrfFilter} answers 403 before authorization
 * is ever consulted, and the anonymous rows would pass for the wrong reason.
 */
@SpringBootTest
@AutoConfigureMockMvc
class ApiAuthorizationMatrixTest {

    /** Out of range on purpose: allowed calls must not touch real rows. */
    private static final String ABSENT_ID = "999999999";
    private static final String ABSENT_ISBN = "9999999999999";

    private static final Set<Role> EVERYONE = EnumSet.allOf(Role.class);
    private static final Set<Role> STAFF = EnumSet.of(Role.librarian, Role.admin);
    private static final Set<Role> ADMIN_ONLY = EnumSet.of(Role.admin);

    @Autowired
    private MockMvc mockMvc;

    /**
     * The 28 business endpoints of the project, in controller order. The count is part of
     * the story: a missing line here is an endpoint nobody checked.
     */
    private static Stream<Arguments> permissionMatrix() {
        return Stream.of(
                // BookController
                Arguments.of(HttpMethod.GET, "/api/v1/books/key-stages", EVERYONE),
                Arguments.of(HttpMethod.GET, "/api/v1/books/search", EVERYONE),
                Arguments.of(HttpMethod.GET, "/api/v1/books/" + ABSENT_ID + "/copies", EVERYONE),
                Arguments.of(HttpMethod.GET, "/api/v1/books/" + ABSENT_ID, EVERYONE),
                Arguments.of(HttpMethod.GET, "/api/v1/books", EVERYONE),
                Arguments.of(HttpMethod.POST, "/api/v1/books", STAFF),
                Arguments.of(HttpMethod.PUT, "/api/v1/books/" + ABSENT_ID, STAFF),
                Arguments.of(HttpMethod.DELETE, "/api/v1/books/" + ABSENT_ID, ADMIN_ONLY),

                // CopyController
                Arguments.of(HttpMethod.GET, "/api/v1/copies/statuses", EVERYONE),
                Arguments.of(HttpMethod.GET, "/api/v1/copies/" + ABSENT_ID + "/qrcode", STAFF),
                Arguments.of(HttpMethod.GET, "/api/v1/copies/" + ABSENT_ID, EVERYONE),
                Arguments.of(HttpMethod.POST, "/api/v1/copies", STAFF),
                Arguments.of(HttpMethod.PUT, "/api/v1/copies/" + ABSENT_ID, STAFF),
                Arguments.of(HttpMethod.DELETE, "/api/v1/copies/" + ABSENT_ID, STAFF),

                // BorrowingController
                Arguments.of(HttpMethod.GET, "/api/v1/borrowings", STAFF),
                Arguments.of(HttpMethod.GET, "/api/v1/borrowings/" + ABSENT_ID, STAFF),
                Arguments.of(HttpMethod.POST, "/api/v1/borrowings", STAFF),
                Arguments.of(HttpMethod.POST, "/api/v1/borrowings/" + ABSENT_ID + "/return", STAFF),

                // HoldController
                Arguments.of(HttpMethod.POST, "/api/v1/holds", EVERYONE),
                Arguments.of(HttpMethod.GET, "/api/v1/holds", STAFF),

                // CoverController
                Arguments.of(HttpMethod.GET, "/api/v1/covers/" + ABSENT_ISBN, EVERYONE),
                Arguments.of(HttpMethod.POST, "/api/v1/covers", STAFF),
                Arguments.of(HttpMethod.DELETE, "/api/v1/covers/" + ABSENT_ISBN, STAFF),

                // DeweyController
                Arguments.of(HttpMethod.GET, "/api/v1/dewey/classes", EVERYONE),
                Arguments.of(HttpMethod.GET, "/api/v1/dewey/classes/000/divisions", EVERYONE),
                Arguments.of(HttpMethod.GET, "/api/v1/dewey/divisions/000/categories", EVERYONE),

                // GenreController
                Arguments.of(HttpMethod.GET, "/api/v1/genres/search", EVERYONE),

                // UserController — the reason this story exists (access rules §4.4)
                Arguments.of(HttpMethod.GET, "/api/v1/users/search", STAFF));
    }

    @ParameterizedTest(name = "{0} {1}")
    @MethodSource("permissionMatrix")
    @DisplayName("every endpoint refuses the roles the matrix refuses, and no session at all")
    void enforcesThePermissionMatrix(HttpMethod method, String path, Set<Role> allowedRoles) throws Exception {
        // No session: 401, never 403. Telling a caller "your role is not enough" when they
        // have no role at all sends the front end to the wrong branch — retry instead of
        // sign in — and confirms the endpoint exists to anyone probing.
        mockMvc.perform(call(method, path))
                .andExpect(status().isUnauthorized());

        for (Role role : Role.values()) {
            int status = mockMvc.perform(call(method, path).with(user("test@booksnap.net").roles(roleName(role))))
                    .andReturn()
                    .getResponse()
                    .getStatus();

            if (allowedRoles.contains(role)) {
                assertThat(status)
                        .describedAs("%s %s must let %s through", method, path, role)
                        .isNotIn(401, 403);
            } else {
                assertThat(status)
                        .describedAs("%s %s must refuse %s", method, path, role)
                        .isEqualTo(403);
            }
        }
    }

    @Test
    @DisplayName("the endpoints needed before signing in stay open")
    void leavesTheSignInPathOpen() throws Exception {
        mockMvc.perform(call(HttpMethod.GET, "/actuator/health"))
                .andExpect(status().isOk());

        mockMvc.perform(call(HttpMethod.GET, "/api/v1/auth/csrf"))
                .andExpect(status().isNoContent());

        // Rejected on its empty body, which is the point: authorization let it through.
        mockMvc.perform(call(HttpMethod.POST, "/api/v1/auth/login"))
                .andExpect(status().isBadRequest());
    }

    @Test
    @DisplayName("actuator beyond the health probe is closed")
    void closesTheRestOfActuator() throws Exception {
        mockMvc.perform(call(HttpMethod.GET, "/actuator/env"))
                .andExpect(status().isUnauthorized());

        mockMvc.perform(call(HttpMethod.GET, "/actuator/env").with(user("student@booksnap.net").roles(roleName(Role.user))))
                .andExpect(status().isForbidden());
    }

    @Test
    @DisplayName("an endpoint matching no rule is closed rather than open")
    void closesWhatNoRuleMentions() throws Exception {
        mockMvc.perform(call(HttpMethod.GET, "/api/v1/something-added-later"))
                .andExpect(status().isUnauthorized());
    }

    private static MockHttpServletRequestBuilder call(HttpMethod method, String path) {
        return request(method, path)
                .with(csrf())
                .contentType(MediaType.APPLICATION_JSON)
                .content("{}");
    }

    /** {@code hasRole("ADMIN")} matches the authority {@code ROLE_ADMIN}; the enum is lower case. */
    private static String roleName(Role role) {
        return role.name().toUpperCase();
    }
}
