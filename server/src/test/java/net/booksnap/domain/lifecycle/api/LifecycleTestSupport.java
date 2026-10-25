package net.booksnap.domain.lifecycle.api;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;

import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Builds the scenarios' data through the real API, inside the test transaction, and reads
 * the history and archive endpoints back as JSON.
 */
final class LifecycleTestSupport {

    static final String ADMIN = "admin@booksnap.net";
    static final String ABSENT_ID = "999999999";

    record BookFixture(long bookId, long copyId, String title, String identificationCode, String genre, String author) {}

    record CopyFixture(long copyId, String identificationCode) {}

    private final MockMvc mockMvc;
    private final JdbcTemplate jdbcTemplate;
    private final ObjectMapper objectMapper = new ObjectMapper();

    LifecycleTestSupport(MockMvc mockMvc, JdbcTemplate jdbcTemplate) {
        this.mockMvc = mockMvc;
        this.jdbcTemplate = jdbcTemplate;
    }

    static String uniqueTitle(String prefix) {
        return prefix + " " + UUID.randomUUID();
    }

    /** Makes every trigger-written event of the current transaction carry {@code actor}. */
    void actAs(String actor) {
        jdbcTemplate.queryForObject("SELECT set_config('booksnap.actor', ?, true)", String.class, actor);
    }

    BookFixture createBook(String titlePrefix) throws Exception {
        String suffix = UUID.randomUUID().toString();
        String title = titlePrefix + " " + suffix;
        String genre = "US05 Genre " + suffix;
        String author = "US05 Author " + suffix;
        JsonNode created = json(admin(post("/api/v1/books"))
                .content("""
                        {"title": "%s", "isFiction": true, "genres": ["%s"], "authors": ["%s"],
                         "libraryId": 1, "sectionName": "Fiction"}
                        """.formatted(title, genre, author)));
        return new BookFixture(created.get("bookId").asLong(), created.get("copyId").asLong(), title,
                created.get("identificationCode").asText(), genre, author);
    }

    CopyFixture addCopy(long bookId) throws Exception {
        JsonNode created = json(admin(post("/api/v1/copies"))
                .content("""
                        {"bookId": %d, "libraryId": 1, "sectionName": "Fiction", "status": "available"}
                        """.formatted(bookId)));
        return new CopyFixture(created.get("copyId").asLong(), created.get("identificationCode").asText());
    }

    void renameBook(BookFixture book, String newTitle) throws Exception {
        mockMvc.perform(admin(put("/api/v1/books/" + book.bookId()))
                        .content("""
                                {"title": "%s", "isFiction": true, "genres": ["%s"], "authors": ["%s"]}
                                """.formatted(newTitle, book.genre(), book.author())))
                .andExpect(status().is2xxSuccessful());
    }

    long createStudent(String firstName, String lastName) {
        return jdbcTemplate.queryForObject(
                "INSERT INTO users (first_name, last_name, email) VALUES (?, ?, ?) RETURNING id",
                Long.class, firstName, lastName, "us05-" + UUID.randomUUID() + "@example.com");
    }

    long borrow(long userId, long copyId) throws Exception {
        return json(admin(post("/api/v1/borrowings"))
                .content("""
                        {"userId": %d, "copyId": %d}
                        """.formatted(userId, copyId))).get("id").asLong();
    }

    void giveBack(long borrowingId) throws Exception {
        mockMvc.perform(admin(post("/api/v1/borrowings/" + borrowingId + "/return")))
                .andExpect(status().is2xxSuccessful());
    }

    void setCopyStatus(long copyId, String newStatus) throws Exception {
        mockMvc.perform(admin(put("/api/v1/copies/" + copyId))
                        .content("""
                                {"status": "%s"}
                                """.formatted(newStatus)))
                .andExpect(status().is2xxSuccessful());
    }

    void placeHold(long userId, long bookId) throws Exception {
        mockMvc.perform(admin(post("/api/v1/holds"))
                        .content("""
                                {"userId": %d, "bookId": %d}
                                """.formatted(userId, bookId)))
                .andExpect(status().is2xxSuccessful());
    }

    void deleteBook(long bookId) throws Exception {
        mockMvc.perform(admin(delete("/api/v1/books/" + bookId)))
                .andExpect(status().is2xxSuccessful());
    }

    void deleteCopy(long copyId) throws Exception {
        mockMvc.perform(admin(delete("/api/v1/copies/" + copyId)))
                .andExpect(status().is2xxSuccessful());
    }

    /** Reads an endpoint as an administrator and expects 200. */
    JsonNode read(String url) throws Exception {
        return objectMapper.readTree(mockMvc.perform(get(url).with(user(ADMIN).roles("ADMIN")))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString());
    }

    /** Every row of a paged endpoint, following {@code page.totalPages} with the default page size. */
    List<JsonNode> readAllPages(String url) throws Exception {
        List<JsonNode> rows = new ArrayList<>();
        int totalPages = 1;
        for (int page = 1; page <= totalPages; page++) {
            JsonNode body = read(url + "?page=" + page);
            totalPages = body.get("page").get("totalPages").asInt();
            body.get("data").forEach(rows::add);
        }
        return rows;
    }

    static List<JsonNode> ofType(JsonNode history, String type) {
        List<JsonNode> matching = new ArrayList<>();
        history.get("data").forEach(event -> {
            if (type.equals(event.get("type").asText())) {
                matching.add(event);
            }
        });
        return matching;
    }

    static List<String> types(JsonNode history) {
        List<String> types = new ArrayList<>();
        history.get("data").forEach(event -> types.add(event.get("type").asText()));
        return types;
    }

    static boolean isNull(JsonNode event, String field) {
        return event.path(field).isNull() || event.path(field).isMissingNode();
    }

    private JsonNode json(MockHttpServletRequestBuilder request) throws Exception {
        return objectMapper.readTree(mockMvc.perform(request)
                .andExpect(status().is2xxSuccessful())
                .andReturn().getResponse().getContentAsString());
    }

    private static MockHttpServletRequestBuilder admin(MockHttpServletRequestBuilder request) {
        return request
                .with(user(ADMIN).roles("ADMIN"))
                .with(csrf())
                .contentType(MediaType.APPLICATION_JSON);
    }
}
