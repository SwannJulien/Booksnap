package net.booksnap.domain.book.service;

import net.booksnap.utils.qr.QRCodeService;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.bean.override.mockito.MockitoSpyBean;
import org.springframework.test.web.servlet.MockMvc;

import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.doThrow;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * <p><strong>Needs the development database up</strong> ({@code docker compose up -d db}):
 * the whole context boots, Flyway included, and the test really writes then rolls back.
 *
 * <p>Deliberately not {@code @Transactional}: a test transaction would wrap the service's
 * own and roll everything back anyway, so the test would pass whether addBook is atomic or not.
 * If it ever fails, the {@code ATOM-qr-} rows it leaves in the append-only
 * {@code lifecycle_event} cannot be deleted.
 */
@SpringBootTest
@AutoConfigureMockMvc
class BookServiceImplAtomicCreationTest {

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private JdbcTemplate jdbcTemplate;

    // A spy, not a mock: the same service builds the identification code the copy needs.
    @MockitoSpyBean
    private QRCodeService qrCodeService;

    @Test
    @DisplayName("a QR code failure answers 500 and leaves no book, event, author or genre behind")
    void qrCodeFailureRollsEverythingBack() throws Exception {
        String suffix = UUID.randomUUID().toString();
        String title = "ATOM-qr-" + suffix;
        String author = "ATOM Author " + suffix;
        String genre = "ATOM Genre " + suffix;
        doThrow(new RuntimeException("Failed to generate QR code (test)"))
                .when(qrCodeService).generateCopyQRCode(any());

        mockMvc.perform(post("/api/v1/books")
                        .with(user("librarian@booksnap.net").roles("LIBRARIAN"))
                        .with(csrf())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"title": "%s", "isFiction": true, "genres": ["%s"], "authors": ["%s"],
                                 "libraryId": 1, "sectionName": "Fiction"}
                                """.formatted(title, genre, author)))
                .andExpect(status().isInternalServerError())
                .andExpect(jsonPath("$.message").value("Internal server error"));

        assertThat(count("SELECT count(*) FROM book WHERE title = ?", title)).isZero();
        assertThat(count("SELECT count(*) FROM lifecycle_event WHERE detail->>'title' = ?", title)).isZero();
        assertThat(count("SELECT count(*) FROM author WHERE name = ?", author)).isZero();
        assertThat(count("SELECT count(*) FROM genre WHERE name = ?", genre)).isZero();
    }

    private Integer count(String sql, String value) {
        return jdbcTemplate.queryForObject(sql, Integer.class, value);
    }
}
