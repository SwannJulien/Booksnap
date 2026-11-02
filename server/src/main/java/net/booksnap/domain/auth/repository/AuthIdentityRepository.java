package net.booksnap.domain.auth.repository;

import net.booksnap.domain.auth.AuthIdentity;
import net.booksnap.domain.auth.Provider;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.Collection;
import java.util.Optional;
import java.util.Set;

public interface AuthIdentityRepository extends JpaRepository<AuthIdentity, Long> {
    Optional<AuthIdentity> findByProviderAndSubject(Provider provider, String subject);
    Optional<AuthIdentity> findByUserIdAndProvider(Long userId, Provider provider);

    boolean existsByUserIdAndProvider(Long userId, Provider provider);

    @Query("SELECT a.user.id FROM AuthIdentity a WHERE a.provider = :provider AND a.user.id IN :userIds")
    Set<Long> findUserIdsWithProvider(@Param("provider") Provider provider, @Param("userIds") Collection<Long> userIds);
}
