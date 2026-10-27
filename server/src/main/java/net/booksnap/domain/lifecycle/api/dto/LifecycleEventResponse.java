package net.booksnap.domain.lifecycle.api.dto;

import net.booksnap.domain.lifecycle.LifecycleEvent;
import net.booksnap.domain.lifecycle.LifecycleEventType;

import java.time.LocalDateTime;
import java.util.Map;

public record LifecycleEventResponse(
    Long id,
    LocalDateTime occurredAt,
    LifecycleEventType type,
    String actor,
    CopyRef copy,
    StudentRef student,
    Map<String, Object> detail,
    boolean backfilled,
    boolean approximateDate
) {
    public static LifecycleEventResponse of(LifecycleEvent event) {
        CopyRef copy = event.getCopyId() == null ? null
                : new CopyRef(event.getCopyId(), (String) event.getDetail().get("identification_code"));
        StudentRef student = event.getStudentId() == null ? null
                : new StudentRef(event.getStudentId(), event.getStudentFirstName(), event.getStudentLastName());
        return new LifecycleEventResponse(event.getId(), event.getOccurredAt(), event.getType(), event.getActor(),
                copy, student, event.getDetail(), event.isBackfilled(), event.isApproximateDate());
    }

    public record CopyRef(Long id, String identificationCode) {}

    public record StudentRef(Long id, String firstName, String lastName) {}
}
