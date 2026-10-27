package net.booksnap.domain.lifecycle.api;

import com.fasterxml.jackson.databind.JsonNode;
import jakarta.persistence.EntityManager;
import net.booksnap.domain.lifecycle.api.LifecycleTestSupport.BookFixture;
import net.booksnap.domain.lifecycle.api.LifecycleTestSupport.CopyFixture;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.annotation.Transactional;

import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

import static net.booksnap.domain.lifecycle.api.LifecycleTestSupport.ADMIN;
import static org.assertj.core.api.Assertions.assertThat;

/**
 * <p><strong>Needs the development database up</strong> ({@code docker compose up -d db}).
 *
 * <p>{@code @Transactional} for the same reason as {@link LifecycleHistoryTest}. The archive
 * is not empty to begin with: the development database already holds deleted books, so
 * absences are checked on every page and the tests' own deletions are the newest rows.
 */
@SpringBootTest
@AutoConfigureMockMvc
@Transactional
class ArchiveTest {

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @Autowired
    private EntityManager entityManager;

    private LifecycleTestSupport scenario;

    @BeforeEach
    void setUp() {
        scenario = new LifecycleTestSupport(mockMvc, jdbcTemplate);
    }

    @Test
    @DisplayName("US-05: the archive lists deleted books, latest first")
    void archiveListsDeletedBooksNewestFirst() throws Exception {
        scenario.actAs(ADMIN);
        List<BookFixture> deletedInOrder = new ArrayList<>();
        for (int i = 0; i < 3; i++) {
            BookFixture book = scenario.createBook("US05 archive order " + i);
            scenario.deleteBook(book.bookId());
            deletedInOrder.add(book);
        }
        entityManager.flush();

        JsonNode archive = scenario.read("/api/v1/archive/books");

        JsonNode rows = archive.get("data");
        assertThat(rows.size()).isGreaterThanOrEqualTo(3);
        for (int row = 0; row < 3; row++) {
            BookFixture expected = deletedInOrder.get(2 - row);
            assertThat(rows.get(row).get("id").asLong()).isEqualTo(expected.bookId());
            assertThat(rows.get(row).get("title").asText()).isEqualTo(expected.title());
            assertThat(rows.get(row).get("deletedAt").asText()).isNotBlank();
            assertThat(rows.get(row).get("deletedBy").asText()).isEqualTo(ADMIN);
        }
    }

    @Test
    @DisplayName("US-05: a living book is not in the archive")
    void livingBookIsNotInTheArchive() throws Exception {
        BookFixture book = scenario.createBook("US05 archive living");
        entityManager.flush();

        assertThat(ids(scenario.readAllPages("/api/v1/archive/books"))).doesNotContain(book.bookId());
    }

    @Test
    @DisplayName("US-05: a book's archive row counts the copies that left with it")
    void bookRowCountsTheCopiesThatLeftWithIt() throws Exception {
        BookFixture book = scenario.createBook("US05 archive count");
        CopyFixture second = scenario.addCopy(book.bookId());
        scenario.addCopy(book.bookId());
        scenario.deleteCopy(second.copyId());
        scenario.deleteBook(book.bookId());
        entityManager.flush();

        JsonNode row = rowWithId(scenario.readAllPages("/api/v1/archive/books"), book.bookId());

        assertThat(row.get("copiesDeletedWithBook").asInt()).isEqualTo(2);
    }

    @Test
    @DisplayName("US-05: a copy deleted alone appears in the copy archive")
    void copyDeletedAloneAppearsInTheCopyArchive() throws Exception {
        BookFixture book = scenario.createBook("US05 archive copy");
        CopyFixture second = scenario.addCopy(book.bookId());
        scenario.deleteCopy(second.copyId());
        entityManager.flush();

        JsonNode row = rowWithId(scenario.readAllPages("/api/v1/archive/copies"), second.copyId());

        assertThat(row.get("identificationCode").asText()).isEqualTo(second.identificationCode());
        assertThat(row.get("bookTitle").asText()).isEqualTo(book.title());
        assertThat(row.get("deletedAt").asText()).isNotBlank();
    }

    @Test
    @DisplayName("US-05: copies taken away with their book do not clutter the copy archive")
    void copiesTakenByTheirBookStayOutOfTheCopyArchive() throws Exception {
        BookFixture book = scenario.createBook("US05 archive swept");
        CopyFixture second = scenario.addCopy(book.bookId());
        CopyFixture third = scenario.addCopy(book.bookId());
        scenario.deleteBook(book.bookId());
        entityManager.flush();

        assertThat(ids(scenario.readAllPages("/api/v1/archive/copies")))
                .doesNotContain(book.copyId(), second.copyId(), third.copyId());
        assertThat(ids(scenario.readAllPages("/api/v1/archive/books"))).contains(book.bookId());
    }

    @Test
    @DisplayName("US-05: a copy deleted alone stays there when its book is deleted later")
    void copyDeletedAloneStaysAfterItsBookIsDeleted() throws Exception {
        BookFixture book = scenario.createBook("US05 archive stays");
        CopyFixture second = scenario.addCopy(book.bookId());
        scenario.deleteCopy(second.copyId());
        scenario.deleteBook(book.bookId());
        entityManager.flush();

        assertThat(ids(scenario.readAllPages("/api/v1/archive/copies"))).contains(second.copyId());
    }

    @Test
    @DisplayName("US-05: the archive is browsed page by page")
    void archiveIsBrowsedPageByPage() throws Exception {
        for (int i = 0; i < 11; i++) {
            scenario.deleteBook(scenario.createBook("US05 archive paging " + i).bookId());
        }
        entityManager.flush();
        long totalDeleted = jdbcTemplate.queryForObject(
                "SELECT count(*) FROM book WHERE deleted_at IS NOT NULL", Long.class);

        JsonNode first = scenario.read("/api/v1/archive/books?page=1");
        JsonNode second = scenario.read("/api/v1/archive/books?page=2");

        assertThat(first.get("data")).hasSize(10);
        assertThat(second.get("data")).isNotEmpty();
        Set<Long> overlap = new HashSet<>(ids(first.get("data")));
        overlap.retainAll(ids(second.get("data")));
        assertThat(overlap).isEmpty();
        assertThat(second.get("page").get("page").asInt()).isEqualTo(2);
        assertThat(second.get("page").get("totalElements").asLong()).isEqualTo(totalDeleted);
    }

    private static List<Long> ids(Iterable<JsonNode> rows) {
        List<Long> ids = new ArrayList<>();
        rows.forEach(row -> ids.add(row.get("id").asLong()));
        return ids;
    }

    private static JsonNode rowWithId(List<JsonNode> rows, long id) {
        return rows.stream()
                .filter(row -> row.get("id").asLong() == id)
                .findFirst()
                .orElseThrow(() -> new AssertionError("No archive row with id " + id));
    }
}
