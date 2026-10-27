package net.booksnap.exception;

import net.booksnap.exception.hold.HoldRefusalReason;

import java.time.LocalDateTime;

public record HoldRefusedError(
    LocalDateTime timestamp,
    int status,
    String message,
    String path,
    HoldRefusalReason reason
) {}
