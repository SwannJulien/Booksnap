package net.booksnap.domain.lifecycle.api.dto;

import java.time.LocalDateTime;

public record DeletedCopyResponse(
    Long id,
    String identificationCode,
    Long bookId,
    String bookTitle,
    LocalDateTime deletedAt,
    String deletedBy
) {}
