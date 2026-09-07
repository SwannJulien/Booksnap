package net.booksnap.domain.auth.service;

import net.booksnap.domain.auth.AuthIdentity;
import net.booksnap.domain.auth.Provider;
import net.booksnap.domain.auth.repository.AuthIdentityRepository;
import net.booksnap.domain.user.User;
import net.booksnap.exception.auth.InvalidCurrentPasswordException;
import net.booksnap.exception.auth.NoLocalIdentityException;
import net.booksnap.exception.auth.PasswordRejectedException;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;

import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * The encoder is real, not a mock, and at BCrypt's minimum strength so the suite stays
 * fast. Mocking it would leave the tests asserting that a stub was called with the
 * arguments the test itself supplied; a real one lets them assert the property that
 * actually matters — that the stored hash verifies the new password and stops verifying
 * the old one.
 */
class PasswordServiceImplTest {

    private static final Long USER_ID = 42L;
    private static final String CURRENT_PASSWORD = "current-password";

    private AuthIdentityRepository authIdentityRepository;
    private PasswordEncoder passwordEncoder;
    private PasswordServiceImpl passwordService;
    private AuthIdentity localIdentity;

    @BeforeEach
    void setUp() {
        authIdentityRepository = mock(AuthIdentityRepository.class);
        passwordEncoder = new BCryptPasswordEncoder(4);
        passwordService = new PasswordServiceImpl(authIdentityRepository, passwordEncoder, new PasswordPolicy());

        localIdentity = identityWithHash(passwordEncoder.encode(CURRENT_PASSWORD));
        when(authIdentityRepository.findByUserIdAndProvider(USER_ID, Provider.local))
                .thenReturn(Optional.of(localIdentity));
    }

    @Test
    @DisplayName("replaces the hash so the new password verifies and the old one no longer does")
    void replacesTheHash() {
        passwordService.changePassword(USER_ID, CURRENT_PASSWORD, "a-brand-new-password");

        verify(authIdentityRepository).save(localIdentity);
        assertThat(passwordEncoder.matches("a-brand-new-password", localIdentity.getPasswordHash())).isTrue();
        assertThat(passwordEncoder.matches(CURRENT_PASSWORD, localIdentity.getPasswordHash())).isFalse();
    }

    @Test
    @DisplayName("stores a BCrypt hash, never the password itself")
    void storesABcryptHash() {
        passwordService.changePassword(USER_ID, CURRENT_PASSWORD, "a-brand-new-password");

        assertThat(localIdentity.getPasswordHash())
                .startsWith("$2")
                .doesNotContain("a-brand-new-password");
    }

    @Test
    @DisplayName("refuses a wrong current password and writes nothing")
    void refusesAWrongCurrentPassword() {
        assertThatThrownBy(() -> passwordService.changePassword(USER_ID, "not-the-one", "a-brand-new-password"))
                .isInstanceOf(InvalidCurrentPasswordException.class);

        assertUnchanged();
    }

    @Test
    @DisplayName("refuses a new password shorter than the policy minimum")
    void refusesATooShortNewPassword() {
        assertThatThrownBy(() -> passwordService.changePassword(USER_ID, CURRENT_PASSWORD, "short"))
                .isInstanceOf(PasswordRejectedException.class)
                .hasMessageContaining(String.valueOf(PasswordPolicy.MINIMUM_LENGTH));

        assertUnchanged();
    }

    @Test
    @DisplayName("refuses a new password equal to the current one")
    void refusesAnUnchangedPassword() {
        assertThatThrownBy(() -> passwordService.changePassword(USER_ID, CURRENT_PASSWORD, CURRENT_PASSWORD))
                .isInstanceOf(PasswordRejectedException.class)
                .hasMessageContaining("differ");

        assertUnchanged();
    }

    /**
     * The order is a security property, not a detail. Someone sitting at an unlocked
     * session must not be able to probe the password rules, and must not be told "too
     * short" before proving they may change anything at all. An implementation that
     * validated the proposal first would pass every other test in this class.
     */
    @Test
    @DisplayName("checks the current password before looking at the new one")
    void checksTheCurrentPasswordFirst() {
        assertThatThrownBy(() -> passwordService.changePassword(USER_ID, "not-the-one", "short"))
                .isInstanceOf(InvalidCurrentPasswordException.class);
    }

    @Test
    @DisplayName("answers a conflict when the account has no local identity")
    void refusesAnAccountWithoutALocalIdentity() {
        when(authIdentityRepository.findByUserIdAndProvider(USER_ID, Provider.local))
                .thenReturn(Optional.empty());

        assertThatThrownBy(() -> passwordService.changePassword(USER_ID, CURRENT_PASSWORD, "a-brand-new-password"))
                .isInstanceOf(NoLocalIdentityException.class);

        verify(authIdentityRepository, never()).save(any());
    }

    /**
     * ck_auth_identity_shape forbids this row, so it only exists if something has gone
     * wrong underneath. It must still not reach the encoder: matches() on a null hash
     * throws, which would turn a 409 into a 500.
     */
    @Test
    @DisplayName("treats a local identity with a blank hash as no local identity")
    void refusesALocalIdentityWithoutAHash() {
        when(authIdentityRepository.findByUserIdAndProvider(USER_ID, Provider.local))
                .thenReturn(Optional.of(identityWithHash("   ")));

        assertThatThrownBy(() -> passwordService.changePassword(USER_ID, CURRENT_PASSWORD, "a-brand-new-password"))
                .isInstanceOf(NoLocalIdentityException.class);

        verify(authIdentityRepository, never()).save(any());
    }

    /**
     * Only ever the identity of the user the caller named — the endpoint hands it the id
     * from the session, and nothing here may widen that to another provider or account.
     */
    @Test
    @DisplayName("looks up the local identity of that user and no other")
    void looksUpTheLocalIdentityOfThatUser() {
        passwordService.changePassword(USER_ID, CURRENT_PASSWORD, "a-brand-new-password");

        verify(authIdentityRepository).findByUserIdAndProvider(USER_ID, Provider.local);
    }

    private void assertUnchanged() {
        verify(authIdentityRepository, never()).save(any());
        assertThat(passwordEncoder.matches(CURRENT_PASSWORD, localIdentity.getPasswordHash())).isTrue();
    }

    private AuthIdentity identityWithHash(String passwordHash) {
        User user = new User();
        user.setId(USER_ID);
        user.setEmail("staff@example.com");

        AuthIdentity identity = new AuthIdentity();
        identity.setId(1L);
        identity.setUser(user);
        identity.setProvider(Provider.local);
        identity.setPasswordHash(passwordHash);
        return identity;
    }
}
