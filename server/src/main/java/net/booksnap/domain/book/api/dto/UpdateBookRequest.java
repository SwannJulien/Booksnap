package net.booksnap.domain.book.api.dto;

import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import net.booksnap.domain.book.KeyStage;

import java.util.Set;

public record UpdateBookRequest (

    @NotNull(message = "The book title is required")
    String title,

    @Size(min = 10, max = 10, message = "Isbn10 must be 10 characters long")
    String isbn10,

    @Size(min = 13, max = 13, message = "Isbn13 must be 13 characters long")
    String isbn13,

    String publishingYear,

    String publisher,

    Integer numberOfPages,

    KeyStage yearRecommendation,

    @NotNull(message = "The book genre fiction/no fiction is required")
    Boolean isFiction,

    String codeDewey,

    Set<String> genres,

    Set<String> authors
) {}
