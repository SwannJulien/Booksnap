package net.booksnap.domain.library.repository;

import net.booksnap.domain.library.Library;
import org.springframework.data.jpa.repository.JpaRepository;

public interface LibraryRepository extends JpaRepository<Library, Long> {
}
