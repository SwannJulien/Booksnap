package net.booksnap.exception;

import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.security.web.session.SessionInformationExpiredEvent;
import org.springframework.security.web.session.SessionInformationExpiredStrategy;
import org.springframework.stereotype.Component;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.time.LocalDateTime;

/**
 * Answers a request arriving on a session that has been expired from elsewhere — today,
 * a session ended by its owner changing their password from another browser.
 *
 * <p>Spring's default writes a sentence of English prose with a 200 status, which is a
 * reasonable thing to show a server-rendered page and the wrong thing entirely for a
 * client that parses JSON and switches on the status: a 200 reads as success, and the
 * front end would render the prose as data. The 401 and the {@link ApiError} shape here
 * are the same ones {@link RestAuthenticationEntryPoint} produces for a request with no
 * session at all, so the front end has a single case to handle.
 */
@Component
public class RestExpiredSessionStrategy implements SessionInformationExpiredStrategy {

    private static final String MESSAGE = "Session ended: sign in again";

    private final ObjectMapper objectMapper;

    public RestExpiredSessionStrategy(ObjectMapper objectMapper) {
        this.objectMapper = objectMapper;
    }

    @Override
    public void onExpiredSessionDetected(SessionInformationExpiredEvent event) throws IOException {
        HttpServletResponse response = event.getResponse();

        ApiError error = new ApiError(
                LocalDateTime.now(),
                HttpStatus.UNAUTHORIZED.value(),
                MESSAGE,
                event.getRequest().getRequestURI());

        response.setStatus(HttpStatus.UNAUTHORIZED.value());
        response.setContentType(MediaType.APPLICATION_JSON_VALUE);
        response.setCharacterEncoding(StandardCharsets.UTF_8.name());
        objectMapper.writeValue(response.getOutputStream(), error);
    }
}
