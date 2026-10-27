package net.booksnap.domain.library.api.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record LibraryNameRequest(
        @NotBlank(message = "Name is required")
        @Size(max = 255, message = "Name must be at most 255 characters")
        String name
) {
    // Trimmed here so that @NotBlank and @Size judge the name that will be stored.
    public LibraryNameRequest {
        name = name == null ? null : name.trim();
    }
}
