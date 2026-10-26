package net.booksnap.domain.library.api;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.annotation.Transactional;

import java.util.ArrayList;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * <p><strong>Needs the development database up</strong> ({@code docker compose up -d db}).
 *
 * <p>{@code @Transactional} so the inserted library rolls back. The development database may
 * already hold other libraries: only the relative order of the known ones is checked. A
 * leftover {@code annexe} from a manual check would fail the insert on {@code library_name_key}.
 */
@SpringBootTest
@AutoConfigureMockMvc
@Transactional
class LibraryTest {

    private static final String LIBRARIES = "/api/v1/libraries";

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @Test
    @DisplayName("US-01: the list is sorted ignoring case")
    void listIsSortedIgnoringCase() throws Exception {
        jdbcTemplate.update("INSERT INTO library (name) VALUES ('annexe')");

        String body = mockMvc.perform(get(LIBRARIES).with(user("admin@booksnap.net").roles("ADMIN")))
                .andExpect(status().isOk())
                .andReturn()
                .getResponse()
                .getContentAsString();

        JsonNode libraries = new ObjectMapper().readTree(body);
        assertThat(libraries.isArray()).isTrue();
        List<String> names = new ArrayList<>();
        for (JsonNode library : libraries) {
            assertThat(library.get("id").isNumber()).isTrue();
            assertThat(library.get("name").isTextual()).isTrue();
            names.add(library.get("name").asText());
        }
        assertThat(names).contains("annexe", "Preschool", "Primary");
        assertThat(names.indexOf("annexe")).isLessThan(names.indexOf("Preschool"));
        assertThat(names.indexOf("Preschool")).isLessThan(names.indexOf("Primary"));
    }

    @Test
    @DisplayName("US-01: the API refuses the list to a non-admin")
    void refusesTheListToANonAdmin() throws Exception {
        mockMvc.perform(get(LIBRARIES).with(user("librarian@booksnap.net").roles("LIBRARIAN")))
                .andExpect(status().isForbidden());

        mockMvc.perform(get(LIBRARIES).with(user("student@booksnap.net").roles("USER")))
                .andExpect(status().isForbidden());
    }

    @Test
    @DisplayName("US-01: the API refuses the list without a session")
    void refusesTheListWithoutASession() throws Exception {
        mockMvc.perform(get(LIBRARIES))
                .andExpect(status().isUnauthorized());
    }
}
