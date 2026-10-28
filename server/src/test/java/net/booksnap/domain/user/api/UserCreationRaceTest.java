package net.booksnap.domain.user.api;

import net.booksnap.domain.user.repository.UserRepository;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.bean.override.mockito.MockitoSpyBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.annotation.Transactional;

import static org.mockito.Mockito.doReturn;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * <p><strong>Needs the development database up</strong> ({@code docker compose up -d db}).
 *
 * <p>The unique index aborts the PostgreSQL transaction: nothing may be read from the
 * database after the request.
 */
@SpringBootTest
@AutoConfigureMockMvc
@Transactional
class UserCreationRaceTest {

    private static final String EMAIL = "us02.race@booksnap.test";

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @MockitoSpyBean
    private UserRepository userRepository;

    @Test
    @DisplayName("US-02: the duplicate email only the database detects")
    void duplicateEmailOnlyTheDatabaseDetects() throws Exception {
        jdbcTemplate.update("INSERT INTO users (first_name, last_name, email) VALUES ('Race', 'Probe', ?)", EMAIL);
        doReturn(false).when(userRepository).existsByEmail(EMAIL);

        mockMvc.perform(post("/api/v1/users")
                        .with(user("admin@booksnap.net").roles("ADMIN"))
                        .with(csrf())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"role": "user", "firstName": "Race", "lastName": "Probe", "email": "%s", "keyStage": "ks_1"}
                                """.formatted(EMAIL)))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.message").value("An account already uses this email."));
    }
}
