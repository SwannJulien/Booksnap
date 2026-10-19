package net.booksnap.domain.book.repository;

import jakarta.persistence.criteria.Join;
import jakarta.persistence.criteria.JoinType;
import jakarta.persistence.criteria.Subquery;
import jakarta.persistence.criteria.Root;
import net.booksnap.domain.author.Author;
import net.booksnap.domain.book.Book;
import net.booksnap.domain.book.KeyStage;
import net.booksnap.domain.copy.Copy;
import net.booksnap.domain.copy.Status;
import net.booksnap.domain.genre.Genre;
import org.springframework.data.jpa.domain.Specification;

import java.util.List;

public final class BookSpecifications {

    private BookSpecifications() {}

    public static Specification<Book> notDeleted() {
        return (root, cq, cb) -> cb.isNull(root.get("deletedAt"));
    }

    public static Specification<Book> textSearch(String query) {
        return (root, cq, cb) -> {
            String pattern = "%" + query.toLowerCase() + "%";
            Join<Book, Author> authors = root.join("authors", JoinType.LEFT);
            return cb.or(
                    cb.like(cb.lower(root.get("title")), pattern),
                    cb.like(root.get("isbn10"), query + "%"),
                    cb.like(root.get("isbn13"), query + "%"),
                    cb.like(cb.lower(authors.get("name")), pattern)
            );
        };
    }

    public static Specification<Book> hasGenres(List<String> genreNames) {
        return (root, cq, cb) -> {
            Join<Book, Genre> genres = root.join("genres", JoinType.INNER);
            return genres.get("name").in(genreNames);
        };
    }

    public static Specification<Book> hasCopyWithStatus(List<Status> statuses) {
        return (root, cq, cb) -> {
            Subquery<Long> subquery = cq.subquery(Long.class);
            Root<Copy> copy = subquery.from(Copy.class);
            subquery.select(copy.get("id"))
                    .where(
                            cb.equal(copy.get("book"), root),
                            copy.get("status").in(statuses),
                            cb.isNull(copy.get("deletedAt"))
                    );
            return cb.exists(subquery);
        };
    }

    public static Specification<Book> hasKeyStage(KeyStage keyStage) {
        return (root, cq, cb) -> cb.equal(root.get("yearRecommendation"), keyStage);
    }
}
