package net.booksnap.domain.library.api;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
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

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
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

    @Test
    @DisplayName("US-02: the API creates the library")
    void createsTheLibrary() throws Exception {
        mockMvc.perform(createAsAdmin("Secondary"))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.id").isNumber())
                .andExpect(jsonPath("$.name").value("Secondary"));

        String list = mockMvc.perform(get(LIBRARIES).with(user("admin@booksnap.net").roles("ADMIN")))
                .andExpect(status().isOk())
                .andReturn()
                .getResponse()
                .getContentAsString();
        List<String> names = new ArrayList<>();
        for (JsonNode library : new ObjectMapper().readTree(list)) {
            names.add(library.get("name").asText());
        }
        assertThat(names).contains("Secondary");
    }

    @Test
    @DisplayName("US-02: surrounding spaces are removed")
    void removesSurroundingSpaces() throws Exception {
        String body = mockMvc.perform(createAsAdmin("  Secondary  "))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.name").value("Secondary"))
                .andReturn()
                .getResponse()
                .getContentAsString();

        long id = new ObjectMapper().readTree(body).get("id").asLong();
        assertThat(storedName(id)).isEqualTo("Secondary");
    }

    @Test
    @DisplayName("US-02: the typed case is kept")
    void keepsTheTypedCase() throws Exception {
        String body = mockMvc.perform(createAsAdmin("école du Lac"))
                .andExpect(status().isCreated())
                .andReturn()
                .getResponse()
                .getContentAsString();

        long id = new ObjectMapper().readTree(body).get("id").asLong();
        assertThat(storedName(id)).isEqualTo("école du Lac");
    }

    @Test
    @DisplayName("US-02: a name differing only by case is refused")
    void refusesANameDifferingOnlyByCase() throws Exception {
        Integer before = countByName("PRIMARY");

        mockMvc.perform(createAsAdmin(" PRIMARY "))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.message").value("A library named \"Primary\" already exists."));

        assertThat(countByName("PRIMARY")).isEqualTo(before);
    }

    @Test
    @DisplayName("US-02: empty name refused by the API")
    void refusesAnEmptyName() throws Exception {
        for (String body : List.of("{}", "{\"name\":\"\"}", "{\"name\":\"   \"}")) {
            mockMvc.perform(post(LIBRARIES)
                            .with(user("admin@booksnap.net").roles("ADMIN"))
                            .with(csrf())
                            .contentType(MediaType.APPLICATION_JSON)
                            .content(body))
                    .andExpect(status().isBadRequest());
        }
    }

    @Test
    @DisplayName("US-02: name too long refused by the API")
    void refusesANameTooLong() throws Exception {
        mockMvc.perform(createAsAdmin("a".repeat(256)))
                .andExpect(status().isBadRequest());
    }

    @Test
    @DisplayName("US-02: administrator only")
    void creationIsReservedToTheAdministrator() throws Exception {
        mockMvc.perform(create("Secondary").with(user("librarian@booksnap.net").roles("LIBRARIAN")))
                .andExpect(status().isForbidden());
        assertThat(countByName("Secondary")).isZero();

        mockMvc.perform(create("Secondary").with(user("student@booksnap.net").roles("USER")))
                .andExpect(status().isForbidden());
        assertThat(countByName("Secondary")).isZero();
    }

    @Test
    @DisplayName("US-02: the database refuses a case duplicate")
    void databaseRefusesACaseDuplicate() {
        assertThatThrownBy(() -> jdbcTemplate.update("INSERT INTO library (name) VALUES ('PRIMARY')"))
                .isInstanceOf(DataIntegrityViolationException.class)
                .hasMessageContaining("library_name_key");
    }

    @Test
    @DisplayName("US-02: the database refuses a null name")
    void databaseRefusesANullName() {
        assertThatThrownBy(() -> jdbcTemplate.update("INSERT INTO library (name) VALUES (NULL)"))
                .isInstanceOf(DataIntegrityViolationException.class)
                .hasMessageContaining("null value in column \"name\"");
    }

    @Test
    @DisplayName("US-03: the API renames the library")
    void renamesTheLibrary() throws Exception {
        long primary = libraryId("Primary");

        mockMvc.perform(renameAsAdmin(primary, "  Primary School  "))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.id").value(primary))
                .andExpect(jsonPath("$.name").value("Primary School"));

        assertThat(storedName(primary)).isEqualTo("Primary School");
    }

    @Test
    @DisplayName("US-03: copies follow the new name")
    void copiesFollowTheNewName() throws Exception {
        long preschool = libraryId("Preschool");
        long copyId = jdbcTemplate.queryForObject(
                "SELECT id FROM copy WHERE library_id = ? AND deleted_at IS NULL LIMIT 1", Long.class, preschool);

        mockMvc.perform(renameAsAdmin(preschool, "Nursery"))
                .andExpect(status().isOk());

        assertThat(jdbcTemplate.queryForObject("SELECT library_id FROM copy WHERE id = ?", Long.class, copyId))
                .isEqualTo(preschool);
        mockMvc.perform(get("/api/v1/copies/" + copyId).with(user("admin@booksnap.net").roles("ADMIN")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.library.id").value(preschool))
                .andExpect(jsonPath("$.library.name").value("Nursery"));
    }

    @Test
    @DisplayName("US-03: renaming to a taken name is refused")
    void refusesRenamingToATakenName() throws Exception {
        long primary = libraryId("Primary");

        mockMvc.perform(renameAsAdmin(primary, "preschool"))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.message").value("A library named \"Preschool\" already exists."));

        assertThat(storedName(primary)).isEqualTo("Primary");
    }

    @Test
    @DisplayName("US-03: changing only the case of its own name")
    void changesOnlyTheCaseOfItsOwnName() throws Exception {
        long primary = libraryId("Primary");
        jdbcTemplate.update("UPDATE library SET name = 'primary' WHERE id = ?", primary);

        mockMvc.perform(renameAsAdmin(primary, "Primary"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.name").value("Primary"));

        assertThat(storedName(primary)).isEqualTo("Primary");
    }

    @Test
    @DisplayName("US-03: empty or too long name refused by the API")
    void refusesAnEmptyOrTooLongRename() throws Exception {
        long primary = libraryId("Primary");
        List<String> bodies = List.of("{}", "{\"name\":\"\"}", "{\"name\":\"   \"}", "{\"name\":\"" + "a".repeat(256) + "\"}");

        for (String body : bodies) {
            mockMvc.perform(put(LIBRARIES + "/" + primary)
                            .with(user("admin@booksnap.net").roles("ADMIN"))
                            .with(csrf())
                            .contentType(MediaType.APPLICATION_JSON)
                            .content(body))
                    .andExpect(status().isBadRequest());
        }

        assertThat(storedName(primary)).isEqualTo("Primary");
    }

    @Test
    @DisplayName("US-03: unknown library")
    void refusesRenamingAnUnknownLibrary() throws Exception {
        mockMvc.perform(renameAsAdmin(999999999L, "Anything"))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.message").value("Library not found: 999999999"));
    }

    @Test
    @DisplayName("US-03: administrator only")
    void renamingIsReservedToTheAdministrator() throws Exception {
        long primary = libraryId("Primary");

        mockMvc.perform(rename(primary, "Secondary").with(user("librarian@booksnap.net").roles("LIBRARIAN")))
                .andExpect(status().isForbidden());
        assertThat(storedName(primary)).isEqualTo("Primary");

        mockMvc.perform(rename(primary, "Secondary").with(user("student@booksnap.net").roles("USER")))
                .andExpect(status().isForbidden());
        assertThat(storedName(primary)).isEqualTo("Primary");
    }

    private static MockHttpServletRequestBuilder create(String name) throws Exception {
        return post(LIBRARIES)
                .with(csrf())
                .contentType(MediaType.APPLICATION_JSON)
                .content(new ObjectMapper().writeValueAsString(Map.of("name", name)));
    }

    private static MockHttpServletRequestBuilder createAsAdmin(String name) throws Exception {
        return create(name).with(user("admin@booksnap.net").roles("ADMIN"));
    }

    private static MockHttpServletRequestBuilder rename(long id, String name) throws Exception {
        return put(LIBRARIES + "/" + id)
                .with(csrf())
                .contentType(MediaType.APPLICATION_JSON)
                .content(new ObjectMapper().writeValueAsString(Map.of("name", name)));
    }

    private static MockHttpServletRequestBuilder renameAsAdmin(long id, String name) throws Exception {
        return rename(id, name).with(user("admin@booksnap.net").roles("ADMIN"));
    }

    private long libraryId(String name) {
        return jdbcTemplate.queryForObject("SELECT id FROM library WHERE name = ?", Long.class, name);
    }

    private String storedName(long id) {
        return jdbcTemplate.queryForObject("SELECT name FROM library WHERE id = ?", String.class, id);
    }

    private Integer countByName(String name) {
        return jdbcTemplate.queryForObject("SELECT count(*) FROM library WHERE name = ?", Integer.class, name);
    }
}
