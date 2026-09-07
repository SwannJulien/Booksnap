package net.booksnap.domain.auth.service;

import lombok.extern.slf4j.Slf4j;
import net.booksnap.domain.auth.AuthIdentity;
import net.booksnap.domain.auth.Provider;
import net.booksnap.domain.auth.repository.AuthIdentityRepository;
import net.booksnap.exception.auth.InvalidCurrentPasswordException;
import net.booksnap.exception.auth.NoLocalIdentityException;
import net.booksnap.exception.auth.PasswordRejectedException;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Slf4j
@Service
public class PasswordServiceImpl implements PasswordService {

    private final AuthIdentityRepository authIdentityRepository;
    private final PasswordEncoder passwordEncoder;
    private final PasswordPolicy passwordPolicy;

    public PasswordServiceImpl(AuthIdentityRepository authIdentityRepository,
                               PasswordEncoder passwordEncoder,
                               PasswordPolicy passwordPolicy) {
        this.authIdentityRepository = authIdentityRepository;
        this.passwordEncoder = passwordEncoder;
        this.passwordPolicy = passwordPolicy;
    }

    /**
     * Order matters and is not arbitrary: the current password is confirmed first, before
     * the new one is so much as looked at. Validating the proposal first would let anyone
     * sitting at an unattended session learn the password rules, and — worse — would report
     * "too short" to someone who has not proved they may change anything here at all.
     *
     * <p>The encoder is the only thing that ever sees a plaintext password. Nothing on this
     * path logs one, and no branch below puts one in an exception message.
     */
    @Override
    @Transactional
    public void changePassword(Long userId, String currentPassword, String newPassword) {
        AuthIdentity identity = authIdentityRepository
                .findByUserIdAndProvider(userId, Provider.local)
                .orElseThrow(() -> {
                    log.info("Password change refused: account {} has no local identity", userId);
                    return new NoLocalIdentityException();
                });

        // ck_auth_identity_shape already forbids a `local` row without a hash. If one
        // exists anyway, matches() would throw and turn this into a 500; the account has
        // no password of ours either way, which is exactly what the 409 says.
        String currentHash = identity.getPasswordHash();
        if (currentHash == null || currentHash.isBlank()) {
            log.warn("Password change refused: local identity {} has no password hash", identity.getId());
            throw new NoLocalIdentityException();
        }

        if (!passwordEncoder.matches(currentPassword, currentHash)) {
            log.info("Password change refused for account {}: current password does not match", userId);
            throw new InvalidCurrentPasswordException();
        }

        passwordPolicy.validate(newPassword);

        // Compared against the hash rather than against currentPassword: the two are equal
        // whenever the new password is the one already in use, and going through the
        // encoder keeps that true no matter how the caller filled the current field.
        if (passwordEncoder.matches(newPassword, currentHash)) {
            throw new PasswordRejectedException("The new password must differ from the current one");
        }

        identity.setPasswordHash(passwordEncoder.encode(newPassword));
        authIdentityRepository.save(identity);

        log.info("Password changed for account {}", userId);
    }
}
