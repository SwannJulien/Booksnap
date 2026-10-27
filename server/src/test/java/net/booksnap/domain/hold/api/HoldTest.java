package net.booksnap.domain.hold.api;

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

import java.util.Map;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * <p><strong>Needs the development database up</strong> ({@code docker compose up -d db}).
 *
 * <p>{@code @Transactional}: {@code lifecycle_event} is append-only, so everything a test
 * writes must be rolled back.
 */
@SpringBootTest
@AutoConfigureMockMvc
@Transactional
class HoldTest {

    private static final String ADMIN = "admin@booksnap.net";
    private static final long ABSENT_ID = 999999999L;

    private record Book(long bookId, long p1) {}

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @Autowired
    private EntityManager entityManager;

    private final ObjectMapper objectMapper = new ObjectMapper();

    @Test
    @DisplayName("US-02: a reservation takes the copy's library")
    void reservationTakesTheCopysLibrary() throws Exception {
        Book book = createBook();
        long p2 = addCopy(book, "Preschool");
        long r1 = addCopy(book, "Primary");
        borrowAll(book.p1(), p2, r1);
        long alice = createStudent("Alice");

        JsonNode hold = placeHold(alice, p2, 201);

        assertThat(hold.get("status").asText()).isEqualTo("pending");
        entityManager.flush();
        Map<String, Object> row = holdRow(hold.get("id").asLong());
        assertThat(row.get("status")).isEqualTo("pending");
        assertThat(row.get("copy_id")).isNull();
        assertThat(((Number) row.get("library_id")).longValue()).isEqualTo(libraryId("Preschool"));
    }

    @Test
    @DisplayName("US-02: an available copy elsewhere does not prevent holding")
    void availableCopyElsewhereDoesNotPreventHolding() throws Exception {
        Book book = createBook();
        long p2 = addCopy(book, "Preschool");
        addCopy(book, "Primary");
        borrowAll(book.p1(), p2);
        long alice = createStudent("Alice");

        JsonNode hold = placeHold(alice, book.p1(), 201);

        entityManager.flush();
        assertThat(((Number) holdRow(hold.get("id").asLong()).get("library_id")).longValue())
                .isEqualTo(libraryId("Preschool"));
    }

    @Test
    @DisplayName("US-02: an available copy in the same library prevents holding")
    void availableCopyInTheSameLibraryPreventsHolding() throws Exception {
        Book book = createBook();
        addCopy(book, "Preschool");
        long r1 = addCopy(book, "Primary");
        borrowAll(book.p1(), r1);
        long alice = createStudent("Alice");

        JsonNode error = placeHold(alice, book.p1(), 409);

        assertThat(error.get("message").asText())
                .isEqualTo("A copy of this book is available at Preschool: borrow it instead.");
        assertThat(error.get("reason").asText()).isEqualTo("copy_available");
        entityManager.flush();
        assertThat(holdCount(book.bookId())).isZero();
    }

    @Test
    @DisplayName("US-02: the position counts the library's queue only")
    void positionCountsTheLibrarysQueueOnly() throws Exception {
        Book book = createBook();
        long p2 = addCopy(book, "Preschool");
        long r1 = addCopy(book, "Primary");
        borrowAll(book.p1(), p2, r1);
        long bob = createStudent("Bob");
        entityManager.flush();
        insertPendingHold(book.bookId(), libraryId("Primary"), bob, 1);

        JsonNode hold = placeHold(createStudent("Alice"), book.p1(), 201);

        assertThat(hold.get("queuePosition").asInt()).isEqualTo(1);
    }

    @Test
    @DisplayName("US-02: a returned copy serves its library's queue")
    void returnedCopyServesItsLibrarysQueue() throws Exception {
        Book book = createBook();
        long p2 = addCopy(book, "Preschool");
        long r1 = addCopy(book, "Primary");
        long[] borrowings = borrowAll(book.p1(), p2, r1);
        long bob = createStudent("Bob");
        long alice = createStudent("Alice");
        entityManager.flush();
        long bobHold = insertPendingHold(book.bookId(), libraryId("Primary"), bob, 2);
        long aliceHold = insertPendingHold(book.bookId(), libraryId("Preschool"), alice, 1);

        JsonNode returned = giveBack(borrowings[1]);
        entityManager.flush();

        assertThat(returned.get("promotedHoldId").asLong()).isEqualTo(aliceHold);
        assertThat(returned.get("copyStatus").asText()).isEqualTo("on_hold");
        Map<String, Object> alicesRow = holdRow(aliceHold);
        assertThat(alicesRow.get("status")).isEqualTo("active");
        assertThat(((Number) alicesRow.get("copy_id")).longValue()).isEqualTo(p2);
        Map<String, Object> bobsRow = holdRow(bobHold);
        assertThat(bobsRow.get("status")).isEqualTo("pending");
        assertThat(bobsRow.get("copy_id")).isNull();
        assertThat(copyStatus(p2)).isEqualTo("on_hold");
    }

    @Test
    @DisplayName("US-02: a returned copy does not serve another library")
    void returnedCopyDoesNotServeAnotherLibrary() throws Exception {
        Book book = createBook();
        long p2 = addCopy(book, "Preschool");
        long r1 = addCopy(book, "Primary");
        long[] borrowings = borrowAll(book.p1(), p2, r1);
        long alice = createStudent("Alice");
        entityManager.flush();
        long aliceHold = insertPendingHold(book.bookId(), libraryId("Preschool"), alice, 1);

        JsonNode returned = giveBack(borrowings[2]);
        entityManager.flush();

        assertThat(returned.get("promotedHoldId") == null || returned.get("promotedHoldId").isNull()).isTrue();
        assertThat(returned.get("copyStatus").asText()).isEqualTo("available");
        assertThat(holdRow(aliceHold).get("status")).isEqualTo("pending");
    }

    @Test
    @DisplayName("US-02: within a library, the oldest hold is served")
    void withinALibraryTheOldestHoldIsServed() throws Exception {
        Book book = createBook();
        long p2 = addCopy(book, "Preschool");
        long r1 = addCopy(book, "Primary");
        long[] borrowings = borrowAll(book.p1(), p2, r1);
        long alice = createStudent("Alice");
        long chloe = createStudent("Chloe");
        entityManager.flush();
        long aliceHold = insertPendingHold(book.bookId(), libraryId("Preschool"), alice, 2);
        long chloeHold = insertPendingHold(book.bookId(), libraryId("Preschool"), chloe, 1);

        JsonNode returned = giveBack(borrowings[0]);
        entityManager.flush();

        assertThat(returned.get("promotedHoldId").asLong()).isEqualTo(aliceHold);
        Map<String, Object> alicesRow = holdRow(aliceHold);
        assertThat(alicesRow.get("status")).isEqualTo("active");
        assertThat(((Number) alicesRow.get("copy_id")).longValue()).isEqualTo(book.p1());
        assertThat(holdRow(chloeHold).get("status")).isEqualTo("pending");
    }

    @Test
    @DisplayName("US-02: a student does not hold the same book twice, even elsewhere")
    void studentDoesNotHoldTheSameBookTwiceEvenElsewhere() throws Exception {
        Book book = createBook();
        long p2 = addCopy(book, "Preschool");
        long r1 = addCopy(book, "Primary");
        borrowAll(book.p1(), p2, r1);
        long alice = createStudent("Alice");
        entityManager.flush();
        insertPendingHold(book.bookId(), libraryId("Primary"), alice, 1);

        JsonNode error = placeHold(alice, book.p1(), 409);

        assertThat(error.get("reason").asText()).isEqualTo("duplicate_hold");
    }

    @Test
    @DisplayName("US-02: holding from a missing or deleted copy")
    void holdingFromAMissingOrDeletedCopy() throws Exception {
        Book book = createBook();
        long p2 = addCopy(book, "Preschool");
        borrowAll(book.p1());
        long alice = createStudent("Alice");
        deleteCopy(p2);

        placeHold(alice, ABSENT_ID, 404);
        placeHold(alice, p2, 404);

        entityManager.flush();
        assertThat(jdbcTemplate.queryForObject("SELECT count(*) FROM hold WHERE user_id = ?", Long.class, alice))
                .isZero();
    }

    @Test
    @DisplayName("US-02: a deleted copy does not count as available")
    void deletedCopyDoesNotCountAsAvailable() throws Exception {
        Book book = createBook();
        long p2 = addCopy(book, "Preschool");
        borrowAll(book.p1());
        deleteCopy(p2);
        long alice = createStudent("Alice");

        placeHold(alice, book.p1(), 201);
    }

    private Book createBook() throws Exception {
        String suffix = UUID.randomUUID().toString();
        JsonNode created = json(admin(post("/api/v1/books"))
                .content("""
                        {"title": "US02 hold %s", "isFiction": true, "genres": ["US02 Genre %s"],
                         "authors": ["US02 Author %s"], "libraryId": %d, "sectionName": "Fiction"}
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

    private JsonNode giveBack(long borrowingId) throws Exception {
        return json(admin(post("/api/v1/borrowings/" + borrowingId + "/return")), 200);
    }

    private void deleteCopy(long copyId) throws Exception {
        mockMvc.perform(admin(delete("/api/v1/copies/" + copyId)))
                .andExpect(status().is2xxSuccessful());
    }

    private JsonNode placeHold(long userId, long copyId, int expectedStatus) throws Exception {
        return json(admin(post("/api/v1/holds"))
                .content("{\"userId\": %d, \"copyId\": %d}".formatted(userId, copyId)), expectedStatus);
    }

    private long createStudent(String firstName) {
        return jdbcTemplate.queryForObject(
                "INSERT INTO users (first_name, last_name, email) VALUES (?, ?, ?) RETURNING id",
                Long.class, firstName, "Hold", "us02-" + UUID.randomUUID() + "@example.com");
    }

    private long insertPendingHold(long bookId, long libraryId, long userId, int hoursAgo) {
        return jdbcTemplate.queryForObject(
                "INSERT INTO hold (book_id, library_id, user_id, status, created_date) "
                        + "VALUES (?, ?, ?, 'pending', now() - (? * interval '1 hour')) RETURNING id",
                Long.class, bookId, libraryId, userId, hoursAgo);
    }

    private Map<String, Object> holdRow(long holdId) {
        return jdbcTemplate.queryForMap(
                "SELECT status::text AS status, copy_id, library_id FROM hold WHERE id = ?", holdId);
    }

    private long holdCount(long bookId) {
        return jdbcTemplate.queryForObject("SELECT count(*) FROM hold WHERE book_id = ?", Long.class, bookId);
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
