package net.booksnap.config;

import org.springframework.beans.factory.ObjectProvider;
import org.springframework.boot.autoconfigure.transaction.TransactionManagerCustomizers;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.data.domain.AuditorAware;
import org.springframework.transaction.PlatformTransactionManager;

@Configuration
public class TransactionConfig {

    // Named transactionManager: Spring Data repositories look it up by that name, and
    // Boot's own JpaTransactionManager steps aside when a TransactionManager bean exists
    @Bean
    public PlatformTransactionManager transactionManager(
            AuditorAware<String> auditorAware,
            ObjectProvider<TransactionManagerCustomizers> customizers) {
        ActorAwareJpaTransactionManager transactionManager = new ActorAwareJpaTransactionManager(auditorAware);
        customizers.ifAvailable(c -> c.customize(transactionManager));
        return transactionManager;
    }
}
