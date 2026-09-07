package net.booksnap.exception;

import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.web.access.AccessDeniedHandler;
import org.springframework.security.web.csrf.CsrfException;
import org.springframework.stereotype.Component;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.time.LocalDateTime;

/**
 * Renders the 403 raised when an authenticated request is refused — today, a write
 * arriving without a valid CSRF token.
 *
 * <p>Same reason as {@link RestAuthenticationEntryPoint}: the refusal happens inside the
 * filter chain, out of reach of {@link GlobalExceptionHandler}, and the default handler
 * answers an empty body. An empty 403 on a write is the hardest failure of this feature
 * to diagnose, so it gets a message.
 */
@Component
public class RestAccessDeniedHandler implements AccessDeniedHandler {

    private static final String MESSAGE = "Access denied";

    /**
     * Naming the cause gives nothing away — the token is a defence against a site that
     * cannot read our responses in the first place — and it is the difference between a
     * five-minute fix and an afternoon.
     */
    private static final String CSRF_MESSAGE = "CSRF token missing or invalid";

    private final ObjectMapper objectMapper;

    public RestAccessDeniedHandler(ObjectMapper objectMapper) {
        this.objectMapper = objectMapper;
    }

    @Override
    public void handle(HttpServletRequest request,
                       HttpServletResponse response,
                       AccessDeniedException accessDeniedException) throws IOException {
        String message = (accessDeniedException instanceof CsrfException) ? CSRF_MESSAGE : MESSAGE;

        ApiError error = new ApiError(
                LocalDateTime.now(),
                HttpStatus.FORBIDDEN.value(),
                message,
                request.getRequestURI());

        response.setStatus(HttpStatus.FORBIDDEN.value());
        response.setContentType(MediaType.APPLICATION_JSON_VALUE);
        response.setCharacterEncoding(StandardCharsets.UTF_8.name());
        objectMapper.writeValue(response.getOutputStream(), error);
    }
}
