package net.booksnap.domain.auth.service;

import lombok.extern.slf4j.Slf4j;
import org.springframework.security.core.session.SessionInformation;
import org.springframework.security.core.session.SessionRegistry;
import org.springframework.stereotype.Component;

import java.util.List;

/**
 * Ends the sessions a user holds elsewhere, keeping the one they are calling from.
 *
 * <p>Two things have to be true for this to work, and neither is visible from here:
 *
 * <ul>
 *   <li>{@code AuthenticatedUser} implements {@code equals}/{@code hashCode}. The registry
 *       keys its sessions by principal object, and each session holds its own instance —
 *       without value equality the lookup below returns an empty list and every other
 *       session quietly survives.</li>
 *   <li>{@code ConcurrentSessionFilter} sits in the filter chain, which
 *       {@code SecurityConfig} arranges by declaring session concurrency control.
 *       {@link SessionInformation#expireNow()} only sets a flag; that filter is what reads
 *       it on the next request and invalidates the session for real.</li>
 * </ul>
 *
 * <p>Both failure modes look identical from the outside — a password change that reports
 * success while the other browser keeps working.
 */
@Slf4j
@Component
public class SessionInvalidator {

    private final SessionRegistry sessionRegistry;

    public SessionInvalidator(SessionRegistry sessionRegistry) {
        this.sessionRegistry = sessionRegistry;
    }

    /**
     * @param principal        the principal as registered at login
     * @param currentSessionId the session to spare — the caller's own. Ending it too would
     *                         sign the user out the instant they changed their password,
     *                         which reads as a failure rather than as a success
     */
    public void invalidateAllExcept(Object principal, String currentSessionId) {
        // false: sessions already marked expired are left alone, there is nothing to do
        // to them a second time.
        List<SessionInformation> sessions = sessionRegistry.getAllSessions(principal, false);

        int expired = 0;
        for (SessionInformation session : sessions) {
            if (session.getSessionId().equals(currentSessionId)) {
                continue;
            }
            session.expireNow();
            expired++;
        }

        if (expired > 0) {
            log.info("Expired {} other session(s) after a credential change", expired);
        }
    }
}
