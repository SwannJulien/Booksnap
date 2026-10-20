package net.booksnap.domain.book.mapper;

import net.booksnap.domain.author.Author;
import net.booksnap.domain.author.AuthorRepository;
import net.booksnap.domain.book.Book;
import net.booksnap.domain.book.api.dto.CreateBookRequest;
import net.booksnap.domain.book.api.dto.BookResponse;
import net.booksnap.domain.common.dto.AuditDTO;
import net.booksnap.domain.dewey.DeweyCategory;
import net.booksnap.domain.dewey.repository.DeweyCategoryRepository;
import net.booksnap.exception.dewey.DeweyCodeNotFoundException;
import net.booksnap.domain.genre.Genre;
import net.booksnap.domain.genre.GenreRepository;
import org.mapstruct.AfterMapping;
import org.mapstruct.Mapper;
import org.mapstruct.Mapping;
import org.mapstruct.MappingTarget;
import org.springframework.beans.factory.annotation.Autowired;

import java.util.HashSet;
import java.util.Set;
import java.util.stream.Collectors;

@Mapper(componentModel = "spring")
public abstract class BookApiMapper {

    @Autowired
    protected GenreRepository genreRepository;

    @Autowired
    protected DeweyCategoryRepository deweyCategoryRepository;

    @Autowired
    protected AuthorRepository authorRepository;

    // Convert API request to Entity
    @Mapping(target = "id", ignore = true)
    @Mapping(target = "createdDate", ignore = true)
    @Mapping(target = "lastModifiedDate", ignore = true)
    @Mapping(target = "deletedAt", ignore = true)
    @Mapping(target = "genres", ignore = true)
    @Mapping(target = "authors", ignore = true)
    @Mapping(target = "deweyCategory", ignore = true)
    public abstract Book createRequestToBookEntity(CreateBookRequest request);

    @AfterMapping
    public void mapGenresToEntity(@MappingTarget Book book, CreateBookRequest request) {
        if(request.genres() != null && !request.genres().isEmpty()) {
            Set<Genre> genreEntities = request.genres().stream()
                    .map(name -> {
                        String trimmed = name.trim();
                        return genreRepository.findByName(trimmed)
                                .orElseGet(() -> genreRepository.save(new Genre(null, trimmed, new HashSet<>())));
                    })
                    .collect(Collectors.toSet());

            book.setGenres(genreEntities);
        }
    }

    @AfterMapping
    public void mapAuthorsToEntity(@MappingTarget Book book, CreateBookRequest request) {
        if(request.authors() != null && !request.authors().isEmpty()) {
            Set<Author> authorEntities = request.authors().stream()
                    .map(name -> {
                        String trimmed = name.trim();
                        return authorRepository.findByName(trimmed)
                                .orElseGet(() -> authorRepository.save(new Author(null, trimmed, new HashSet<>())));
                    })
                    .collect(Collectors.toSet());

            book.setAuthors(authorEntities);
        }
    }

    @AfterMapping
    public void mapDeweyCategory(@MappingTarget Book book, CreateBookRequest request) {
        String codeDewey = request.codeDewey();

        if (codeDewey == null || codeDewey.isBlank()) {
            book.setDeweyCategory(null);
        } else {
            DeweyCategory category = deweyCategoryRepository.findByCode(codeDewey)
                    .orElseThrow(() -> new DeweyCodeNotFoundException(codeDewey));
            book.setDeweyCategory(category);
        }
    }

    // Convert entity response to DTO
    @Mapping(target = "genres", expression = "java(mapGenresToSet(book.getGenres()))")
    @Mapping(target = "authors", expression = "java(mapAuthorsToSet(book.getAuthors()))")
    @Mapping(target = "audit", expression = "java(mapAuditToDTO(book))")
    @Mapping(target = "codeDewey", expression = "java(mapDeweyCode(book.getDeweyCategory()))")
    @Mapping(target = "countCopies", ignore = true)
    public abstract BookResponse bookEntityToBookResponse(Book book);

    protected Set<String> mapGenresToSet(Set<Genre> genres) {
        if (genres == null || genres.isEmpty()) {
            return null;
        }
        return genres.stream().map(Genre::getName).collect(Collectors.toSet());
    }

    protected Set<String> mapAuthorsToSet(Set<Author> authors) {
        if (authors == null || authors.isEmpty()) {
            return null;
        }
        return authors.stream().map(Author::getName).collect(Collectors.toSet());
    }

    protected String mapDeweyCode(DeweyCategory deweyCategory) {
        if (deweyCategory == null) {
            return null;
        }
        return deweyCategory.getCode();
    }

    protected AuditDTO mapAuditToDTO(Book book) {
        return new AuditDTO(
            book.getCreatedBy(),
            book.getCreatedDate(),
            book.getLastModifiedBy(),
            book.getLastModifiedDate()
        );
    }

}