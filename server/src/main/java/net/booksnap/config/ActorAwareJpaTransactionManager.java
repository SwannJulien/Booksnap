package net.booksnap.config;

import jakarta.persistence.EntityManager;
import net.booksnap.domain.Auditable;
import org.springframework.data.domain.AuditorAware;
import org.springframework.orm.jpa.EntityManagerHolder;
import org.springframework.orm.jpa.JpaTransactionManager;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.support.TransactionSynchronizationManager;

/**
 * Hands the current auditor to the database for the length of each write transaction, as
 * the {@code booksnap.actor} setting that the {@code lifecycle_event} triggers read.
 *
 * <p>A trigger cannot see the HTTP session. Without this, every event written by a
 * trigger — which is most of them, the copy status changes included — would name
 * {@code system}, whoever made the request. {@code set_config(..., true)} is local to the
 * transaction, so nothing leaks to the next user of the pooled connection.
 *
 * <p>A write that bypasses the transaction manager (raw JDBC, a statement outside any
 * transaction) is attributed to {@code system}, silently.
 */
public class ActorAwareJpaTransactionManager extends JpaTransactionManager {

    private final AuditorAware<String> auditorAware;

    public ActorAwareJpaTransactionManager(AuditorAware<String> auditorAware) {
        this.auditorAware = auditorAware;
    }

    @Override
    protected void doBegin(Object transaction, TransactionDefinition definition) {
        super.doBegin(transaction, definition);
        if (definition.isReadOnly()) {
            return;
        }

        EntityManagerHolder holder = (EntityManagerHolder)
                TransactionSynchronizationManager.getResource(obtainEntityManagerFactory());
        EntityManager entityManager = holder.getEntityManager();
        entityManager.createNativeQuery("SELECT set_config('booksnap.actor', ?1, true)")
                .setParameter(1, auditorAware.getCurrentAuditor().orElse(Auditable.SYSTEM_AUDITOR))
                .getSingleResult();
    }
}
