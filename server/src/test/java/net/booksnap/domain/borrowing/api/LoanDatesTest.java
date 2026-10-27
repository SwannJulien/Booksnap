package net.booksnap.domain.borrowing.api;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.persistence.EntityManager;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.util.Map;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * <p><strong>Needs the development database up</strong> ({@code docker compose up -d db}).
 *
 * <p>{@code @Transactional}: {@code lifecycle_event} is append-only, so everything a test
 * writes must be rolled back. MockMvc shares the test's {@code EntityManager}: once a request
 * has loaded a library, a later SQL update of it is not seen by the service. Loan rules are
 * therefore set in SQL before the first request, or through the endpoint afterwards.
 */
@SpringBootTest
@AutoConfigureMockMvc
@Transactional
class LoanDatesTest {

    private static final String ADMIN = "admin@booksnap.net";

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @Autowired
    private EntityManager entityManager;

    private final ObjectMapper objectMapper = new ObjectMapper();

    @Test
    @DisplayName("US-01: a borrowing follows the loan duration of the copy's library")
    void borrowingFollowsTheLibrarysDuration() throws Exception {
        setRules("Primary", 21, 7);
        setRules("Preschool", 14, 7);
        long primaryCopy = createBookIn("Primary");
        long preschoolCopy = createBookIn("Preschool");
        long student = createStudent();

        JsonNode fromPrimary = borrow(student, primaryCopy);
        JsonNode fromPreschool = borrow(student, preschoolCopy);

        LocalDate today = LocalDate.now();
        assertThat(fromPrimary.get("endDate").asText()).isEqualTo(today.plusDays(21).toString());
        assertThat(fromPreschool.get("endDate").asText()).isEqualTo(today.plusDays(14).toString());
        entityManager.flush();
        assertThat(storedBorrowingEnd(fromPrimary.get("id").asLong())).isEqualTo(today.plusDays(21));
        assertThat(storedBorrowingEnd(fromPreschool.get("id").asLong())).isEqualTo(today.plusDays(14));
    }

    @Test
    @DisplayName("US-01: a copy set aside follows the pickup window of its library")
    void setAsideCopyFollowsThePickupWindow() throws Exception {
        setRules("Primary", 14, 3);
        long book = createBook("Primary");
        long copy = copyOf(book);
        JsonNode borrowing = borrow(createStudent(), copy);
        entityManager.flush();
        long hold = insertPendingHold(book, libraryId("Primary"), createStudent());

        JsonNode returned = giveBack(borrowing.get("id").asLong());
        entityManager.flush();

        assertThat(returned.get("promotedHoldId").asLong()).isEqualTo(hold);
        Map<String, Object> row = jdbcTemplate.queryForMap(
                "SELECT status::text AS status, copy_id, start_date, end_date FROM hold WHERE id = ?", hold);
        assertThat(row.get("status")).isEqualTo("active");
        assertThat(((Number) row.get("copy_id")).longValue()).isEqualTo(copy);
        assertThat(row.get("end_date").toString()).isEqualTo(LocalDate.now().plusDays(3).toString());
    }

    @Test
    @DisplayName("US-01: a borrowing in progress keeps its due date")
    void borrowingInProgressKeepsItsDueDate() throws Exception {
        setRules("Primary", 14, 7);
        long copy = createBookIn("Primary");
        JsonNode borrowing = borrow(createStudent(), copy);
        entityManager.flush();
        long borrowingId = borrowing.get("id").asLong();
        LocalDate due = storedBorrowingEnd(borrowingId);
        assertThat(due).isEqualTo(LocalDate.now().plusDays(14));

        mockMvc.perform(admin(put("/api/v1/libraries/" + libraryId("Primary") + "/loan-rules"))
                        .content("{\"borrowingDurationDays\":21,\"pickupWindowDays\":7}"))
                .andExpect(status().isOk());
        entityManager.flush();

        assertThat(storedBorrowingEnd(borrowingId)).isEqualTo(due);
    }

    @Test
    @DisplayName("US-01: a copy already set aside keeps its deadline")
    void setAsideCopyKeepsItsDeadline() throws Exception {
        setRules("Primary", 14, 7);
        long book = createBook("Primary");
        JsonNode borrowing = borrow(createStudent(), copyOf(book));
        entityManager.flush();
        long hold = insertPendingHold(book, libraryId("Primary"), createStudent());
        giveBack(borrowing.get("id").asLong());
        entityManager.flush();
        Map<String, Object> promoted = jdbcTemplate.queryForMap(
                "SELECT status::text AS status, end_date FROM hold WHERE id = ?", hold);
        assertThat(promoted.get("status")).isEqualTo("active");
        String deadline = promoted.get("end_date").toString();
        assertThat(deadline).isEqualTo(LocalDate.now().plusDays(7).toString());

        mockMvc.perform(admin(put("/api/v1/libraries/" + libraryId("Primary") + "/loan-rules"))
                        .content("{\"borrowingDurationDays\":14,\"pickupWindowDays\":3}"))
                .andExpect(status().isOk());
        entityManager.flush();

        assertThat(jdbcTemplate.queryForObject("SELECT end_date FROM hold WHERE id = ?", Object.class, hold).toString())
                .isEqualTo(deadline);
    }

    private void setRules(String library, int borrowingDays, int pickupDays) {
        jdbcTemplate.update(
                "UPDATE library SET borrowing_duration_days = ?, pickup_window_days = ? WHERE name = ?",
                borrowingDays, pickupDays, library);
    }

    private long createBookIn(String library) throws Exception {
        return copyOf(createBook(library));
    }

    private long createBook(String library) throws Exception {
        String suffix = UUID.randomUUID().toString();
        JsonNode created = json(admin(post("/api/v1/books"))
                .content("""
                        {"title": "US01 loan %s", "isFiction": true, "genres": ["US01 Genre %s"],
                         "authors": ["US01 Author %s"], "libraryId": %d, "sectionName": "Fiction"}
                        """.formatted(suffix, suffix, suffix, libraryId(library))));
        return created.get("bookId").asLong();
    }

    private long copyOf(long bookId) {
        return jdbcTemplate.queryForObject("SELECT id FROM copy WHERE book_id = ? AND deleted_at IS NULL", Long.class, bookId);
    }

    private long createStudent() {
        return jdbcTemplate.queryForObject(
                "INSERT INTO users (first_name, last_name, email) VALUES (?, ?, ?) RETURNING id",
                Long.class, "Clara", "Dupont", "us01-" + UUID.randomUUID() + "@example.com");
    }

    private long insertPendingHold(long bookId, long libraryId, long userId) {
        return jdbcTemplate.queryForObject(
                "INSERT INTO hold (book_id, library_id, user_id, status) VALUES (?, ?, ?, 'pending') RETURNING id",
                Long.class, bookId, libraryId, userId);
    }

    private JsonNode borrow(long userId, long copyId) throws Exception {
        return json(admin(post("/api/v1/borrowings"))
                .content("{\"userId\": %d, \"copyId\": %d}".formatted(userId, copyId)));
    }

    private JsonNode giveBack(long borrowingId) throws Exception {
        return json(admin(post("/api/v1/borrowings/" + borrowingId + "/return")));
    }

    private long libraryId(String name) {
        return jdbcTemplate.queryForObject("SELECT id FROM library WHERE name = ?", Long.class, name);
    }

    private LocalDate storedBorrowingEnd(long borrowingId) {
        return jdbcTemplate.queryForObject("SELECT end_date FROM borrowing WHERE id = ?", LocalDate.class, borrowingId);
    }

    private JsonNode json(MockHttpServletRequestBuilder request) throws Exception {
        String body = mockMvc.perform(request)
                .andExpect(status().is2xxSuccessful())
                .andReturn().getResponse().getContentAsString();
        return objectMapper.readTree(body);
    }

    private static MockHttpServletRequestBuilder admin(MockHttpServletRequestBuilder request) {
        return request
                .with(user(ADMIN).roles("ADMIN"))
                .with(csrf())
                .contentType(MediaType.APPLICATION_JSON);
    }
}
