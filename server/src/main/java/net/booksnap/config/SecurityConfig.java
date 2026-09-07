package net.booksnap.config;

import java.util.List;

import lombok.extern.slf4j.Slf4j;
import net.booksnap.domain.user.Role;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.security.authentication.AuthenticationManager;
import org.springframework.security.config.annotation.authentication.configuration.AuthenticationConfiguration;
import org.springframework.security.config.Customizer;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configurers.AuthorizeHttpRequestsConfigurer;
import org.springframework.security.core.session.SessionRegistry;
import org.springframework.security.core.session.SessionRegistryImpl;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.web.AuthenticationEntryPoint;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.access.AccessDeniedHandler;
import org.springframework.security.web.authentication.logout.HttpStatusReturningLogoutSuccessHandler;
import org.springframework.security.web.authentication.session.ChangeSessionIdAuthenticationStrategy;
import org.springframework.security.web.authentication.session.CompositeSessionAuthenticationStrategy;
import org.springframework.security.web.authentication.session.RegisterSessionAuthenticationStrategy;
import org.springframework.security.web.authentication.session.SessionAuthenticationStrategy;
import org.springframework.security.web.context.HttpSessionSecurityContextRepository;
import org.springframework.security.web.context.SecurityContextRepository;
import org.springframework.security.web.csrf.CookieCsrfTokenRepository;
import org.springframework.security.web.csrf.CsrfAuthenticationStrategy;
import org.springframework.security.web.csrf.CsrfTokenRepository;
import org.springframework.security.web.csrf.CsrfTokenRequestHandler;
import org.springframework.security.web.session.HttpSessionEventPublisher;
import org.springframework.security.web.session.SessionInformationExpiredStrategy;

@Slf4j
@Configuration
public class SecurityConfig {

    private static final String ADMIN = Role.admin.name().toUpperCase();
    private static final String LIBRARIAN = Role.librarian.name().toUpperCase();

    /**
     * Way back to an open chain, for a rollout that has gone wrong and only then.
     *
     * <p>US-009 is a one-way switch for the front end: every business endpoint starts
     * answering 401 to a caller without a session. If a deployment turns out to lock the
     * school out — the sign-in screen not shipped with it, the bootstrap administrator
     * unusable — the choice would otherwise be between a broken library and a rollback of
     * the whole release. This flag is the third option, and it is meant to be turned back
     * on the same day: while it is off the API is fully public, which is the state access
     * rules §7 describes as the debt this story pays off.
     */
    private final boolean lockdownEnabled;

    public SecurityConfig(@Value("${booksnap.security.lockdown-enabled:true}") boolean lockdownEnabled) {
        this.lockdownEnabled = lockdownEnabled;
    }

    @Bean
    public SecurityFilterChain filterChain(HttpSecurity http,
                                           AuthenticationEntryPoint authenticationEntryPoint,
                                           AccessDeniedHandler accessDeniedHandler,
                                           CsrfTokenRepository csrfTokenRepository,
                                           CsrfTokenRequestHandler csrfTokenRequestHandler,
                                           SessionRegistry sessionRegistry,
                                           SessionInformationExpiredStrategy sessionInformationExpiredStrategy) throws Exception {
        http
            .cors(Customizer.withDefaults())
            // Enabled since US-006. Authentication is carried by a cookie the browser
            // attaches on its own, including on a request another site triggered, so a
            // write has to prove it was issued by our own pages. Spring Security exempts
            // GET, HEAD, OPTIONS and TRACE by itself — reads stay untouched.
            .csrf(csrf -> csrf
                    .csrfTokenRepository(csrfTokenRepository)
                    .csrfTokenRequestHandler(csrfTokenRequestHandler)
            )
            .authorizeHttpRequests(this::authorize)
            // Not a limit on how many times someone may sign in — maximumSessions(-1) is
            // unlimited, and capping the librarians' browsers is nobody's requirement.
            // Declaring concurrency control is what puts ConcurrentSessionFilter in the
            // chain, and that filter is the only thing that acts on a session marked
            // expired by SessionInvalidator. Without this block, changing a password marks
            // the other sessions and they keep working regardless.
            .sessionManagement(session -> session
                    .maximumSessions(-1)
                    .sessionRegistry(sessionRegistry)
                    .expiredSessionStrategy(sessionInformationExpiredStrategy)
            )
            .exceptionHandling(exception -> exception
                    .authenticationEntryPoint(authenticationEntryPoint)
                    .accessDeniedHandler(accessDeniedHandler)
            )
            .logout(logout -> logout
                    .logoutUrl("/api/v1/auth/logout")
                    .invalidateHttpSession(true)
                    .deleteCookies("JSESSIONID")
                    .logoutSuccessHandler(new HttpStatusReturningLogoutSuccessHandler(HttpStatus.NO_CONTENT))
            );
        return http.build();
    }

    /**
     * The permission matrix of access rules §3, endpoint by endpoint.
     *
     * <p>Written here rather than as {@code @PreAuthorize} on the controllers so that it
     * can be read in one block against the document it implements — which is what makes
     * "no endpoint was forgotten" checkable at all. Method annotations become necessary in
     * phase 2, when the answer stops depending on the URL alone and starts depending on
     * the data (the library a copy belongs to).
     *
     * <p>The groups below follow the controllers, and every rule names both a method and a
     * path. That is deliberate: with no rule broader than the endpoints it is meant to
     * cover, moving one line cannot silently mask another. The two places where order
     * still decides are marked.
     *
     * <p><strong>Library scope does not exist yet.</strong> A {@code LIBRARIAN} passing a
     * rule here may act on every library, not only the ones they are attached to. That is
     * phase 2 (access rules §2), and nothing in this file should be read as implementing
     * it. Same for {@code POST /holds}: it is open to a {@code USER} because the matrix
     * says so, but the {@code userId} in the body is still trusted, so a student can place
     * a hold in somebody else's name (access rules §4.3, §7 item 2). Being signed in is
     * now required for it, which narrows the hole without closing it.
     */
    private void authorize(AuthorizeHttpRequestsConfigurer<HttpSecurity>.AuthorizationManagerRequestMatcherRegistry auth) {
        if (!lockdownEnabled) {
            log.warn("SECURITY LOCKDOWN DISABLED — every endpoint is public, including the user "
                    + "directory. booksnap.security.lockdown-enabled must go back to true.");
            auth.anyRequest().permitAll();
            return;
        }

        auth
                // --- No session required -------------------------------------------------
                // Sign-in itself, and the token a sign-in needs before it can be sent.
                .requestMatchers("/api/v1/auth/csrf", "/api/v1/auth/login", "/api/v1/auth/logout").permitAll()
                // The container's health probe, which runs before anyone can sign in.
                // Ordered before the /actuator/** rule below, which would otherwise take it.
                .requestMatchers(HttpMethod.GET, "/actuator/health", "/actuator/health/**").permitAll()

                // --- Own account ---------------------------------------------------------
                .requestMatchers("/api/v1/auth/me", "/api/v1/auth/password").authenticated()

                // --- Books ---------------------------------------------------------------
                .requestMatchers(HttpMethod.GET, "/api/v1/books/key-stages").authenticated()
                .requestMatchers(HttpMethod.GET, "/api/v1/books/search").authenticated()
                .requestMatchers(HttpMethod.GET, "/api/v1/books/*/copies").authenticated()
                .requestMatchers(HttpMethod.GET, "/api/v1/books/*").authenticated()
                .requestMatchers(HttpMethod.GET, "/api/v1/books").authenticated()
                .requestMatchers(HttpMethod.POST, "/api/v1/books").hasAnyRole(LIBRARIAN, ADMIN)
                .requestMatchers(HttpMethod.PUT, "/api/v1/books/*").hasAnyRole(LIBRARIAN, ADMIN)
                // Admin only: the copy foreign key cascades, so deleting one shared record
                // empties the shelves of every library at once (access rules §4.1).
                .requestMatchers(HttpMethod.DELETE, "/api/v1/books/*").hasRole(ADMIN)

                // --- Copies --------------------------------------------------------------
                .requestMatchers(HttpMethod.GET, "/api/v1/copies/statuses").authenticated()
                // Before the plain /copies/* read below, which would otherwise open the QR
                // code — a desk tool — to students.
                .requestMatchers(HttpMethod.GET, "/api/v1/copies/*/qrcode").hasAnyRole(LIBRARIAN, ADMIN)
                // Not in the matrix, which lists only GET /books/{id}/copies. Same payload
                // for one copy instead of all of a book's, so it follows that line.
                .requestMatchers(HttpMethod.GET, "/api/v1/copies/*").authenticated()
                .requestMatchers(HttpMethod.POST, "/api/v1/copies").hasAnyRole(LIBRARIAN, ADMIN)
                .requestMatchers(HttpMethod.PUT, "/api/v1/copies/*").hasAnyRole(LIBRARIAN, ADMIN)
                .requestMatchers(HttpMethod.DELETE, "/api/v1/copies/*").hasAnyRole(LIBRARIAN, ADMIN)

                // --- Borrowings ----------------------------------------------------------
                // All four are desk operations. There is no "my borrowings" endpoint yet
                // (access rules §7 item 3), so nothing here is open to a student: GET
                // /borrowings lists the whole school, and GET /borrowings/{copyId} names
                // whoever is holding that copy.
                .requestMatchers(HttpMethod.GET, "/api/v1/borrowings").hasAnyRole(LIBRARIAN, ADMIN)
                .requestMatchers(HttpMethod.GET, "/api/v1/borrowings/*").hasAnyRole(LIBRARIAN, ADMIN)
                .requestMatchers(HttpMethod.POST, "/api/v1/borrowings").hasAnyRole(LIBRARIAN, ADMIN)
                .requestMatchers(HttpMethod.POST, "/api/v1/borrowings/*/return").hasAnyRole(LIBRARIAN, ADMIN)

                // --- Holds ---------------------------------------------------------------
                .requestMatchers(HttpMethod.POST, "/api/v1/holds").authenticated()
                .requestMatchers(HttpMethod.GET, "/api/v1/holds").hasAnyRole(LIBRARIAN, ADMIN)

                // --- Covers --------------------------------------------------------------
                // Open to every signed-in user on purpose: this is what fills the thumbnails
                // in the catalogue, and closing it blanks every cover in the app.
                .requestMatchers(HttpMethod.GET, "/api/v1/covers/*").authenticated()
                .requestMatchers(HttpMethod.POST, "/api/v1/covers").hasAnyRole(LIBRARIAN, ADMIN)
                .requestMatchers(HttpMethod.DELETE, "/api/v1/covers/*").hasAnyRole(LIBRARIAN, ADMIN)

                // --- Reference data ------------------------------------------------------
                .requestMatchers(HttpMethod.GET, "/api/v1/dewey/**").authenticated()
                .requestMatchers(HttpMethod.GET, "/api/v1/genres/search").authenticated()

                // --- Users ---------------------------------------------------------------
                // Name, first name and email of every active user. Staff only, and the
                // student journey must never call it (access rules §4.4).
                .requestMatchers(HttpMethod.GET, "/api/v1/users/search").hasAnyRole(LIBRARIAN, ADMIN)

                // --- Everything else -----------------------------------------------------
                // Actuator beyond the health probe is operational data, not the school's.
                .requestMatchers("/actuator/**").hasRole(ADMIN)
                // Closed by default, and never permitAll(): an endpoint added tomorrow is
                // protected until someone opens it here on purpose, rather than the reverse.
                .anyRequest().authenticated();
    }

    /**
     * The token lives in a cookie the script is allowed to read, not in the session.
     *
     * <p>That is the deliberate opposite of {@code JSESSIONID}, which stays {@code HttpOnly}:
     * the front end must be able to copy the CSRF token into a request header, and the
     * whole protection rests on a foreign site being unable to read our cookies. Making
     * the session cookie readable would hand it to any injected script; making the CSRF
     * cookie unreadable would leave the front end nothing to send.
     *
     * <p>Storing it in a cookie rather than the session also means a token can be handed
     * out before anyone has signed in — which is what lets the login form itself be
     * protected.
     */
    @Bean
    public CsrfTokenRepository csrfTokenRepository() {
        return CookieCsrfTokenRepository.withHttpOnlyFalse();
    }

    @Bean
    public CsrfTokenRequestHandler csrfTokenRequestHandler() {
        return new SpaCsrfTokenRequestHandler();
    }

    @Bean
    public PasswordEncoder passwordEncoder(@Value("${booksnap.security.bcrypt-strength:10}") int strength) {
        return new BCryptPasswordEncoder(strength);
    }

    @Bean
    AuthenticationManager authenticationManager(AuthenticationConfiguration config) throws Exception {
        return config.getAuthenticationManager();
    }

    @Bean
    public SecurityContextRepository securityContextRepository() {
        return new HttpSessionSecurityContextRepository();
    }

    @Bean
    public SessionRegistry sessionRegistry() {
        return new SessionRegistryImpl();
    }

    // Order matters: the session id is rotated first, so the registry records the
    // rotated one rather than the id the client arrived with.
    //
    // The CSRF step comes last and is not decoration: it throws away the token the
    // visitor held before signing in and issues a new one. Whoever managed to plant a
    // known token in the browser before the login therefore holds a dead value after it.
    // Spring wires this strategy in on its own when the login goes through one of its
    // filters; AuthController authenticates by hand, so it has to be listed here.
    @Bean
    public SessionAuthenticationStrategy sessionAuthenticationStrategy(SessionRegistry sessionRegistry,
                                                                      CsrfTokenRepository csrfTokenRepository,
                                                                      CsrfTokenRequestHandler csrfTokenRequestHandler) {
        CsrfAuthenticationStrategy csrfAuthenticationStrategy = new CsrfAuthenticationStrategy(csrfTokenRepository);
        csrfAuthenticationStrategy.setRequestHandler(csrfTokenRequestHandler);

        return new CompositeSessionAuthenticationStrategy(List.of(
                new ChangeSessionIdAuthenticationStrategy(),
                new RegisterSessionAuthenticationStrategy(sessionRegistry),
                csrfAuthenticationStrategy
        ));
    }

    // Without it the registry never hears about expired or invalidated sessions and
    // keeps growing.
    @Bean
    public HttpSessionEventPublisher httpSessionEventPublisher() {
        return new HttpSessionEventPublisher();
    }
}
