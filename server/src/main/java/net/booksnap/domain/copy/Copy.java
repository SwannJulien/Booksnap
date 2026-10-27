package net.booksnap.domain.copy;

import jakarta.persistence.*;
import jakarta.validation.constraints.NotNull;
import lombok.*;
import net.booksnap.domain.Auditable;
import net.booksnap.domain.book.Book;
import net.booksnap.domain.library.Library;
import org.hibernate.annotations.JdbcType;
import org.hibernate.dialect.PostgreSQLEnumJdbcType;

import java.time.LocalDateTime;

@Entity
@Table(name = "copy", indexes = {
        @Index(name = "idx_copy_book_status", columnList = "book_id, status")
})
@Data
@NoArgsConstructor
@AllArgsConstructor
@EqualsAndHashCode(callSuper = true)
public class Copy extends Auditable {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne
    @JoinColumn(name = "book_id", nullable = false)
    private Book book;

    @Column(name = "section_name")
    @NotNull
    private String sectionName;

    @Column(name = "identification_code")
    @NotNull
    private String identificationCode;

    @ManyToOne
    @JoinColumn(name = "library_id", nullable = false)
    private Library library;

    @Column(name = "status")
    @NotNull
    @Enumerated(EnumType.STRING)
    @JdbcType(PostgreSQLEnumJdbcType.class)
    private Status status = Status.available;

    // Independent of status, which the triggers own: a deleted copy stays 'available'
    @Column(name = "deleted_at")
    private LocalDateTime deletedAt;

}
