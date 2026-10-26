package net.booksnap.domain.library.repository;

import net.booksnap.domain.library.Library;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

import java.util.List;

public interface LibraryRepository extends JpaRepository<Library, Long> {

    // LOWER is required: the database sorts bytewise (musl), which puts every capital before "annexe"
    @Query("SELECT l FROM Library l ORDER BY LOWER(l.name), l.id")
    List<Library> findAllOrderByNameIgnoreCase();
}
