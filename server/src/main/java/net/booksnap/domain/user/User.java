package net.booksnap.domain.user;

import jakarta.persistence.*;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotNull;
import lombok.*;
import net.booksnap.domain.Auditable;
import net.booksnap.domain.book.KeyStage;
import org.hibernate.annotations.JdbcType;
import org.hibernate.dialect.PostgreSQLEnumJdbcType;

import java.time.LocalDateTime;

@Entity
@Table(name = "users")
@Data
@NoArgsConstructor
@AllArgsConstructor
@EqualsAndHashCode(callSuper = true)
public class User extends Auditable {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "first_name")
    private String firstName;

    @Column(name = "last_name")
    private String lastName;

    @Column(name = "email", nullable = false, unique = true, columnDefinition = "email")
    @Email
    @NotNull
    private String email;

    @Column(name = "is_active")
    private Boolean isActive = Boolean.TRUE;

    @Column(name = "last_login")
    private LocalDateTime lastLogin;

    @Column(name = "role", nullable = false)
    @NotNull
    @Enumerated(EnumType.STRING)
    @JdbcType(PostgreSQLEnumJdbcType.class)
    private Role role = Role.user;

    @Column(name = "key_stage")
    @Enumerated(EnumType.STRING)
    @JdbcType(PostgreSQLEnumJdbcType.class)
    private KeyStage keyStage;

    @Column(name = "house")
    private String house;

    @Column(name = "parent_email", columnDefinition = "email")
    private String parentEmail;

    // Free text in the database (the column is called genre); the API narrows it to Sex.
    @Column(name = "genre")
    private String sex;

}
