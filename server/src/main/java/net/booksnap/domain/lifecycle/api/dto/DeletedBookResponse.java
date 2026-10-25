package net.booksnap.domain.lifecycle.api.dto;

import java.time.LocalDateTime;

public record DeletedBookResponse(
    Long id,
    String title,
    LocalDateTime deletedAt,
    String deletedBy,
    long copiesDeletedWithBook
) {}
