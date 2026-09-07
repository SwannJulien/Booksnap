package net.booksnap.config;

import net.booksnap.domain.Auditable;
import org.springframework.data.domain.AuditorAware;
import org.springframework.security.authentication.AnonymousAuthenticationToken;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Component;

import java.util.Optional;

/**
 * Names the author of every write in the {@code created_by} / {@code last_modified_by}
 * columns of {@link Auditable}.
 *
 * <p><strong>What is stored is the email address</strong>, because {@code auth.getName()}
 * is the {@code UserDetails} username and
 * {@link net.booksnap.domain.auth.service.AuthenticatedUser#getUsername()} returns the
 * email. That is a deliberate choice, not an accident of the API: these columns are plain
 * traceability text, read straight out of {@code psql} when an entry has to be traced back
 * to whoever made it, and an address is legible where an account id would need a join.
 *
 * <p>The price is that the value is <strong>not stable</strong>. An address that is later
 * corrected leaves the older rows naming the previous one, and nothing rewrites them.
 * That is accepted: this is a log of what was true at the time of the write.
 * <strong>Never turn these columns into a foreign key to {@code users}</strong>
 * (structural rules §8).
 *
 * <p><strong>The anonymous trap.</strong> Spring Security supplies an
 * {@link AnonymousAuthenticationToken} for callers with no session, and its
 * {@code isAuthenticated()} answers {@code true}. Without the guard below, an
 * unauthenticated write would be stamped with the literal string {@code "anonymousUser"}
 * rather than falling back to {@link Auditable#SYSTEM_AUDITOR}. Since US-009 no such call
 * reaches a write — <em>unless</em> {@code booksnap.security.lockdown-enabled} is turned
 * off, the rollback switch in {@link SecurityConfig}, which makes every endpoint public
 * again. Precisely the situation whose audit trail one would want to read afterwards, so
 * the guard is not theoretical.
 *
 * <p>Bulk {@code @Modifying} queries never reach this class: they are translated straight
 * to SQL and the auditing entity listener never sees the rows. Anything written that way
 * has to set the columns itself — see
 * {@link net.booksnap.domain.borrowing.repository.BorrowingRepository#markOverdue}.
 */
@Component
public class AuditorAwareImpl implements AuditorAware<String> {

    @Override
    public Optional<String> getCurrentAuditor() {
        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        if (auth != null && auth.isAuthenticated() && !(auth instanceof AnonymousAuthenticationToken)) {
            return Optional.of(auth.getName());
        }
        return Optional.of(Auditable.SYSTEM_AUDITOR);
    }
}
