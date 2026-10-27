package net.booksnap.domain.hold.service;

import net.booksnap.domain.hold.Status;
import net.booksnap.domain.hold.repository.HoldRepository;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.boot.test.system.CapturedOutput;
import org.springframework.boot.test.system.OutputCaptureExtension;

import java.time.LocalDate;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith({MockitoExtension.class, OutputCaptureExtension.class})
class HoldExpirationSchedulerTest {

    @Mock
    private HoldRepository holdRepository;

    @Mock
    private HoldService holdService;

    @Test
    @DisplayName("a failing expiry does not stop the others and is logged")
    void failingExpiryDoesNotStopTheOthers(CapturedOutput output) {
        when(holdRepository.findIdsByStatusAndEndDateBefore(eq(Status.active), any(LocalDate.class)))
                .thenReturn(List.of(1L, 2L, 3L));
        when(holdService.expireHold(1L)).thenReturn(true);
        when(holdService.expireHold(2L)).thenThrow(new RuntimeException("boom"));
        when(holdService.expireHold(3L)).thenReturn(true);
        HoldExpirationScheduler scheduler = new HoldExpirationScheduler(holdRepository, holdService);

        assertThatCode(scheduler::expireUncollectedHolds).doesNotThrowAnyException();

        verify(holdService).expireHold(1L);
        verify(holdService).expireHold(3L);
        List<String> errorMessages = output.getAll().lines()
                .filter(line -> line.contains(" ERROR "))
                .map(line -> line.replaceFirst("^.* ERROR .*? (?:--|:) ", ""))
                .toList();
        assertThat(errorMessages).hasSize(1);
        assertThat(errorMessages.get(0)).containsPattern("\\b2\\b").doesNotContainPattern("\\b[13]\\b");
        assertThat(output.getAll()).contains("2 hold(s) expired");
    }

    @Test
    @DisplayName("the expiry count is logged only if non-zero")
    void expiryCountIsLoggedOnlyIfNonZero(CapturedOutput output) {
        when(holdRepository.findIdsByStatusAndEndDateBefore(eq(Status.active), any(LocalDate.class)))
                .thenReturn(List.of());
        HoldExpirationScheduler scheduler = new HoldExpirationScheduler(holdRepository, holdService);

        scheduler.expireUncollectedHolds();

        verify(holdService, never()).expireHold(any());
        assertThat(output.getAll()).doesNotContain("hold(s) expired");

        when(holdRepository.findIdsByStatusAndEndDateBefore(eq(Status.active), any(LocalDate.class)))
                .thenReturn(List.of(1L, 2L));
        when(holdService.expireHold(1L)).thenReturn(true);
        when(holdService.expireHold(2L)).thenReturn(true);

        scheduler.expireUncollectedHolds();

        assertThat(output.getAll()).contains("2 hold(s) expired");
    }
}
