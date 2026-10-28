package net.booksnap.domain.user.api;

import com.jayway.jsonpath.JsonPath;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.junit.jupiter.params.provider.Arguments;
import org.junit.jupiter.params.provider.MethodSource;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.system.CapturedOutput;
import org.springframework.boot.test.system.OutputCaptureExtension;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;
import org.springframework.test.web.servlet.request.RequestPostProcessor;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.Map;
import java.util.stream.Stream;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * <p><strong>Needs the development database up</strong> ({@code docker compose up -d db}).
 *
 * <p>{@code @Transactional} so the inserted accounts roll back. The development database holds
 * accounts of its own, whose roles are not assumed: every lookup that counts rows searches for
 * the email of the account the test inserted.
 */
@SpringBootTest
@AutoConfigureMockMvc
@Transactional
@ExtendWith(OutputCaptureExtension.class)
class UserTest {

    private static final String USERS = "/api/v1/users";
    private static final String PROBE_EMAIL = "us01.probe@booksnap.test";
    private static final String NEW_EMAIL = "us02.lea.moreau@booksnap.test";
    private static final String TAKEN_EMAIL_MESSAGE = "An account already uses this email.";
    private static final String INCOMPLETE_FIRST_NAME = "Us02Incomplete";
    private static final String ABSENT_ID = "999999999";

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @Autowired
    private PasswordEncoder passwordEncoder;

    @ParameterizedTest(name = "{displayName} [{0}]")
    @CsvSource({"ADMIN, 200", "LIBRARIAN, 403", "USER, 403"})
    @DisplayName("US-01: only the administrator reads the accounts list through the API")
    void onlyTheAdministratorReadsTheList(String role, int expectedStatus) throws Exception {
        mockMvc.perform(get(USERS).with(user("test@booksnap.net").roles(role)))
                .andExpect(status().is(expectedStatus));
    }

    @Test
    @DisplayName("US-01: reading without a session is refused")
    void refusesTheListWithoutASession() throws Exception {
        mockMvc.perform(get(USERS))
                .andExpect(status().isUnauthorized());
    }

    @Test
    @DisplayName("US-01: response shape")
    void responseShape() throws Exception {
        insertProbe("true");

        mockMvc.perform(get(USERS).with(admin()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data").isArray())
                .andExpect(jsonPath("$.data[0].id").isNumber())
                .andExpect(jsonPath("$.data[0].firstName").exists())
                .andExpect(jsonPath("$.data[0].lastName").exists())
                .andExpect(jsonPath("$.data[0].email").isString())
                .andExpect(jsonPath("$.data[0].role").isString())
                .andExpect(jsonPath("$.data[0].active").isBoolean())
                .andExpect(jsonPath("$.page.size").value(10))
                .andExpect(jsonPath("$.page.page").value(1))
                .andExpect(jsonPath("$.page.totalElements").isNumber())
                .andExpect(jsonPath("$.page.totalPages").isNumber());

        mockMvc.perform(get(USERS).param("q", PROBE_EMAIL).with(admin()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.length()").value(1))
                .andExpect(jsonPath("$.data[0].firstName").value("Probe"))
                .andExpect(jsonPath("$.data[0].lastName").value("Account"))
                .andExpect(jsonPath("$.data[0].email").value(PROBE_EMAIL))
                .andExpect(jsonPath("$.data[0].role").value("user"))
                .andExpect(jsonPath("$.data[0].active").value(true))
                .andExpect(jsonPath("$.page.totalElements").value(1))
                .andExpect(jsonPath("$.page.totalPages").value(1));
    }

    @ParameterizedTest(name = "{displayName} [{0}={1}]")
    @CsvSource({"role, superuser", "status, disabled"})
    @DisplayName("US-01: unknown role or status is a bad request")
    void unknownRoleOrStatusIsABadRequest(String parameter, String value) throws Exception {
        mockMvc.perform(get(USERS).param(parameter, value).with(admin()))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.status").value(400))
                .andExpect(jsonPath("$.message").isString())
                .andExpect(jsonPath("$.path").value(USERS));
    }

    @Test
    @DisplayName("US-01: an account with a null is_active is deactivated")
    void nullIsActiveIsDeactivated() throws Exception {
        insertProbe("NULL");

        mockMvc.perform(get(USERS).param("q", PROBE_EMAIL).param("status", "deactivated").with(admin()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.length()").value(1))
                .andExpect(jsonPath("$.data[0].email").value(PROBE_EMAIL))
                .andExpect(jsonPath("$.data[0].active").value(false));

        mockMvc.perform(get(USERS).param("q", PROBE_EMAIL).param("status", "active").with(admin()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.length()").value(0));

        mockMvc.perform(get(USERS).param("q", PROBE_EMAIL).param("status", "all").with(admin()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.length()").value(1));
    }

    @Test
    @DisplayName("US-01: search ignores case on the email")
    void searchIgnoresCaseOnTheEmail() throws Exception {
        insertProbe("true");

        mockMvc.perform(get(USERS).param("q", PROBE_EMAIL.toUpperCase()).with(admin()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.length()").value(1))
                .andExpect(jsonPath("$.data[0].email").value(PROBE_EMAIL));
    }

    @Test
    @DisplayName("US-02: the student's information is saved")
    void studentInformationIsSaved() throws Exception {
        String created = create(admin(), """
                {"role": "user", "firstName": "Léa", "lastName": "Moreau", "email": "%s",
                 "keyStage": "ks_2", "house": "Goya", "parentEmail": "us02.parent@booksnap.test", "sex": "female"}
                """.formatted(NEW_EMAIL))
                .andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString();
        String id = JsonPath.read(created, "$.id").toString();

        mockMvc.perform(get(USERS + "/" + id).with(admin()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.firstName").value("Léa"))
                .andExpect(jsonPath("$.lastName").value("Moreau"))
                .andExpect(jsonPath("$.email").value(NEW_EMAIL))
                .andExpect(jsonPath("$.keyStage").value("ks_2"))
                .andExpect(jsonPath("$.house").value("Goya"))
                .andExpect(jsonPath("$.parentEmail").value("us02.parent@booksnap.test"))
                .andExpect(jsonPath("$.sex").value("female"))
                .andExpect(jsonPath("$.role").value("user"))
                .andExpect(jsonPath("$.active").value(true));
    }

    @Test
    @DisplayName("US-02: the API refuses a sex outside the list")
    void refusesASexOutsideTheList() throws Exception {
        create(admin(), """
                {"role": "user", "firstName": "Léa", "lastName": "Moreau", "email": "%s",
                 "keyStage": "ks_2", "sex": "unknown"}
                """.formatted(NEW_EMAIL))
                .andExpect(status().isBadRequest());

        assertThat(countAccounts(NEW_EMAIL)).isZero();
    }

    @Test
    @DisplayName("US-02: the temporary password is never read back")
    void temporaryPasswordIsNeverReadBack() throws Exception {
        String created = create(admin(), staffBody("librarian", NEW_EMAIL))
                .andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString();
        String temporaryPassword = JsonPath.read(created, "$.temporaryPassword");
        String id = JsonPath.read(created, "$.id").toString();

        String list = mockMvc.perform(get(USERS).param("q", NEW_EMAIL).param("status", "all").with(admin()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.length()").value(1))
                .andReturn().getResponse().getContentAsString();
        String single = mockMvc.perform(get(USERS + "/" + id).with(admin()))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();

        for (String body : List.of(list, single)) {
            assertThat(body).doesNotContain(temporaryPassword);
            assertThat(body.toLowerCase()).doesNotContain("password").doesNotContain("hash");
            assertThat(body).doesNotContain("$2");
        }
    }

    @Test
    @DisplayName("US-02: a created student does not receive a temporary password (API response)")
    void createdStudentReceivesNoTemporaryPassword() throws Exception {
        create(admin(), """
                {"role": "user", "firstName": "Léa", "lastName": "Moreau", "email": "%s", "keyStage": "ks_2"}
                """.formatted(NEW_EMAIL))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.temporaryPassword").doesNotExist());

        assertThat(identityCount(NEW_EMAIL)).isZero();
    }

    @Test
    @DisplayName("US-02: the API refuses an email already in use")
    void refusesAnEmailAlreadyInUse() throws Exception {
        String taken = "us02.clara.dupont@booksnap.test";
        jdbcTemplate.update(
                "INSERT INTO users (first_name, last_name, email) VALUES ('Clara', 'Dupont', ?)", taken);

        create(admin(), """
                {"role": "user", "firstName": "Clara", "lastName": "Other", "email": "%s", "keyStage": "ks_1"}
                """.formatted(taken.toUpperCase()))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.status").value(409))
                .andExpect(jsonPath("$.message").value(TAKEN_EMAIL_MESSAGE));

        assertThat(countAccounts(taken)).isEqualTo(1);
    }

    @ParameterizedTest(name = "{displayName} [{0}]")
    @MethodSource("incompleteAccounts")
    @DisplayName("US-02: the API refuses an incomplete account")
    void refusesAnIncompleteAccount(String caseName, String body) throws Exception {
        create(admin(), body)
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.status").value(400))
                .andExpect(jsonPath("$.message").isString())
                .andExpect(jsonPath("$.path").value(USERS));

        assertThat(jdbcTemplate.queryForObject(
                "SELECT count(*) FROM users WHERE first_name = ?", Integer.class, INCOMPLETE_FIRST_NAME)).isZero();
    }

    @ParameterizedTest(name = "{displayName} [{0}]")
    @ValueSource(strings = {"firstName", "lastName"})
    @DisplayName("a name longer than 255 characters is refused")
    void refusesANameLongerThan255Characters(String field) throws Exception {
        String body = nameBody(field, "a".repeat(256));

        create(admin(), body)
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.status").value(400))
                .andExpect(jsonPath("$.path").value(USERS));

        assertThat(countAccounts(NEW_EMAIL)).isZero();
    }

    @ParameterizedTest(name = "{displayName} [{0}]")
    @ValueSource(strings = {"firstName", "lastName"})
    @DisplayName("a name of exactly 255 characters is accepted")
    void acceptsANameOf255Characters(String field) throws Exception {
        create(admin(), nameBody(field, "a".repeat(255)))
                .andExpect(status().isCreated());

        assertThat(countAccounts(NEW_EMAIL)).isEqualTo(1);
    }

    @ParameterizedTest(name = "{displayName} [{0}]")
    @ValueSource(strings = {"LIBRARIAN", "USER"})
    @DisplayName("US-02: only the administrator creates an account")
    void onlyTheAdministratorCreatesAnAccount(String role) throws Exception {
        create(user("test@booksnap.net").roles(role), staffBody("librarian", NEW_EMAIL))
                .andExpect(status().isForbidden());

        assertThat(countAccounts(NEW_EMAIL)).isZero();
    }

    @Test
    @DisplayName("US-02: reading an account that does not exist")
    void readingAnAbsentAccount() throws Exception {
        mockMvc.perform(get(USERS + "/" + ABSENT_ID).with(admin()))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.status").value(404))
                .andExpect(jsonPath("$.message").isString())
                .andExpect(jsonPath("$.path").value(USERS + "/" + ABSENT_ID));
    }

    @ParameterizedTest(name = "{displayName} [{0}]")
    @ValueSource(strings = {"LIBRARIAN", "USER"})
    @DisplayName("US-02: only the administrator reads an account")
    void onlyTheAdministratorReadsAnAccount(String role) throws Exception {
        Long id = jdbcTemplate.queryForObject(
                "INSERT INTO users (first_name, last_name, email) VALUES ('Léa', 'Moreau', ?) RETURNING id",
                Long.class, NEW_EMAIL);

        mockMvc.perform(get(USERS + "/" + id).with(user("test@booksnap.net").roles(role)))
                .andExpect(status().isForbidden());
    }

    @Test
    @DisplayName("US-02: the author of the creation is recorded")
    void theAuthorOfTheCreationIsRecorded() throws Exception {
        create(user("alice.martin@example.com").roles("ADMIN"), staffBody("librarian", NEW_EMAIL))
                .andExpect(status().isCreated());

        assertThat(jdbcTemplate.queryForObject(
                "SELECT created_by FROM users WHERE email = ?", String.class, NEW_EMAIL))
                .isEqualTo("alice.martin@example.com");
    }

    @Test
    @DisplayName("US-02: the suggested houses are distinct ignoring case, and never empty")
    void suggestedHousesAreDistinctAndNonEmpty() throws Exception {
        insertStudentInHouse("us02.house.a@booksnap.test", "us02-house");
        insertStudentInHouse("us02.house.b@booksnap.test", "US02-HOUSE");
        insertStudentInHouse("us02.house.c@booksnap.test", "   ");

        String body = mockMvc.perform(get(USERS + "/houses").with(admin()))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();
        List<String> houses = JsonPath.read(body, "$");

        assertThat(houses.stream().filter(house -> house.equalsIgnoreCase("us02-house"))).hasSize(1);
        assertThat(houses).noneMatch(String::isBlank);
    }

    @Test
    @DisplayName("US-02: the temporary password is stored hashed in a local identity")
    void temporaryPasswordIsStoredHashedInALocalIdentity() throws Exception {
        String created = create(admin(), staffBody("librarian", NEW_EMAIL))
                .andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString();
        String temporaryPassword = JsonPath.read(created, "$.temporaryPassword");

        Map<String, Object> identity = jdbcTemplate.queryForMap(
                "SELECT provider::text AS provider, subject, password_hash FROM auth_identity "
                        + "WHERE user_id = (SELECT id FROM users WHERE email = ?)", NEW_EMAIL);

        assertThat(identity.get("provider")).isEqualTo("local");
        assertThat(identity.get("subject")).isNull();
        assertThat((String) identity.get("password_hash")).startsWith("$2");
        assertThat(passwordEncoder.matches(temporaryPassword, (String) identity.get("password_hash"))).isTrue();
    }

    @Test
    @DisplayName("US-02: the temporary password appears in no log")
    void temporaryPasswordAppearsInNoLog(CapturedOutput output) throws Exception {
        String created = create(admin(), staffBody("admin", NEW_EMAIL))
                .andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString();
        String temporaryPassword = JsonPath.read(created, "$.temporaryPassword");

        assertThat(output.getAll()).doesNotContain(temporaryPassword);
    }

    private static Stream<Arguments> incompleteAccounts() {
        String prefix = "{\"firstName\": \"" + INCOMPLETE_FIRST_NAME + "\", \"lastName\": \"Case\"";
        String email = ", \"email\": \"us02.incomplete@booksnap.test\"";
        return Stream.of(
                Arguments.of("without an email", prefix + ", \"role\": \"librarian\"}"),
                Arguments.of("role user without a key stage", prefix + email + ", \"role\": \"user\"}"),
                Arguments.of("role superuser", prefix + email + ", \"role\": \"superuser\"}"),
                Arguments.of("an invalid parent email", prefix + email
                        + ", \"role\": \"user\", \"keyStage\": \"ks_1\", \"parentEmail\": \"parent@\"}"));
    }

    private ResultActions create(RequestPostProcessor principal, String json) throws Exception {
        return mockMvc.perform(post(USERS)
                .with(principal)
                .with(csrf())
                .contentType(MediaType.APPLICATION_JSON)
                .content(json));
    }

    private static String staffBody(String role, String email) {
        return """
                {"role": "%s", "firstName": "Paul", "lastName": "Girard", "email": "%s"}
                """.formatted(role, email);
    }

    private static String nameBody(String field, String value) {
        String firstName = field.equals("firstName") ? value : "Paul";
        String lastName = field.equals("lastName") ? value : "Girard";
        return """
                {"role": "librarian", "firstName": "%s", "lastName": "%s", "email": "%s"}
                """.formatted(firstName, lastName, NEW_EMAIL);
    }

    private int countAccounts(String email) {
        return jdbcTemplate.queryForObject(
                "SELECT count(*) FROM users WHERE lower(email::text) = lower(?)", Integer.class, email);
    }

    private int identityCount(String email) {
        return jdbcTemplate.queryForObject(
                "SELECT count(*) FROM auth_identity WHERE user_id IN (SELECT id FROM users WHERE email = ?)",
                Integer.class, email);
    }

    private void insertStudentInHouse(String email, String house) {
        jdbcTemplate.update(
                "INSERT INTO users (first_name, last_name, email, house) VALUES ('House', 'Probe', ?, ?)",
                email, house);
    }

    private void insertProbe(String isActive) {
        jdbcTemplate.update(
                "INSERT INTO users (first_name, last_name, email, is_active) VALUES ('Probe', 'Account', ?, " + isActive + ")",
                PROBE_EMAIL);
    }

    private static RequestPostProcessor admin() {
        return user("admin@booksnap.net").roles("ADMIN");
    }
}
