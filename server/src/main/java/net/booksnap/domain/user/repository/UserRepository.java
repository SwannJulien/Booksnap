package net.booksnap.domain.user.repository;

import net.booksnap.domain.user.Role;
import net.booksnap.domain.user.User;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

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
    Optional<User> findByEmail(String email);

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
