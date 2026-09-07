package net.booksnap.config;

import lombok.extern.slf4j.Slf4j;
import net.booksnap.domain.auth.AuthIdentity;
import net.booksnap.domain.auth.Provider;
import net.booksnap.domain.auth.repository.AuthIdentityRepository;
import net.booksnap.domain.auth.service.PasswordPolicy;
import net.booksnap.domain.user.Role;
import net.booksnap.domain.user.User;
import net.booksnap.domain.user.repository.UserRepository;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

/**
 * Creates the very first {@code admin} account, so that locking the API down does not
 * lock everybody out of it.
 *
 * <p>Creating an account requires being an administrator, and the two ways of becoming
 * one without already being one — an emailed invitation and Microsoft SSO — are both
 * later phases. This runner is the third way described in access rules §5.3, and the only
 * one available on a database nobody has ever signed into.
 *
 * <p><strong>It is a door, and it has to close behind itself.</strong> The condition is
 * "no account holds the {@code admin} role", never "this particular account does not
 * exist": the second one would re-apply the environment password on every restart, wiping
 * whatever password the administrator has since chosen. Once one admin exists this runner
 * does nothing at all, whatever the variables still say.
 *
 * <p>The account written here is stamped {@code created_by = "system"} — no request, no
 * security context, so {@link AuditorAwareImpl} falls back to that.
 */
@Slf4j
@Component
public class AdminBootstrapRunner implements ApplicationRunner {

    private final UserRepository userRepository;
    private final AuthIdentityRepository authIdentityRepository;
    private final PasswordEncoder passwordEncoder;
    private final PasswordPolicy passwordPolicy;

    private final String email;
    private final String password;
    private final String firstName;
    private final String lastName;

    public AdminBootstrapRunner(UserRepository userRepository,
                                AuthIdentityRepository authIdentityRepository,
                                PasswordEncoder passwordEncoder,
                                PasswordPolicy passwordPolicy,
                                @Value("${booksnap.bootstrap.admin.email:}") String email,
                                @Value("${booksnap.bootstrap.admin.password:}") String password,
                                @Value("${booksnap.bootstrap.admin.first-name:}") String firstName,
                                @Value("${booksnap.bootstrap.admin.last-name:}") String lastName) {
        this.userRepository = userRepository;
        this.authIdentityRepository = authIdentityRepository;
        this.passwordEncoder = passwordEncoder;
        this.passwordPolicy = passwordPolicy;
        this.email = email.trim();
        // Not trimmed: a space is a legitimate character, and silently dropping one would
        // hash something other than what the operator will type at the login form.
        this.password = password;
        this.firstName = firstName.trim();
        this.lastName = lastName.trim();
    }

    /**
     * Transactional so that a rejected {@code auth_identity} row takes the account back
     * with it. Half a bootstrap — an admin with no way to sign in — would look like a
     * success in the logs and close the door on the next start.
     */
    @Override
    @Transactional
    public void run(ApplicationArguments args) {
        if (userRepository.existsByRole(Role.admin)) {
            log.debug("Admin bootstrap skipped: an admin account already exists");
            return;
        }

        if (email.isBlank()) {
            log.warn("No admin account exists and no bootstrap is configured: nobody can "
                    + "administer Booksnap. Set BOOKSNAP_BOOTSTRAP_ADMIN_EMAIL and "
                    + "BOOKSNAP_BOOTSTRAP_ADMIN_PASSWORD, then restart. See server/README.md.");
            return;
        }

        // Before any write, and loudly: the alternative is an application whose
        // administrator is guessable, which is worse than an application that will not
        // start. An unset password lands here too — zero is shorter than twelve.
        //
        // The rule itself comes from PasswordPolicy, the same component the password
        // change of US-008 uses. A copy of it here would eventually accept a bootstrap
        // password that the change endpoint then refuses.
        passwordPolicy.violation(password).ifPresent(rule -> {
            throw new IllegalStateException(
                    "Admin bootstrap refused: BOOKSNAP_BOOTSTRAP_ADMIN_PASSWORD does not "
                            + "satisfy the password policy — " + rule
                            + ". Fix it or clear the bootstrap variables.");
        });

        // users.email is unique, and citext since V4 — a difference in case is the same
        // address, so this finds the account whatever case it was typed in and the
        // promotion path is taken instead of a duplicate insert being attempted.
        User admin = userRepository.findByEmail(email)
                .map(this::promoteExistingAccount)
                .orElseGet(this::createAccount);

        attachLocalIdentity(admin);
    }

    /**
     * The email already belongs to somebody — a librarian, a student. That row is the
     * account: it keeps its history, its loans and its name, and gains the role.
     */
    private User promoteExistingAccount(User user) {
        Role previousRole = user.getRole();
        user.setRole(Role.admin);

        // A disabled account is refused at login by UserDetailsServiceImpl, so leaving it
        // disabled would produce an administrator who cannot sign in — a bootstrap that
        // reports success and changes nothing.
        if (!Boolean.TRUE.equals(user.getIsActive())) {
            user.setIsActive(Boolean.TRUE);
            log.warn("Admin bootstrap: account {} was inactive and has been reactivated", email);
        }

        User saved = userRepository.save(user);
        log.info("Admin bootstrap: existing account {} promoted from {} to admin", email, previousRole);
        return saved;
    }

    private User createAccount() {
        User user = new User();
        user.setEmail(email);
        user.setFirstName(blankToNull(firstName));
        user.setLastName(blankToNull(lastName));
        user.setRole(Role.admin);
        user.setIsActive(Boolean.TRUE);

        User saved = userRepository.save(user);
        log.info("Admin bootstrap: admin account {} created", email);
        return saved;
    }

    /**
     * Gives the account a password to sign in with, unless it already has one.
     *
     * <p>Never overwriting is the same rule as never re-running: the account may be a
     * person who already chose a password, and the bootstrap variables are usually still
     * in the environment at that point. Promoting them must not also reset their
     * credentials to a value written in a file.
     */
    private void attachLocalIdentity(User user) {
        if (authIdentityRepository.findByUserIdAndProvider(user.getId(), Provider.local).isPresent()) {
            log.warn("Admin bootstrap: account {} already had a password, left untouched. "
                    + "Sign in with the existing one.", email);
            return;
        }

        AuthIdentity identity = new AuthIdentity();
        identity.setUser(user);
        identity.setProvider(Provider.local);
        // ck_auth_identity_shape: a `local` row carries a hash and no subject. Setting
        // both, or neither, is rejected by the database.
        identity.setSubject(null);
        identity.setPasswordHash(passwordEncoder.encode(password));
        authIdentityRepository.save(identity);

        log.warn("Admin bootstrap: password set for {}. Sign in, change it (US-008), then "
                + "remove the BOOKSNAP_BOOTSTRAP_ADMIN_* variables from the environment.", email);
    }

    /**
     * {@code users.first_name} and {@code users.last_name} are nullable. An unset variable
     * should leave them empty rather than store the empty string, which would read as a
     * name that happens to be blank.
     */
    private String blankToNull(String value) {
        return value.isBlank() ? null : value;
    }
}
