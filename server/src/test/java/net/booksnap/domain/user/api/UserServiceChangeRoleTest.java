package net.booksnap.domain.user.api;

import net.booksnap.domain.book.KeyStage;
import net.booksnap.domain.user.Role;
import net.booksnap.domain.user.api.dto.ChangeRoleRequest;
import net.booksnap.domain.user.service.RoleChange;
import net.booksnap.domain.user.service.UserService;
import net.booksnap.exception.common.BadRequestException;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.annotation.Transactional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * <p><strong>Needs the development database up</strong> ({@code docker compose up -d db}).
 * Writes roll back with the test transaction.
 */
@SpringBootTest
@Transactional
class UserServiceChangeRoleTest {

    private static final String EMAIL = "us04.service@booksnap.test";

    @Autowired
    private UserService userService;

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @Test
    void theSameRoleIsAnAnswerWithoutAChange() {
        Long id = insertAccount("librarian", null);

        RoleChange change = userService.changeRole(id, new ChangeRoleRequest(Role.librarian, KeyStage.ks_5));

        assertThat(change.roleChanged()).isFalse();
        assertThat(change.account().role()).isEqualTo(Role.librarian);
        assertThat(keyStageOf(id)).isNull();
    }

    @Test
    void aKeyStageIsIgnoredWhenTheAccountDoesNotBecomeAStudent() {
        Long id = insertAccount("user", "ks_1");

        RoleChange change = userService.changeRole(id, new ChangeRoleRequest(Role.librarian, KeyStage.ks_5));

        assertThat(change.roleChanged()).isTrue();
        assertThat(keyStageOf(id)).isEqualTo("ks_1");
    }

    @Test
    void anAccountThatHasAKeyStageKeepsItWhenBecomingAStudent() {
        Long id = insertAccount("librarian", "ks_1");

        RoleChange change = userService.changeRole(id, new ChangeRoleRequest(Role.user, KeyStage.ks_5));

        assertThat(change.roleChanged()).isTrue();
        assertThat(keyStageOf(id)).isEqualTo("ks_1");
    }

    @Test
    void anAccountWithoutAKeyStageTakesTheOneGivenWhenBecomingAStudent() {
        Long id = insertAccount("librarian", null);

        userService.changeRole(id, new ChangeRoleRequest(Role.user, KeyStage.ks_3));

        assertThat(keyStageOf(id)).isEqualTo("ks_3");
    }

    @Test
    void aStudentWithoutAKeyStageIsRefusedAndStaysAsItWas() {
        Long id = insertAccount("librarian", null);

        assertThatThrownBy(() -> userService.changeRole(id, new ChangeRoleRequest(Role.user, null)))
                .isInstanceOf(BadRequestException.class);
    }

    private Long insertAccount(String role, String keyStage) {
        jdbcTemplate.update(
                "INSERT INTO users (first_name, last_name, email, role, key_stage) "
                        + "VALUES ('Paul', 'Girard', ?, ?::user_role, ?::key_stage)",
                EMAIL, role, keyStage);
        return jdbcTemplate.queryForObject("SELECT id FROM users WHERE email = ?", Long.class, EMAIL);
    }

    private String keyStageOf(Long id) {
        return jdbcTemplate.queryForObject("SELECT key_stage::text FROM users WHERE id = ?", String.class, id);
    }
}
