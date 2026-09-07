package net.booksnap.config;

import net.booksnap.domain.Auditable;
import net.booksnap.domain.auth.service.AuthenticatedUser;
import net.booksnap.domain.user.Role;
import net.booksnap.domain.user.User;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.security.authentication.AnonymousAuthenticationToken;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * US-010 is a verification story, and this is the one thing in it that verification alone
 * cannot hold: {@link AnonymousAuthenticationToken#isAuthenticated()} answers
 * {@code true}, so the obvious {@code auth != null && auth.isAuthenticated()} stamps the
 * literal string {@code "anonymousUser"} into {@code created_by}. It reads like a real
 * account, it is not one, and nothing downstream complains.
 *
 * <p>Nothing here boots Spring. {@code SecurityContextHolder} is a thread local and
 * {@link AuditorAwareImpl} reads it directly, so the four cases can simply be placed in
 * it — which also means the context has to be cleared afterwards, or the surviving
 * principal leaks into whatever test JUnit runs next on this thread.
 */
class AuditorAwareImplTest {

    private final AuditorAwareImpl auditorAware = new AuditorAwareImpl();

    @BeforeEach
    @AfterEach
    void clearContext() {
        SecurityContextHolder.clearContext();
    }

    @Test
    @DisplayName("a signed-in user is recorded by email")
    void recordsTheEmailOfTheSignedInUser() {
        authenticate(principal("librarian@booksnap.net"));

        assertThat(auditorAware.getCurrentAuditor()).contains("librarian@booksnap.net");
    }

    @Test
    @DisplayName("the anonymous caller is the system, not \"anonymousUser\"")
    void doesNotRecordTheAnonymousPrincipal() {
        // Exactly what AnonymousAuthenticationFilter puts in the context; note that its
        // getName() is "anonymousUser", which is the value this guard exists to keep out.
        Authentication anonymous = new AnonymousAuthenticationToken(
                "key", "anonymousUser", List.of(new SimpleGrantedAuthority("ROLE_ANONYMOUS")));
        assertThat(anonymous.isAuthenticated()).isTrue();
        SecurityContextHolder.getContext().setAuthentication(anonymous);

        assertThat(auditorAware.getCurrentAuditor()).contains(Auditable.SYSTEM_AUDITOR);
    }

    @Test
    @DisplayName("no security context at all is the system — the scheduler and the bootstrap")
    void fallsBackToTheSystemWithoutAContext() {
        assertThat(auditorAware.getCurrentAuditor()).contains(Auditable.SYSTEM_AUDITOR);
    }

    @Test
    @DisplayName("a token that failed authentication is the system")
    void fallsBackToTheSystemForAnUnauthenticatedToken() {
        // No authorities: the constructor leaves isAuthenticated() false.
        SecurityContextHolder.getContext().setAuthentication(
                new UsernamePasswordAuthenticationToken("librarian@booksnap.net", "wrong"));

        assertThat(auditorAware.getCurrentAuditor()).contains(Auditable.SYSTEM_AUDITOR);
    }

    /** Never empty: {@code created_by} is meant to name somebody on every row. */
    @Test
    @DisplayName("an auditor is always supplied")
    void alwaysSuppliesAnAuditor() {
        assertThat(auditorAware.getCurrentAuditor()).isPresent();

        authenticate(principal("admin@booksnap.net"));
        assertThat(auditorAware.getCurrentAuditor()).isPresent();
    }

    private void authenticate(AuthenticatedUser user) {
        SecurityContextHolder.getContext().setAuthentication(
                new UsernamePasswordAuthenticationToken(user, null, user.getAuthorities()));
    }

    private AuthenticatedUser principal(String email) {
        User user = new User();
        user.setId(7L);
        user.setEmail(email);
        user.setRole(Role.librarian);
        return new AuthenticatedUser(user, "$2a$10$irrelevant");
    }
}
