package net.booksnap.domain.library.api;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.Arguments;
import org.junit.jupiter.params.provider.MethodSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;
import org.springframework.transaction.annotation.Transactional;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.stream.Stream;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * <p><strong>Needs the development database up</strong> ({@code docker compose up -d db}).
 *
 * <p>{@code @Transactional} so every write rolls back. Primary is set to 14 / 7 at the start
 * of the tests that assume it, before any request loads the entity.
 */
@SpringBootTest
@AutoConfigureMockMvc
@Transactional
class LoanRulesTest {

    private static final String LOAN_RULES = "/api/v1/libraries/loan-rules";
    private static final String INVALID_MESSAGE =
            "Borrowing duration and pickup window must be whole numbers of days between 1 and 365.";

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private JdbcTemplate jdbcTemplate;

    private static Stream<Arguments> outOfRangeBodies() {
        return Stream.of(
                Arguments.of("borrowing duration 0", "{\"borrowingDurationDays\":0,\"pickupWindowDays\":7}"),
                Arguments.of("pickup window 366", "{\"borrowingDurationDays\":14,\"pickupWindowDays\":366}"),
                Arguments.of("pickup window absent", "{\"borrowingDurationDays\":14}"),
                Arguments.of("borrowing duration 1.5", "{\"borrowingDurationDays\":1.5,\"pickupWindowDays\":7}"));
    }

    private static Stream<Arguments> outOfRangeColumns() {
        return Stream.of(
                Arguments.of("borrowing_duration_days", 0, "library_borrowing_duration_days_check"),
                Arguments.of("borrowing_duration_days", 366, "library_borrowing_duration_days_check"),
                Arguments.of("pickup_window_days", 0, "library_pickup_window_days_check"),
                Arguments.of("pickup_window_days", 366, "library_pickup_window_days_check"));
    }

    @ParameterizedTest(name = "US-01: the API refuses an out-of-range value without saving anything - {0}")
    @MethodSource("outOfRangeBodies")
    void refusesAnOutOfRangeValue(String example, String body) throws Exception {
        resetPrimaryRules();
        long primary = libraryId("Primary");

        mockMvc.perform(saveAsAdmin(primary, body))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message").value(INVALID_MESSAGE));

        assertThat(storedRules(primary)).containsExactly(14, 7);
    }

    @Test
    @DisplayName("US-01: the bounds are accepted")
    void acceptsTheBounds() throws Exception {
        long primary = libraryId("Primary");

        mockMvc.perform(saveAsAdmin(primary, "{\"borrowingDurationDays\":365,\"pickupWindowDays\":1}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.id").value(primary))
                .andExpect(jsonPath("$.name").value("Primary"))
                .andExpect(jsonPath("$.borrowingDurationDays").value(365))
                .andExpect(jsonPath("$.pickupWindowDays").value(1));

        assertThat(storedRules(primary)).containsExactly(365, 1);
    }

    @Test
    @DisplayName("US-01: unknown library")
    void refusesAnUnknownLibrary() throws Exception {
        mockMvc.perform(saveAsAdmin(999999999L, "{\"borrowingDurationDays\":14,\"pickupWindowDays\":7}"))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.message").value("Library not found: 999999999"));
    }

    @Test
    @DisplayName("US-01: the librarian reads the loan rules through the API")
    void librarianReadsTheLoanRules() throws Exception {
        String body = mockMvc.perform(get(LOAN_RULES).with(user("librarian@booksnap.net").roles("LIBRARIAN")))
                .andExpect(status().isOk())
                .andReturn()
                .getResponse()
                .getContentAsString();

        JsonNode rules = new ObjectMapper().readTree(body);
        assertThat(rules.isArray()).isTrue();
        List<String> names = new ArrayList<>();
        for (JsonNode library : rules) {
            assertThat(library.get("id").isNumber()).isTrue();
            assertThat(library.get("name").isTextual()).isTrue();
            assertThat(library.get("borrowingDurationDays").isNumber()).isTrue();
            assertThat(library.get("pickupWindowDays").isNumber()).isTrue();
            names.add(library.get("name").asText());
        }
        assertThat(names).contains("Preschool", "Primary");
    }

    @Test
    @DisplayName("US-01: only the administrator saves")
    void savingIsReservedToTheAdministrator() throws Exception {
        resetPrimaryRules();
        long primary = libraryId("Primary");
        String body = "{\"borrowingDurationDays\":21,\"pickupWindowDays\":3}";

        mockMvc.perform(save(primary, body).with(user("librarian@booksnap.net").roles("LIBRARIAN")))
                .andExpect(status().isForbidden());
        assertThat(storedRules(primary)).containsExactly(14, 7);

        mockMvc.perform(save(primary, body).with(user("student@booksnap.net").roles("USER")))
                .andExpect(status().isForbidden());
        assertThat(storedRules(primary)).containsExactly(14, 7);
    }

    @Test
    @DisplayName("US-01: a user does not read the loan rules")
    void userDoesNotReadTheLoanRules() throws Exception {
        mockMvc.perform(get(LOAN_RULES).with(user("student@booksnap.net").roles("USER")))
                .andExpect(status().isForbidden());
    }

    @ParameterizedTest(name = "US-01: the database refuses an out-of-range duration - {0} = {1}")
    @MethodSource("outOfRangeColumns")
    void databaseRefusesAnOutOfRangeDuration(String column, int value, String constraint) {
        assertThatThrownBy(() -> jdbcTemplate.update(
                        "UPDATE library SET " + column + " = ? WHERE name = 'Primary'", value))
                .isInstanceOf(DataIntegrityViolationException.class)
                .hasMessageContaining(constraint);
    }

    private static MockHttpServletRequestBuilder save(long id, String body) {
        return put("/api/v1/libraries/" + id + "/loan-rules")
                .with(csrf())
                .contentType(MediaType.APPLICATION_JSON)
                .content(body);
    }

    private static MockHttpServletRequestBuilder saveAsAdmin(long id, String body) {
        return save(id, body).with(user("admin@booksnap.net").roles("ADMIN"));
    }

    private void resetPrimaryRules() {
        jdbcTemplate.update(
                "UPDATE library SET borrowing_duration_days = 14, pickup_window_days = 7 WHERE name = 'Primary'");
    }

    private long libraryId(String name) {
        return jdbcTemplate.queryForObject("SELECT id FROM library WHERE name = ?", Long.class, name);
    }

    private List<Integer> storedRules(long id) {
        Map<String, Object> row = jdbcTemplate.queryForMap(
                "SELECT borrowing_duration_days, pickup_window_days FROM library WHERE id = ?", id);
        return List.of(((Number) row.get("borrowing_duration_days")).intValue(),
                ((Number) row.get("pickup_window_days")).intValue());
    }
}
