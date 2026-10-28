package net.booksnap.domain.auth.service;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.util.HashSet;
import java.util.Set;
import java.util.stream.IntStream;

import static org.assertj.core.api.Assertions.assertThat;

class TemporaryPasswordGeneratorTest {

    private static final int SAMPLES = 100;

    private final TemporaryPasswordGenerator generator = new TemporaryPasswordGenerator();
    private final PasswordPolicy passwordPolicy = new PasswordPolicy();

    @Test
    @DisplayName("US-02: a generated temporary password satisfies the password policy")
    void generatedPasswordSatisfiesThePolicy() {
        IntStream.range(0, SAMPLES).forEach(i ->
                assertThat(passwordPolicy.violation(generator.generate())).isEmpty());
    }

    @Test
    @DisplayName("US-02: two generated temporary passwords differ")
    void generatedPasswordsDiffer() {
        Set<String> passwords = new HashSet<>();
        IntStream.range(0, SAMPLES).forEach(i -> passwords.add(generator.generate()));

        assertThat(passwords).hasSize(SAMPLES);
    }
}
