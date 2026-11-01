package net.booksnap.domain.user.api;

import jakarta.persistence.EntityManager;
import net.booksnap.domain.user.User;
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

import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.doAnswer;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * <p><strong>Needs the development database up</strong> ({@code docker compose up -d db}).
 *
 * <p>Stands for a login recorded between the moment the update loads the account and the
 * moment it writes it.
 */
@SpringBootTest
@AutoConfigureMockMvc
@Transactional
class UserUpdateRaceTest {

    private static final String EMAIL = "us03.race@booksnap.test";
    private static final String LOGIN_TIME = "2026-01-01 10:00";

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @Autowired
    private EntityManager entityManager;

    @MockitoSpyBean
    private UserRepository userRepository;

    @Test
    @DisplayName("US-03: an update does not rewrite last_login")
    void anUpdateDoesNotRewriteLastLogin() throws Exception {
        Long id = jdbcTemplate.queryForObject(
                "INSERT INTO users (first_name, last_name, email, key_stage) "
                        + "VALUES ('Race', 'Probe', ?, 'ks_1') RETURNING id", Long.class, EMAIL);
        doAnswer(invocation -> {
            User loaded = entityManager.find(User.class, id);
            jdbcTemplate.update("UPDATE users SET last_login = '" + LOGIN_TIME + "' WHERE id = ?", id);
            return Optional.of(loaded);
        }).when(userRepository).findById(id);

        mockMvc.perform(put("/api/v1/users/" + id)
                        .with(user("admin@booksnap.net").roles("ADMIN"))
                        .with(csrf())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"firstName": "Renamed", "lastName": "Probe", "email": "%s", "keyStage": "ks_1"}
                                """.formatted(EMAIL)))
                .andExpect(status().isOk());

        entityManager.flush();
        assertThat(jdbcTemplate.queryForObject(
                "SELECT to_char(last_login, 'YYYY-MM-DD HH24:MI') FROM users WHERE id = ?", String.class, id))
                .isEqualTo(LOGIN_TIME);
        assertThat(jdbcTemplate.queryForObject(
                "SELECT first_name FROM users WHERE id = ?", String.class, id))
                .isEqualTo("Renamed");
    }
}
