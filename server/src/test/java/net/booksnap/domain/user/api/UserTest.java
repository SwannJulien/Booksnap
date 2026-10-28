package net.booksnap.domain.user.api;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.RequestPostProcessor;
import org.springframework.transaction.annotation.Transactional;

import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * <p><strong>Needs the development database up</strong> ({@code docker compose up -d db}).
 *
 * <p>{@code @Transactional} so the inserted accounts roll back. The development database holds
 * accounts of its own, whose roles are not assumed: every lookup that counts rows searches for
 * the email of the account the test inserted.
 */
@SpringBootTest
@AutoConfigureMockMvc
@Transactional
class UserTest {

    private static final String USERS = "/api/v1/users";
    private static final String PROBE_EMAIL = "us01.probe@booksnap.test";

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @ParameterizedTest(name = "{displayName} [{0}]")
    @CsvSource({"ADMIN, 200", "LIBRARIAN, 403", "USER, 403"})
    @DisplayName("US-01: only the administrator reads the accounts list through the API")
    void onlyTheAdministratorReadsTheList(String role, int expectedStatus) throws Exception {
        mockMvc.perform(get(USERS).with(user("test@booksnap.net").roles(role)))
                .andExpect(status().is(expectedStatus));
    }

    @Test
    @DisplayName("US-01: reading without a session is refused")
    void refusesTheListWithoutASession() throws Exception {
        mockMvc.perform(get(USERS))
                .andExpect(status().isUnauthorized());
    }

    @Test
    @DisplayName("US-01: response shape")
    void responseShape() throws Exception {
        insertProbe("true");

        mockMvc.perform(get(USERS).with(admin()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data").isArray())
                .andExpect(jsonPath("$.data[0].id").isNumber())
                .andExpect(jsonPath("$.data[0].firstName").exists())
                .andExpect(jsonPath("$.data[0].lastName").exists())
                .andExpect(jsonPath("$.data[0].email").isString())
                .andExpect(jsonPath("$.data[0].role").isString())
                .andExpect(jsonPath("$.data[0].active").isBoolean())
                .andExpect(jsonPath("$.page.size").value(10))
                .andExpect(jsonPath("$.page.page").value(1))
                .andExpect(jsonPath("$.page.totalElements").isNumber())
                .andExpect(jsonPath("$.page.totalPages").isNumber());

        mockMvc.perform(get(USERS).param("q", PROBE_EMAIL).with(admin()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.length()").value(1))
                .andExpect(jsonPath("$.data[0].firstName").value("Probe"))
                .andExpect(jsonPath("$.data[0].lastName").value("Account"))
                .andExpect(jsonPath("$.data[0].email").value(PROBE_EMAIL))
                .andExpect(jsonPath("$.data[0].role").value("user"))
                .andExpect(jsonPath("$.data[0].active").value(true))
                .andExpect(jsonPath("$.page.totalElements").value(1))
                .andExpect(jsonPath("$.page.totalPages").value(1));
    }

    @ParameterizedTest(name = "{displayName} [{0}={1}]")
    @CsvSource({"role, superuser", "status, disabled"})
    @DisplayName("US-01: unknown role or status is a bad request")
    void unknownRoleOrStatusIsABadRequest(String parameter, String value) throws Exception {
        mockMvc.perform(get(USERS).param(parameter, value).with(admin()))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.status").value(400))
                .andExpect(jsonPath("$.message").isString())
                .andExpect(jsonPath("$.path").value(USERS));
    }

    @Test
    @DisplayName("US-01: an account with a null is_active is deactivated")
    void nullIsActiveIsDeactivated() throws Exception {
        insertProbe("NULL");

        mockMvc.perform(get(USERS).param("q", PROBE_EMAIL).param("status", "deactivated").with(admin()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.length()").value(1))
                .andExpect(jsonPath("$.data[0].email").value(PROBE_EMAIL))
                .andExpect(jsonPath("$.data[0].active").value(false));

        mockMvc.perform(get(USERS).param("q", PROBE_EMAIL).param("status", "active").with(admin()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.length()").value(0));

        mockMvc.perform(get(USERS).param("q", PROBE_EMAIL).param("status", "all").with(admin()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.length()").value(1));
    }

    @Test
    @DisplayName("US-01: search ignores case on the email")
    void searchIgnoresCaseOnTheEmail() throws Exception {
        insertProbe("true");

        mockMvc.perform(get(USERS).param("q", PROBE_EMAIL.toUpperCase()).with(admin()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.length()").value(1))
                .andExpect(jsonPath("$.data[0].email").value(PROBE_EMAIL));
    }

    private void insertProbe(String isActive) {
        jdbcTemplate.update(
                "INSERT INTO users (first_name, last_name, email, is_active) VALUES ('Probe', 'Account', ?, " + isActive + ")",
                PROBE_EMAIL);
    }

    private static RequestPostProcessor admin() {
        return user("admin@booksnap.net").roles("ADMIN");
    }
}
