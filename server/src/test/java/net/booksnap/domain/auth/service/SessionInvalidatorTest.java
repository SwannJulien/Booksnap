package net.booksnap.domain.auth.service;

import net.booksnap.domain.user.Role;
import net.booksnap.domain.user.User;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.security.core.session.SessionInformation;
import org.springframework.security.core.session.SessionRegistry;
import org.springframework.security.core.session.SessionRegistryImpl;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Guards the half of US-008 that fails silently.
 *
 * <p>Every test here registers its sessions under <strong>distinct</strong>
 * {@link AuthenticatedUser} instances carrying the same account id, because that is what
 * happens in production: one instance per login, plus one per deserialization, and never
 * the same object twice. {@code SessionRegistry} keys its sessions by principal in a
 * plain map, so this only works while {@code AuthenticatedUser} defines
 * {@code equals}/{@code hashCode}. Delete them and every test below fails — which is the
 * point, since the application itself would keep answering 204 while ending nothing.
 *
 * <p>What this cannot cover: {@code expireNow()} only sets a flag, and
 * {@code ConcurrentSessionFilter} is what acts on it. That filter comes from the session
 * concurrency control declared in {@code SecurityConfig}, so removing that block leaves
 * these tests green and the feature broken. Only an end-to-end test with two cookie jars
 * would catch it.
 */
class SessionInvalidatorTest {

    private static final Long USER_ID = 7L;
    private static final String CURRENT_SESSION = "session-current";
    private static final String OTHER_SESSION = "session-other";

    private SessionRegistry sessionRegistry;
    private SessionInvalidator sessionInvalidator;

    @BeforeEach
    void setUp() {
        sessionRegistry = new SessionRegistryImpl();
        sessionInvalidator = new SessionInvalidator(sessionRegistry);
    }

    @Test
    @DisplayName("expires the other sessions of the user and spares the current one")
    void expiresTheOthersAndSparesTheCurrent() {
        sessionRegistry.registerNewSession(CURRENT_SESSION, principal(USER_ID));
        sessionRegistry.registerNewSession(OTHER_SESSION, principal(USER_ID));

        // A third instance, as the controller would pass it: read back from this request's
        // own security context, equal to neither of the two above by identity.
        sessionInvalidator.invalidateAllExcept(principal(USER_ID), CURRENT_SESSION);

        assertThat(expired(OTHER_SESSION)).isTrue();
        assertThat(expired(CURRENT_SESSION)).isFalse();
    }

    @Test
    @DisplayName("leaves another user's sessions alone")
    void leavesOtherUsersAlone() {
        sessionRegistry.registerNewSession(CURRENT_SESSION, principal(USER_ID));
        sessionRegistry.registerNewSession("session-somebody-else", principal(99L));

        sessionInvalidator.invalidateAllExcept(principal(USER_ID), CURRENT_SESSION);

        assertThat(expired("session-somebody-else")).isFalse();
    }

    @Test
    @DisplayName("expires every other session, not just the first")
    void expiresEveryOtherSession() {
        sessionRegistry.registerNewSession(CURRENT_SESSION, principal(USER_ID));
        sessionRegistry.registerNewSession("session-b", principal(USER_ID));
        sessionRegistry.registerNewSession("session-c", principal(USER_ID));

        sessionInvalidator.invalidateAllExcept(principal(USER_ID), CURRENT_SESSION);

        assertThat(expired("session-b")).isTrue();
        assertThat(expired("session-c")).isTrue();
        assertThat(expired(CURRENT_SESSION)).isFalse();
    }

    @Test
    @DisplayName("does nothing when the user has no other session")
    void doesNothingWithASingleSession() {
        sessionRegistry.registerNewSession(CURRENT_SESSION, principal(USER_ID));

        sessionInvalidator.invalidateAllExcept(principal(USER_ID), CURRENT_SESSION);

        assertThat(expired(CURRENT_SESSION)).isFalse();
    }

    /**
     * States the dependency this class rests on, so a failure points at the cause rather
     * than at four tests going red at once.
     */
    @Test
    @DisplayName("two instances of the same account are the same principal to the registry")
    void principalsWithTheSameIdAreEqual() {
        assertThat(principal(USER_ID))
                .isEqualTo(principal(USER_ID))
                .isNotSameAs(principal(USER_ID))
                .hasSameHashCodeAs(principal(USER_ID))
                .isNotEqualTo(principal(99L));
    }

    private boolean expired(String sessionId) {
        SessionInformation information = sessionRegistry.getSessionInformation(sessionId);
        assertThat(information).as("session %s is registered", sessionId).isNotNull();
        return information.isExpired();
    }

    private AuthenticatedUser principal(Long userId) {
        User user = new User();
        user.setId(userId);
        user.setEmail("staff" + userId + "@example.com");
        user.setRole(Role.librarian);
        return new AuthenticatedUser(user, "$2a$10$irrelevant");
    }
}
