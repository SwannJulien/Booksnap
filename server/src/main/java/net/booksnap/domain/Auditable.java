package net.booksnap.domain;

import jakarta.persistence.Column;
import jakarta.persistence.EntityListeners;
import jakarta.persistence.MappedSuperclass;
import lombok.Data;
import org.springframework.data.annotation.CreatedBy;
import org.springframework.data.annotation.CreatedDate;
import org.springframework.data.annotation.LastModifiedBy;
import org.springframework.data.annotation.LastModifiedDate;
import org.springframework.data.jpa.domain.support.AuditingEntityListener;

import java.time.LocalDateTime;

@EntityListeners(AuditingEntityListener.class)
@MappedSuperclass
@Data
public abstract class Auditable {

    /**
     * What {@code created_by} / {@code last_modified_by} hold when no one is signed in:
     * the admin bootstrap, the overdue scheduler, and anything else running off a request
     * thread. Since US-009 no external call can reach a write without a session, so this
     * value now means "Booksnap itself" and never "we could not tell".
     */
    public static final String SYSTEM_AUDITOR = "system";

    @CreatedBy
    @Column(name = "created_by")
    protected String createdBy;

    @CreatedDate
    @Column(name = "created_date", nullable = false, updatable = false)
    protected LocalDateTime createdDate;

    @LastModifiedBy
    @Column(name = "last_modified_by")
    protected String lastModifiedBy;

    @LastModifiedDate
    @Column(name = "last_modified_date")
    protected LocalDateTime lastModifiedDate;
}
