package net.booksnap.domain.user.service;

import net.booksnap.domain.auth.repository.AuthIdentityRepository;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.bean.override.mockito.MockitoSpyBean;
import org.springframework.test.web.servlet.MockMvc;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.mockingDetails;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * <p><strong>Needs the development database up</strong> ({@code docker compose up -d db}):
 * the whole context boots, Flyway included, and the test really writes then rolls back.
 *
 * <p>Deliberately not {@code @Transactional}: a test transaction would wrap the service's
 * own and roll everything back anyway, so the test would pass whether the creation is atomic
 * or not. If it ever fails, the account it leaves behind is deleted in {@code finally}.
 */
@SpringBootTest
@AutoConfigureMockMvc
class UserServiceImplAtomicCreationTest {

    private static final String EMAIL = "us02.atomic@booksnap.test";

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @MockitoSpyBean
    private AuthIdentityRepository authIdentityRepository;

    @Test
    @DisplayName("US-02: an identity failure answers 500 and leaves no account behind")
    void identityFailureLeavesNoAccountBehind() throws Exception {
        doThrow(new RuntimeException("Failed to write the identity (test)"))
                .when(authIdentityRepository).save(any());
        doThrow(new RuntimeException("Failed to write the identity (test)"))
                .when(authIdentityRepository).saveAndFlush(any());

        try {
            mockMvc.perform(post("/api/v1/users")
                            .with(user("admin@booksnap.net").roles("ADMIN"))
                            .with(csrf())
                            .contentType(MediaType.APPLICATION_JSON)
                            .content("""
                                    {"role": "librarian", "firstName": "Paul", "lastName": "Girard", "email": "%s"}
                                    """.formatted(EMAIL)))
                    .andExpect(status().isInternalServerError())
                    .andExpect(jsonPath("$.message").value("Internal server error"));

            // An unmapped endpoint also answers 500 with no row: the identity write must have been attempted.
            assertThat(mockingDetails(authIdentityRepository).getInvocations())
                    .anyMatch(invocation -> invocation.getMethod().getName().startsWith("save"));
            assertThat(jdbcTemplate.queryForObject(
                    "SELECT count(*) FROM users WHERE email = ?", Integer.class, EMAIL)).isZero();
        } finally {
            jdbcTemplate.update(
                    "DELETE FROM auth_identity WHERE user_id IN (SELECT id FROM users WHERE email = ?)", EMAIL);
            jdbcTemplate.update("DELETE FROM users WHERE email = ?", EMAIL);
        }
    }
}
