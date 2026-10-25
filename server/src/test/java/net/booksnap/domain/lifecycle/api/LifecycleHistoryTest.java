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
import java.util.List;
import java.util.Set;
import java.util.stream.Collectors;

import static net.booksnap.domain.lifecycle.api.LifecycleTestSupport.ABSENT_ID;
import static net.booksnap.domain.lifecycle.api.LifecycleTestSupport.ADMIN;
import static net.booksnap.domain.lifecycle.api.LifecycleTestSupport.isNull;
import static net.booksnap.domain.lifecycle.api.LifecycleTestSupport.ofType;
import static net.booksnap.domain.lifecycle.api.LifecycleTestSupport.types;
import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * <p><strong>Needs the development database up</strong> ({@code docker compose up -d db}).
 *
 * <p>{@code @Transactional}: {@code lifecycle_event} is append-only, so everything a test
 * writes must be rolled back. A single transaction means a single {@code now()}: the events
 * of a test share one {@code occurred_at} and their order reads on {@code id}. The triggers
 * only fire at flush, hence the explicit flush before each read.
 */
@SpringBootTest
@AutoConfigureMockMvc
@Transactional
class LifecycleHistoryTest {

    private static final String LIBRARIAN = "librarian@booksnap.net";

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
    @DisplayName("US-05: a living book's timeline reads in order")
    void livingBookTimelineReadsInOrder() throws Exception {
        BookFixture book = scenario.createBook("US05 timeline");
        entityManager.flush();
        scenario.renameBook(book, book.title() + " renamed");
        entityManager.flush();
        long borrowingId = scenario.borrow(scenario.createStudent("Clara", "Dupont"), book.copyId());
        entityManager.flush();
        scenario.giveBack(borrowingId);
        entityManager.flush();

        JsonNode history = scenario.read("/api/v1/books/" + book.bookId() + "/history");

        List<Long> ids = new ArrayList<>();
        history.get("data").forEach(event -> ids.add(event.get("id").asLong()));
        assertThat(ids).isSorted();
        assertThat(ids).doesNotHaveDuplicates();

        List<String> milestones = types(history).stream()
                .filter(Set.of("book_created", "book_updated", "borrowed", "returned")::contains)
                .toList();
        assertThat(milestones).containsExactly("book_created", "book_updated", "borrowed", "returned");

        assertThat(ofType(history, "borrowed").get(0).get("copy").get("id").asLong()).isEqualTo(book.copyId());
        assertThat(ofType(history, "returned").get(0).get("copy").get("id").asLong()).isEqualTo(book.copyId());
        assertThat(isNull(ofType(history, "book_created").get(0), "copy")).isTrue();
        assertThat(isNull(ofType(history, "book_updated").get(0), "copy")).isTrue();
    }

    @Test
    @DisplayName("US-05: a loan appears only once")
    void loanAppearsOnce() throws Exception {
        BookFixture book = scenario.createBook("US05 single loan");
        long borrowingId = scenario.borrow(scenario.createStudent("Clara", "Dupont"), book.copyId());
        scenario.giveBack(borrowingId);
        entityManager.flush();

        JsonNode history = scenario.read("/api/v1/books/" + book.bookId() + "/history");

        assertThat(types(history)).doesNotContain("copy_status_changed");
        assertThat(history.get("page").get("totalElements").asLong()).isEqualTo(history.get("data").size());
    }

    @Test
    @DisplayName("US-05: a loss declaration stays in the timeline")
    void lossDeclarationStaysInTimeline() throws Exception {
        BookFixture book = scenario.createBook("US05 lost and found");
        scenario.setCopyStatus(book.copyId(), "lost");
        scenario.setCopyStatus(book.copyId(), "available");
        entityManager.flush();

        JsonNode history = scenario.read("/api/v1/copies/" + book.copyId() + "/history");

        List<JsonNode> changes = ofType(history, "copy_status_changed");
        assertThat(changes).hasSize(2);
        assertThat(changes.get(0).get("detail").get("from").asText()).isEqualTo("available");
        assertThat(changes.get(0).get("detail").get("to").asText()).isEqualTo("lost");
        assertThat(changes.get(1).get("detail").get("from").asText()).isEqualTo("lost");
        assertThat(changes.get(1).get("detail").get("to").asText()).isEqualTo("available");
    }

    @Test
    @DisplayName("US-05: a found copy stays visible when a hold is waiting for it")
    void foundCopyStaysVisibleWhenAHoldWaits() throws Exception {
        BookFixture book = scenario.createBook("US05 found under hold");
        scenario.setCopyStatus(book.copyId(), "lost");
        long studentId = scenario.createStudent("Clara", "Dupont");
        scenario.placeHold(studentId, book.bookId());
        scenario.setCopyStatus(book.copyId(), "available");
        entityManager.flush();

        JsonNode history = scenario.read("/api/v1/copies/" + book.copyId() + "/history");

        List<JsonNode> changes = ofType(history, "copy_status_changed");
        assertThat(changes).anySatisfy(change -> {
            assertThat(change.get("detail").get("from").asText()).isEqualTo("lost");
            assertThat(change.get("detail").get("to").asText()).isEqualTo("available");
        });
        assertThat(types(history)).contains("hold_promoted");
        assertThat(changes).noneSatisfy(change ->
                assertThat(change.get("detail").get("to").asText()).isEqualTo("on_hold"));
    }

    @Test
    @DisplayName("US-05: a deleted book's timeline stays readable")
    void deletedBookTimelineStaysReadable() throws Exception {
        BookFixture book = scenario.createBook("US05 deleted book");
        CopyFixture second = scenario.addCopy(book.bookId());
        long borrowingId = scenario.borrow(scenario.createStudent("Clara", "Dupont"), book.copyId());
        scenario.giveBack(borrowingId);
        scenario.deleteBook(book.bookId());
        entityManager.flush();

        JsonNode history = scenario.read("/api/v1/books/" + book.bookId() + "/history");

        assertThat(types(history)).contains("borrowed", "returned", "book_deleted");
        Set<Long> deletedCopies = ofType(history, "copy_deleted").stream()
                .map(event -> event.get("copy").get("id").asLong())
                .collect(Collectors.toSet());
        assertThat(deletedCopies).containsExactlyInAnyOrder(book.copyId(), second.copyId());
        assertThat(ofType(history, "copy_deleted")).hasSize(2);
    }

    @Test
    @DisplayName("US-05: a deleted copy's timeline stays readable")
    void deletedCopyTimelineStaysReadable() throws Exception {
        BookFixture book = scenario.createBook("US05 deleted copy");
        scenario.addCopy(book.bookId());
        long borrowingId = scenario.borrow(scenario.createStudent("Clara", "Dupont"), book.copyId());
        scenario.giveBack(borrowingId);
        scenario.deleteCopy(book.copyId());
        entityManager.flush();

        JsonNode history = scenario.read("/api/v1/copies/" + book.copyId() + "/history");

        assertThat(types(history)).contains("borrowed", "returned", "copy_deleted");
    }

    @Test
    @DisplayName("US-05: a copy's timeline holds only that copy")
    void copyTimelineHoldsOnlyItself() throws Exception {
        BookFixture book = scenario.createBook("US05 two copies");
        CopyFixture second = scenario.addCopy(book.bookId());
        scenario.renameBook(book, book.title() + " renamed");
        long studentId = scenario.createStudent("Clara", "Dupont");
        scenario.giveBack(scenario.borrow(studentId, book.copyId()));
        scenario.giveBack(scenario.borrow(studentId, second.copyId()));
        entityManager.flush();

        JsonNode history = scenario.read("/api/v1/copies/" + book.copyId() + "/history");

        assertThat(history.get("data")).isNotEmpty();
        history.get("data").forEach(event -> {
            assertThat(isNull(event, "copy")).isFalse();
            assertThat(event.get("copy").get("id").asLong()).isEqualTo(book.copyId());
        });
        assertThat(types(history)).doesNotContain("book_updated");
    }

    @Test
    @DisplayName("US-05: the borrower is named")
    void borrowerIsNamed() throws Exception {
        scenario.actAs(LIBRARIAN);
        BookFixture book = scenario.createBook("US05 borrower");
        long studentId = scenario.createStudent("Clara", "Dupont");
        scenario.borrow(studentId, book.copyId());
        entityManager.flush();

        JsonNode history = scenario.read("/api/v1/copies/" + book.copyId() + "/history");

        List<JsonNode> loans = ofType(history, "borrowed");
        assertThat(loans).hasSize(1);
        JsonNode student = loans.get(0).get("student");
        assertThat(student.get("id").asLong()).isEqualTo(studentId);
        assertThat(student.get("firstName").asText()).isEqualTo("Clara");
        assertThat(student.get("lastName").asText()).isEqualTo("Dupont");
        assertThat(loans.get(0).get("actor").asText()).isEqualTo(LIBRARIAN);
    }

    @Test
    @DisplayName("US-05: labels are those of the time")
    void labelsAreThoseOfTheTime() throws Exception {
        BookFixture book = scenario.createBook("The Little Prince");
        scenario.renameBook(book, book.title().replace("The Little Prince", "The little prince"));
        entityManager.flush();

        JsonNode history = scenario.read("/api/v1/books/" + book.bookId() + "/history");

        List<JsonNode> creations = ofType(history, "book_created");
        assertThat(creations).hasSize(1);
        assertThat(creations.get(0).get("detail").get("title").asText()).isEqualTo(book.title());
    }

    @Test
    @DisplayName("US-05: an event carried over by the migration flags itself as such")
    void backfilledEventSignalsItself() throws Exception {
        BookFixture book = scenario.createBook("US05 backfilled");
        jdbcTemplate.update("""
                INSERT INTO lifecycle_event (occurred_at, type, actor, book_id, copy_id, detail, backfilled, approximate_date)
                VALUES (now() - interval '3 years', 'returned', 'system', ?, ?, '{}'::jsonb, true, true)
                """, book.bookId(), book.copyId());
        entityManager.flush();

        JsonNode history = scenario.read("/api/v1/copies/" + book.copyId() + "/history");

        List<JsonNode> returns = ofType(history, "returned");
        assertThat(returns).hasSize(1);
        assertThat(returns.get(0).get("backfilled").asBoolean()).isTrue();
        assertThat(returns.get(0).get("approximateDate").asBoolean()).isTrue();
    }

    @Test
    @DisplayName("US-05: an unknown book id is not a timeline")
    void unknownBookIsNotATimeline() throws Exception {
        String path = "/api/v1/books/" + ABSENT_ID + "/history";

        mockMvc.perform(get(path).with(user(ADMIN).roles("ADMIN")))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.status").value(404))
                .andExpect(jsonPath("$.message").value("Book not found with ID: " + ABSENT_ID))
                .andExpect(jsonPath("$.path").value(path))
                .andExpect(jsonPath("$.timestamp").exists());
    }

    @Test
    @DisplayName("US-05: an unknown copy id is not one either")
    void unknownCopyIsNotATimeline() throws Exception {
        String path = "/api/v1/copies/" + ABSENT_ID + "/history";

        mockMvc.perform(get(path).with(user(ADMIN).roles("ADMIN")))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.status").value(404))
                .andExpect(jsonPath("$.message").value("Copy not found with ID: " + ABSENT_ID))
                .andExpect(jsonPath("$.path").value(path))
                .andExpect(jsonPath("$.timestamp").exists());
    }

    @Test
    @DisplayName("US-05: a librarian can reach neither the history nor the archive")
    void librarianIsRefusedEverywhere() throws Exception {
        for (String path : restrictedPaths()) {
            mockMvc.perform(get(path).with(user(LIBRARIAN).roles("LIBRARIAN")))
                    .andExpect(status().isForbidden());
        }
    }

    @Test
    @DisplayName("US-05: a student cannot either")
    void studentIsRefusedEverywhere() throws Exception {
        for (String path : restrictedPaths()) {
            mockMvc.perform(get(path).with(user("student@booksnap.net").roles("USER")))
                    .andExpect(status().isForbidden());
        }
    }

    private static List<String> restrictedPaths() {
        return List.of(
                "/api/v1/books/" + ABSENT_ID + "/history",
                "/api/v1/copies/" + ABSENT_ID + "/history",
                "/api/v1/archive/books",
                "/api/v1/archive/copies");
    }
}
