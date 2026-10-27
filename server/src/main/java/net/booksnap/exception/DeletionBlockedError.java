package net.booksnap.exception;

import net.booksnap.exception.common.BlockingBorrowing;
import net.booksnap.exception.common.BlockingHold;

import java.time.LocalDateTime;
import java.util.List;

public record DeletionBlockedError(
    LocalDateTime timestamp,
    int status,
    String message,
    String path,
    List<BlockingBorrowing> activeBorrowings,
    List<BlockingHold> activeHolds
) {}
