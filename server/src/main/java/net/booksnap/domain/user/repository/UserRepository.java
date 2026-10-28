package net.booksnap.domain.user.repository;

import net.booksnap.domain.user.Role;
import net.booksnap.domain.user.User;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.Collection;
import java.util.List;
import java.util.Optional;

public interface UserRepository extends JpaRepository<User, Long> {
    @Query("""
            SELECT u FROM User u
            WHERE u.isActive = true
              AND (LOWER(u.firstName) LIKE LOWER(CONCAT('%', :query, '%'))
                OR LOWER(u.lastName) LIKE LOWER(CONCAT('%', :query, '%'))
                OR LOWER(u.email) LIKE LOWER(CONCAT('%', :query, '%')))
            """)
    List<User> searchActiveUsers(@Param("query") String query);

    /**
     * Ordered here rather than through the {@code Pageable}: PostgreSQL sorts the nulls of an
     * ascending order last, which is where accounts without a name belong. The email, unique,
     * makes the order total.
     *
     * <p>Takes no nullable parameter, so the caller expands "any role" into every role. A
     * null enum parameter has no type for PostgreSQL to infer under {@code stringtype=unspecified}.
     * {@code is_active} is nullable: a null counts as deactivated, so the two flags partition all rows.
     */
    @Query("""
            SELECT u FROM User u
            WHERE u.role IN :roles
              AND ((:includeActive = true AND u.isActive = true)
                OR (:includeDeactivated = true AND (u.isActive IS NULL OR u.isActive = false)))
              AND (LOWER(u.firstName) LIKE LOWER(CONCAT('%', :q, '%'))
                OR LOWER(u.lastName) LIKE LOWER(CONCAT('%', :q, '%'))
                OR LOWER(u.email) LIKE LOWER(CONCAT('%', :q, '%')))
            ORDER BY u.lastName, u.firstName, u.email
            """)
    Page<User> findMatching(@Param("roles") Collection<Role> roles,
                            @Param("includeActive") boolean includeActive,
                            @Param("includeDeactivated") boolean includeDeactivated,
                            @Param("q") String q,
                            Pageable pageable);

    Optional<User> findByEmail(String email);

    // citext + stringtype=unspecified: ignores case
    boolean existsByEmail(String email);

    @Query("""
            SELECT MIN(u.house) FROM User u
            WHERE TRIM(u.house) <> ''
            GROUP BY LOWER(u.house)
            ORDER BY MIN(u.house)
            """)
    List<String> findDistinctHouses();

    /**
     * Whether anyone at all can administer the application. Read at startup by
     * {@code AdminBootstrapRunner}: false is what opens the bootstrap door, and the row
     * this bootstrap writes is what closes it again for every later start.
     *
     * <p>Deliberately blind to {@code is_active}: a deactivated administrator still
     * counts. Someone who suspended the last admin account did so on purpose, and a
     * restart must not hand out a fresh one behind their back.
     */
    boolean existsByRole(Role role);

}
