package net.booksnap.config;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.security.web.csrf.CsrfToken;
import org.springframework.security.web.csrf.CsrfTokenRequestAttributeHandler;
import org.springframework.security.web.csrf.CsrfTokenRequestHandler;
import org.springframework.security.web.csrf.XorCsrfTokenRequestAttributeHandler;
import org.springframework.util.StringUtils;

import java.util.function.Supplier;

/**
 * Makes CSRF protection usable by a JavaScript front end that reads the token from a
 * cookie. Two problems have to be solved, and they are unrelated.
 *
 * <p><b>1. Masking.</b> Spring Security masks the token before writing it anywhere a
 * response body could carry it (BREACH protection): the exposed value is the raw token
 * XOR-ed with a random salt, different on every request. {@code CookieCsrfTokenRepository}
 * however stores the <em>raw</em> token in the {@code XSRF-TOKEN} cookie. A client that
 * copies that cookie into the {@code X-XSRF-TOKEN} header therefore sends a raw value
 * where the default handler expects a masked one, and every write answers 403. The two
 * cases are told apart by where the token came from: a request header is read as raw,
 * anything else (a {@code _csrf} form parameter) as masked. Writing stays masked, since
 * that is the side facing the response body.
 *
 * <p><b>2. Deferred loading.</b> Since Spring Security 6 the token is lazy: the filter
 * puts a supplier in the request attributes and the repository only writes the cookie if
 * something reads the value. A server-rendered page reads it while building its form; an
 * API answering JSON never does, so the cookie would never be sent. Resolving the token
 * here forces it out — the {@code csrfToken.get()} call below looks useless and is the
 * reason the front end receives a token at all.
 *
 * <p>The reference documentation solves that second point with a separate filter placed
 * after {@code BasicAuthenticationFilter}. That filter cannot cover the token rotation
 * {@code CsrfAuthenticationStrategy} performs during login, which happens later in the
 * request, in the controller: the old cookie would be cleared and the replacement never
 * written. Doing it in the handler covers both paths, since both go through it.
 */
final class SpaCsrfTokenRequestHandler extends CsrfTokenRequestAttributeHandler {

    private final CsrfTokenRequestHandler delegate = new XorCsrfTokenRequestAttributeHandler();

    @Override
    public void handle(HttpServletRequest request, HttpServletResponse response, Supplier<CsrfToken> csrfToken) {
        this.delegate.handle(request, response, csrfToken);
        // Forces the repository to write the XSRF-TOKEN cookie. Only writes one when the
        // request arrived without it: an existing token is loaded and reused as is.
        csrfToken.get();
    }

    @Override
    public String resolveCsrfTokenValue(HttpServletRequest request, CsrfToken csrfToken) {
        if (StringUtils.hasText(request.getHeader(csrfToken.getHeaderName()))) {
            // Raw value, read straight from the cookie by the front end.
            return super.resolveCsrfTokenValue(request, csrfToken);
        }
        // Masked value, rendered into a form.
        return this.delegate.resolveCsrfTokenValue(request, csrfToken);
    }
}
