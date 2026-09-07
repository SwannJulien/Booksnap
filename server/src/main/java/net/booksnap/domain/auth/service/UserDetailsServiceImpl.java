package net.booksnap.domain.auth.service;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import net.booksnap.domain.auth.AuthIdentity;
import net.booksnap.domain.auth.Provider;
import net.booksnap.domain.auth.repository.AuthIdentityRepository;
import net.booksnap.domain.user.User;
import net.booksnap.domain.user.repository.UserRepository;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.security.core.userdetails.UserDetailsService;
import org.springframework.security.core.userdetails.UsernameNotFoundException;
import org.springframework.stereotype.Service;

@Slf4j
@Service
@RequiredArgsConstructor
public class UserDetailsServiceImpl implements UserDetailsService {

    /**
     * Every rejection carries this message so the client cannot tell an unknown
     * email from a disabled account or from one without a local password.
     */
    private static final String REJECTION_MESSAGE = "Bad credentials";

    private final UserRepository userRepository;
    private final AuthIdentityRepository authIdentityRepository;

    /**
     * Loads the account a login attempt refers to. The password itself is checked
     * later by {@code DaoAuthenticationProvider}: rejecting here with anything other
     * than {@link UsernameNotFoundException} would both leak the cause and skip the
     * dummy hash comparison that keeps failed attempts equally slow.
     */
    @Override
    public UserDetails loadUserByUsername(String email) throws UsernameNotFoundException {
        User user = userRepository.findByEmail(email).orElseThrow(() -> {
            log.info("Login rejected: no account for the submitted email");
            return new UsernameNotFoundException(REJECTION_MESSAGE);
        });

        // is_active is nullable in the database, hence Boolean rather than boolean.
        if (!Boolean.TRUE.equals(user.getIsActive())) {
            log.info("Login rejected: account {} is inactive", user.getId());
            throw new UsernameNotFoundException(REJECTION_MESSAGE);
        }

        AuthIdentity identity = authIdentityRepository
                .findByUserIdAndProvider(user.getId(), Provider.local)
                .orElseThrow(() -> {
                    log.info("Login rejected: account {} has no local identity", user.getId());
                    return new UsernameNotFoundException(REJECTION_MESSAGE);
                });

        // ck_auth_identity_shape already forbids this; a null hash would surface as
        // an encoder failure, so a 500, instead of the 401 the scenarios expect.
        String passwordHash = identity.getPasswordHash();
        if (passwordHash == null || passwordHash.isBlank()) {
            log.warn("Login rejected: local identity {} has no password hash", identity.getId());
            throw new UsernameNotFoundException(REJECTION_MESSAGE);
        }

        return new AuthenticatedUser(user, passwordHash);
    }
}
