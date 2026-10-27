package net.booksnap.domain.lifecycle;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.Getter;
import lombok.NoArgsConstructor;
import org.hibernate.annotations.Immutable;
import org.hibernate.annotations.JdbcType;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.dialect.PostgreSQLEnumJdbcType;
import org.hibernate.type.SqlTypes;

import java.time.LocalDateTime;
import java.util.Map;

// Written by the triggers of V10, never by Java
@Entity
@Table(name = "lifecycle_event")
@Immutable
@Getter
@NoArgsConstructor
public class LifecycleEvent {

    @Id
    private Long id;

    @Column(name = "occurred_at")
    private LocalDateTime occurredAt;

    @Enumerated(EnumType.STRING)
    @JdbcType(PostgreSQLEnumJdbcType.class)
    @Column(name = "type", columnDefinition = "lifecycle_event_type")
    private LifecycleEventType type;

    private String actor;

    @Column(name = "book_id")
    private Long bookId;

    @Column(name = "copy_id")
    private Long copyId;

    @Column(name = "student_id")
    private Long studentId;

    @Column(name = "student_first_name")
    private String studentFirstName;

    @Column(name = "student_last_name")
    private String studentLastName;

    @JdbcTypeCode(SqlTypes.JSON)
    private Map<String, Object> detail;

    private boolean backfilled;

    @Column(name = "approximate_date")
    private boolean approximateDate;
}
