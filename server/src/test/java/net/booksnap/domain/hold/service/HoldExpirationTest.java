package net.booksnap.domain.hold.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.persistence.EntityManager;
import net.booksnap.BooksnapApplication;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.ApplicationContext;
import org.springframework.context.ConfigurableApplicationContext;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;
import org.springframework.transaction.annotation.Transactional;

import java.time.Duration;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * <p><strong>Needs the development database up</strong> ({@code docker compose up -d db}).
 *
 * <p>{@code @Transactional}: {@code lifecycle_event} is append-only, so everything a test
 * writes must be rolled back. The scheduler has no transaction of its own, so the expiry
 * joins the test's.
 */
@SpringBootTest
@AutoConfigureMockMvc
@Transactional
class HoldExpirationTest {

    private static final String ADMIN = "admin@booksnap.net";
    private static final int PICKUP_WINDOW = 3;

    private record Book(long bookId, long p1) {}

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @Autowired
    private EntityManager entityManager;

    @Autowired
    private HoldExpirationScheduler holdExpirationScheduler;

    @Autowired
    private ApplicationContext applicationContext;

    private final ObjectMapper objectMapper = new ObjectMapper();

    @Test
    @DisplayName("US-03: a hold past its deadline expires")
    void holdPastItsDeadlineExpires() throws Exception {
        Book book = createBook();
        long alice = createStudent("Alice");
        long aliceHold = insertActiveHold(book, "Preschool", alice, book.p1(), -1);

        holdExpirationScheduler.expireUncollectedHolds();
        entityManager.flush();

        Map<String, Object> row = holdRow(aliceHold);
        assertThat(row.get("status")).isEqualTo("expired");
        assertThat(row.get("last_modified_by")).isEqualTo("system");
        assertThat(copyStatus(book.p1())).isEqualTo("available");
    }

    @Test
    @DisplayName("US-03: the last pickup day does not expire")
    void lastPickupDayDoesNotExpire() throws Exception {
        Book book = createBook();
        long alice = createStudent("Alice");
        long aliceHold = insertActiveHold(book, "Preschool", alice, book.p1(), 0);

        holdExpirationScheduler.expireUncollectedHolds();
        entityManager.flush();

        assertThat(holdRow(aliceHold).get("status")).isEqualTo("active");
        assertThat(copyStatus(book.p1())).isEqualTo("on_hold");
    }

    @Test
    @DisplayName("US-03: the freed copy goes to the next in line")
    void freedCopyGoesToTheNextInLine() throws Exception {
        jdbcTemplate.update("UPDATE library SET pickup_window_days = ? WHERE name = 'Preschool'", PICKUP_WINDOW);
        Book book = createBook();
        long p2 = addCopy(book, "Preschool");
        borrowAll(p2);
        long alice = createStudent("Alice");
        long chloe = createStudent("Chloe");
        long aliceHold = insertActiveHold(book, "Preschool", alice, book.p1(), -1);
        long chloeHold = insertPendingHold(book.bookId(), libraryId("Preschool"), chloe, 1);
        entityManager.flush();
        entityManager.clear();

        holdExpirationScheduler.expireUncollectedHolds();
        entityManager.flush();

        assertThat(holdRow(aliceHold).get("status")).isEqualTo("expired");
        Map<String, Object> chloesRow = holdRow(chloeHold);
        assertThat(chloesRow.get("status")).isEqualTo("active");
        assertThat(((Number) chloesRow.get("copy_id")).longValue()).isEqualTo(book.p1());
        assertThat(chloesRow.get("start_date")).isEqualTo(LocalDate.now().toString());
        assertThat(chloesRow.get("end_date")).isEqualTo(LocalDate.now().plusDays(PICKUP_WINDOW).toString());
        assertThat(chloesRow.get("last_modified_by")).isEqualTo("system");
        assertThat(copyStatus(book.p1())).isEqualTo("on_hold");
    }

    @Test
    @DisplayName("US-03: the freed copy does not serve another library")
    void freedCopyDoesNotServeAnotherLibrary() throws Exception {
        Book book = createBook();
        long r1 = addCopy(book, "Primary");
        borrowAll(r1);
        long alice = createStudent("Alice");
        long bob = createStudent("Bob");
        long aliceHold = insertActiveHold(book, "Preschool", alice, book.p1(), -1);
        long bobHold = insertPendingHold(book.bookId(), libraryId("Primary"), bob, 1);
        entityManager.flush();
        entityManager.clear();

        holdExpirationScheduler.expireUncollectedHolds();
        entityManager.flush();

        assertThat(holdRow(aliceHold).get("status")).isEqualTo("expired");
        assertThat(copyStatus(book.p1())).isEqualTo("available");
        Map<String, Object> bobsRow = holdRow(bobHold);
        assertThat(bobsRow.get("status")).isEqualTo("pending");
        assertThat(bobsRow.get("copy_id")).isNull();
    }

    @Test
    @DisplayName("US-03: several holds expire the same day")
    void severalHoldsExpireTheSameDay() throws Exception {
        Book book = createBook();
        long r1 = addCopy(book, "Primary");
        long alice = createStudent("Alice");
        long bob = createStudent("Bob");
        long aliceHold = insertActiveHold(book, "Preschool", alice, book.p1(), -1);
        long bobHold = insertActiveHold(book, "Primary", bob, r1, -1);
        entityManager.flush();
        entityManager.clear();

        holdExpirationScheduler.expireUncollectedHolds();
        entityManager.flush();

        assertThat(holdRow(aliceHold).get("status")).isEqualTo("expired");
        assertThat(holdRow(bobHold).get("status")).isEqualTo("expired");
        assertThat(copyStatus(book.p1())).isEqualTo("available");
        assertThat(copyStatus(r1)).isEqualTo("available");
    }

    @Test
    @DisplayName("US-03: startup catches up missed days")
    void startupCatchesUpMissedDays() throws Exception {
        Book book = createBook();
        long alice = createStudent("Alice");
        long aliceHold = insertActiveHold(book, "Preschool", alice, book.p1(), -3);

        applicationContext.publishEvent(new ApplicationReadyEvent(
                new SpringApplication(BooksnapApplication.class), new String[0],
                (ConfigurableApplicationContext) applicationContext, Duration.ZERO));
        entityManager.flush();

        assertThat(holdRow(aliceHold).get("status")).isEqualTo("expired");
    }

    @Test
    @DisplayName("US-03: the expiry is logged under the system")
    void expiryIsLoggedUnderTheSystem() throws Exception {
        Book book = createBook();
        long alice = createStudent("Alice");
        insertActiveHold(book, "Preschool", alice, book.p1(), -1);

        holdExpirationScheduler.expireUncollectedHolds();
        entityManager.flush();

        JsonNode history = json(admin(get("/api/v1/copies/" + book.p1() + "/history")), 200);
        List<JsonNode> expirations = new ArrayList<>();
        history.get("data").forEach(event -> {
            if (event.get("type").asText().equals("hold_expired")) {
                expirations.add(event);
            }
        });
        assertThat(expirations).hasSize(1);
        assertThat(expirations.get(0).get("student").get("id").asLong()).isEqualTo(alice);
        assertThat(expirations.get(0).get("actor").asText()).isEqualTo("system");
    }

    @Test
    @DisplayName("US-03: a pending hold does not expire")
    void pendingHoldDoesNotExpire() throws Exception {
        Book book = createBook();
        borrowAll(book.p1());
        long alice = createStudent("Alice");
        entityManager.flush();
        long aliceHold = insertPendingHold(book.bookId(), libraryId("Preschool"), alice, 70 * 24);

        holdExpirationScheduler.expireUncollectedHolds();
        entityManager.flush();

        assertThat(holdRow(aliceHold).get("status")).isEqualTo("pending");
    }

    @Test
    @DisplayName("US-03: finished holds are untouched")
    void finishedHoldsAreUntouched() throws Exception {
        Book book = createBook();
        long p2 = addCopy(book, "Preschool");
        long alice = createStudent("Alice");
        long bob = createStudent("Bob");
        entityManager.flush();
        long fulfilledHold = insertHold(book, "Preschool", alice, book.p1(), "fulfilled", -2);
        long expiredHold = insertHold(book, "Preschool", bob, p2, "expired", -2);
        entityManager.flush();
        entityManager.clear();
        long eventsBefore = eventCount(fulfilledHold, expiredHold);

        holdExpirationScheduler.expireUncollectedHolds();
        entityManager.flush();

        assertThat(holdRow(fulfilledHold).get("status")).isEqualTo("fulfilled");
        assertThat(holdRow(expiredHold).get("status")).isEqualTo("expired");
        assertThat(eventCount(fulfilledHold, expiredHold)).isEqualTo(eventsBefore);
    }

    @Test
    @DisplayName("US-03: a student whose hold expired can hold again")
    void studentWhoseHoldExpiredCanHoldAgain() throws Exception {
        Book book = createBook();
        long alice = createStudent("Alice");
        insertActiveHold(book, "Preschool", alice, book.p1(), -1);

        holdExpirationScheduler.expireUncollectedHolds();
        entityManager.flush();
        borrowAll(book.p1());

        placeHold(alice, book.p1(), 201);
    }

    private Book createBook() throws Exception {
        String suffix = UUID.randomUUID().toString();
        JsonNode created = json(admin(post("/api/v1/books"))
                .content("""
                        {"title": "US03 expiry %s", "isFiction": true, "genres": ["US03 Genre %s"],
                         "authors": ["US03 Author %s"], "libraryId": %d, "sectionName": "Fiction"}
                        """.formatted(suffix, suffix, suffix, libraryId("Preschool"))), 201);
        return new Book(created.get("bookId").asLong(), created.get("copyId").asLong());
    }

    private long addCopy(Book book, String library) throws Exception {
        JsonNode created = json(admin(post("/api/v1/copies"))
                .content("""
                        {"bookId": %d, "libraryId": %d, "sectionName": "Fiction", "status": "available"}
                        """.formatted(book.bookId(), libraryId(library))), 201);
        return created.get("copyId").asLong();
    }

    private long[] borrowAll(long... copyIds) throws Exception {
        long[] borrowings = new long[copyIds.length];
        for (int i = 0; i < copyIds.length; i++) {
            borrowings[i] = json(admin(post("/api/v1/borrowings"))
                    .content("{\"userId\": %d, \"copyId\": %d}".formatted(createStudent("Borrower"), copyIds[i])), 201)
                    .get("id").asLong();
        }
        return borrowings;
    }

    private JsonNode placeHold(long userId, long copyId, int expectedStatus) throws Exception {
        return json(admin(post("/api/v1/holds"))
                .content("{\"userId\": %d, \"copyId\": %d}".formatted(userId, copyId)), expectedStatus);
    }

    private long createStudent(String firstName) {
        return jdbcTemplate.queryForObject(
                "INSERT INTO users (first_name, last_name, email) VALUES (?, ?, ?) RETURNING id",
                Long.class, firstName, "Hold", "us03-" + UUID.randomUUID() + "@example.com");
    }

    private long insertActiveHold(Book book, String library, long userId, long copyId, int endDateOffsetDays) {
        return insertHold(book, library, userId, copyId, "active", endDateOffsetDays);
    }

    private long insertHold(Book book, String library, long userId, long copyId, String status,
                            int endDateOffsetDays) {
        entityManager.flush();
        long holdId = jdbcTemplate.queryForObject(
                "INSERT INTO hold (book_id, library_id, user_id, copy_id, status, start_date, end_date, "
                        + "created_date, last_modified_by) "
                        + "VALUES (?, ?, ?, ?, ?::hold_status, current_date + ?::int - 7, current_date + ?::int, "
                        + "now() - interval '9 days', 'librarian@booksnap.net') RETURNING id",
                Long.class, book.bookId(), libraryId(library), userId, copyId, status,
                endDateOffsetDays, endDateOffsetDays);
        entityManager.flush();
        entityManager.clear();
        return holdId;
    }

    private long insertPendingHold(long bookId, long libraryId, long userId, int hoursAgo) {
        return jdbcTemplate.queryForObject(
                "INSERT INTO hold (book_id, library_id, user_id, status, created_date) "
                        + "VALUES (?, ?, ?, 'pending', now() - (? * interval '1 hour')) RETURNING id",
                Long.class, bookId, libraryId, userId, hoursAgo);
    }

    private Map<String, Object> holdRow(long holdId) {
        return jdbcTemplate.queryForMap(
                "SELECT status::text AS status, copy_id, library_id, start_date::text AS start_date, "
                        + "end_date::text AS end_date, last_modified_by FROM hold WHERE id = ?", holdId);
    }

    private long eventCount(long firstHoldId, long secondHoldId) {
        return jdbcTemplate.queryForObject(
                "SELECT count(*) FROM lifecycle_event WHERE hold_id IN (?, ?)", Long.class, firstHoldId, secondHoldId);
    }

    private String copyStatus(long copyId) {
        return jdbcTemplate.queryForObject("SELECT status::text FROM copy WHERE id = ?", String.class, copyId);
    }

    private long libraryId(String name) {
        return jdbcTemplate.queryForObject("SELECT id FROM library WHERE name = ?", Long.class, name);
    }

    private JsonNode json(MockHttpServletRequestBuilder request, int expectedStatus) throws Exception {
        String body = mockMvc.perform(request)
                .andExpect(status().is(expectedStatus))
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
