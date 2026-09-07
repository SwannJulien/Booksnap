package net.booksnap.config;

import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.servlet.config.annotation.CorsRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

import java.util.Arrays;
import java.util.List;

@Slf4j
@Configuration
public class WebConfiguration {

    /**
     * Origins allowed to call the API from a browser, comma-separated.
     *
     * <p>Setting it to empty is a valid answer, not a mistake: the Vite proxy makes the
     * front end same-origin with the API in development, and a deployment serving both
     * from one domain is same-origin too. CORS only has something to say when the two
     * sit on different origins.
     *
     * <p>Read as a plain string rather than a {@code List<String>} because the empty
     * value binds to a list holding one empty string, which would be registered as an
     * origin and match nothing while looking configured.
     */
    private final List<String> allowedOrigins;

    public WebConfiguration(@Value("${booksnap.cors.allowed-origins:}") String allowedOrigins) {
        this.allowedOrigins = Arrays.stream(allowedOrigins.split(","))
                .map(String::trim)
                .filter(origin -> !origin.isEmpty())
                .toList();
    }

    @Bean
    public WebMvcConfigurer corsConfigurer() {
        return new WebMvcConfigurer() {
            @Override
            public void addCorsMappings(CorsRegistry registry) {
                if (allowedOrigins.isEmpty()) {
                    log.info("CORS disabled: no allowed origin configured, the API only answers same-origin calls");
                    return;
                }

                log.info("CORS enabled for origins {}", allowedOrigins);
                registry.addMapping("/**")
                        .allowedOrigins(allowedOrigins.toArray(String[]::new))
                        .allowedMethods("GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS")
                        .allowedHeaders("*")
                        // Required for the browser to send JSESSIONID and XSRF-TOKEN on a
                        // cross-origin call. It is also why the origins above can never be
                        // "*": the specification forbids the pair, and Spring throws at
                        // startup rather than let it through.
                        .allowCredentials(true);
            }
        };
    }
}
