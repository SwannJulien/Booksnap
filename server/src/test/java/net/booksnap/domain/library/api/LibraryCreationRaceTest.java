package net.booksnap.domain.library.api;

import net.booksnap.domain.library.Library;
import net.booksnap.domain.library.repository.LibraryRepository;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.bean.override.mockito.MockitoSpyBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.annotation.Transactional;

import java.util.Optional;

import static org.mockito.Mockito.doReturn;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * <p><strong>Needs the development database up</strong> ({@code docker compose up -d db}).
 *
 * <p>The unique index aborts the PostgreSQL transaction: nothing may be read from the
 * database after the request.
 */
@SpringBootTest
@AutoConfigureMockMvc
@Transactional
class LibraryCreationRaceTest {

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @MockitoSpyBean
    private LibraryRepository libraryRepository;

    @Test
    @DisplayName("US-02: the duplicate only the database detects")
    void duplicateOnlyTheDatabaseDetects() throws Exception {
        jdbcTemplate.update("INSERT INTO library (name) VALUES ('Secondary')");
        doReturn(Optional.<Library>empty()).when(libraryRepository).findByName("Secondary");

        mockMvc.perform(post("/api/v1/libraries")
                        .with(user("admin@booksnap.net").roles("ADMIN"))
                        .with(csrf())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"name\":\"Secondary\"}"))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.message").value("A library named \"Secondary\" already exists."));
    }
}
